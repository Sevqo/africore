import { workspaceKind } from '../marketplace/engine';
import { capture, emit } from './events';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { type Access } from '../platform/auth';
import { now } from '../platform/crypto';
import { atomic, day, addDays } from './store';
import { notify, expireApprovals } from './automation';
import { product, stockBalance } from '../inventory/service';
import { read as readErp } from '../erp/store';
import { expandCalendarSeries } from '../apps/calendar-recurrence';
const types = [
  'approval.decided',
  'approval.expired',
  'customer.created',
  'order.confirmed',
  'order.cancelled',
  'invoice.issued',
  'invoice.paid',
  'payment.succeeded',
  'reconciliation.exception_created',
  'draft_invoice.prepared',
  'stock.receipt',
  'stock.adjustment',
  'stock.dispatch',
  'stock.return',
  'crm.entry_created',
  'crm.followup_due',
  'crm.stage_changed',
  'automation.run_failed',
  'calendar.reminder_due',
];
/** Consume existing durable scoped events. Receipt and notification commit together; no second queue. */
export async function processBusinessEvents(a: Access) {
  return atomic(a, async () => {
    const kind = await workspaceKind(a.org);
    await expireApprovals(a);
    const events = await dbAll(
      'SELECT e.* FROM ac2_events e WHERE e.org_id=? AND e.environment=? AND e.event_type IN (' +
        types.map(() => '?').join(',') +
        ") AND NOT EXISTS (SELECT 1 FROM ac_business_event_receipts r WHERE r.org_id=e.org_id AND r.environment=e.environment AND r.event_id=e.id AND r.consumer='business_notifications_v1') ORDER BY e.occurred_at,e.id LIMIT 100",
      [a.org, a.environment, ...types],
    );
    let notifications = 0;
    for (const event of events) {
      const payload = JSON.parse(event.payload),
        id = payload.id || payload.request_id || event.resource_id;
      let input: Parameters<typeof notify>[1] | null = null;
      if (['approval.decided', 'approval.expired'].includes(event.event_type)) {
        const approval = await dbGet(
          'SELECT requester,status FROM ac2_approvals WHERE id=? AND org_id=? AND environment=?',
          [id, a.org, a.environment],
        );
        if (approval)
          input = {
            category: 'security',
            title:
              approval.status === 'approved'
                ? 'Review approved'
                : approval.status === 'rejected'
                  ? 'Review rejected'
                  : 'Review expired',
            body: 'The review status changed. Approval does not execute the operation; return to the original record to continue or request a new review.',
            resource_id: id,
            key: 'business:' + event.id,
            user_id: approval.requester,
            severity: approval.status === 'approved' ? 'success' : 'action_required',
            action_data: { app_id: 'automations', section: 'Approvals', approval_id: id },
          };
      }
      if (event.event_type === 'order.confirmed')
        input = {
          category: 'orders',
          title: 'Order confirmed',
          body: 'Review the order, its reservation results and any policy-prepared draft invoice.',
          resource_id: id,
          key: 'business:' + event.id,
          capability: 'operations',
          severity: 'success',
          action_data: { app_id: 'sales', section: 'Orders', record_id: id },
        };
      if (event.event_type === 'draft_invoice.prepared')
        input = {
          category: 'invoices',
          title: 'Draft invoice prepared',
          body: 'A confirmed order produced a linked draft. Review and issue it separately; no payment was requested.',
          resource_id: id,
          key: 'business:' + event.id,
          capability: 'finance',
          severity: 'success',
          action_data: { app_id: 'finance', section: 'Invoices', record_id: id },
        };
      if (['invoice.issued', 'invoice.paid', 'payment.succeeded'].includes(event.event_type))
        input = {
          category: event.event_type.startsWith('payment') ? 'payments' : 'invoices',
          title:
            event.event_type === 'invoice.paid'
              ? payload.credited_minor
                ? 'Invoice balance settled'
                : 'Invoice fully paid'
              : event.event_type === 'invoice.issued'
                ? 'Invoice issued'
                : 'Payment confirmed',
          body: 'An authorized financial record changed. Inspect its evidence and allocation details in Finance.',
          resource_id: id,
          key: 'business:' + event.id,
          capability: 'finance',
          severity: 'success',
          action_data: {
            app_id: 'finance',
            section: event.event_type.startsWith('payment') ? 'Payments' : 'Invoices',
            record_id: id,
          },
        };
      if (event.event_type === 'reconciliation.exception_created')
        input = {
          category: 'reconciliation',
          title: 'Payment match needs review',
          body: 'Inspect the unmatched evidence; a review note does not establish provider confirmation.',
          resource_id: id,
          key: 'business:' + event.id,
          capability: 'finance',
          severity: 'action_required',
          action_data: { app_id: 'finance', section: 'Reconciliation' },
        };
      if (event.event_type.startsWith('stock.') && payload.product_id) {
        const p = await product(a, payload.product_id),
          balance = await stockBalance(a, p.id);
        if (p.track_inventory && balance.available_milli <= p.reorder_point_milli)
          input = {
            category: 'inventory',
            title:
              balance.available_milli === 0
                ? 'Product is out of available stock'
                : 'Product reached its reorder point',
            body: 'Review available quantities and incoming plans before replenishing. No supplier order was placed.',
            resource_id: p.id,
            key: 'stock.low:' + p.id + ':' + day(),
            capability: 'operations',
            severity: 'warning',
            action_data: { app_id: 'inventory', section: 'replenishment', record_id: p.id },
          };
      }
      if (event.event_type === 'customer.created')
        input = {
          category: 'crm',
          title: kind === 'personal' ? 'Client created' : 'Customer created',
          body:
            kind === 'personal'
              ? 'The client is available for your personal invoicing records.'
              : 'The shared customer can be selected by authorized Sales and Finance workflows.',
          resource_id: id,
          key: 'business:' + event.id,
          capability: 'operations',
          action_data: {
            app_id: kind === 'personal' ? 'finance' : 'crm',
            section: 'Customers',
            record_id: id,
          },
        };
      if (event.event_type === 'crm.stage_changed')
        input = {
          category: 'crm',
          title: 'CRM stage changed',
          body: 'Review the current opportunity and its revision history. Recorded opportunity values are not revenue.',
          resource_id: id,
          key: 'business:' + event.id,
          capability: 'operations',
          user_id: payload.assigned_to || undefined,
          action_data: { app_id: 'crm', section: 'pipeline', record_id: id },
        };
      if (event.event_type === 'crm.followup_due') {
        const task = await dbGet(
          "SELECT status,assigned_to,due_at FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=? AND kind='follow_up'",
          [id, a.org, a.environment],
        );
        const end = new Date(addDays(day(), 1) + 'T00:00:00+03:00').toISOString(),
          active = await dbGet(
            "SELECT e.service_id FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.service_id='crm' AND e.status='active' AND s.enabled=1",
            [a.org, a.environment],
          );
        if (
          active &&
          task &&
          task.status === 'open' &&
          task.assigned_to === payload.assigned_to &&
          task.due_at &&
          task.due_at < end
        ) {
          const overdue = task.due_at < now();
          input = {
            category: 'crm',
            title: overdue ? 'Follow-up overdue' : 'Follow-up due today',
            body: 'Review the scheduled CRM activity and update it when complete.',
            resource_id: id,
            key: 'business:' + event.id,
            capability: 'operations',
            user_id: task.assigned_to,
            severity: overdue ? 'warning' : 'informational',
            action_data: { app_id: 'crm', section: 'followups', record_id: id },
          };
        }
      }
      if (event.event_type === 'crm.entry_created' && payload.kind === 'follow_up')
        input = {
          category: 'crm',
          title: 'Follow-up task created',
          body: 'Review the task and its due date in CRM.',
          resource_id: id,
          key: 'business:' + event.id,
          capability: 'operations',
          user_id: payload.assigned_to || undefined,
          action_data: { app_id: 'crm', section: 'followups', record_id: id },
        };
      if (event.event_type === 'automation.run_failed')
        input = {
          category: 'automation_failures',
          title: 'Workflow execution needs attention',
          body: 'Inspect the durable execution history before retrying the supported action.',
          resource_id: id,
          key: 'business:' + event.id,
          capability: 'finance',
          severity: 'action_required',
          action_data: { app_id: 'automations', section: 'runs' },
        };
      if (event.event_type === 'calendar.reminder_due') {
        const setting = await dbGet(
          "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='calendar_settings' AND owner_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1",
          [a.org, a.environment, payload.user_id],
        );
        const timezone = setting
          ? (await readErp(a, setting.id, 'calendar_settings')).data.timezone
          : 'Africa/Nairobi';
        input = {
          category: 'calendar',
          title: 'Meeting reminder',
          body: `A meeting starts at ${new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(payload.starts_at))}. Open Calendar to review the invitation.`,
          resource_id: payload.event_id,
          key: 'business:' + event.id,
          user_id: payload.user_id,
          action_data: { app_id: 'calendar', section: 'invitations', record_id: payload.event_id },
        };
      }
      if (input) notifications += (await notify(a, input)).inserted;
      if (input && event.event_type.startsWith('stock.') && payload.product_id)
        await emit(
          a,
          'inventory.reorder_needed',
          { id: payload.product_id, product_id: payload.product_id, schema_version: 1 },
          { key: 'stock.low.event:' + payload.product_id + ':' + day() },
        );
      await dbRun(
        "INSERT INTO ac_business_event_receipts(org_id,environment,event_id,consumer,processed_at) VALUES (?,?,?,'business_notifications_v1',?) ON CONFLICT(org_id,environment,event_id,consumer) DO NOTHING",
        [a.org, a.environment, event.id, now()],
      );
    }
    return { processed: events.length, notifications };
  });
}

