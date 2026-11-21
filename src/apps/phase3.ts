import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { fail, type Access } from '../platform/auth';
import { hash, now, seal, unseal } from '../platform/crypto';
import {
  authorize,
  currentMember,
  history as erpHistory,
  insert,
  operation,
  read,
  update,
  visible,
} from '../erp/store';
import { workTarget } from '../erp/work';
import { publicSlug } from '../commerce/contracts';
import { notify } from '../operations/automation';
import { assetBytes, assetReferences } from '../publishing/assets';
import { requireServices } from '../marketplace/engine';
import {
  calendarOccurrenceInstant,
  expandCalendarSeries,
  type CalendarRule,
} from './calendar-recurrence';

const attendee = z
  .object({
    user_id: z.string().min(1).max(200),
    response: z.enum(['pending', 'accepted', 'declined', 'tentative']).default('pending'),
  })
  .strict();
const recurrenceRule = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().int().min(1).max(99).default(1),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    end: z.enum(['never', 'count', 'until']).default('never'),
    count: z.number().int().min(1).max(1000).nullable().default(null),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.end === 'count' && rule.count === null)
      ctx.addIssue({ code: 'custom', message: 'Choose an occurrence count', path: ['count'] });
    if (rule.end === 'until' && rule.until === null)
      ctx.addIssue({ code: 'custom', message: 'Choose an end date', path: ['until'] });
    if (rule.until) {
      const until = new Date(rule.until + 'T00:00:00.000Z');
      if (!Number.isFinite(until.getTime()) || until.toISOString().slice(0, 10) !== rule.until)
        ctx.addIssue({ code: 'custom', message: 'Choose a valid end date', path: ['until'] });
    }
  });
const eventInput = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().max(8000).default(''),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    timezone: z.string().min(1).max(100),
    all_day: z.boolean().default(false),
    location: z.string().max(300).default(''),
    meeting_url: z.string().url().max(1000).or(z.literal('')).default(''),
    visibility: z.enum(['default', 'private']).default('default'),
    recurrence: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']).default('none'),
    recurrence_rule: recurrenceRule.nullable().default(null),
    attendees: z.array(attendee).max(100).default([]),
    linked_record: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('calendar_appointment_type'), id: z.string().uuid() }).strict(),
        z.object({ kind: z.literal('work_task'), id: z.string().uuid() }).strict(),
        z.object({ kind: z.literal('crm_entry'), id: z.string().uuid() }).strict(),
      ])
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (Date.parse(d.end) <= Date.parse(d.start))
      ctx.addIssue({ code: 'custom', message: 'End must be after start', path: ['end'] });
    if (d.recurrence !== 'none' && Date.parse(d.end) - Date.parse(d.start) > 31 * 86400000)
      ctx.addIssue({
        code: 'custom',
        message: 'Recurring event duration cannot exceed 31 days',
        path: ['end'],
      });
    try {
      new Intl.DateTimeFormat('en', { timeZone: d.timezone });
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Use a valid IANA timezone', path: ['timezone'] });
    }
    if (d.recurrence_rule && d.recurrence_rule.frequency !== d.recurrence)
      ctx.addIssue({
        code: 'custom',
        message: 'Recurrence frequency must match the selected rule',
        path: ['recurrence_rule', 'frequency'],
      });
    if (d.recurrence === 'none' && d.recurrence_rule)
      ctx.addIssue({
        code: 'custom',
        message: 'A one-time event cannot have a recurrence rule',
        path: ['recurrence_rule'],
      });
    if (d.recurrence === 'weekly' && d.recurrence_rule?.weekdays.length) {
      const start = new Date(d.start);
      const weekday = new Intl.DateTimeFormat('en', {
        timeZone: d.timezone,
        weekday: 'short',
      }).format(start);
      const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
      if (!d.recurrence_rule.weekdays.includes(index))
        ctx.addIssue({
          code: 'custom',
          message: 'Include the event weekday so the series starts on its original date',
          path: ['recurrence_rule', 'weekdays'],
        });
    }
  });
const calendarGrant = async (a: Access, id: string, members: { user_id: string }[]) => {
  for (const member of members)
    await dbRun(
      'INSERT INTO ac_erp_grants(org_id,environment,resource_id,user_id,permission) VALUES (?,?,?,?,?) ON CONFLICT(org_id,environment,resource_id,user_id) DO NOTHING',
      [a.org, a.environment, id, member.user_id, 'view'],
    );
};
async function validateMembers(a: Access, members: { user_id: string }[]) {
  const ids = [...new Set(members.map((x) => x.user_id))];
  if (!ids.length) return;
  const found = await dbAll(
    'SELECT user_id FROM ac_memberships WHERE org_id=? AND user_id IN (' +
      ids.map(() => '?').join(',') +
      ')',
    [a.org, ...ids],
  );
  if (found.length !== ids.length) fail(400, 'Attendees must be current workspace members');
}
const workDayInput = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict()
  .refine((d) => d.end > d.start, { message: 'Workday end must follow its start', path: ['end'] });
const calendarSettingsInput = z
  .object({
    timezone: z.string().min(1).max(100),
    work_days: z.array(workDayInput).max(7),
    share_with_team: z.boolean().default(false),
    reminder_minutes_before: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60), z.literal(1440)]).nullable().default(null),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (new Set(d.work_days.map((day) => day.weekday)).size !== d.work_days.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Each weekday can appear only once',
        path: ['work_days'],
      });
    try {
      new Intl.DateTimeFormat('en', { timeZone: d.timezone });
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Use a valid IANA timezone', path: ['timezone'] });
    }
  });
