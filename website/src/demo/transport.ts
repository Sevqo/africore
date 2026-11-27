import { demoTrust, seedTrust } from './trust';
import initial from './fixture.json';
const KEY = 'africore.demo.v1',
  ACTIVE = 'africore.demo.active';
export const isDemo = () =>
  typeof localStorage !== 'undefined' && localStorage.getItem(ACTIVE) === 'yes';
export function startDemo(reset = false) {
  if (reset || !localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(initial));
  localStorage.setItem(ACTIVE, 'yes');
}
export function exitDemo() {
  localStorage.removeItem(ACTIVE);
}
const now = () => new Date().toISOString(),
  id = () => crypto.randomUUID(),
  date = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') || structuredClone(initial);
  } catch {
    return structuredClone(initial);
  }
}
export async function transport(path: string, options: RequestInit = {}): Promise<Response> {
  let input: any = {};
  try {
    input = typeof options.body === 'string' ? JSON.parse(options.body) : {};
  } catch {}
  if (!isDemo()) return fetch(path, options);
  const method = options.method || 'GET',
    url = new URL(path, location.origin),
    state: any = read();
  seedTrust(state);
  const finish = (data: any, status = 200) => {
    localStorage.setItem(KEY, JSON.stringify(state));
    return Response.json(data, { status });
  };
  const reject = (message: string, status = 400) => finish({ message }, status);
  const headers = new Headers(options.headers);
  if (headers.get('X-Environment') === 'production')
    return reject('The demo contains sandbox data only. Switch back to Sandbox.', 403);
  if (url.pathname === '/api/auth/me') return finish(state['/me']);
  if (url.pathname === '/api/auth/signout') {
    exitDemo();
    return Response.json({ signed_out: true });
  }
  if (url.pathname === '/api/v1/organizations')
    return method === 'GET'
      ? finish({ data: [{ ...state['/organization'], role: 'owner' }] })
      : reject('Use the seeded demo workspace. Connect a backend to create real organizations.');
  const orgPrefix = '/api/v1/organizations/' + state['/organization'].id;
  let route = url.pathname.startsWith(orgPrefix)
    ? url.pathname.slice(orgPrefix.length)
    : url.pathname.replace('/api/v1', '');
  const trustResult = await demoTrust(state, route, method, input);
  if (trustResult !== null)
    return trustResult.__error ? reject(trustResult.__error, 409) : finish(trustResult);
  const selectedCurrency = url.searchParams.get('currency') || input.currency || 'KES';
  const rows = (key: string) => state[key]?.data || [],
    find = (key: string, recordId: string) => rows(key).find((r: any) => r.id === recordId);
  const add = (key: string, d: any) => {
    const row = {
      ...d,
      id: d.id || id(),
      created_at: now(),
      updated_at: now(),
      environment: 'sandbox',
      org_id: state['/organization'].id,
    };
    state[key] ||= { data: [] };
    state[key].data.unshift(row);
    return row;
  };
  const audit = (action: string, resource?: string) =>
    add('/audit', { actor: state['/me'].id, action, resource_id: resource });
  const snapshot = () => {
    const s = structuredClone(state['/intelligence']),
      invoices = rows('/records/invoices').filter(
        (i: any) => !['draft', 'voided'].includes(i.status) && i.currency === selectedCurrency,
      ),
      expenses = rows('/expenses').filter(
        (e: any) =>
          e.currency === selectedCurrency &&
          !rows('/expenses').some((c: any) => c.supersedes_id === e.id),
      );
    s.currency = selectedCurrency;
    s.invoices = invoices.map((i: any) => ({
      ...i,
      outstanding_minor: i.total_minor - i.paid_minor,
      overdue_days: Math.max(
        0,
        Math.floor((Date.parse(date()) - Date.parse(i.due_date)) / 86400000),
      ),
    }));
    s.totals.confirmed_inflows_minor = rows('/payments')
      .filter((p: any) => p.status === 'paid' && p.currency === selectedCurrency)
      .reduce((n: number, p: any) => n + (p.paid_minor || p.amount_minor || 0), 0);
    s.totals.recorded_outflows_minor = expenses.reduce(
      (n: number, e: any) => n + e.amount_minor,
      0,
    );
    s.totals.net_movement_minor =
      s.totals.confirmed_inflows_minor - s.totals.recorded_outflows_minor;
    s.totals.outstanding_minor = s.invoices.reduce(
      (n: number, i: any) => n + i.outstanding_minor,
      0,
    );
    s.totals.overdue_minor = s.invoices
      .filter((i: any) => i.overdue_days > 0)
      .reduce((n: number, i: any) => n + i.outstanding_minor, 0);
    s.totals.invoiced_sales_minor = invoices.reduce((n: number, i: any) => n + i.total_minor, 0);
    s.period.to = date();
    s.as_of = date();
    s.customers = rows('/records/customers').map((c: any) => {
      const ds = s.invoices.filter((i: any) => i.customer_id === c.id);
      return {
        ...c,
        customer_id: c.id,
        total_invoiced_minor: ds.reduce((n: number, i: any) => n + i.total_minor, 0),
        total_paid_minor: ds.reduce((n: number, i: any) => n + i.paid_minor, 0),
        outstanding_minor: ds.reduce((n: number, i: any) => n + i.outstanding_minor, 0),
        settled_invoice_count: ds.filter((i: any) => i.paid_minor === i.total_minor).length,
        limited_data: true,
        average_delay_days: null,
        on_time_percent: null,
      };
    });
    s.aging = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_over_90: 0,
    };
    for (const invoice of s.invoices) {
      const key =
        invoice.overdue_days === 0
          ? 'current'
          : invoice.overdue_days <= 30
            ? 'days_1_30'
            : invoice.overdue_days <= 60
              ? 'days_31_60'
              : invoice.overdue_days <= 90
                ? 'days_61_90'
                : 'days_over_90';
      s.aging[key] += invoice.outstanding_minor;
    }
    if (!s.series.some((point: any) => point.date === date())) s.series.push({ date: date() });
    s.series = s.series.map((point: any) => ({
      ...point,
      confirmed_inflows_minor: rows('/payments')
        .filter(
          (pay: any) =>
            pay.status === 'paid' &&
            pay.currency === selectedCurrency &&
            pay.created_at?.slice(0, 10) === point.date,
        )
        .reduce((n: number, pay: any) => n + (pay.paid_minor || pay.amount_minor || 0), 0),
      recorded_outflows_minor: expenses
        .filter((expense: any) => expense.occurred_on === point.date)
        .reduce((n: number, e: any) => n + e.amount_minor, 0),
    }));
    s.quality.demo = true;
    s.quality.bank_balance_available = false;
    s.quality.profit_available = false;
    return s;
  };
  if (route === '/intelligence') return finish(snapshot());
  if (route === '/report') {
    const s = snapshot();
    if (url.searchParams.get('format') === 'csv') {
      const csv = [
        'reference,currency,total_minor,paid_minor,due_date,status',
        ...s.invoices.map((i: any) =>
          [i.reference, i.currency, i.total_minor, i.paid_minor, i.due_date, i.status]
            .map((v) => '\"' + String(v ?? '').replaceAll('\"', '\"\"') + '\"')
            .join(','),
        ),
      ].join('\r\n');
      return new Response(csv, { headers: { 'Content-Type': 'text/csv' } });
    }
    return finish({
      ...state['/report'],
      currency: selectedCurrency,
      confirmed_inflows_minor: s.totals.confirmed_inflows_minor,
      recorded_outflows_minor: s.totals.recorded_outflows_minor,
      net_recorded_movement_minor: s.totals.net_movement_minor,
      outstanding_minor: s.totals.outstanding_minor,
      overdue_minor: s.totals.overdue_minor,
      invoices: s.invoices,
      aging: s.aging,
    });
  }
  if (route === '/forecasts') {
    const f = structuredClone(state['/forecasts']),
      s = snapshot(),
      h = Number(input.horizon || 30),
      bps =
        input.scenario === 'optimistic'
          ? 10000
          : input.scenario === 'conservative'
            ? 6500
            : input.scenario === 'custom'
              ? Number(input.collection_bps ?? 9000)
              : 9000;
    f.currency = selectedCurrency;
    f.horizon = h;
    f.scenario = input.scenario || 'expected';
    f.assumptions.collection_bps = bps;
    f.projected_inflows_minor = Math.round((s.totals.outstanding_minor * bps) / 10000);
    f.projected_outflows_minor = rows('/obligations')
      .filter((o: any) => o.status === 'active' && o.currency === selectedCurrency)
      .reduce((n: number, o: any) => n + o.amount_minor, 0);
    const delay = input.scenario === 'conservative' ? 14 : Number(input.delay_days || 0);
    if (delay >= h) f.projected_inflows_minor = 0;
    f.assumptions.additional_delay_days = delay;
    f.assumptions.outflow_bps = Number(input.outflow_bps || 10000);
    f.projected_outflows_minor = Math.round(
      (f.projected_outflows_minor * f.assumptions.outflow_bps) / 10000,
    );
    f.receivables = s.invoices.map((invoice: any) => ({
      invoice_id: invoice.id,
      customer_id: invoice.customer_id,
      expected_date: new Date(Date.now() + (5 + delay) * 86400000).toISOString().slice(0, 10),
      expected_receipt_minor:
        delay >= h ? 0 : Math.round((invoice.outstanding_minor * bps) / 10000),
      delay_observations: 0,
    }));
    f.estimated_net_movement_minor = f.projected_inflows_minor - f.projected_outflows_minor;
    f.series = Array.from({ length: h }, (_, i) => ({
      date: new Date(Date.now() + (i + 1) * 86400000).toISOString().slice(0, 10),
      inflow_minor: i === Math.min(4, h - 1) ? f.projected_inflows_minor : 0,
      outflow_minor: i === Math.min(4, h - 1) ? f.projected_outflows_minor : 0,
      cumulative_net_movement_minor: i >= Math.min(4, h - 1) ? f.estimated_net_movement_minor : 0,
    }));
    f.uncertainty =
      'Simplified browser demo scenario; use the connected backend for due-date and history-aware forecasting.';
    return finish(f);
  }
  if (route === '/assistant') {
    const s = snapshot();
    return finish({
      status: 'demo_local',
      provider: 'none',
      evidence: {
        tool: input.tool || 'financial_summary',
        currency: 'KES',
        ...s.totals,
      },
      explanation:
        'Browser demo: recorded collections and expenses are synthetic. Review receivables and obligations in the Intelligence and Forecasts tabs. No external AI request was sent.',
      actions_executed: false,
      limitations: ['Synthetic browser data; no external model or bank connection.'],
    });
  }
  if (route.startsWith('/internal/'))
    return reject(
      'Internal engineering access requires a connected backend and a verified allowlisted engineer.',
      403,
    );
  const recordMatch = /^\/records\/([^/]+)(?:\/([^/]+))?$/.exec(route);
  if (recordMatch) {
    const key = '/records/' + recordMatch[1],
      row = recordMatch[2] ? find(key, recordMatch[2]) : null;
    if (method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50))),
        offset = Math.max(0, Number(url.searchParams.get('offset') || 0)),
        q = (url.searchParams.get('q') || '').toLowerCase(),
        status = url.searchParams.get('status');
      const filtered = rows(key).filter(
        (r: any) =>
          (!q || JSON.stringify(r).toLowerCase().includes(q)) && (!status || r.status === status),
      );
      return finish(
        recordMatch[2]
          ? row || { message: 'Record not found' }
          : { data: filtered.slice(offset, offset + limit), limit, offset },
      );
    }
    if (method === 'POST') {
      let d = {
        ...input,
        kind: recordMatch[1],
        status: 'draft',
        paid_minor: 0,
        payment_status: 'unpaid',
        fulfillment_status: 'unfulfilled',
      };
      if (input.items) {
        d.subtotal_minor = input.items.reduce(
          (n: number, i: any) => n + i.quantity * i.unit_price_minor,
          0,
        );
        d.tax_minor = Math.round(
          ((d.subtotal_minor - (input.discount_minor || 0)) * (input.tax_bps || 0)) / 10000,
        );
        d.total_minor = d.subtotal_minor - (input.discount_minor || 0) + d.tax_minor;
        d.reference =
          (recordMatch[1] === 'orders' ? 'ORD-' : 'INV-') + id().slice(0, 6).toUpperCase();
        if (d.total_minor <= 0) return reject('Enter a positive document total.');
      }
      const result = add(key, d);
      audit('demo.record.created', result.id);
      return finish(result, 201);
    }
    if (row && method === 'PATCH') {
      if (
        recordMatch[1] === 'orders' &&
        rows('/protected-sales').some(
          (s: any) => s.order_id === row.id && !['cancelled', 'expired'].includes(s.state),
        )
      )
        return reject('Use protected shipment actions for this order.', 409);
      Object.assign(row, input, { updated_at: now() });
      audit('demo.record.updated', row.id);
      return finish(row);
    }
  }
  if (route === '/payment-requests' && method === 'POST') {
    const doc =
      find('/records/invoices', input.document_id) || find('/records/orders', input.document_id);
    if (
      doc &&
      rows('/protected-sales').some(
        (s: any) => s.order_id === doc.id && !['cancelled', 'expired'].includes(s.state),
      )
    )
      return reject('This order uses the protected purchase workflow.', 409);
    if (!doc || doc.status === 'draft') return reject('Issue the invoice or order first.');
    if (doc.paid_minor >= doc.total_minor) return reject('This document is already paid.');
    const payment = add('/payments', {
      document_id: doc.id,
      amount_minor: doc.total_minor - doc.paid_minor,
      paid_minor: 0,
      currency: doc.currency,
      status: 'pending',
      checkout_url: '/checkout/demo-' + id(),
      reference: doc.reference,
    });
    return finish(payment, 201);
  }
  if (route.startsWith('/checkout/')) {
    const pay = rows('/payments').find((p: any) => p.checkout_url === route.replace(/\/pay$/, ''));
    if (!pay) return reject('Demo payment link not found.', 404);
    if (method === 'POST') {
      pay.status =
        input.scenario === 'failure' ? 'failed' : input.scenario === 'pending' ? 'pending' : 'paid';
      if (pay.status === 'paid') {
        pay.paid_minor = pay.amount_minor;
        const doc =
          find('/records/invoices', pay.document_id) || find('/records/orders', pay.document_id);
        if (doc) {
          doc.paid_minor = doc.total_minor;
          doc.payment_status = 'paid';
        }
      }
      audit('demo.payment.simulated', pay.id);
    }
    return finish({
      ...pay,
      merchant: state['/organization'].name,
      environment: 'sandbox',
      items:
        (find('/records/invoices', pay.document_id) || find('/records/orders', pay.document_id))
          ?.items || [],
      document:
        find('/records/invoices', pay.document_id) || find('/records/orders', pay.document_id),
    });
  }
  if (route === '/automations/process') {
    let processed = 0;
    for (const w of rows('/automations').filter((w: any) => w.enabled)) {
      if (
        rows('/automation-runs').some(
          (r: any) => r.workflow_id === w.id && r.created_at.slice(0, 10) === date(),
        )
      )
        continue;
      add('/automation-runs', {
        workflow_id: w.id,
        trigger_key: 'demo:' + date(),
        status: 'succeeded',
        attempts: 1,
        result: JSON.stringify({ action: 'in_app_notification' }),
      });
      add('/notifications', {
        title: w.name,
        body: 'Synthetic scheduled review. No customer message or financial action sent.',
        category: 'payments',
        read_at: null,
      });
      processed++;
    }
    return finish({ processed });
  }
  if (route === '/notification-preferences') {
    state['/notifications'].preferences = input;
    return finish(input);
  }
  const simple =
    /^\/(expenses|obligations|automations|notifications|shipments|connectors|approvals|protected-sales|disputes)(?:\/([^/]+))?(?:\/(transition|evidence|sync|action|decide|respond|resolve|import))?$/.exec(
      route,
    );
  if (simple) {
    const key = '/' + simple[1],
      row = simple[2] ? find(key, simple[2]) : null,
      op = simple[3];
    if (method === 'GET') return finish(row || state[key] || { data: [] });
    if (method === 'POST' && !simple[2]) {
      const d = { ...input };
      if (key === '/expenses') {
        if (!Number.isSafeInteger(d.amount_minor) || d.amount_minor <= 0)
          return reject('Enter a positive expense.');
      }
      if (key === '/obligations') d.status ||= 'active';
      if (key === '/automations') {
        d.created_by = state['/me'].id;
        d.conditions ||= { currency: 'KES', minimum_minor: 0 };
        d.enabled ??= true;
      }
      if (key === '/connectors') {
        d.status = 'configured';
        d.authorization_state = 'sandbox_simulated';
      }
      if (key === '/shipments') {
        const order = find('/records/orders', d.order_id);
        if (!order) return reject('Choose an order.');
        const active = rows('/protected-sales').find(
          (x: any) => x.order_id === order.id && !['cancelled', 'expired'].includes(x.state),
        );
        if (active) {
          if (!['awaiting_shipment', 'shipped'].includes(active.state))
            return reject('Buyer payment is required before shipment.', 409);
          d.protected_sale_id = active.id;
        }
        const siblings = rows('/shipments').filter(
          (x: any) => x.order_id === order.id && !['cancelled', 'returned'].includes(x.status),
        );
        if (
          !d.items?.length ||
          d.items.some(
            (i: any) =>
              !order.items[i.item_index] ||
              i.quantity +
                siblings.reduce(
                  (n: number, x: any) =>
                    n +
                    x.items
                      .filter((v: any) => v.item_index === i.item_index)
                      .reduce((m: number, v: any) => m + v.quantity, 0),
                  0,
                ) >
                order.items[i.item_index].quantity,
          )
        )
          return reject('Shipment quantity exceeds remaining order quantities.');
        d.status = 'pending';
        d.delivery_assurance = 'seller_reported';
        d.history = [{ state: 'pending', source: 'seller_reported', at: now() }];
      }
      if (key === '/approvals') {
        if (d.approver === state['/me'].id) return reject('Choose a different approver.');
        d.status = 'pending';
        d.requester = state['/me'].id;
        d.expires_at = new Date(Date.now() + 86400000).toISOString();
      }
      if (key === '/protected-sales') {
        const order = add('/records/orders', {
          kind: 'orders',
          customer_id: rows('/records/customers')[0]?.id,
          items: [
            {
              description: d.title,
              quantity: 1,
              unit_price_minor: d.amount_minor,
            },
          ],
          total_minor: d.amount_minor,
          currency: d.currency,
          status: 'awaiting_payment',
          paid_minor: 0,
          fulfillment_status: 'unfulfilled',
          payment_status: 'unpaid',
          reference: 'PRO-' + id().slice(0, 6),
        });
        d.order_id ||= order.id;
        d.state = 'awaiting_buyer_payment';
        d.history = [{ state: d.state, source: 'seller_reported', at: now() }];
        d.payment_state = 'not_initiated';
        d.arrangement_state = 'unconfirmed';
        d.settlement_state = 'not_requested';
        d.buyer_url = '/buyer/demo-' + id();
      }
      const result = add(key, d);
      audit('demo.' + simple[1] + '.created', result.id);
      return finish(result, 201);
    }
    if (!row) return reject('Record not found.', 404);
    if (method === 'PATCH') {
      Object.assign(row, key === '/notifications' ? { read_at: now() } : input);
      return finish(row);
    }
    if (op === 'evidence') {
      state['/evidence/' + row.id] ||= { data: [] };
      return finish(
        add('/evidence/' + row.id, {
          ...input,
          source: 'seller_reported',
          assurance: 'seller_reported',
        }),
        201,
      );
    }
    if (op === 'transition') {
      const next: any = {
        pending: ['processing', 'cancelled'],
        processing: ['ready_for_dispatch', 'cancelled'],
        ready_for_dispatch: ['shipped', 'cancelled'],
        shipped: ['out_for_delivery', 'delivery_exception', 'returned'],
        out_for_delivery: ['delivered', 'delivery_exception', 'returned'],
        delivery_exception: ['out_for_delivery', 'returned'],
        delivered: ['returned'],
      };
      if (!next[row.status]?.includes(input.status))
        return reject('Invalid fulfillment transition.', 409);
      row.status = input.status;
      row.history.push({
        state: input.status,
        source: 'seller_reported',
        at: now(),
      });
      if (row.protected_sale_id && input.status === 'shipped') {
        const sale = find('/protected-sales', row.protected_sale_id);
        if (sale) sale.state = 'shipped';
      }
      return finish(row);
    }
    if (op === 'sync') {
      row.status = row.scenario === 'failure' ? 'failed' : 'synced';
      row.last_synced_at = now();
      row.last_batch = { provenance: 'sandbox_simulated', records: [] };
      return finish(row);
    }
    if (op === 'import')
      return reject(
        'Use Transactions > Import for custom demo rows; connected connector import requires the backend.',
      );
    if (op === 'action' && key === '/connectors') {
      row.status = input.action === 'disconnect' ? 'disconnected' : 'configured';
      return finish(row);
    }
    if (op === 'decide')
      return reject(
        'This demo login cannot approve its own requests. Use separate authorized accounts on the backend.',
        403,
      );
    if (op === 'respond') {
      row.status = 'under_review';
      row.history.push({
        status: 'under_review',
        party: 'seller_reported',
        statement: input.statement,
        at: now(),
      });
      return finish(row);
    }
    if (op === 'resolve' || op === 'action')
      return reject(
        'Settlement requires a separate authorized reviewer on the connected backend. No demo self-approval is allowed.',
        403,
      );
  }
  if (route.startsWith('/buyer/')) {
    const sale = rows('/protected-sales').find(
      (s: any) => s.buyer_url === route.replace(/\/(action|disputes).*$/, ''),
    );
    if (!sale) return reject('Demo buyer link is unavailable in this browser.', 404);
    if (method === 'POST') {
      if (route.endsWith('/disputes')) {
        const dispute = add('/disputes', {
          ...input,
          protected_sale_id: sale.id,
          status: 'open',
          history: [
            {
              status: 'open',
              party: 'buyer_reported',
              statement: input.statement,
              at: now(),
            },
          ],
        });
        sale.state = 'disputed';
        return finish(dispute, 201);
      }
      const action = input.action;
      if (action === 'confirm_receipt') {
        const order = find('/records/orders', sale.order_id),
          shipped = rows('/shipments').filter(
            (s: any) =>
              s.protected_sale_id === sale.id &&
              ['shipped', 'out_for_delivery', 'delivered'].includes(s.status),
          );
        if (
          !order?.items.every(
            (i: any, index: number) =>
              shipped.reduce(
                (n: number, s: any) =>
                  n +
                  s.items
                    .filter((v: any) => v.item_index === index)
                    .reduce((m: number, v: any) => m + v.quantity, 0),
                0,
              ) >= i.quantity,
          )
        )
          return reject('All purchased quantities must ship before confirming receipt.', 409);
      }
      const allowed: any = {
        pay: ['awaiting_buyer_payment'],
        confirm_receipt: ['shipped'],
        accept: ['inspection_period'],
        cancel: ['awaiting_buyer_payment'],
      };
      if (!allowed[action]?.includes(sale.state))
        return reject('This action is not available in the current demo state.', 409);
      sale.state =
        action === 'pay'
          ? 'awaiting_shipment'
          : action === 'confirm_receipt'
            ? 'inspection_period'
            : action === 'accept'
              ? 'accepted'
              : 'cancelled';
      if (action === 'pay') {
        sale.payment_state = 'provider_confirmed';
        sale.arrangement_state = 'sandbox_confirmed';
      }
      sale.history.push({
        state: sale.state,
        source: 'browser_demo_simulation',
        at: now(),
      });
    }
    return finish({
      ...sale,
      merchant: state['/organization'].name,
      merchant_verification: 'unverified',
      environment: 'sandbox',
      custody: 'Browser demo only. No funds are held.',
      provider: 'Browser demo simulator',
      fees_minor: 0,
      shipments: rows('/shipments').filter((s: any) => s.protected_sale_id === sale.id),
      disputes: rows('/disputes').filter((d: any) => d.protected_sale_id === sale.id),
    });
  }
  if (route.startsWith('/agent')) {
    state['/agent'] ||= {
      policy: {
        autonomy_mode: 'supervised',
        computer_use_enabled: true,
        cross_dev_bridge_enabled: false,
        permissions: {
          analyze_business: 'autonomous',
          forecast_cashflow: 'autonomous',
          schedule_meeting: 'approval_required',
          create_project: 'approval_required',
          create_crm_lead: 'approval_required',
          create_draft_invoice: 'approval_required',
          record_expense: 'approval_required',
          send_workspace_reply: 'approval_required',
        },
      },
      billing: {
        billing_stream: 'separate_agent_credits',
        excluded_from_workspace_all_apps_cap: true,
        collection_enabled: false,
        period: date().slice(0, 7),
        currency: 'KES',
        plan: {
          id: 'agent_starter',
          name: 'Agent Starter',
          currency: 'KES',
          monthly_minor: 0,
          included_credits: 50,
          overage_unit_minor: 1000,
          summary: 'KSh 0/mo · 50 Agent Credits/mo included, then KSh 10/credit',
        },
        available_plans: [
          {
            id: 'agent_starter',
            name: 'Agent Starter',
            currency: 'KES',
            monthly_minor: 0,
            included_credits: 50,
            overage_unit_minor: 1000,
            summary: 'KSh 0/mo · 50 Agent Credits/mo included, then KSh 10/credit',
          },
          {
            id: 'agent_growth',
            name: 'Agent Growth',
            currency: 'KES',
            monthly_minor: 99000,
            included_credits: 300,
            overage_unit_minor: 600,
            summary: 'KSh 990/mo · 300 Agent Credits/mo included, then KSh 6/credit',
          },
          {
            id: 'agent_autonomous',
            name: 'Agent Autonomous Pro',
            currency: 'KES',
            monthly_minor: 249000,
            included_credits: 1000,
            overage_unit_minor: 400,
            summary: 'KSh 2,490/mo · 1,000 Agent Credits/mo included, then KSh 4/credit',
          },
        ],
        included_credits: 50,
        bonus_credits: 0,
        total_credits_pool: 50,
        credits_used: 0,
        credits_remaining: 50,
        overage_credits: 0,
        overage_unit_minor: 1000,
        plan_monthly_minor: 0,
        overage_estimated_minor: 0,
        total_estimated_minor: 0,
        amount_due_minor: 0,
        monthly_spend_cap_minor: 250000,
        hard_stop: true,
        ledger: [],
        policy_note: 'Browser demo Agent Credit Wallet (separate from workspace ERP billing).',
      },
      runs: [],
      approvals: [],
      routines: [],
      memory: [],
    };
    const ag = state['/agent'];
    const buildOverview = () => ({
      agent_name: 'AfriCore Agent',
      workspace_kind: 'business',
      environment: 'sandbox',
      role: 'owner',
      can_manage_policy: true,
      boundary: {
        source_workspace_id: state['/organization'].id,
        source_kind: 'business',
        allowed_workspace_ids: [state['/organization'].id],
        linked_workspaces: [
          { id: state['/organization'].id, kind: 'business', name: state['/organization'].name, relation: 'current' },
        ],
        blocked_kinds: ['personal', 'developer', 'other_business'],
        cross_workspace_bridge: false,
        sandbox_policy:
          'Business Sandbox Lock: Strictly isolated inside this business workspace. Zero access to Personal or Developer workspaces.',
        isolation_label: 'Business Sandboxed',
      },
      policy: ag.policy,
      billing: ag.billing,
      tools: [
        { id: 'analyze_business', name: 'Analyze business performance', description: 'Executive business health brief.', access_kind: 'read', credit_cost: 1, permission: ag.policy.permissions.analyze_business || 'autonomous' },
        { id: 'schedule_meeting', name: 'Schedule meeting', description: 'Create a calendar event.', access_kind: 'write', credit_cost: 3, permission: ag.policy.permissions.schedule_meeting || 'approval_required' },
        { id: 'create_project', name: 'Set up project & starter tasks', description: 'Create a workspace project.', access_kind: 'write', credit_cost: 3, permission: ag.policy.permissions.create_project || 'approval_required' },
        { id: 'create_crm_lead', name: 'Create CRM lead', description: 'Log a CRM opportunity.', access_kind: 'write', credit_cost: 3, permission: ag.policy.permissions.create_crm_lead || 'approval_required' },
      ],
      runs: ag.runs,
      approvals: ag.approvals,
      pending_approvals_count: ag.approvals.filter((a: any) => a.status === 'pending').length,
      routines: ag.routines,
      memory: ag.memory,
    });
    if (route === '/agent/overview' && method === 'GET') return finish(buildOverview());
    if (route === '/agent/runs' && method === 'POST') {
      const prompt = String(input.prompt || '');
      const isWrite = /\b(meet|meeting|schedule|project|lead|invoice|expense)\b/i.test(prompt);
      const toolName = /meet|schedule/i.test(prompt)
        ? 'schedule_meeting'
        : /project/i.test(prompt)
          ? 'create_project'
          : /lead|crm/i.test(prompt)
            ? 'create_crm_lead'
            : 'analyze_business';
      const perm = ag.policy.autonomy_mode === 'autonomous' ? 'autonomous' : ag.policy.permissions[toolName] || (isWrite ? 'approval_required' : 'autonomous');
      const runId = id();
      const targetTab = toolName === 'schedule_meeting' ? 'Apps' : toolName === 'create_project' ? 'Work' : toolName === 'create_crm_lead' ? 'Customer Relationships' : 'Intelligence';
      const cloneKind = toolName === 'schedule_meeting' ? 'calendar' : toolName === 'create_project' ? 'work' : toolName === 'create_crm_lead' ? 'crm' : 'intelligence';
      const pageTitle = toolName === 'schedule_meeting' ? 'AfriCore Calendar' : toolName === 'create_project' ? 'AfriCore Work · Projects' : toolName === 'create_crm_lead' ? 'Customer Relationships · Pipeline' : 'Intelligence';
      const shouldStage = isWrite && (input.stage_in_sandbox || perm === 'approval_required');
      const credits = shouldStage ? 1 : isWrite ? 5 : 1;
      ag.billing.credits_used += credits;
      ag.billing.credits_remaining = Math.max(0, ag.billing.total_credits_pool - ag.billing.credits_used);
      ag.billing.ledger.unshift({ id: id(), entry_type: isWrite ? 'computer_use_session' : 'analysis_read', credits_delta: -credits, estimated_minor: 0, currency: 'KES', reason: `Demo run: ${toolName}`, created_at: now() });
      const approvalId = shouldStage ? id() : null;
      const sandboxClone = isWrite
        ? {
            clone_kind: cloneKind,
            page_title: pageTitle,
            section_label: 'Isolated Sandbox Staging',
            primary_cta: `Approve & Send to ${pageTitle}`,
            tool_id: toolName,
            target_tab: targetTab,
            target_app: toolName === 'schedule_meeting' ? 'calendar' : toolName === 'create_project' ? 'work' : toolName === 'create_crm_lead' ? 'crm' : undefined,
            currency: input.currency || 'KES',
            staged_params: { title: prompt, name: prompt, duration_minutes: 45, location: 'Workspace Meeting Room' },
            editable_fields: [
              { key: 'title', label: 'Title', type: 'text', value: prompt },
            ],
          }
        : null;
      const run: any = {
        id: runId,
        prompt,
        tool_name: toolName,
        status: shouldStage ? 'awaiting_approval' : 'completed',
        summary:
          shouldStage
            ? `Staged "${prompt}" inside the isolated ${pageTitle} sandbox clone. Approve to send to workspace.`
            : `Operational Intelligence Brief: Analyzed live receivables, CRM pipeline, projects, and upcoming schedule.`,
        credits_used: credits,
        steps: [
          { step_index: 1, phase: 'observe', label: 'Boot Isolated Sandbox Clone', detail: 'Confirmed strict Business-only boundary.', target_tab: targetTab, target_element: 'Isolation Shield', cursor_hint: { x_pct: 22, y_pct: 20 }, status: 'completed', duration_ms: 50 },
          { step_index: 2, phase: shouldStage ? 'awaiting_approval' : 'verify', label: shouldStage ? `Staged on ${pageTitle}` : `Completed on ${targetTab}`, detail: prompt, target_tab: targetTab, target_element: 'Sandbox Composer', cursor_hint: { x_pct: 58, y_pct: 58 }, status: shouldStage ? 'pending_approval' : 'completed', duration_ms: 110 },
        ],
        result: {
          ...(approvalId ? { approval_id: approvalId } : {}),
          ...(sandboxClone ? { sandbox_clone: sandboxClone } : {}),
          destination: { tab: targetTab, ...(toolName === 'schedule_meeting' ? { app: 'calendar', section: 'calendar' } : {}) },
        },
        created_at: now(),
      };
      ag.runs.unshift(run);
      if (shouldStage && approvalId) {
        ag.approvals.unshift({ id: approvalId, run_id: runId, tool_name: toolName, target_workspace_id: state['/organization'].id, action_summary: prompt, payload: { sandbox_clone: sandboxClone }, status: 'pending', created_at: now() });
      }
      return finish(run, 201);
    }
    if (/^\/agent\/approvals\/[^/]+\/decide$/.test(route) && method === 'POST') {
      const approvalId = route.split('/')[3];
      const ap = ag.approvals.find((x: any) => x.id === approvalId);
      if (ap) {
        ap.status = input.decision === 'approve' ? 'approved' : 'rejected';
        const run = ag.runs.find((r: any) => r.id === ap.run_id);
        if (run) {
          run.status = input.decision === 'approve' ? 'completed' : 'rejected';
          run.summary = input.decision === 'approve' ? `Approved and executed "${run.prompt}" in browser demo.` : `Rejected "${run.prompt}".`;
          if (run.steps?.[1]) run.steps[1].status = input.decision === 'approve' ? 'completed' : 'failed';
        }
        return finish({ approval_id: approvalId, status: ap.status, run });
      }
    }
    if (route === '/agent/permissions' && method === 'PUT') {
      if (input.autonomy_mode) ag.policy.autonomy_mode = input.autonomy_mode;
      if (input.computer_use_enabled !== undefined) ag.policy.computer_use_enabled = input.computer_use_enabled;
      if (input.permissions) ag.policy.permissions = { ...ag.policy.permissions, ...input.permissions };
      return finish(ag.policy);
    }
    if (route === '/agent/billing' && method === 'PUT') {
      const found = ag.billing.available_plans.find((p: any) => p.id === input.plan_tier);
      if (found) {
        ag.billing.plan = found;
        ag.billing.included_credits = found.included_credits;
        ag.billing.total_credits_pool = found.included_credits + ag.billing.bonus_credits;
        ag.billing.credits_remaining = Math.max(0, ag.billing.total_credits_pool - ag.billing.credits_used);
      }
      if (input.monthly_spend_cap_minor !== undefined) ag.billing.monthly_spend_cap_minor = input.monthly_spend_cap_minor;
      if (input.hard_stop !== undefined) ag.billing.hard_stop = input.hard_stop;
      return finish(ag.billing);
    }
    if (route === '/agent/billing/credits' && method === 'POST') {
      ag.billing.bonus_credits += Number(input.credits || 100);
      ag.billing.total_credits_pool = ag.billing.included_credits + ag.billing.bonus_credits;
      ag.billing.credits_remaining = Math.max(0, ag.billing.total_credits_pool - ag.billing.credits_used);
      return finish(ag.billing);
    }
    if (route === '/agent/routines' && method === 'POST') {
      const item = { id: id(), ...input, enabled: true, created_at: now() };
      ag.routines.unshift(item);
      return finish(item, 201);
    }
    if (route === '/agent/memory' && method === 'POST') {
      const item = { id: id(), ...input, created_at: now() };
      ag.memory.unshift(item);
      return finish(item, 201);
    }
  }
  if (route.startsWith('/evidence/')) return finish(state[route] || { data: [] });
  if (route === '/credentials' && method === 'POST')
    return reject(
      'Real API credentials require a backend. This demo never creates usable server credentials.',
    );
  if (route === '/import' && method === 'POST') {
    for (const r of input.rows || [])
      if (!rows('/records/transactions').some((x: any) => x.external_id === r.external_id))
        add('/records/transactions', {
          ...r,
          provider_verified: false,
          processing_status: 'recorded',
          provenance: 'browser_demo',
        });
    return finish({ imported: input.rows?.length || 0, duplicates: 0 });
  }
  if (method === 'GET' && state[route]) return finish(state[route]);
  return reject(
    'This operation requires a connected backend. Other demo changes stay in this browser only.',
    503,
  );
}