/** Schedule attendee-specific in-app reminders through the existing durable event/notification pipeline. */
export async function processCalendarReminders(a: Access, at = new Date()) {
  const nowMs = at.getTime(), from = new Date(nowMs).toISOString(), to = new Date(nowMs + 26 * 3600000).toISOString();
  return atomic(a, async () => {
    const rows = await dbAll(
      "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='calendar_event' AND status='active' ORDER BY updated_at,id LIMIT 1001",
      [a.org, a.environment],
    );
    const settingsRows = await dbAll(
      "SELECT id,owner_id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='calendar_settings' AND status='active' ORDER BY updated_at,id LIMIT 1001",
      [a.org, a.environment],
    );
    const reminders = new Map<string, number | null>();
    for (const row of settingsRows.slice(0, 1000)) {
      const settings = await readErp(a, row.id, 'calendar_settings');
      reminders.set(row.owner_id, settings.data.reminder_minutes_before ?? null);
    }
    if (![...reminders.values()].some((minutes) => minutes !== null))
      return { scheduled: 0, scanned: 0 };
    let scheduled = 0;
    for (const row of rows.slice(0, 1000)) {
      const event = await readErp(a, row.id, 'calendar_event');
      if (event.data.cancelled_at) continue;
      const attendeeIds = [...new Set([event.data.organizer_id, ...(event.data.attendees || []).filter((x: any) => x.response !== 'declined').map((x: any) => x.user_id)].filter(Boolean))];
      if (!attendeeIds.length) continue;
      const current = await dbAll(
        'SELECT user_id FROM ac_memberships WHERE org_id=? AND user_id IN (' + attendeeIds.map(() => '?').join(',') + ')',
        [a.org, ...attendeeIds],
      );
      const activeMembers = new Set(current.map((member: any) => member.user_id));
      const instances = expandCalendarSeries(event, from, to);
      for (const occurrence of instances) {
        const startMs = Date.parse(occurrence.data.start);
        if (startMs <= nowMs || startMs > nowMs + 26 * 3600000) continue;
        for (const userId of attendeeIds) {
          const minutes = reminders.get(userId);
          if (!activeMembers.has(userId) || !minutes || startMs - minutes * 60000 > nowMs) continue;
          const start = new Date(startMs).toISOString();
          const result = await capture(
            a,
            'calendar.reminder_due',
            { event_id: event.id, user_id: userId, starts_at: start },
            { key: `calendar-reminder:${event.id}:${start}:${userId}:${minutes}` },
          );
          if (result.inserted) scheduled++;
        }
      }
    }
    return { scheduled, scanned: Math.min(rows.length, 1000) };
  });
}