const defaultCalendarSettings = {
  timezone: 'Africa/Nairobi',
  work_days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
  share_with_team: false,
  reminder_minutes_before: null,
};
export async function getCalendarSettings(a: Access) {
  await authorize(a, 'calendar');
  const row = await dbGet(
    "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='calendar_settings' AND owner_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1",
    [a.org, a.environment, a.actor],
  );
  return {
    actor_id: a.actor,
    configured: !!row,
    data: row ? (await read(a, row.id, 'calendar_settings')).data : defaultCalendarSettings,
  };
}
export async function saveCalendarSettings(a: Access, input: unknown, key: string) {
  const settings = calendarSettingsInput.parse(input);
  return operation(
    a,
    'calendar.settings',
    key,
    settings,
    () => authorize(a, 'calendar', undefined, true),
    async () => {
      const existing = await dbGet(
        "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='calendar_settings' AND owner_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1",
        [a.org, a.environment, a.actor],
      );
      if (!existing)
        return {
          actor_id: a.actor,
          configured: true,
          data: (await insert(a, 'calendar_settings', settings, { owner: a.actor })).data,
        };
      return {
        actor_id: a.actor,
        configured: true,
        data: (await update(a, await read(a, existing.id, 'calendar_settings'), settings)).data,
      };
    },
    { meter: false },
  );
}
export async function calendarAvailability(
  a: Access,
  from: string,
  to: string,
  selected: string[] = [],
  excludeEventId?: string,
) {
  await authorize(a, 'calendar');
  const fromMs = Date.parse(from),
    toMs = Date.parse(to);
  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    toMs <= fromMs ||
    toMs - fromMs > 31 * 86400000
  )
    fail(400, 'Availability range must be a valid interval no longer than 31 days');
  const currentMembers = await dbAll('SELECT user_id FROM ac_memberships WHERE org_id=?', [a.org]);
  const allowed = currentMembers.map((member) => String(member.user_id));
  const memberIds = [...new Set(selected.length ? selected : allowed)];
  if (memberIds.some((id) => !allowed.includes(id)))
    fail(400, 'Availability is limited to current workspace members');
  if (memberIds.length > 50) fail(400, 'Select at most 50 workspace members');
  const rows = await dbAll(
    "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='calendar_event' AND status='active'",
    [a.org, a.environment],
  );
  const events = await Promise.all(rows.map((row) => read(a, row.id, 'calendar_event')));
  const output = await Promise.all(
    memberIds.map(async (user_id) => {
      const settingRow = await dbGet(
        "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='calendar_settings' AND owner_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1",
        [a.org, a.environment, user_id],
      );
      const settings = settingRow
        ? (await read(a, settingRow.id, 'calendar_settings')).data
        : defaultCalendarSettings;
      const busy: { start: number; end: number }[] = [];
      for (const event of events) {
        if (event.id === excludeEventId) continue;
        const belongs =
          event.data.organizer_id === user_id ||
          event.data.attendees?.some(
            (person: any) => person.user_id === user_id && person.response !== 'declined',
          );
        if (!belongs) continue;
        for (const occurrence of expandCalendarSeries(event, from, to)) {
          busy.push({
            start: Date.parse(occurrence.data.start),
            end: Date.parse(occurrence.data.end),
          });
        }
      }
      busy.sort((left, right) => left.start - right.start);
      const merged: { start: string; end: string }[] = [];
      for (const item of busy) {
        const previous = merged[merged.length - 1];
        if (previous && Date.parse(previous.end) >= item.start) {
          if (item.end > Date.parse(previous.end)) previous.end = new Date(item.end).toISOString();
        } else
          merged.push({
            start: new Date(item.start).toISOString(),
            end: new Date(item.end).toISOString(),
          });
      }
      return {
        member_id: user_id,
        timezone: settings.timezone,
        work_days: user_id === a.actor || settings.share_with_team ? settings.work_days : null,
        busy: merged,
      };
    }),
  );
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), data: output };
}
export async function calendarEvents(a: Access, from?: string, to?: string) {
  const events = await visible(a, 'calendar_event');
  const role = await currentMember(a);
  if (!['owner', 'admin'].includes(role)) {
    const owned = await dbAll(
      "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='calendar_event' AND owner_id=? AND status='active'",
      [a.org, a.environment, a.actor],
    );
    const byId = new Map(events.map((event) => [event.id, event]));
    for (const row of owned) byId.set(row.id, await read(a, row.id, 'calendar_event'));
    events.splice(0, events.length, ...byId.values());
  }
  const nowMs = Date.now();
  const fromIso = from || new Date(nowMs - 90 * 86400000).toISOString();
  const toIso = to || new Date(nowMs + 180 * 86400000).toISOString();
  const fromMs = Date.parse(fromIso),
    toMs = Date.parse(toIso);
  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    toMs <= fromMs ||
    toMs - fromMs > 370 * 86400000
  )
    fail(400, 'Calendar range must be a valid interval no longer than 370 days');
  return {
    data: events
      .filter((e) => e.status === 'active')
      .flatMap((e) =>
        expandCalendarSeries(e, fromIso, toIso).map((occurrence) => {
          const invited = e.data.attendees.some((person: any) => person.user_id === a.actor);
          const isOrganizer = e.data.organizer_id === a.actor;
          const privateToViewer = e.data.visibility === 'private' && !isOrganizer && !invited;
          const source = occurrence.data;
          const data = privateToViewer
            ? {
                ...source,
                title: 'Busy',
                description: '',
                location: '',
                meeting_url: '',
                linked_record: null,
                attendees: [],
              }
            : {
                ...source,
                my_response:
                  e.data.attendees.find((person: any) => person.user_id === a.actor)?.response ||
                  null,
              };
          const result: any = { ...occurrence, data };
          if (privateToViewer) {
            result.read_only = true;
            delete result.series_data;
            delete result.series_id;
            delete result.occurrence_key;
            delete result.data.recurrence_rule;
            delete result.data.occurrence_key;
            delete result.data.recurrence_parent_id;
            result.id = hash(occurrence.id).slice(0, 32);
          }
          return result;
        }),
      )
      .slice(0, 5000),
  };
}
export async function calendarEventHistory(a: Access, id: string) {
  await authorize(a, 'calendar', id, false);
  const event = await read(a, id, 'calendar_event');
  if (event.data.organizer_id !== a.actor)
    fail(403, 'Only the event organizer can view its history');
  const versions = await erpHistory(a, event, 50);
  return {
    data: versions.map((version) => ({
      version: version.version,
      actor: version.actor,
      action: version.action,
      created_at: version.created_at,
      title: version.snapshot.data.title,
      start: version.snapshot.data.start,
      end: version.snapshot.data.end,
      timezone: version.snapshot.data.timezone,
      status: version.snapshot.status,
    })),
  };
}
export async function createCalendarEvent(a: Access, input: unknown, key: string) {
  const d = eventInput.parse(input);
  const rule =
    d.recurrence === 'none'
      ? null
      : d.recurrence_rule || {
          frequency: d.recurrence,
          interval: 1,
          weekdays: [],
          end: 'never',
          count: null,
          until: null,
        };
  await validateMembers(a, d.attendees);
  return operation(
    a,
    'calendar.create',
    key,
    d,
    async () => {
      await authorize(a, 'calendar', undefined, true);
      if (d.linked_record?.kind === 'work_task') await workTarget(a, d.linked_record.id);
      if (d.linked_record?.kind === 'crm_entry') {
        await authorize(a, 'crm');
        const entry = await dbGet(
          "SELECT id FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=? AND kind IN ('lead','opportunity') AND status<>'archived'",
          [d.linked_record.id, a.org, a.environment],
        );
        if (!entry) fail(404, 'CRM record not found');
      }
    },
    async () => {
      const event = await insert(a, 'calendar_event', {
        ...d,
        recurrence_rule: rule,
        occurrence_exceptions: [],
        organizer_id: a.actor,
        cancelled_at: null,
      });
      await calendarGrant(a, event.id, [...d.attendees, { user_id: a.actor }]);
      for (const invite of d.attendees)
        await notify(a, {
          category: 'calendar',
          title: 'Meeting invitation',
          body: 'You have a new workspace meeting invitation. Open Calendar to review and respond.',
          resource_id: event.id,
          key: 'calendar-invitation:' + event.id,
          user_id: invite.user_id,
          capability: 'read',
          action_data: { app_id: 'calendar', section: 'invitations', record_id: event.id },
        });
      return event;
    },
  );
}
export async function editCalendarEvent(a: Access, id: string, input: unknown, key: string) {
  const d = eventInput.extend({ expected_version: z.number().int().positive() }).parse(input);
  const rule =
    d.recurrence === 'none'
      ? null
      : d.recurrence_rule || {
          frequency: d.recurrence,
          interval: 1,
          weekdays: [],
          end: 'never',
          count: null,
          until: null,
        };
  await validateMembers(a, d.attendees);
  return operation(
    a,
    'calendar.edit',
    key,
    { id, ...d },
    async () => {
      await authorize(a, 'calendar', id, true);
      if (d.linked_record?.kind === 'work_task') await workTarget(a, d.linked_record.id);
      if (d.linked_record?.kind === 'crm_entry') {
        await authorize(a, 'crm');
        const entry = await dbGet(
          "SELECT id FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=? AND kind IN ('lead','opportunity') AND status<>'archived'",
          [d.linked_record.id, a.org, a.environment],
        );
        if (!entry) fail(404, 'CRM record not found');
      }
    },
    async () => {
      const old = await read(a, id, 'calendar_event');
      if (old.version !== d.expected_version) fail(409, 'Event changed; reload before editing');
      if (old.data.organizer_id !== a.actor && !['owner', 'admin'].includes(a.role))
        fail(403, 'Only the organizer or workspace administrator can edit this event');
      if (old.data.linked_record?.kind === 'calendar_appointment_type') {
        if (
          d.linked_record?.kind !== 'calendar_appointment_type' ||
          d.linked_record.id !== old.data.linked_record.id
        )
          fail(400, 'An appointment must remain linked to its appointment type');
        const appointmentType = await read(a, old.data.linked_record.id, 'calendar_appointment_type');
        const staff = appointmentType.data.staff as string[];
        if (Date.parse(d.end) - Date.parse(d.start) !== appointmentType.data.duration_minutes * 60000)
          fail(400, 'Appointment duration must match its appointment type');
        if ([...new Set(d.attendees.map((person) => person.user_id))].sort().join(',') !== [...staff].sort().join(','))
          fail(400, 'Appointment staff must match its appointment type');
        const busy = await calendarAvailability(a, d.start, d.end, staff, id);
        const startMs = Date.parse(d.start), endMs = Date.parse(d.end);
        if (busy.data.some((person) => person.busy.some((slot) => Date.parse(slot.start) < endMs && Date.parse(slot.end) > startMs)))
          fail(409, 'A selected staff member is no longer available at that time');
      }
      const { expected_version: _, ...data } = d;
      await dbRun('DELETE FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=?', [
        a.org,
        a.environment,
        id,
      ]);
      await calendarGrant(a, id, [...d.attendees, { user_id: a.actor }]);
      const updated = await update(a, old, {
        ...data,
        recurrence_rule: rule,
        occurrence_exceptions: rule ? old.data.occurrence_exceptions || [] : [],
        organizer_id: old.data.organizer_id,
        cancelled_at: null,
      });
      for (const invite of [
        ...new Set([...old.data.attendees, ...d.attendees].map((x: any) => x.user_id)),
      ].map((user_id) => ({ user_id })))
        await notify(a, {
          category: 'calendar',
          title: 'Meeting updated',
          body: 'A workspace meeting you are invited to has changed. Open Calendar to review the current details.',
          resource_id: id,
          key: 'calendar-update:' + id + ':' + (old.version + 1),
          user_id: invite.user_id,
          capability: 'read',
          action_data: { app_id: 'calendar', section: 'invitations', record_id: id },
        });
      return updated;
    },
  );
}
export async function editCalendarOccurrence(
  a: Access,
  id: string,
  occurrenceKey: string,
  input: unknown,
  key: string,
) {
  const d = z
    .object({
      expected_version: z.number().int().positive(),
      title: z.string().trim().min(1).max(180),
      description: z.string().max(8000).default(''),
      start: z.string().datetime({ offset: true }),
      end: z.string().datetime({ offset: true }),
      timezone: z.string().min(1).max(100),
      location: z.string().max(300).default(''),
      meeting_url: z.string().url().max(1000).or(z.literal('')).default(''),
      all_day: z.boolean().default(false),
    })
    .strict()
    .refine((x) => Date.parse(x.end) > Date.parse(x.start), {
      message: 'End must be after start',
      path: ['end'],
    })
    .parse(input);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(occurrenceKey))
    fail(400, 'Invalid occurrence key');
  return operation(
    a,
    'calendar.occurrence.edit',
    key,
    { id, occurrenceKey, ...d },
    async () => {
      await authorize(a, 'calendar', id, true);
    },
    async () => {
      const old = await read(a, id, 'calendar_event');
      if (old.version !== d.expected_version) fail(409, 'Event changed; reload before editing');
      if (old.data.organizer_id !== a.actor && !['owner', 'admin'].includes(a.role))
        fail(403, 'Only the organizer or workspace administrator can edit this event');
      if (!old.data.recurrence_rule) fail(409, 'This meeting is not a recurring series');
      const scheduled = calendarOccurrenceInstant(old, occurrenceKey);
      if (scheduled === null) fail(404, 'Occurrence not found in this series');
      if (Math.abs(Date.parse(d.start) - (scheduled as number)) > 366 * 86400000)
        fail(400, 'An occurrence can be rescheduled by at most 366 days');
      try {
        new Intl.DateTimeFormat('en', { timeZone: d.timezone });
      } catch {
        fail(400, 'Use a valid IANA timezone');
      }
      const exceptions = [...(old.data.occurrence_exceptions || [])].filter(
        (x: any) => x.key !== occurrenceKey,
      );
      if (exceptions.length >= 1000) fail(409, 'This series has reached its exception limit');
      exceptions.push({
        key: occurrenceKey,
        data: {
          title: d.title,
          description: d.description,
          start: d.start,
          end: d.end,
          timezone: d.timezone,
          location: d.location,
          meeting_url: d.meeting_url,
          all_day: d.all_day,
        },
      });
      const updated = await update(
        a,
        old,
        { ...old.data, occurrence_exceptions: exceptions },
        {},
        'occurrence_updated',
      );
      for (const invite of old.data.attendees)
        await notify(a, {
          category: 'calendar',
          title: 'Meeting updated',
          body: 'A workspace meeting you are invited to has changed. Open Calendar to review the current details.',
          resource_id: id,
          key: 'calendar-occurrence-update:' + id + ':' + occurrenceKey + ':' + (old.version + 1),
          user_id: invite.user_id,
          capability: 'read',
          action_data: { app_id: 'calendar', section: 'invitations', record_id: id },
        });
      return updated;
    },
    { meter: false },
  );
}
export async function cancelCalendarOccurrence(
  a: Access,
  id: string,
  occurrenceKey: string,
  version: number,
  key: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(occurrenceKey))
    fail(400, 'Invalid occurrence key');
  return operation(
    a,
    'calendar.occurrence.cancel',
    key,
    { id, occurrenceKey, version },
    () => authorize(a, 'calendar', id, true),
    async () => {
      const old = await read(a, id, 'calendar_event');
      if (old.version !== version) fail(409, 'Event changed; reload before cancelling');
      if (old.data.organizer_id !== a.actor && !['owner', 'admin'].includes(a.role))
        fail(403, 'Only the organizer or workspace administrator can cancel this event');
      if (!old.data.recurrence_rule) fail(409, 'This meeting is not a recurring series');
      if (calendarOccurrenceInstant(old, occurrenceKey) === null)
        fail(404, 'Occurrence not found in this series');
      const exceptions = [...(old.data.occurrence_exceptions || [])].filter(
        (x: any) => x.key !== occurrenceKey,
      );
      if (exceptions.length >= 1000) fail(409, 'This series has reached its exception limit');
      exceptions.push({ key: occurrenceKey, cancelled: true });
      const updated = await update(
        a,
        old,
        { ...old.data, occurrence_exceptions: exceptions },
        {},
        'occurrence_cancelled',
      );
      for (const invite of old.data.attendees)
        await notify(a, {
          category: 'calendar',
          title: 'Meeting cancelled',
          body: 'A workspace meeting you are invited to has been cancelled. Open Calendar to review your invitations.',
          resource_id: id,
          key: 'calendar-occurrence-cancel:' + id + ':' + occurrenceKey + ':' + (old.version + 1),
          user_id: invite.user_id,
          capability: 'read',
          action_data: { app_id: 'calendar', section: 'invitations', record_id: id },
        });
      return updated;
    },
    { meter: false },
  );
}
export async function respondCalendarInvite(
  a: Access,
  id: string,
  response: 'accepted' | 'declined' | 'tentative',
  key: string,
) {
  return operation(
    a,
    'calendar.respond',
    key,
    { id, response },
    () => authorize(a, 'calendar', id, false),
    async () => {
      const old = await read(a, id, 'calendar_event'),
        person = old.data.attendees.find((x: any) => x.user_id === a.actor);
      if (!person) fail(404, 'Invitation not found');
      const attendees = old.data.attendees.map((x: any) =>
        x.user_id === a.actor ? { ...x, response } : x,
      );
      return update(a, old, { ...old.data, attendees });
    },
    { meter: false },
  );
}
export async function cancelCalendarEvent(a: Access, id: string, version: number, key: string) {
  return operation(
    a,
    'calendar.cancel',
    key,
    { id, version },
    () => authorize(a, 'calendar', id, true),
    async () => {
      const old = await read(a, id, 'calendar_event');
      if (old.version !== version) fail(409, 'Event changed; reload before cancelling');
      if (old.data.organizer_id !== a.actor && !['owner', 'admin'].includes(a.role))
        fail(403, 'Only the organizer can cancel this event');
      return update(
        a,
        old,
        { ...old.data, cancelled_at: now() },
        { status: 'cancelled' },
        'cancelled',
      );
    },
    { meter: false },
  );
}

const appointmentTypeInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    duration_minutes: z.number().int().min(15).max(480),
    timezone: z.string().min(1).max(100),
    staff: z.array(z.string().min(1).max(200)).min(1).max(20),
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.staff).size !== value.staff.length)
      ctx.addIssue({ code: 'custom', message: 'Select each staff member once', path: ['staff'] });
    try {
      new Intl.DateTimeFormat('en', { timeZone: value.timezone });
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Use a valid IANA timezone', path: ['timezone'] });
    }
  });

export async function calendarAppointmentTypes(a: Access) {
  await authorize(a, 'calendar');
  const rows = await dbAll(
    "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='calendar_appointment_type' AND status='active' ORDER BY created_at DESC",
    [a.org, a.environment],
  );
  const role = await currentMember(a);
  const types = await Promise.all(rows.map((row) => read(a, row.id, 'calendar_appointment_type')));
  return {
    data: types
      .filter((type) => type.data.active || type.owner_id === a.actor || ['owner', 'admin'].includes(role))
      .map(({ id, version, owner_id, data }) => ({ id, version, owner_id, data })),
  };
}

export async function createCalendarAppointmentType(a: Access, input: unknown, key: string) {
  const data = appointmentTypeInput.parse(input);
  await validateMembers(a, data.staff.map((user_id) => ({ user_id })));
  return operation(
    a,
    'calendar.appointment.type.create',
    key,
    data,
    () => authorize(a, 'calendar', undefined, true),
    async () => ({ data: await insert(a, 'calendar_appointment_type', data, { owner: a.actor }) }),
    { meter: false },
  );
}