/** Emit at most one durable daily reminder per assigned open follow-up. Unprocessed rows remain eligible for later worker passes. */
export async function processCrmDueReminders(a: Access, at = new Date()) {
  const today = day(at),
    end = new Date(addDays(today, 1) + 'T00:00:00+03:00').toISOString(),
    prefix = 'crm.followup_due:' + today + ':';
  return atomic(a, async () => {
    const rows = await dbAll(
      "SELECT c.id,c.assigned_to,c.due_at FROM ac_crm_entries c JOIN ac_memberships m ON m.org_id=c.org_id AND m.user_id=c.assigned_to WHERE c.org_id=? AND c.environment=? AND c.kind='follow_up' AND c.status='open' AND c.due_at<? AND NOT EXISTS (SELECT 1 FROM ac2_events e WHERE e.org_id=c.org_id AND e.environment=c.environment AND e.dedupe_key=? || c.id || ':' || c.assigned_to) ORDER BY c.due_at,c.id LIMIT 100",
      [a.org, a.environment, end, prefix],
    );
    for (const row of rows)
      await emit(
        a,
        'crm.followup_due',
        {
          id: row.id,
          assigned_to: row.assigned_to,
          overdue: row.due_at < at.toISOString(),
          schema_version: 1,
        },
        { key: prefix + row.id + ':' + row.assigned_to },
      );
    return { processed: rows.length };
  });
}