export async function updateCalendarAppointmentType(
  a: Access,
  id: string,
  input: unknown,
  key: string,
) {
  const { expected_version, ...raw } = z
    .object({ ...appointmentTypeInput.shape, expected_version: z.number().int().positive() })
    .strict()
    .parse(input);
  const data = appointmentTypeInput.parse(raw);
  await validateMembers(a, data.staff.map((user_id) => ({ user_id })));
  return operation(
    a,
    'calendar.appointment.type.update',
    key,
    { id, expected_version, data },
    () => authorize(a, 'calendar', id, true),
    async () => {
      const old = await read(a, id, 'calendar_appointment_type');
      const role = await currentMember(a);
      if (old.owner_id !== a.actor && !['owner', 'admin'].includes(role))
        fail(403, 'Only the appointment type owner can change it');
      if (old.version !== expected_version)
        fail(409, 'Appointment type changed; reload it before saving');
      return update(a, old, data);
    },
    { meter: false },
  );
}

export async function bookCalendarAppointment(
  a: Access,
  typeId: string,
  input: unknown,
  key: string,
) {
  const request = z.object({ start: z.string().datetime({ offset: true }) }).strict().parse(input);
  return operation(
    a,
    'calendar.appointment.book',
    key,
    { typeId, request },
    () => authorize(a, 'calendar'),
    async () => {
      const type = await read(a, typeId, 'calendar_appointment_type');
      if (!type.data.active) fail(409, 'This appointment type is inactive');
      await validateMembers(a, type.data.staff.map((user_id: string) => ({ user_id })));
      const start = Date.parse(request.start);
      const end = start + type.data.duration_minutes * 60000;
      if (start < Date.now() - 60000 || start > Date.now() + 180 * 86400000)
        fail(400, 'Choose a time within the next 180 days');
      const busy = await calendarAvailability(
        a,
        new Date(start).toISOString(),
        new Date(end).toISOString(),
        type.data.staff,
      );
      const conflict = busy.data.some((person) =>
        person.busy.some((slot) => Date.parse(slot.start) < end && Date.parse(slot.end) > start),
      );
      if (conflict) fail(409, 'A selected staff member is no longer available at that time');
      const attendees = type.data.staff.map((user_id: string) => ({
        user_id,
        response: 'pending' as const,
      }));
      const event = await insert(a, 'calendar_event', {
        title: type.data.name,
        description: 'Appointment',
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        timezone: type.data.timezone,
        all_day: false,
        location: '',
        meeting_url: '',
        visibility: 'default',
        recurrence: 'none',
        recurrence_rule: null,
        attendees,
        linked_record: { kind: 'calendar_appointment_type', id: typeId },
        occurrence_exceptions: [],
        organizer_id: a.actor,
        cancelled_at: null,
      });
      await calendarGrant(a, event.id, [...attendees, { user_id: a.actor }]);
      for (const invite of attendees)
        await notify(a, {
          category: 'calendar',
          title: 'Appointment booked',
          body: 'A workspace appointment was booked. Open Calendar to review the details.',
          resource_id: event.id,
          key: 'calendar-appointment:' + event.id,
          user_id: invite.user_id,
          capability: 'read',
          action_data: { app_id: 'calendar', section: 'invitations', record_id: event.id },
        });
      return { status: 'confirmed', event };
    },
    { meter: false },
  );
}

const block = z
  .object({
    type: z.enum([
      'hero',
      'heading',
      'text',
      'image',
      'gallery',
      'columns',
      'features',
      'cta',
      'testimonial',
      'pricing',
      'faq',
      'contact',
      'contact_form',
      'footer',
      'commerce_showcase',
    ]),
    title: z.string().max(180).default(''),
    body: z.string().max(8000).default(''),
    image_url: z.string().url().max(1000).or(z.literal('')).default(''),
    image_id: z.string().uuid().nullable().default(null),
    alt: z.string().max(500).default(''),
    button_label: z.string().max(100).default(''),
    button_url: z.string().max(1000).default(''),
    storefront_slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .or(z.literal(''))
      .default(''),
    background: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#ffffff'),
  })
  .strict();
const safeLink = (value: string) => /^(https:\/\/|mailto:|\/(?!\/)[^\\\r\n]*)/i.test(value);
const pageInput = z
  .object({
    title: z.string().trim().min(1).max(180),
    slug: z.string().min(1).max(100),
    template: z.enum(['blank']).default('blank'),
    sections: z.array(block).max(60),
    meta_title: z.string().max(180).default(''),
    meta_description: z.string().max(320).default(''),
    noindex: z.boolean().default(false),
    theme: z
      .object({
        primary: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default('#087e78'),
        width: z.enum(['standard', 'wide']).default('standard'),
      })
      .strict()
      .default({ primary: '#087e78', width: 'standard' }),
    menus: z
      .array(
        z
          .object({
            label: z.string().min(1).max(80),
            url: z.string().max(500),
            parent_index: z.number().int().min(0).max(29).nullable().default(null),
          })
          .strict(),
      )
      .max(30)
      .default([]),
  })
  .strict()
  .superRefine((d, ctx) => {
    try {
      publicSlug.parse(d.slug);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Use a safe page slug', path: ['slug'] });
    }
    for (const [i, s] of d.sections.entries())
      if (s.button_url && !safeLink(s.button_url))
        ctx.addIssue({
          code: 'custom',
          message: 'Unsafe link destination',
          path: ['sections', i, 'button_url'],
        });
    for (const [i, m] of d.menus.entries())
      if (m.parent_index !== null && m.parent_index >= i)
        ctx.addIssue({
          code: 'custom',
          message: 'A menu item must follow its parent item',
          path: ['menus', i, 'parent_index'],
        });
      else if (m.url && !safeLink(m.url))
        ctx.addIssue({
          code: 'custom',
          message: 'Unsafe link destination',
          path: ['menus', i, 'url'],
        });
    for (const [i, m] of d.menus.entries()) {
      let parent = m.parent_index,
        depth = 0;
      while (parent !== null && parent !== undefined && depth <= 3) {
        depth++;
        parent = d.menus[parent]?.parent_index ?? null;
      }
      if (depth > 3)
        ctx.addIssue({ code: 'custom', message: 'Menu nesting is limited to three levels', path: ['menus', i, 'parent_index'] });
    }
  });
export async function websitePages(a: Access) {
  const pages = (await visible(a, 'website_page')).filter((p) => p.status !== 'deleted');
  const pubs = pages.length
    ? await dbAll(
        "SELECT source_id,slug,version,published_at,active FROM ac_publications WHERE org_id=? AND environment=? AND source_kind='website' AND source_id IN (" +
          pages.map(() => '?').join(',') +
          ')',
        [a.org, a.environment, ...pages.map((p) => p.id)],
      )
    : [];
  return {
    data: pages.map((page) => {
      const pub = pubs.find((p) => p.source_id === page.id);
      return {
        ...page,
        data: {
          ...page.data,
          published_version: pub?.active ? Number(pub.version) : null,
          public_url: pub?.active && a.environment === 'production' ? '/sites/' + pub.slug : null,
          published_at: pub?.published_at || null,
        },
      };
    }),
  };
}

const websiteIdentityInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(1000).default(''),
    public_enabled: z.boolean().default(false),
    default_page_id: z.string().uuid().nullable().default(null),
    logo_media_id: z.string().uuid().nullable().default(null),
    brand_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#087e78'),
    content_width: z.enum(['standard', 'wide']).default('standard'),
    expected_version: z.number().int().positive().optional(),
  })
  .strict();
const defaultWebsiteIdentity = {
  name: 'AfriCore Website',
  description: '',
  public_enabled: false,
  default_page_id: null,
  logo_media_id: null,
  brand_color: '#087e78',
  content_width: 'standard',
};
async function websiteIdentityRow(a: Access) {
  return dbGet(
    "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='website_identity' AND status='active' ORDER BY updated_at DESC LIMIT 1",
    [a.org, a.environment],
  );
}
export async function getWebsiteIdentity(a: Access) {
  await authorize(a, 'website');
  const row = await websiteIdentityRow(a);
  return {
    configured: !!row,
    version: row ? (await read(a, row.id, 'website_identity')).version : null,
    data: row ? (await read(a, row.id, 'website_identity')).data : defaultWebsiteIdentity,
  };
}
export async function saveWebsiteIdentity(a: Access, input: unknown, key: string) {
  const d = websiteIdentityInput.parse(input);
  const { expected_version, ...data } = d;
  const role = await currentMember(a, true);
  if (!['owner', 'admin'].includes(role))
    fail(403, 'Only a workspace owner or administrator can manage website settings');
  if (data.default_page_id) {
    const page = await dbGet(
      "SELECT id FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind='website_page' AND status='active'",
      [data.default_page_id, a.org, a.environment],
    );
    if (!page) fail(400, 'Default page must be an active page in this workspace');
  }
  if (data.logo_media_id) await assetReferences(a, [data.logo_media_id]);
  return operation(
    a,
    'website.identity',
    key,
    d,
    () => authorize(a, 'website', undefined, true),
    async () => {
      const existing = await websiteIdentityRow(a);
      if (!existing) {
        if (expected_version) fail(409, 'Website settings changed; reload before saving');
        return insert(a, 'website_identity', data, { owner: a.org });
      }
      const old = await read(a, existing.id, 'website_identity');
      if (expected_version !== old.version)
        fail(409, 'Website settings changed; reload before saving');
      const updated = await update(a, old, data);
      if (!data.public_enabled)
        await dbRun(
          "UPDATE ac_publications SET active=0 WHERE org_id=? AND environment=? AND source_kind='website'",
          [a.org, a.environment],
        );
      return updated;
    },
    { meter: false },
  );
}

export async function websitePublicationHistory(a: Access, id: string) {
  await authorize(a, 'website', id);
  const publication = await dbGet(
    "SELECT id,version,active,published_at FROM ac_publications WHERE org_id=? AND environment=? AND source_id=? AND source_kind='website'",
    [a.org, a.environment, id],
  );
  if (!publication) return { data: [] };
  const versions = await dbAll(
    'SELECT version,actor,created_at FROM ac_publication_versions WHERE publication_id=? ORDER BY version DESC LIMIT 50',
    [publication.id],
  );
  return {
    active: !!publication.active,
    current_version: Number(publication.version),
    data: versions.map((row) => ({
      version: Number(row.version),
      actor: row.actor,
      created_at: row.created_at,
    })),
  };
}
export async function saveWebsitePage(a: Access, id: string | null, input: unknown, key: string) {
  const d = pageInput
    .extend({ expected_version: z.number().int().positive().optional() })
    .parse(input);
  const imageIds = d.sections.map((section) => section.image_id).filter(Boolean) as string[];
  if (imageIds.length) await assetReferences(a, imageIds);
  if (d.sections.some((section) => section.image_url))
    fail(400, 'Use a reviewed image from the Website media library');
  return operation(
    a,
    id ? 'website.edit' : 'website.create',
    key,
    { id, ...d },
    () => authorize(a, 'website', id || undefined, true),
    async () => {
      if (!id) return insert(a, 'website_page', { ...d, template: 'blank' });
      const old = await read(a, id, 'website_page');
      if (old.version !== d.expected_version) fail(409, 'Page changed; reload before editing');
      const { expected_version: _, ...data } = d;
      return update(a, old, { ...old.data, ...data });
    },
  );
}
export async function publishWebsitePage(a: Access, id: string, version: number, key: string) {
  return operation(
    a,
    'website.publish',
    key,
    { id, version },
    () => authorize(a, 'website', id, true),
    async () => {
      const page = await read(a, id, 'website_page');
      if (page.version !== version) fail(409, 'Page changed; review the current draft');
      const identityRow = await websiteIdentityRow(a);
      const identity = identityRow
        ? (await read(a, identityRow.id, 'website_identity')).data
        : defaultWebsiteIdentity;
      let defaultPageSlug: string | null = null;
      if (identity.default_page_id) {
        const defaultPage = await dbGet(
          "SELECT id FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind='website_page' AND status='active'",
          [identity.default_page_id, a.org, a.environment],
        );
        if (defaultPage)
          defaultPageSlug = (await read(a, defaultPage.id, 'website_page')).data.slug;
      }
      if (!identity.public_enabled && a.environment === 'production')
        fail(409, 'Enable public access in Website Settings before publishing to production');
      const internalLinks = [
        ...page.data.menus.map((menu: any) => menu.url),
        ...page.data.sections.map((section: any) => section.button_url).filter(Boolean),
      ].filter((value: string) => value.startsWith('/') && !value.startsWith('//')) as string[];
      for (const link of internalLinks) {
        const rawPath = link.split(/[?#]/, 1)[0],
          targetSlug =
            rawPath === '/'
              ? defaultPageSlug || page.data.slug
              : rawPath.startsWith('/sites/')
                ? rawPath.slice('/sites/'.length)
                : rawPath.slice(1);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(targetSlug))
          fail(400, 'Use a published page slug for same-site links');
        if (targetSlug === page.data.slug) continue;
        const target = await dbGet(
          "SELECT id FROM ac_publications WHERE org_id=? AND environment=? AND source_kind='website' AND slug=? AND active=1",
          [a.org, a.environment, targetSlug],
        );
        if (!target) fail(409, 'Publish the linked page before publishing this page');
      }
      const mediaIds = page.data.sections.map((section: any) => section.image_id).filter(Boolean);
      if (identity.logo_media_id) mediaIds.push(identity.logo_media_id);
      if (mediaIds.length) await assetReferences(a, mediaIds);
      const existing = await dbGet(
        "SELECT * FROM ac_publications WHERE org_id=? AND environment=? AND source_id=? AND source_kind='website'",
        [a.org, a.environment, id],
      );
      const collision = await dbGet(
        'SELECT id FROM ac_publications WHERE environment=? AND slug=? AND active=1 AND source_id<>?',
        [a.environment, page.data.slug, id],
      );
      if (collision) fail(409, 'This public path is already in use');
      const pubId = existing?.id || randomUUID(),
        pubVersion = Number(existing?.version || 0) + 1,
        at = now();
      const snapshot = seal(
        JSON.stringify({
          title: page.data.title,
          slug: page.data.slug,
          sections: page.data.sections,
          meta_title: page.data.meta_title,
          meta_description: page.data.meta_description,
          noindex: page.data.noindex,
          theme: page.data.theme,
          menus: page.data.menus,
          site: {
            name: identity.name,
            description: identity.description,
            logo_media_id: identity.logo_media_id,
            brand_color: identity.brand_color,
            content_width: identity.content_width,
            public_enabled: identity.public_enabled,
            default_page_id: identity.default_page_id,
            default_page_slug: defaultPageSlug,
          },
        }),
        JSON.stringify(['website-publication', a.org, a.environment, pubId, pubVersion]),
        '2',
      );
      if (existing)
        await dbRun(
          'UPDATE ac_publications SET slug=?,version=?,snapshot=?,active=1,published_by=?,published_at=? WHERE id=? AND org_id=? AND environment=?',
          [page.data.slug, pubVersion, snapshot, a.actor, at, pubId, a.org, a.environment],
        );
      else
        await dbRun(
          "INSERT INTO ac_publications(id,org_id,environment,source_id,source_kind,slug,version,snapshot,active,published_by,published_at) VALUES (?,?,?,?,'website',?,?,?,1,?,?)",
          [pubId, a.org, a.environment, id, page.data.slug, pubVersion, snapshot, a.actor, at],
        );
      await dbRun(
        'INSERT INTO ac_publication_versions(publication_id,version,snapshot,actor,created_at) VALUES (?,?,?,?,?)',
        [pubId, pubVersion, snapshot, a.actor, at],
      );
      return {
        id: pubId,
        slug: page.data.slug,
        version: pubVersion,
        published_at: at,
        url: a.environment === 'production' ? '/sites/' + page.data.slug : null,
      };
    },
    { meter: false },
  );
}
export async function unpublishWebsitePage(a: Access, id: string, version: number, key: string) {
  return operation(
    a,
    'website.unpublish',
    key,
    { id, version },
    () => authorize(a, 'website', id, true),
    async () => {
      const page = await read(a, id, 'website_page');
      if (page.version !== version) fail(409, 'Page changed; review the current draft');
      const publication = await dbGet(
        "SELECT id,version FROM ac_publications WHERE org_id=? AND environment=? AND source_id=? AND source_kind='website' AND active=1",
        [a.org, a.environment, id],
      );
      if (!publication) fail(409, 'This page is not published');
      await dbRun('UPDATE ac_publications SET active=0 WHERE id=? AND org_id=? AND environment=?', [
        publication.id,
        a.org,
        a.environment,
      ]);
      return { id: publication.id, active: false, withdrawn_at: now() };
    },
    { meter: false },
  );
}

export async function restoreWebsitePublication(
  a: Access,
  id: string,
  sourceVersion: number,
  key: string,
) {
  if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 1)
    fail(400, 'Invalid publication version');
  return operation(
    a,
    'website.restore_publication',
    key,
    { id, sourceVersion },
    () => authorize(a, 'website', id, true),
    async () => {
      const page = await read(a, id, 'website_page');
      const publication = await dbGet(
        "SELECT * FROM ac_publications WHERE org_id=? AND environment=? AND source_id=? AND source_kind='website'",
        [a.org, a.environment, id],
      );
      if (!publication) fail(404, 'No publication history exists for this page');
      if (Number(publication.version) === sourceVersion)
        fail(409, 'This publication is already the current version');
      const previous = await dbGet(
        'SELECT snapshot FROM ac_publication_versions WHERE publication_id=? AND version=?',
        [publication.id, sourceVersion],
      );
      if (!previous) fail(404, 'Publication version not found');
      let snapshot: any;
      try {
        snapshot = JSON.parse(
          unseal(
            previous.snapshot,
            JSON.stringify([
              'website-publication',
              a.org,
              a.environment,
              publication.id,
              sourceVersion,
            ]),
          ),
        );
      } catch {
        fail(409, 'Publication history could not be verified');
      }
      const { site: previousSite, ...previousPage } = snapshot;
      const safe = pageInput.parse({ ...previousPage, template: page.data.template });
      const mediaIds = safe.sections.map((section) => section.image_id).filter(Boolean) as string[];
      if (previousSite?.logo_media_id) mediaIds.push(previousSite.logo_media_id);
      if (mediaIds.length) await assetReferences(a, mediaIds);
      const collision = await dbGet(
        'SELECT id FROM ac_publications WHERE environment=? AND slug=? AND active=1 AND source_id<>?',
        [a.environment, safe.slug, id],
      );
      if (collision) fail(409, 'The historic public path is currently in use');
      if (a.environment === 'production' && previousSite?.public_enabled === false)
        fail(409, 'That historic publication was not publicly enabled');
      const nextVersion = Number(publication.version) + 1;
      const at = now();
      const restoredSnapshot = seal(
        JSON.stringify({ ...safe, site: previousSite || defaultWebsiteIdentity }),
        JSON.stringify(['website-publication', a.org, a.environment, publication.id, nextVersion]),
        '2',
      );
      await dbRun(
        'UPDATE ac_publications SET slug=?,version=?,snapshot=?,active=1,published_by=?,published_at=? WHERE id=? AND org_id=? AND environment=?',
        [
          safe.slug,
          nextVersion,
          restoredSnapshot,
          a.actor,
          at,
          publication.id,
          a.org,
          a.environment,
        ],
      );
      await dbRun(
        'INSERT INTO ac_publication_versions(publication_id,version,snapshot,actor,created_at) VALUES (?,?,?,?,?)',
        [publication.id, nextVersion, restoredSnapshot, a.actor, at],
      );
      return {
        id: publication.id,
        slug: safe.slug,
        version: nextVersion,
        restored_from: sourceVersion,
        published_at: at,
        url: a.environment === 'production' ? '/sites/' + safe.slug : null,
      };
    },
    { meter: false },
  );
}
export async function publicWebsitePage(slug: string, path = '') {
  const pageSlug = path ? slug + '/' + path : slug;
  const p = await dbGet(
    "SELECT * FROM ac_publications WHERE environment='production' AND slug=? AND active=1 AND source_kind='website'",
    [pageSlug],
  );
  if (!p) return null;
  const workspace = await dbGet('SELECT kind,status FROM ac_workspaces WHERE id=?', [p.org_id]);
  if (workspace?.kind !== 'business' || workspace.status !== 'active') return null;
  const websiteService = await dbGet(
    "SELECT 1 AS active FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment='production' AND e.service_id='website' AND e.status='active' AND s.enabled=1",
    [p.org_id],
  );
  if (!websiteService) return null;
  try {
    const snapshot = JSON.parse(
      unseal(
        p.snapshot,
        JSON.stringify(['website-publication', p.org_id, p.environment, p.id, Number(p.version)]),
      ),
    );
    if (snapshot.site?.public_enabled === false) return null;
    const mediaIds = [
      ...new Set(snapshot.sections.map((section: any) => section.image_id).filter(Boolean)),
    ] as string[];
    if (mediaIds.length) {
      const activeMedia = await dbAll(
        "SELECT id FROM ac_public_media WHERE org_id=? AND environment='production' AND status='active' AND id IN (" +
          mediaIds.map(() => '?').join(',') +
          ')',
        [p.org_id, ...mediaIds],
      );
      if (activeMedia.length !== mediaIds.length) return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

/** Build a sitemap only for the active published pages belonging to this site. */
export async function publicWebsiteSitemap(slug: string) {
  const first = await dbGet(
    "SELECT id,org_id FROM ac_publications WHERE environment='production' AND slug=? AND active=1 AND source_kind='website'",
    [slug],
  );
  if (!first || !(await publicWebsitePage(slug))) return null;
  const sitePages = await dbAll(
    "SELECT slug,published_at FROM ac_publications WHERE org_id=? AND environment='production' AND active=1 AND source_kind='website' ORDER BY slug",
    [first.org_id],
  );
  const publicPages = [] as Array<{ slug: string; published_at: string }>;
  for (const page of sitePages) {
    if (await publicWebsitePage(String(page.slug)))
      publicPages.push({ slug: String(page.slug), published_at: String(page.published_at) });
  }
  const origin = process.env.AFRICORE_PUBLIC_ORIGIN || '';
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return null;
  }
  if (base.protocol !== 'https:' || base.origin !== origin || base.username || base.password)
    return null;
  const xmlEscape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  const entries = publicPages
    .map(
      (page) =>
        `<url><loc>${xmlEscape(base.origin + '/sites/' + page.slug)}</loc><lastmod>${xmlEscape(new Date(page.published_at).toISOString())}</lastmod></url>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
}

/** Deliver only active images referenced by the current public site snapshot. */
export async function publicWebsiteImage(slug: string, id: string) {
  z.string().uuid().parse(id);
  const publication = await dbGet(
    "SELECT * FROM ac_publications WHERE environment='production' AND slug=? AND active=1 AND source_kind='website'",
    [slug],
  );
  if (!publication) return null;
  let snapshot: any;
  try {
    snapshot = JSON.parse(
      unseal(
        publication.snapshot,
        JSON.stringify([
          'website-publication',
          publication.org_id,
          publication.environment,
          publication.id,
          Number(publication.version),
        ]),
      ),
    );
  } catch {
    return null;
  }
  if (
    snapshot.site?.logo_media_id !== id &&
    !snapshot.sections?.some((section: any) => section.image_id === id)
  )
    return null;
  const workspace = await dbGet('SELECT kind,status FROM ac_workspaces WHERE id=?', [
    publication.org_id,
  ]);
  if (workspace?.kind !== 'business' || workspace.status !== 'active') return null;
  const websiteService = await dbGet(
    "SELECT 1 AS active FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment='production' AND e.service_id='website' AND e.status='active' AND s.enabled=1",
    [publication.org_id],
  );
  if (!websiteService) return null;
  const asset = await dbGet(
    "SELECT * FROM ac_public_media WHERE id=? AND org_id=? AND environment='production' AND status='active'",
    [id, publication.org_id],
  );
  if (!asset) return null;
  return { bytes: assetBytes(asset), mime: asset.mime };
}

const websiteContactInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254),
    company: z.string().trim().max(120).default(''),
    message: z.string().trim().min(5).max(4000),
    consent: z.literal(true),
    website: z.string().max(200).default(''),
  })
  .strict();

/** Accept only forms explicitly present on the active production page snapshot. */
export async function submitPublicWebsiteForm(slug: string, input: unknown) {
  const data = websiteContactInput.parse(input);
  // Honeypot bots receive the same success response but are not persisted.
  if (data.website) return { accepted: true };
  const page = await publicWebsitePage(slug);
  if (!page || !page.sections.some((section: any) => section.type === 'contact_form')) return null;
  const publication = await dbGet(
    "SELECT id,org_id FROM ac_publications WHERE environment='production' AND slug=? AND active=1 AND source_kind='website'",
    [slug],
  );
  if (!publication) return null;
  const id = randomUUID(),
    createdAt = now(),
    expires = new Date(Date.parse(createdAt) + 90 * 24 * 60 * 60 * 1000).toISOString(),
    payload = seal(
      JSON.stringify({
        name: data.name,
        email: data.email,
        company: data.company,
        message: data.message,
        consent: true,
      }),
      JSON.stringify(['website-form', publication.org_id, 'production', id]),
      '2',
    );
  await dbRun("DELETE FROM ac_website_form_submissions WHERE expires_at<=? AND status='expired'", [
    createdAt,
  ]);
  await dbRun(
    "INSERT INTO ac_website_form_submissions(id,org_id,environment,publication_id,slug,payload,status,created_at,expires_at) VALUES (?,?,'production',?,?,?,?,?,?)",
    [id, publication.org_id, publication.id, slug, payload, 'new', createdAt, expires],
  );
  return { accepted: true };
}

export async function websiteFormSubmissions(a: Access) {
  await currentMember(a);
  await requireServices(a, ['website'], true);
  if (!['owner', 'admin'].includes(a.role)) fail(403, 'Workspace administrator required');
  const at = now();
  await dbRun(
    "UPDATE ac_website_form_submissions SET status='expired',payload='' WHERE org_id=? AND environment=? AND expires_at<=? AND status='new'",
    [a.org, a.environment, at],
  );
  const rows = await dbAll(
    'SELECT id,environment,payload,status,created_at FROM ac_website_form_submissions WHERE org_id=? AND environment=? ORDER BY created_at DESC,id DESC LIMIT 100',
    [a.org, a.environment],
  );
  return {
    data: rows.map((row) => ({
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      ...(row.payload
        ? JSON.parse(
            unseal(row.payload, JSON.stringify(['website-form', a.org, row.environment, row.id])),
          )
        : {}),
    })),
  };
}
