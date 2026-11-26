import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('business-app-workflows');
import { hash } from '../platform/crypto';
import { canonical } from '../finance/service';
import { migrate, dbAll, dbGet, dbRun, closeDb } from '../db';
import { createApp } from '../app';
import { stockBalance } from '../inventory/service';
import { processProviderResult } from '../platform/payments';
import { processBusinessEvents, processCrmDueReminders } from '../operations/business-worker';
import { runAutomations, notify } from '../operations/automation';
import { quantityMilli } from '../inventory/quantity';
import { analyticsCSV } from '../operations/business-analytics';
import { day, addDays } from '../operations/store';
let server: any,
  base: string,
  cookie = '',
  org = '',
  actor = '',
  customerId = '',
  productId = '',
  warehouseId = '',
  orderId = '',
  invoiceId = '',
  approverCookie = '',
  approverId = '';
const path = (suffix: string) => '/api/v1/organizations/' + org + suffix;
const a = () => ({ org, actor, role: 'owner', environment: 'sandbox', api: false });
async function api(
  p: string,
  method = 'GET',
  body?: any,
  session = cookie,
  key: string = randomUUID(),
) {
  const r = await fetch(base + p, {
    method,
    headers: { Cookie: session, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
async function install(id: string, optional: string[] = []) {
  const preview = await api(
    path('/apps/' + id + '/installation-preview') +
      (optional.length ? '?optional=' + optional.join(',') : ''),
  );
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  const r = await api(path('/apps/' + id + '/install'), 'POST', {
    review_hash: preview.data.review_hash,
    optional_services: optional,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
}
const document = (quantity = 3) => ({
  customer_id: customerId,
  currency: 'KES',
  items: [
    {
      description: 'Synthetic shared product',
      quantity,
      unit_price_minor: 100000,
      product_id: productId,
      warehouse_id: warehouseId,
    },
  ],
  issue_date: '2026-10-01',
  due_date: '2026-11-01',
});
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const s = await api('/api/auth/signup', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-connected-business-2026!',
  });
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  actor = (await api('/api/auth/account')).data.user.id;
  const w = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Synthetic connected apps',
    display_name: 'Synthetic owner',
    services: [],
  });
  assert.equal(w.status, 201);
  org = w.data.id;
  const other = await api('/api/auth/signup', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-second-reviewer-2026!',
  });
  approverCookie = other.cookie;
  await api('/api/auth/verify', 'POST', { token: other.data.verification_token }, approverCookie);
  approverId = (await api('/api/auth/account', 'GET', undefined, approverCookie)).data.user.id;
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'owner')", [
    org,
    approverId,
  ]);
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await closeDb();
});
test('six installations share customers/services without duplicate entitlements', async () => {
  for (const id of ['finance', 'crm', 'inventory', 'sales', 'analytics', 'automations'])
    await install(id, id === 'finance' ? ['payments', 'reconciliation'] : []);
  const apps = await api(path('/apps'));
  assert.equal(apps.data.apps.filter((a: any) => a.installation?.status === 'installed').length, 6);
  assert.equal(
    (
      await dbAll(
        'SELECT service_id,COUNT(*) AS n FROM ac_service_entitlements WHERE org_id=? GROUP BY service_id HAVING COUNT(*)>1',
        [org],
      )
    ).length,
    0,
  );
  const customer = await api(path('/records/customers'), 'POST', {
    name: 'Synthetic shared customer',
    address: 'Original fictional address',
  });
  assert.equal(customer.status, 201);
  customerId = customer.data.id;
  assert.equal(
    (
      await api(path('/crm/customers/' + customerId), 'PUT', {
        expected_version: 0,
        tags: ['repeat buyer'],
        assigned_to: actor,
      })
    ).status,
    200,
  );
  const opportunity = await api(path('/crm/entries'), 'POST', {
    kind: 'opportunity',
    customer_id: customerId,
    title: 'Synthetic desks proposal',
    stage: 'proposal',
    assigned_to: actor,
    amount_minor: 300000,
  });
  assert.equal(opportunity.status, 201);
  const warehouse = await api(path('/inventory/warehouses'), 'POST', {
    code: 'MAIN',
    name: 'Synthetic warehouse',
  });
  assert.equal(warehouse.status, 201);
  warehouseId = warehouse.data.id;
  const product = await api(path('/products'), 'POST', {
    sku: 'SHARED-001',
    name: 'Synthetic shared product',
    sale_price_minor: 100000,
    reorder_point_milli: 17000,
  });
  assert.equal(product.status, 201);
  productId = product.data.id;
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        product_id: productId,
        warehouse_id: warehouseId,
        kind: 'receipt',
        quantity_milli: 20000,
        reason: 'Synthetic opening stock receipt',
      })
    ).status,
    201,
  );
  assert.equal((await stockBalance(a(), productId)).on_hand_milli, 20000);
});
test('quotation and draft order do not consume stock; confirmation atomically reserves and prepares one draft invoice', async () => {
  const created = await api(path('/sales/quotations'), 'POST', document());
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal((await stockBalance(a(), productId)).reserved_milli, 0);
  const accepted = await api(path('/sales/quotations/' + created.data.id + '/action'), 'POST', {
    action: 'accept',
    expected_version: 1,
  });
  assert.equal(accepted.status, 200);
  const converted = await api(path('/sales/quotations/' + created.data.id + '/action'), 'POST', {
    action: 'convert',
    expected_version: 2,
  });
  assert.equal(converted.status, 200, JSON.stringify(converted.data));
  orderId = converted.data.order_id;
  assert.equal((await stockBalance(a(), productId)).reserved_milli, 0);
  const confirmed = await api(path('/records/orders/' + orderId), 'PATCH', {
    status: 'awaiting_payment',
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.deepEqual(await stockBalance(a(), productId), {
    on_hand_milli: 20000,
    reserved_milli: 3000,
    available_milli: 17000,
    incoming_milli: 0,
    outgoing_milli: 3000,
    forecasted_milli: 17000,
  });
  const linked = await dbGet('SELECT invoice_id FROM ac_sales_order_links WHERE order_id=?', [
    orderId,
  ]);
  assert.ok(linked);
  invoiceId = linked.invoice_id;
  const invoice = await api(path('/records/invoices/' + invoiceId));
  assert.equal(invoice.data.status, 'draft');
  assert.equal(invoice.data.order_id, orderId);
  assert.equal(invoice.data.total_minor, 300000);
  assert.equal(
    (await api(path('/records/orders/' + orderId), 'PATCH', { status: 'awaiting_payment' })).status,
    409,
  );
  assert.equal(
    Number(
      (await dbGet('SELECT COUNT(*) AS n FROM ac_sales_order_links WHERE order_id=?', [orderId])).n,
    ),
    1,
  );
});
test('concurrent reservations cannot oversell and cancelling an unissued order releases only its own stock', async () => {
  const first = await api(path('/records/orders'), 'POST', document(12)),
    second = await api(path('/records/orders'), 'POST', document(12));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const results = await Promise.all(
    [first, second].map((o) =>
      api(path('/records/orders/' + o.data.id), 'PATCH', { status: 'awaiting_payment' }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const winner = results[0].status === 200 ? first : second,
    loser = results[0].status === 409 ? first : second;
  assert.equal((await stockBalance(a(), productId)).reserved_milli, 15000);
  assert.equal((await api(path('/records/orders/' + loser.data.id))).data.status, 'draft');
  const cancelled = await api(path('/records/orders/' + winner.data.id), 'PATCH', {
    status: 'cancelled',
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  assert.equal((await stockBalance(a(), productId)).reserved_milli, 3000);
});
test('issued customer details remain frozen while shared contact edits and confirmed payment reach Finance and CRM', async () => {
  assert.equal(
    (await api(path('/records/invoices/' + invoiceId), 'PATCH', { status: 'issued' })).status,
    200,
  );
  assert.equal(
    (
      await api(path('/records/customers/' + customerId), 'PATCH', {
        address: 'Updated fictional address',
        name: 'Updated shared customer',
      })
    ).status,
    200,
  );
  const invoice = await api(path('/records/invoices/' + invoiceId));
  assert.equal(invoice.data.customer_snapshot.address, 'Original fictional address');
  assert.equal(
    (await api(path('/crm/customers/' + customerId))).data.customer.address,
    'Updated fictional address',
  );
  assert.equal(
    (
      await api(path('/records/invoices/' + invoiceId), 'PATCH', {
        ...document(),
        items: [{ description: 'Illegal silent change', quantity: 1, unit_price_minor: 1 }],
      })
    ).status,
    409,
  );
  const request = await api(path('/payment-requests'), 'POST', {
    document_id: invoiceId,
    amount_minor: 300000,
  });
  assert.equal(request.status, 201);
  await processProviderResult(request.data.id, {
    reference: 'synthetic-apps-' + randomUUID(),
    status: 'succeeded',
    amount_minor: 300000,
    currency: 'KES',
  });
  const history = await api(path('/crm/customers/' + customerId + '/activity'));
  assert.equal(history.status, 200);
  assert.ok(
    history.data.financial_activity.invoices.some(
      (i: any) => i.id === invoiceId && i.outstanding_minor === 0,
    ),
  );
  const before = Number(
    (await dbGet('SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=?', [org])).n,
  );
  await processBusinessEvents(a());
  const after = Number(
    (await dbGet('SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=?', [org])).n,
  );
  assert.ok(after > before);
  await processBusinessEvents(a());
  assert.equal(
    Number((await dbGet('SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=?', [org])).n),
    after,
  );
  const notifications = await api(path('/notifications/summary'));
  assert.ok(notifications.data.unread > 0);
  assert.ok(notifications.data.data.some((n: any) => n.title === 'Draft invoice prepared'));
});
test('partial physical dispatch, bounded returns and adjustments preserve exact available stock', async () => {
  const shipment = await api(path('/shipments'), 'POST', {
    order_id: orderId,
    courier: 'manual',
    tracking_reference: 'Synthetic app shipment',
    estimated_delivery: '2026-11-01',
    items: [{ item_index: 0, quantity: 1 }],
  });
  assert.equal(shipment.status, 201, JSON.stringify(shipment.data));
  for (const status of ['processing', 'ready_for_dispatch', 'shipped']) {
    const r = await api(path('/shipments/' + shipment.data.id + '/transition'), 'POST', { status });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  assert.equal((await stockBalance(a(), productId)).on_hand_milli, 19000);
  assert.equal((await stockBalance(a(), productId)).reserved_milli, 2000);
  const dispatch = await dbGet(
    "SELECT id FROM ac_stock_movements WHERE source_id=? AND kind='dispatch'",
    [shipment.data.id],
  );
  assert.ok(dispatch);
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        product_id: productId,
        warehouse_id: warehouseId,
        kind: 'return',
        quantity_milli: 1000,
        source_id: dispatch.id,
        reason: 'Synthetic returned unit received',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        product_id: productId,
        warehouse_id: warehouseId,
        kind: 'return',
        quantity_milli: 1000,
        source_id: dispatch.id,
        reason: 'Duplicate excess physical return',
      })
    ).status,
    409,
  );
  assert.equal((await stockBalance(a(), productId)).on_hand_milli, 20000);
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        product_id: productId,
        warehouse_id: warehouseId,
        kind: 'adjustment',
        quantity_milli: -1000,
        reason: 'Synthetic count correction',
      })
    ).status,
    201,
  );
});
test('stock write-off approval binds resource version and exact parameters, rejects replay and stale changes', async () => {
  const movement = {
    product_id: productId,
    warehouse_id: warehouseId,
    kind: 'adjustment',
    quantity_milli: -6000,
    reason: 'Synthetic significant write-off',
  };
  assert.equal((await api(path('/inventory/movements'), 'POST', movement)).status, 409);
  const approval = await api(path('/inventory/adjustment-approvals'), 'POST', {
    approver: approverId,
    movement,
  });
  assert.equal(approval.status, 201, JSON.stringify(approval.data));
  assert.equal(
    (
      await api(
        path('/approvals/' + approval.data.id + '/decide'),
        'POST',
        { decision: 'approved', reason: 'Reviewed exact synthetic stock delta' },
        approverCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        ...movement,
        quantity_milli: -6001,
        approval_id: approval.data.id,
      })
    ).status,
    409,
  );
  const key = randomUUID(),
    posted = await api(
      path('/inventory/movements'),
      'POST',
      { ...movement, approval_id: approval.data.id },
      cookie,
      key,
    );
  assert.equal(posted.status, 201, JSON.stringify(posted.data));
  assert.equal(
    (
      await api(
        path('/inventory/movements'),
        'POST',
        { ...movement, approval_id: approval.data.id },
        cookie,
        key,
      )
    ).data.id,
    posted.data.id,
  );
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        ...movement,
        approval_id: approval.data.id,
      })
    ).status,
    409,
  );
  const stale = await api(path('/inventory/adjustment-approvals'), 'POST', {
    approver: approverId,
    movement,
  });
  assert.equal(stale.status, 201);
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        product_id: productId,
        warehouse_id: warehouseId,
        kind: 'receipt',
        quantity_milli: 1000,
        reason: 'Synthetic later stock change',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await api(
        path('/approvals/' + stale.data.id + '/decide'),
        'POST',
        { decision: 'approved', reason: 'Attempt to approve stale resource' },
        approverCookie,
      )
    ).status,
    409,
  );
});
test('business invoice credits require reviewed second-person execution and preserve issued terms', async () => {
  const created = await api(path('/records/invoices'), 'POST', {
    ...document(),
    items: [{ description: 'Synthetic additional work', quantity: 1, unit_price_minor: 10000 }],
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  await api(path('/records/invoices/' + id), 'PATCH', { status: 'issued' });
  const credit = {
    amount_minor: 1000,
    reason: 'Synthetic reviewed commercial correction',
    issued_on: '2026-10-29',
  };
  assert.equal((await api(path('/invoices/' + id + '/credits'), 'POST', credit)).status, 409);
  const context = await api(path('/invoices/' + id + '/finance'));
  assert.equal(context.status, 200, JSON.stringify(context.data));
  assert.equal(context.data.correction_policy.required, true);
  assert.ok(context.data.correction_policy.approvers.some((m: any) => m.id === approverId));
  assert.ok(!context.data.correction_policy.approvers.some((m: any) => m.id === actor));
  const reviewKey = randomUUID();
  const requested = await api(
    path('/business/invoices/' + id + '/correction-review'),
    'POST',
    { approver: approverId, credit_note: credit },
    cookie,
    reviewKey,
  );
  assert.equal(
    (
      await api(
        path('/business/invoices/' + id + '/correction-review'),
        'POST',
        { approver: approverId, credit_note: credit },
        cookie,
        reviewKey,
      )
    ).data.id,
    requested.data.id,
  );
  assert.equal(requested.status, 201, JSON.stringify(requested.data));
  assert.equal(
    (
      await api(
        path('/approvals/' + requested.data.id + '/decide'),
        'POST',
        { decision: 'approved', reason: 'Reviewed exact synthetic credit' },
        approverCookie,
      )
    ).status,
    200,
  );
  const approvedContext = await api(path('/invoices/' + id + '/finance'));
  assert.ok(
    approvedContext.data.correction_policy.reviews.some(
      (r: any) => r.id === requested.data.id && r.status === 'approved',
    ),
  );
  assert.equal(
    (
      await api(path('/invoices/' + id + '/credits'), 'POST', {
        ...credit,
        approval_id: requested.data.id,
      })
    ).status,
    201,
  );
  assert.ok(
    !(await api(path('/invoices/' + id + '/finance'))).data.correction_policy.reviews.some(
      (r: any) => r.id === requested.data.id,
    ),
  );
  assert.equal((await api(path('/records/invoices/' + id))).data.total_minor, 10000);
});
test('cross-workspace, role, inactive-service and notification boundaries remain enforced', async () => {
  const signup = await api('/api/auth/signup', 'POST', {
      email: randomUUID() + '@example.test',
      password: 'Synthetic-operations-reader-2026!',
    }),
    session = signup.cookie;
  await api('/api/auth/verify', 'POST', { token: signup.data.verification_token }, session);
  const id = (await api('/api/auth/account', 'GET', undefined, session)).data.user.id;
  assert.equal((await api(path('/inventory'), 'GET', undefined, session)).status, 403);
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'operations')", [
    org,
    id,
  ]);
  const stockReview = await api(
    path('/inventory/adjustment-approvals'),
    'POST',
    {
      approver: approverId,
      movement: {
        product_id: productId,
        warehouse_id: warehouseId,
        kind: 'adjustment',
        quantity_milli: -6000,
        reason: 'Synthetic operations requester review',
      },
    },
    session,
  );
  assert.equal(stockReview.status, 201, JSON.stringify(stockReview.data));
  const ownReviews = await api(path('/business/approvals'), 'GET', undefined, session);
  assert.equal(ownReviews.status, 200);
  assert.equal(ownReviews.data.current_actor, id);
  assert.ok(ownReviews.data.data.some((r: any) => r.id === stockReview.data.id && r.resource_hash));
  assert.equal(
    (
      await api(
        path('/approvals/' + stockReview.data.id + '/cancel'),
        'POST',
        { reason: 'Synthetic requester cancels stock review' },
        session,
      )
    ).status,
    200,
  );
  const history = await api(
    path('/crm/customers/' + customerId + '/activity'),
    'GET',
    undefined,
    session,
  );
  assert.equal(history.status, 200);
  assert.equal(history.data.financial_activity, null);
  const notification = await dbGet(
    'SELECT id FROM ac2_notifications WHERE org_id=? AND user_id=? LIMIT 1',
    [org, actor],
  );
  assert.equal(
    (await api(path('/notifications/' + notification.id), 'PATCH', {}, session)).status,
    404,
  );
  await dbRun(
    "UPDATE ac_service_entitlements SET status='disabled' WHERE org_id=? AND service_id='inventory'",
    [org],
  );
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        product_id: productId,
        warehouse_id: warehouseId,
        kind: 'receipt',
        quantity_milli: 1000,
        reason: 'Denied inactive service operation',
      })
    ).status,
    402,
  );
  await dbRun(
    "UPDATE ac_service_entitlements SET status='active' WHERE org_id=? AND service_id='inventory'",
    [org],
  );
  assert.equal(quantityMilli('0.125'), 125);
  assert.throws(() => quantityMilli('0.0001'));
});

test('supported event workflows create one assigned task and one review suggestion without external actions', async () => {
  const rule = await api(path('/automations'), 'POST', {
    name: 'Synthetic customer onboarding',
    template: 'customer_onboarding',
    enabled: true,
    conditions: { currency: 'KES', minimum_minor: 0, days_before_due: 2 },
  });
  assert.equal(rule.status, 201, JSON.stringify(rule.data));
  const preview = await api(path('/business/workflows/' + rule.data.id + '/test'), 'POST', {
    confirm: true,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.side_effects_performed, 0);
  assert.equal(preview.data.action, 'create_crm_follow_up');
  assert.equal(
    Number(
      (await dbGet('SELECT COUNT(*) AS n FROM ac2_runs WHERE workflow_id=?', [rule.data.id])).n,
    ),
    0,
  );
  assert.equal(
    (
      await api(path('/automations'), 'POST', {
        name: 'Reject mismatched action',
        template: 'customer_onboarding',
        action: 'in_app_notification',
      })
    ).status,
    400,
  );
  const c = await api(path('/records/customers'), 'POST', { name: 'Synthetic workflow customer' });
  assert.equal(c.status, 201);
  await runAutomations(a());
  await runAutomations(a());
  const tasks = await dbAll(
    "SELECT * FROM ac_crm_entries WHERE org_id=? AND customer_id=? AND kind='follow_up'",
    [org, c.data.id],
  );
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].assigned_to, actor);
  const run = await dbGet("SELECT * FROM ac2_runs WHERE workflow_id=? AND status='succeeded'", [
    rule.data.id,
  ]);
  assert.ok(run);
  assert.equal(JSON.parse(run.result).external_messages_sent, 0);
  const stockRule = await api(path('/automations'), 'POST', {
    name: 'Synthetic stock replenishment',
    template: 'stock_replenishment',
    enabled: true,
  });
  assert.equal(stockRule.status, 201, JSON.stringify(stockRule.data));
  const low = await api(path('/products'), 'POST', {
    sku: 'WORKFLOW-LOW',
    name: 'Synthetic low stock workflow',
    sale_price_minor: 100,
    reorder_point_milli: 5000,
  });
  assert.equal(low.status, 201);
  await api(path('/inventory/movements'), 'POST', {
    product_id: low.data.id,
    warehouse_id: warehouseId,
    kind: 'receipt',
    quantity_milli: 1000,
    reason: 'Synthetic low stock receipt',
  });
  await processBusinessEvents(a());
  await runAutomations(a());
  await runAutomations(a());
  const suggestions = await dbAll(
    "SELECT * FROM ac2_objects WHERE org_id=? AND kind='replenishment_suggestions'",
    [org],
  );
  assert.ok(suggestions.length >= 1);
  assert.equal(new Set(suggestions.map((r: any) => r.id)).size, suggestions.length);
  const stockRun = await dbGet(
    "SELECT * FROM ac2_runs WHERE workflow_id=? AND status='succeeded'",
    [stockRule.data.id],
  );
  assert.ok(stockRun);
  assert.equal(JSON.parse(stockRun.result).supplier_orders_created, 0);
});

test('analytics uses covered sources and actor-private saved reports', async () => {
  const report = await api(path('/business/analytics?currency=KES&from=2026-10-01&to=2026-10-29'));
  assert.equal(report.status, 200, JSON.stringify(report.data));
  assert.ok(report.data.inventory.total_products >= 1);
  assert.equal(report.data.inventory.valuation, null);
  assert.ok(report.data.definitions.sales.includes('not recognized revenue'));
  const saved = await api(path('/business/saved-reports'), 'POST', {
    name: 'Synthetic reviewed view',
    configuration: {
      query: { currency: 'KES', from: '2026-10-01', to: '2026-10-29' },
      widgets: ['financial', 'inventory'],
    },
  });
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  assert.ok(
    (await api(path('/business/saved-reports'))).data.data.some((r: any) => r.id === saved.data.id),
  );
  assert.ok(
    !(await api(path('/business/saved-reports'), 'GET', undefined, approverCookie)).data.data.some(
      (r: any) => r.id === saved.data.id,
    ),
  );
  assert.equal(
    (await api(path('/business/saved-reports/' + saved.data.id), 'DELETE', {}, approverCookie))
      .status,
    404,
  );
  assert.equal(
    (await api(path('/business/saved-reports/' + saved.data.id), 'DELETE', {})).status,
    200,
  );
  assert.equal((await api(path('/business/analytics?from=2026-10-29&to=2026-10-01'))).status, 400);
});

test('analytics registry, grouped reports, pivots, exports and versioned dashboard CRUD are enforced', async () => {
  const registry = await api(path('/business/analytics/registry'));
  assert.equal(registry.status, 200, JSON.stringify(registry.data));
  assert.equal(registry.data.sources.orders.readable, true);
  assert.ok(registry.data.metrics.some((metric: any) => metric.id === 'orders.count'));
  assert.equal(registry.data.sources.automations.readable, true);
  assert.ok(registry.data.metrics.some((metric: any) => metric.id === 'automations.rules'));
  assert.ok(registry.data.metrics.some((metric: any) => metric.id === 'automations.runs'));
  const lowStockMetric = registry.data.metrics.find((metric: any) => metric.id === 'inventory.low_stock');
  assert.equal(lowStockMetric.available, true);
  assert.deepEqual(lowStockMetric.allowed_charts, ['kpi']);
  assert.deepEqual(lowStockMetric.groups, ['snapshot']);
  const report = await api(
    path(
      '/business/analytics/report?metric=orders.count&group_by=status&from=2026-10-01&to=2026-10-29',
    ),
  );
  assert.equal(report.status, 200, JSON.stringify(report.data));
  assert.equal(
    report.data.value,
    report.data.rows.reduce((total: number, row: any) => total + row.value, 0),
  );
  assert.ok(report.data.rows.every((row: any) => row.drilldown?.kind === 'orders'));
  assert.match(report.data.coverage, /matching source records/);
  const excluded = await api(
    path('/business/analytics/report?metric=orders.count&group_by=month&source=customers&from=2026-10-01&to=2026-10-29'),
  );
  assert.equal(excluded.status, 200);
  assert.equal(excluded.data.excluded_by_source_filter, true);
  assert.equal(excluded.data.value, null);
  const snapshot = await api(
    path('/business/analytics/report?metric=inventory.low_stock&group_by=snapshot&from=2026-10-01&to=2026-10-29'),
  );
  assert.equal(snapshot.status, 200, JSON.stringify(snapshot.data));
  assert.ok(Number.isInteger(snapshot.data.value));
  assert.match(snapshot.data.coverage, /products included/);
  const pivot = await api(
    path(
      '/business/analytics/pivot?metric=orders.count&row_by=month&column_by=status&from=2026-10-01&to=2026-10-29',
    ),
  );
  assert.equal(pivot.status, 200, JSON.stringify(pivot.data));
  assert.equal(
    pivot.data.totals.overall,
    pivot.data.rows.reduce((total: number, row: any) => total + row.total, 0),
  );
  assert.equal(
    (
      await api(
        path('/business/analytics/pivot?metric=orders.count&row_by=day&column_by=status&range=all'),
      )
    ).status,
    400,
  );
  const exported = await api(
    path(
      '/business/analytics/report/export-data?metric=orders.count&group_by=month&from=2026-10-01&to=2026-10-29',
    ),
  );
  assert.equal(exported.status, 200, JSON.stringify(exported.data));
  assert.match(exported.data.content, /"Metric","Orders created"/);
  const pivotExport = await api(
    path('/business/analytics/pivot/export-data?metric=orders.count&row_by=month&column_by=status&from=2026-10-01&to=2026-10-29'),
  );
  assert.equal(pivotExport.status, 200, JSON.stringify(pivotExport.data));
  assert.match(pivotExport.data.content, /"Total"/);
  assert.equal(analyticsCSV([['Value', 'Label'], [-25, '=1+1']]), '"Value","Label"\r\n"-25","\'=1+1"');
  const savedExploration = await api(path('/business/saved-reports'), 'POST', {
    name: 'Synthetic Orders exploration',
    configuration: {
      query: { currency: 'KES', from: '2026-10-01', to: '2026-10-29' },
      widgets: ['sales'],
      exploration: {
        metric: 'orders.count', source: 'orders', group_by: 'month', chart: 'line', view: 'graph',
      },
    },
  });
  assert.equal(savedExploration.status, 201, JSON.stringify(savedExploration.data));
  assert.equal(
    (await api(path('/business/saved-reports'), 'POST', {
      name: 'Invalid filtered exploration',
      configuration: {
        query: { currency: 'KES', source: 'customers' },
        widgets: ['sales'],
        exploration: {
          metric: 'orders.count', source: 'orders', group_by: 'month', chart: 'line', view: 'graph',
        },
      },
    })).status,
    400,
  );
  const definition = {
    name: 'Synthetic Analytics dashboard',
    template: 'sales',
    configuration: {
      filters: { currency: 'KES', from: '2026-10-01', to: '2026-10-29' },
      widgets: [
        {
          id: 'orders-by-month',
          metric: 'orders.count',
          title: 'Orders by month',
          chart: 'bar',
          group_by: 'month',
        },
      ],
    },
  };
  const created = await api(path('/business/analytics/dashboards'), 'POST', definition);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.version, 1);
  const visible = await api(path('/business/analytics/dashboards'));
  assert.ok(visible.data.data.some((dashboard: any) => dashboard.id === created.data.id));
  const update = await api(path('/business/analytics/dashboards/' + created.data.id), 'PATCH', {
    expected_version: 1,
    name: 'Updated Analytics dashboard',
    configuration: definition.configuration,
  });
  assert.equal(update.status, 200, JSON.stringify(update.data));
  assert.equal(update.data.version, 2);
  assert.equal(
    (
      await api(path('/business/analytics/dashboards/' + created.data.id), 'PATCH', {
        expected_version: 1,
        name: 'Stale Analytics dashboard',
        configuration: definition.configuration,
      })
    ).status,
    409,
  );
  const duplicate = await api(
    path('/business/analytics/dashboards/' + created.data.id + '/duplicate'),
    'POST',
    { name: 'Synthetic dashboard copy' },
  );
  assert.equal(duplicate.status, 201, JSON.stringify(duplicate.data));
  assert.equal(duplicate.data.version, 1);
  await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?", [org, actor]);
  try {
    assert.equal(
      (await api(path('/business/analytics/dashboards'), 'POST', definition)).status,
      403,
    );
    assert.equal(
      (await api(path('/business/analytics/dashboards/' + created.data.id), 'DELETE', {})).status,
      403,
    );
  } finally {
    await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?", [
      org,
      actor,
    ]);
  }
  assert.equal(
    (await api(path('/business/analytics/dashboards/' + duplicate.data.id), 'DELETE', {})).status,
    200,
  );
  assert.equal(
    (await api(path('/business/analytics/dashboards/' + created.data.id), 'DELETE', {})).status,
    200,
  );
  assert.equal(
    (await api(path('/business/saved-reports/' + savedExploration.data.id), 'DELETE', {})).status,
    200,
  );
});

test('analytics buckets use the configured IANA timezone across daylight-saving transitions', async () => {
  const workspace = await dbGet('SELECT profile FROM ac_organizations WHERE id=?', [org]),
    profile = JSON.parse(workspace.profile || '{}'),
    customers = [
      await api(path('/records/customers'), 'POST', { name: 'Synthetic before New York midnight' }),
      await api(path('/records/customers'), 'POST', { name: 'Synthetic after New York midnight' }),
    ];
  assert.ok(customers.every((result: any) => result.status === 201));
  await dbRun('UPDATE ac_organizations SET profile=? WHERE id=?', [
    JSON.stringify({ ...profile, timezone: 'America/New_York' }),
    org,
  ]);
  try {
    await dbRun('UPDATE ac_records SET created_at=? WHERE id=?', [
      '2026-03-08T04:30:00.000Z',
      customers[0].data.id,
    ]);
    await dbRun('UPDATE ac_records SET created_at=? WHERE id=?', [
      '2026-03-08T05:30:00.000Z',
      customers[1].data.id,
    ]);
    const beforeMidnight = await api(
      path(
        '/business/analytics/records?kind=customers&from=2026-03-07&to=2026-03-07&date=2026-03-07',
      ),
    );
    const afterMidnight = await api(
      path(
        '/business/analytics/records?kind=customers&from=2026-03-08&to=2026-03-08&date=2026-03-08',
      ),
    );
    assert.equal(beforeMidnight.data.timezone, 'America/New_York');
    assert.ok(beforeMidnight.data.data.some((record: any) => record.id === customers[0].data.id));
    assert.ok(!beforeMidnight.data.data.some((record: any) => record.id === customers[1].data.id));
    assert.ok(afterMidnight.data.data.some((record: any) => record.id === customers[1].data.id));
    const report = await api(
      path(
        '/business/analytics/report?metric=customers.count&group_by=day&from=2026-03-07&to=2026-03-08',
      ),
    );
    assert.equal(report.status, 200, JSON.stringify(report.data));
    assert.equal(report.data.timezone, 'America/New_York');
    assert.ok(report.data.rows.find((row: any) => row.key === '2026-03-07').value >= 1);
    assert.ok(report.data.rows.find((row: any) => row.key === '2026-03-08').value >= 1);
  } finally {
    await dbRun('UPDATE ac_organizations SET profile=? WHERE id=?', [JSON.stringify(profile), org]);
  }
});

test('warehouse editing, location transfers, incoming plans and exact fractional stock remain distinct', async () => {
  const p = await api(path('/products'), 'POST', {
    sku: 'MEASURED-001',
    name: 'Synthetic measured material',
    unit: 'kg',
    sale_price_minor: 1000,
  });
  assert.equal(p.status, 201);
  const target = await api(path('/inventory/warehouses'), 'POST', {
    code: 'SECOND',
    name: 'Synthetic second warehouse',
  });
  assert.equal(target.status, 201);
  const location = await api(path('/inventory/warehouses/' + warehouseId + '/locations'), 'POST', {
    code: 'BIN-KG',
    name: 'Synthetic material bin',
  });
  assert.equal(location.status, 201);
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        product_id: p.data.id,
        warehouse_id: warehouseId,
        location_id: location.data.id,
        kind: 'receipt',
        quantity_milli: 1250,
        reason: 'Synthetic measured opening receipt',
      })
    ).status,
    201,
  );
  const incoming = await api(path('/inventory/incoming'), 'POST', {
    product_id: p.data.id,
    warehouse_id: target.data.id,
    quantity_milli: 500,
    due_on: '2026-11-05',
    reason: 'Synthetic planned incoming material',
  });
  assert.equal(incoming.status, 201);
  assert.equal((await stockBalance(a(), p.data.id)).on_hand_milli, 1250);
  assert.equal((await stockBalance(a(), p.data.id)).incoming_milli, 500);
  const transferKey = randomUUID(),
    movement = {
      product_id: p.data.id,
      warehouse_id: warehouseId,
      location_id: location.data.id,
      destination_warehouse_id: target.data.id,
      kind: 'transfer',
      quantity_milli: 1000,
      reason: 'Synthetic paired warehouse transfer',
    };
  const transfer = await api(path('/inventory/movements'), 'POST', movement, cookie, transferKey);
  assert.equal(transfer.status, 201, JSON.stringify(transfer.data));
  assert.equal(transfer.data.movements.length, 2);
  assert.equal((await stockBalance(a(), p.data.id, warehouseId)).on_hand_milli, 250);
  assert.equal((await stockBalance(a(), p.data.id, target.data.id)).on_hand_milli, 1000);
  assert.equal((await stockBalance(a(), p.data.id)).on_hand_milli, 1250);
  await api(path('/inventory/movements'), 'POST', movement, cookie, transferKey);
  assert.equal((await stockBalance(a(), p.data.id)).on_hand_milli, 1250);
  const receiptKey = randomUUID(),
    receive = { action: 'receive', reason: 'Synthetic physical incoming receipt' };
  assert.equal(
    (
      await api(
        path('/inventory/incoming/' + incoming.data.id + '/action'),
        'POST',
        receive,
        cookie,
        receiptKey,
      )
    ).status,
    200,
  );
  await api(
    path('/inventory/incoming/' + incoming.data.id + '/action'),
    'POST',
    receive,
    cookie,
    receiptKey,
  );
  assert.equal((await stockBalance(a(), p.data.id)).on_hand_milli, 1750);
  assert.equal((await stockBalance(a(), p.data.id)).incoming_milli, 0);
  const edited = await api(path('/inventory/warehouses/' + target.data.id), 'PATCH', {
    expected_revision: target.data.revision,
    warehouse: {
      code: 'SECOND',
      name: 'Synthetic corrected warehouse',
      address: 'Fictional corrected address',
      status: 'active',
    },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.notEqual(edited.data.revision, target.data.revision);
  assert.equal(
    (
      await api(path('/inventory/warehouses/' + target.data.id), 'PATCH', {
        expected_revision: target.data.revision,
        warehouse: { code: 'SECOND', name: 'Stale edit', status: 'active' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(path('/inventory/warehouses/' + target.data.id), 'PATCH', {
        expected_revision: edited.data.revision,
        warehouse: { code: 'SECOND', name: 'Synthetic corrected warehouse', status: 'archived' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        product_id: productId,
        warehouse_id: warehouseId,
        kind: 'receipt',
        quantity_milli: 500,
        reason: 'Invalid fractional whole-unit stock',
      })
    ).status,
    400,
  );
});

test('large sales discounts need an exact current quotation review', async () => {
  const q = await api(path('/sales/quotations'), 'POST', {
    ...document(1),
    items: [{ description: 'Synthetic untracked service', quantity: 1, unit_price_minor: 10000 }],
    discount_minor: 3000,
  });
  assert.equal(q.status, 201);
  assert.equal(
    (
      await api(path('/sales/quotations/' + q.data.id + '/action'), 'POST', {
        action: 'accept',
        expected_version: q.data.version,
      })
    ).status,
    409,
  );
  const key = randomUUID(),
    review = await api(
      path('/sales/quotations/' + q.data.id + '/discount-approvals'),
      'POST',
      { approver: approverId },
      cookie,
      key,
    );
  assert.equal(review.status, 201);
  assert.equal(
    (
      await api(
        path('/sales/quotations/' + q.data.id + '/discount-approvals'),
        'POST',
        { approver: approverId },
        cookie,
        key,
      )
    ).data.id,
    review.data.id,
  );
  await api(
    path('/approvals/' + review.data.id + '/decide'),
    'POST',
    { decision: 'approved', reason: 'Synthetic exact discount review' },
    approverCookie,
  );
  const changed = await api(path('/sales/quotations/' + q.data.id), 'PATCH', {
    expected_version: q.data.version,
    document: {
      ...document(1),
      items: [{ description: 'Synthetic untracked service', quantity: 1, unit_price_minor: 10000 }],
      discount_minor: 4000,
    },
  });
  assert.equal(changed.status, 200);
  assert.equal(
    (
      await api(path('/sales/quotations/' + q.data.id + '/action'), 'POST', {
        action: 'accept',
        expected_version: changed.data.version,
        approval_id: review.data.id,
      })
    ).status,
    409,
  );
  const fresh = await api(path('/sales/quotations/' + q.data.id + '/discount-approvals'), 'POST', {
    approver: approverId,
  });
  assert.equal(fresh.status, 201);
  assert.equal(
    (
      await api(
        path('/approvals/' + fresh.data.id + '/decide'),
        'POST',
        { decision: 'approved', reason: 'Synthetic revised exact discount' },
        approverCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(path('/sales/quotations/' + q.data.id + '/action'), 'POST', {
        action: 'accept',
        expected_version: changed.data.version,
        approval_id: fresh.data.id,
      })
    ).status,
    200,
  );
});

test('revoked draft-invoice policy authority rolls back order confirmation and stock reservation', async () => {
  const draft = await api(path('/records/orders'), 'POST', document(1), approverCookie);
  assert.equal(draft.status, 201);
  const held = (await stockBalance(a(), productId)).reserved_milli;
  await dbRun("UPDATE ac_memberships SET role='operations' WHERE org_id=? AND user_id=?", [
    org,
    actor,
  ]);
  try {
    const result = await api(
      path('/records/orders/' + draft.data.id),
      'PATCH',
      { status: 'awaiting_payment' },
      approverCookie,
    );
    assert.equal(result.status, 409, JSON.stringify(result.data));
    assert.equal(
      (await api(path('/records/orders/' + draft.data.id), 'GET', undefined, approverCookie)).data
        .status,
      'draft',
    );
    assert.equal((await stockBalance(a(), productId)).reserved_milli, held);
    assert.equal(
      Number(
        (
          await dbGet('SELECT COUNT(*) AS n FROM ac_stock_reservations WHERE order_id=?', [
            draft.data.id,
          ])
        ).n,
      ),
      0,
    );
  } finally {
    await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?", [
      org,
      actor,
    ]);
  }
});

test('draft order editing preserves shared product allocation, rejects stale edits and replays safely', async () => {
  const draft = await api(path('/records/orders'), 'POST', document(1));
  assert.equal(draft.status, 201);
  const context = await api(path('/business/orders/' + draft.data.id + '/draft'));
  assert.equal(context.status, 200);
  assert.equal(context.data.editable, true);
  const before = (await stockBalance(a(), productId)).reserved_milli;
  const body = {
      expected_revision: context.data.revision,
      document: { ...document(2), notes: 'Synthetic reviewed allocation change' },
    },
    key = randomUUID();
  const edit = await api(
    path('/business/orders/' + draft.data.id + '/draft'),
    'POST',
    body,
    cookie,
    key,
  );
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal(edit.data.order.items[0].product_id, productId);
  assert.equal(edit.data.order.items[0].warehouse_id, warehouseId);
  assert.equal(edit.data.order.items[0].quantity, 2);
  assert.notEqual(edit.data.revision, context.data.revision);
  assert.equal((await stockBalance(a(), productId)).reserved_milli, before);
  assert.deepEqual(
    (await api(path('/business/orders/' + draft.data.id + '/draft'), 'POST', body, cookie, key))
      .data,
    edit.data,
  );
  assert.equal(
    (await api(path('/business/orders/' + draft.data.id + '/draft'), 'POST', body)).status,
    409,
  );
  assert.equal(
    (await api(path('/records/orders/' + draft.data.id), 'PATCH', { status: 'awaiting_payment' }))
      .status,
    200,
  );
  assert.equal((await stockBalance(a(), productId)).reserved_milli, before + 2000);
  assert.equal(
    (
      await api(path('/business/orders/' + draft.data.id + '/draft'), 'POST', {
        expected_revision: edit.data.revision,
        document: document(3),
      })
    ).status,
    409,
  );
  assert.equal(
    (await api(path('/records/orders/' + draft.data.id), 'PATCH', { status: 'cancelled' })).status,
    200,
  );
  assert.equal((await stockBalance(a(), productId)).reserved_milli, before);
});

test('approval decisions and expiry update notifications without enabling execution or allowing pending dismissal', async () => {
  const movement = {
    product_id: productId,
    warehouse_id: warehouseId,
    kind: 'adjustment',
    quantity_milli: -6000,
    reason: 'Synthetic notification lifecycle review',
  };
  const expired = await api(path('/inventory/adjustment-approvals'), 'POST', {
    approver: approverId,
    movement,
  });
  assert.equal(expired.status, 201);
  const original = await dbGet(
    'SELECT id FROM ac2_notifications WHERE org_id=? AND user_id=? AND resource_id=?',
    [org, approverId, expired.data.id],
  );
  assert.ok(original);
  assert.equal(
    (
      await api(
        path('/notifications/' + original.id + '/dismiss'),
        'POST',
        { confirm: true },
        approverCookie,
      )
    ).status,
    409,
  );
  await dbRun('UPDATE ac2_approvals SET expires_at=? WHERE id=?', [
    '2000-01-01T00:00:00.000Z',
    expired.data.id,
  ]);
  await processBusinessEvents(a());
  assert.equal(
    (await dbGet('SELECT status FROM ac2_approvals WHERE id=?', [expired.data.id])).status,
    'expired',
  );
  assert.equal(
    (
      await api(
        path('/notifications/' + original.id + '/dismiss'),
        'POST',
        { confirm: true },
        approverCookie,
      )
    ).status,
    200,
  );
  const fresh = await api(path('/inventory/adjustment-approvals'), 'POST', {
    approver: approverId,
    movement,
  });
  assert.equal(fresh.status, 201);
  assert.equal(
    (
      await api(
        path('/approvals/' + fresh.data.id + '/decide'),
        'POST',
        { decision: 'approved', reason: 'Synthetic notification approval only' },
        approverCookie,
      )
    ).status,
    200,
  );
  const balance = await stockBalance(a(), productId);
  await processBusinessEvents(a());
  const one = await dbGet(
    "SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=? AND user_id=? AND resource_id=? AND title='Review approved'",
    [org, actor, fresh.data.id],
  );
  assert.equal(Number(one.n), 1);
  await processBusinessEvents(a());
  assert.equal(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=? AND user_id=? AND resource_id=? AND title='Review approved'",
          [org, actor, fresh.data.id],
        )
      ).n,
    ),
    1,
  );
  assert.equal((await stockBalance(a(), productId)).on_hand_milli, balance.on_hand_milli);
});

test('notification daily cap follows the Nairobi calendar across the UTC date boundary', async () => {
  const w = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Synthetic notification cap',
    display_name: 'Synthetic owner',
    services: [],
  });
  assert.equal(w.status, 201);
  const access = { ...a(), org: w.data.id },
    at = new Date('2026-10-29T22:30:00.000Z');
  for (let i = 0; i < 100; i++)
    assert.equal(
      (
        await notify(
          access,
          {
            category: 'security',
            title: 'Synthetic cap fixture',
            body: 'No external delivery.',
            key: 'cap:' + i,
            user_id: actor,
          },
          at,
        )
      ).inserted,
      1,
    );
  assert.equal(
    (
      await notify(
        access,
        {
          category: 'security',
          title: 'Suppressed fixture',
          body: 'No external delivery.',
          key: 'cap:overflow',
          user_id: actor,
        },
        at,
      )
    ).inserted,
    0,
  );
  const first = await api('/api/v1/organizations/' + w.data.id + '/notifications/summary');
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.total, 100);
  assert.equal(first.data.data.length, 30);
  assert.equal(
    (await api('/api/v1/organizations/' + w.data.id + '/notifications/summary?offset=90')).data.data
      .length,
    10,
  );
  assert.equal(
    (await api('/api/v1/organizations/' + w.data.id + '/notifications/summary?offset=-1')).status,
    400,
  );
});

test('notification preferences stay private and work without business apps in Personal and Developer', async () => {
  for (const kind of ['personal', 'developer']) {
    const w = await api('/api/auth/workspaces', 'POST', {
      kind,
      name: 'Synthetic ' + kind + ' notification scope',
      display_name: 'Synthetic owner',
      services: [],
    });
    assert.equal(w.status, 201);
    const base = '/api/v1/organizations/' + w.data.id;
    assert.equal((await api(base + '/notifications/preferences')).status, 200);
    assert.equal(
      (
        await api(base + '/notifications/preferences', 'PUT', {
          paused: true,
          muted_categories: ['security'],
        })
      ).status,
      200,
    );
    assert.equal((await api(base + '/notifications/preferences')).data.paused, true);
    assert.equal(
      (
        await notify(
          { ...a(), org: w.data.id },
          {
            category: 'security',
            title: 'Suppressed preference fixture',
            body: 'No external delivery.',
            key: 'paused:' + kind,
            user_id: actor,
          },
        )
      ).inserted,
      0,
    );
    assert.equal(
      (await api(base + '/notifications/preferences', 'GET', undefined, approverCookie)).status,
      403,
    );
    assert.equal(
      (await api(base + '/notifications/summary', 'GET', undefined, approverCookie)).status,
      403,
    );
    assert.equal(
      Number(
        (await dbGet('SELECT COUNT(*) AS n FROM ac_app_installations WHERE org_id=?', [w.data.id]))
          .n,
      ),
      0,
    );
    if (kind === 'developer') {
      const devApps = await api(base + '/apps');
      assert.equal(devApps.status, 200);
      assert.deepEqual(
        devApps.data.apps.map((app: any) => app.id),
        ['analytics', 'automations', 'studio', 'integrations_hub'],
      );
      assert.equal((await api(base + '/apps/people/installation-preview')).status, 403);
    }
  }
});

test('analytics drilldown uses the same Nairobi dates, source authorization and private saved sections', async () => {
  const c = await api(path('/records/customers'), 'POST', {
    name: 'Synthetic Nairobi boundary client',
    email: 'boundary@example.test',
    address: 'Private fictional address',
  });
  assert.equal(c.status, 201);
  const date = day(),
    boundary = new Date(date + 'T01:15:00+03:00').toISOString();
  await dbRun('UPDATE ac_records SET created_at=? WHERE id=?', [boundary, c.data.id]);
  const report = await api(path('/business/analytics?from=' + date + '&to=' + date));
  assert.equal(report.status, 200);
  const matching = await api(
    path(
      '/business/analytics/records?kind=customers&from=' + date + '&to=' + date + '&date=' + date,
    ),
  );
  assert.equal(matching.status, 200, JSON.stringify(matching.data));
  assert.ok(matching.data.data.some((r: any) => r.id === c.data.id));
  assert.equal(matching.data.timezone, 'Africa/Nairobi');
  assert.ok(
    matching.data.data.every(
      (r: any) => !('email' in r) && !('address' in r) && !('total_minor' in r),
    ),
  );
  assert.ok(
    !(
      await api(
        path(
          '/business/analytics/records?kind=customers&from=' +
            addDays(date, -1) +
            '&to=' +
            addDays(date, -1),
        ),
      )
    ).data.data.some((r: any) => r.id === c.data.id),
  );
  assert.equal((await api(path('/business/analytics/records?kind=invoices'))).status, 400);
  await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?", [org, actor]);
  try {
    const view = await api(path('/business/analytics?from=' + date + '&to=' + date));
    assert.equal(view.status, 200);
    assert.equal(view.data.financial, null);
    assert.equal(
      (await api(path('/business/analytics/records?kind=customers&from=' + date + '&to=' + date)))
        .status,
      200,
    );
    const saved = await api(path('/business/saved-reports'), 'POST', {
      name: 'Synthetic viewer source view',
      configuration: { query: { currency: 'KES' }, widgets: ['customers'] },
    });
    assert.equal(saved.status, 201);
    assert.deepEqual(
      (await api(path('/business/saved-reports'))).data.data.find(
        (r: any) => r.id === saved.data.id,
      ).configuration.widgets,
      ['customers'],
    );
  } finally {
    await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?", [
      org,
      actor,
    ]);
  }
  const outsider = await api('/api/auth/signup', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-analytics-outsider-2026!',
  });
  assert.equal(
    (
      await api(
        path('/business/analytics/records?kind=customers'),
        'GET',
        undefined,
        outsider.cookie,
      )
    ).status,
    403,
  );
  const personal = await dbGet(
    "SELECT w.id FROM ac_workspaces w JOIN ac_memberships m ON m.org_id=w.id WHERE m.user_id=? AND w.kind='personal'",
    [actor],
  );
  assert.equal(
    (await api('/api/v1/organizations/' + personal.id + '/business/analytics/records?kind=orders'))
      .status,
    403,
  );
});

test('a reviewed replenishment suggestion can create one incoming plan without ordering, receiving or paying', async () => {
  const list = await api(path('/inventory/replenishment-suggestions?status=open'));
  assert.equal(list.status, 200, JSON.stringify(list.data));
  const suggestion = list.data.data[0];
  assert.ok(suggestion);
  const before = await stockBalance(a(), suggestion.product_id),
    body = {
      expected_version: suggestion.version,
      decision: 'plan_incoming',
      note: 'Synthetic reviewed replenishment plan',
      incoming: {
        warehouse_id: warehouseId,
        quantity_milli: suggestion.suggested_quantity_milli,
        due_on: '2026-11-05',
      },
    },
    key = randomUUID();
  const result = await api(
    path('/inventory/replenishment-suggestions/' + suggestion.id + '/review'),
    'POST',
    body,
    cookie,
    key,
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.suggestion.status, 'planned');
  assert.equal(result.data.supplier_orders_created, 0);
  assert.equal(result.data.payments_created, 0);
  assert.equal(result.data.physical_movements_created, 0);
  assert.deepEqual(
    (
      await api(
        path('/inventory/replenishment-suggestions/' + suggestion.id + '/review'),
        'POST',
        body,
        cookie,
        key,
      )
    ).data,
    result.data,
  );
  assert.equal(
    (
      await api(
        path('/inventory/replenishment-suggestions/' + suggestion.id + '/review'),
        'POST',
        body,
      )
    ).status,
    409,
  );
  const after = await stockBalance(a(), suggestion.product_id);
  assert.equal(after.on_hand_milli, before.on_hand_milli);
  assert.equal(after.incoming_milli, before.incoming_milli + suggestion.suggested_quantity_milli);
  assert.ok(
    !(await api(path('/inventory/replenishment-suggestions?status=open'))).data.data.some(
      (r: any) => r.id === suggestion.id,
    ),
  );
  assert.ok(
    (await api(path('/inventory/replenishment-suggestions?status=planned'))).data.data.some(
      (r: any) => r.id === suggestion.id,
    ),
  );
});

test('a committed stock-operation replay remains available at its hard usage cap', async () => {
  const period = new Date().toISOString().slice(0, 7),
    units = Number(
      (
        await dbGet(
          "SELECT COALESCE(SUM(quantity),0) AS n FROM ac_usage_events WHERE org_id=? AND environment='sandbox' AND service_id='inventory' AND period=?",
          [org, period],
        )
      ).n,
    ),
    limit = {
      monthly_budget_minor: null,
      quantity_limit: units + 1,
      hard_stop: true,
      thresholds: [80, 100],
    };
  assert.equal((await api(path('/usage/limits/inventory'), 'PUT', limit)).status, 200);
  try {
    const key = randomUUID(),
      body = {
        product_id: productId,
        warehouse_id: warehouseId,
        kind: 'receipt',
        quantity_milli: 1000,
        reason: 'Synthetic replay at a hard inventory cap',
      },
      first = await api(path('/inventory/movements'), 'POST', body, cookie, key);
    assert.equal(first.status, 201, JSON.stringify(first.data));
    const replay = await api(path('/inventory/movements'), 'POST', body, cookie, key);
    assert.equal(replay.status, 201, JSON.stringify(replay.data));
    assert.equal(replay.data.id, first.data.id);
    assert.equal(
      (
        await api(path('/inventory/movements'), 'POST', {
          ...body,
          reason: 'Denied additional operation beyond hard cap',
        })
      ).status,
      429,
    );
    assert.equal(
      Number(
        (
          await dbGet(
            "SELECT COALESCE(SUM(quantity),0) AS n FROM ac_usage_events WHERE org_id=? AND environment='sandbox' AND service_id='inventory' AND period=?",
            [org, period],
          )
        ).n,
      ),
      units + 1,
    );
  } finally {
    await api(path('/usage/limits/inventory'), 'PUT', {
      monthly_budget_minor: null,
      quantity_limit: null,
      hard_stop: false,
      thresholds: [80, 100],
    });
  }
});

test('new resource creation is metered once and remains replayable at product, CRM and sales caps', async () => {
  const cases = [
    {
      service: 'products',
      route: '/products',
      body: {
        sku: 'CAP-' + randomUUID(),
        name: 'Synthetic capped product',
        sale_price_minor: 1000,
      },
    },
    {
      service: 'crm',
      route: '/crm/entries',
      body: {
        kind: 'interaction',
        customer_id: customerId,
        title: 'Synthetic capped note',
        notes: 'No customer message was sent.',
      },
    },
    { service: 'sales', route: '/sales/quotations', body: document(1) },
  ];
  for (const entry of cases) {
    const period = new Date().toISOString().slice(0, 7),
      count = async () =>
        Number(
          (
            await dbGet(
              'SELECT COALESCE(SUM(quantity),0) AS n FROM ac_usage_events WHERE org_id=? AND environment=? AND service_id=? AND period=?',
              [org, 'sandbox', entry.service, period],
            )
          ).n,
        ),
      before = await count();
    assert.equal(
      (
        await api(path('/usage/limits/' + entry.service), 'PUT', {
          monthly_budget_minor: null,
          quantity_limit: before + 1,
          hard_stop: true,
          thresholds: [80, 100],
        })
      ).status,
      200,
    );
    try {
      const key = randomUUID(),
        first = await api(path(entry.route), 'POST', entry.body, cookie, key);
      assert.equal(first.status, 201, JSON.stringify(first.data));
      const replay = await api(path(entry.route), 'POST', entry.body, cookie, key);
      assert.equal(replay.status, 201, JSON.stringify(replay.data));
      assert.equal(replay.data.id, first.data.id);
      assert.equal(await count(), before + 1);
      assert.equal((await api(path(entry.route), 'POST', entry.body)).status, 429);
      assert.equal(await count(), before + 1);
    } finally {
      await api(path('/usage/limits/' + entry.service), 'PUT', {
        monthly_budget_minor: null,
        quantity_limit: null,
        hard_stop: false,
        thresholds: [80, 100],
      });
    }
  }
});

test('lead conversion retains shared identity and terms, rejects stale or closed records and replays without duplicates', async () => {
  const created = await api(path('/crm/entries'), 'POST', {
    kind: 'lead',
    customer_id: customerId,
    title: 'Synthetic conversion lead',
    notes: 'Preserve these notes',
    assigned_to: actor,
    amount_minor: 120000,
    currency: 'KES',
  });
  assert.equal(created.status, 201);
  const id = created.data.id,
    body = { expected_version: 1 },
    key = randomUUID();
  assert.equal(
    (await api(path('/crm/entries/' + id + '/convert'), 'POST', { expected_version: 2 })).status,
    409,
  );
  const result = await api(path('/crm/entries/' + id + '/convert'), 'POST', body, cookie, key);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.id, id);
  assert.equal(result.data.customer_id, customerId);
  assert.equal(result.data.kind, 'opportunity');
  assert.equal(result.data.stage, 'qualified');
  assert.equal(result.data.version, 2);
  assert.equal(result.data.notes, 'Preserve these notes');
  assert.equal(result.data.amount_minor, 120000);
  assert.equal(result.data.assigned_to, actor);
  assert.deepEqual(
    (await api(path('/crm/entries/' + id + '/convert'), 'POST', body, cookie, key)).data,
    result.data,
  );
  assert.equal(
    (await api(path('/crm/entries/' + id + '/convert'), 'POST', { expected_version: 2 })).status,
    409,
  );
  assert.equal(
    Number((await dbGet('SELECT COUNT(*) AS n FROM ac_crm_entries WHERE id=?', [id])).n),
    1,
  );
  assert.equal(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac_audit WHERE resource_id=? AND action='crm.lead_converted'",
          [id],
        )
      ).n,
    ),
    1,
  );
  const outsider = await api('/api/auth/signup', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-conversion-outsider-2026!',
  });
  await api(
    '/api/auth/verify',
    'POST',
    { token: outsider.data.verification_token },
    outsider.cookie,
  );
  assert.equal(
    (
      await api(
        path('/crm/entries/' + id + '/convert'),
        'POST',
        { expected_version: 2 },
        outsider.cookie,
      )
    ).status,
    403,
  );
  const outsiderId = (await api('/api/auth/account', 'GET', undefined, outsider.cookie)).data.user
    .id;
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'viewer')", [
    org,
    outsiderId,
  ]);
  assert.equal(
    (
      await api(
        path('/crm/entries/' + id + '/convert'),
        'POST',
        { expected_version: 2 },
        outsider.cookie,
      )
    ).status,
    403,
  );
  const closed = await api(path('/crm/entries'), 'POST', {
    kind: 'lead',
    customer_id: customerId,
    title: 'Closed conversion lead',
    status: 'cancelled',
  });
  assert.equal(
    (
      await api(path('/crm/entries/' + closed.data.id + '/convert'), 'POST', {
        expected_version: 1,
      })
    ).status,
    409,
  );
  await dbRun(
    "UPDATE ac_service_entitlements SET status='disabled' WHERE org_id=? AND service_id='crm'",
    [org],
  );
  assert.equal(
    (await api(path('/crm/entries/' + id + '/convert'), 'POST', body, cookie, key)).status,
    402,
  );
  await dbRun(
    "UPDATE ac_service_entitlements SET status='active' WHERE org_id=? AND service_id='crm'",
    [org],
  );
});

test('competing lead conversions commit once and archived customers cannot enter the opportunity pipeline', async () => {
  const created = await api(path('/crm/entries'), 'POST', {
    kind: 'lead',
    customer_id: customerId,
    title: 'Concurrent conversion fixture',
  });
  assert.equal(created.status, 201);
  const converted = await Promise.all(
    [1, 2].map(() =>
      api(path('/crm/entries/' + created.data.id + '/convert'), 'POST', { expected_version: 1 }),
    ),
  );
  assert.deepEqual(converted.map((r) => r.status).sort(), [200, 409]);
  const lead = await api(path('/crm/entries'), 'POST', {
    kind: 'lead',
    customer_id: customerId,
    title: 'Archived contact conversion fixture',
  });
  assert.equal(lead.status, 201);
  assert.equal(
    (await api(path('/records/customers/' + customerId), 'PATCH', { status: 'archived' })).status,
    200,
  );
  try {
    assert.equal(
      (
        await api(path('/crm/entries/' + lead.data.id + '/convert'), 'POST', {
          expected_version: 1,
        })
      ).status,
      409,
    );
    assert.equal(
      (await dbGet('SELECT kind FROM ac_crm_entries WHERE id=?', [lead.data.id])).kind,
      'lead',
    );
  } finally {
    await api(path('/records/customers/' + customerId), 'PATCH', { status: 'active' });
  }
});

test('reviewed stock counts append one exact adjustment, replay safely and reject stale observations', async () => {
  const created = await api(path('/products'), 'POST', {
    sku: 'COUNT-' + randomUUID(),
    name: 'Synthetic counted product',
    sale_price_minor: 1000,
  });
  assert.equal(created.status, 201);
  const id = created.data.id,
    target = { product_id: id, warehouse_id: warehouseId, location_id: null };
  assert.equal(
    (
      await api(path('/inventory/movements'), 'POST', {
        ...target,
        kind: 'receipt',
        quantity_milli: 10000,
        reason: 'Synthetic count opening receipt',
      })
    ).status,
    201,
  );
  const previewPath =
      '/inventory/stock-counts/preview?product_id=' + id + '&warehouse_id=' + warehouseId,
    preview = await api(path(previewPath));
  assert.equal(preview.status, 200);
  assert.equal(preview.data.on_hand_milli, 10000);
  const before = Number(
      (await dbGet('SELECT COUNT(*) AS n FROM ac_stock_movements WHERE product_id=?', [id])).n,
    ),
    body = {
      ...target,
      expected_revision: preview.data.revision,
      counted_quantity_milli: 9000,
      reason: 'Synthetic physical count reconciliation',
    },
    key = 'count-' + randomUUID() + 'x'.repeat(158);
  const result = await api(path('/inventory/stock-counts'), 'POST', body, cookie, key);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.delta_milli, -1000);
  assert.ok(result.data.movement_id);
  assert.equal((await stockBalance(a(), id)).on_hand_milli, 9000);
  assert.deepEqual(
    (await api(path('/inventory/stock-counts'), 'POST', body, cookie, key)).data,
    result.data,
  );
  assert.equal(
    Number(
      (await dbGet('SELECT COUNT(*) AS n FROM ac_stock_movements WHERE product_id=?', [id])).n,
    ),
    before + 1,
  );
  assert.equal((await api(path('/inventory/stock-counts'), 'POST', body)).status, 409);
  const next = await api(path(previewPath)),
    noop = await api(path('/inventory/stock-counts'), 'POST', {
      ...body,
      expected_revision: next.data.revision,
      counted_quantity_milli: 9000,
    });
  assert.equal(noop.status, 200);
  assert.equal(noop.data.movement_id, null);
  assert.equal(
    Number(
      (await dbGet('SELECT COUNT(*) AS n FROM ac_stock_movements WHERE product_id=?', [id])).n,
    ),
    before + 1,
  );
  assert.equal(
    (
      await api(path('/inventory/stock-counts'), 'POST', {
        ...body,
        expected_revision: next.data.revision,
        counted_quantity_milli: 8500,
      })
    ).status,
    400,
  );
  const competing = await Promise.all(
    [10000, 11000].map((counted_quantity_milli) =>
      api(path('/inventory/stock-counts'), 'POST', {
        ...body,
        expected_revision: next.data.revision,
        counted_quantity_milli,
      }),
    ),
  );
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
  const latest = await api(path(previewPath)),
    negative = { ...body, expected_revision: latest.data.revision, counted_quantity_milli: 0 };
  assert.equal((await api(path('/inventory/stock-counts'), 'POST', negative)).status, 409);
  const movement = {
      ...target,
      kind: 'adjustment',
      quantity_milli: -latest.data.on_hand_milli,
      reason: 'Stock count: ' + body.reason,
    },
    review = await api(path('/inventory/adjustment-approvals'), 'POST', {
      approver: approverId,
      movement,
    });
  assert.equal(review.status, 201);
  assert.equal(
    (
      await api(
        path('/approvals/' + review.data.id + '/decide'),
        'POST',
        { decision: 'approved', reason: 'Reviewed exact synthetic count difference' },
        approverCookie,
      )
    ).status,
    200,
  );
  const posted = await api(path('/inventory/stock-counts'), 'POST', {
    ...negative,
    approval_id: review.data.id,
  });
  assert.equal(posted.status, 200, JSON.stringify(posted.data));
  assert.equal((await stockBalance(a(), id)).on_hand_milli, 0);
});

test('stock counts reject consuming reservations and respect workspace, role and service boundaries', async () => {
  const target = { product_id: productId, warehouse_id: warehouseId, location_id: null },
    preview = await api(
      path(
        '/inventory/stock-counts/preview?product_id=' + productId + '&warehouse_id=' + warehouseId,
      ),
    );
  assert.equal(preview.status, 200);
  assert.ok(preview.data.reserved_milli > 0);
  const body = {
    ...target,
    expected_revision: preview.data.revision,
    counted_quantity_milli: 0,
    reason: 'Synthetic count below reserved stock',
  };
  assert.equal((await api(path('/inventory/stock-counts'), 'POST', body)).status, 409);
  assert.equal(
    (await api(path('/inventory/stock-counts'), 'POST', { ...body, warehouse_id: randomUUID() }))
      .status,
    404,
  );
  const outsider = await api('/api/auth/signup', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-count-outsider-2026!',
  });
  await api(
    '/api/auth/verify',
    'POST',
    { token: outsider.data.verification_token },
    outsider.cookie,
  );
  assert.equal(
    (await api(path('/inventory/stock-counts'), 'POST', body, outsider.cookie)).status,
    403,
  );
  const user = (await api('/api/auth/account', 'GET', undefined, outsider.cookie)).data.user.id;
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'viewer')", [org, user]);
  assert.equal(
    (await api(path('/inventory/stock-counts'), 'POST', body, outsider.cookie)).status,
    403,
  );
  await dbRun(
    "UPDATE ac_service_entitlements SET status='disabled' WHERE org_id=? AND service_id='inventory'",
    [org],
  );
  try {
    assert.equal((await api(path('/inventory/stock-counts'), 'POST', body)).status, 402);
  } finally {
    await dbRun(
      "UPDATE ac_service_entitlements SET status='active' WHERE org_id=? AND service_id='inventory'",
      [org],
    );
  }
});

test('CRM configuration, team ownership, archive and version history retain authorization and historical stages', async () => {
  const configuration = await api(path('/crm/configuration'));
  assert.equal(configuration.status, 200);
  const teamId = randomUUID(),
    stages = [...configuration.data.stages, { id: 'negotiation', name: 'Negotiation' }],
    teams = [
      {
        id: teamId,
        name: 'Synthetic sales team',
        owner: actor,
        members: [actor, approverId],
        active: true,
      },
    ];
  const saved = await api(path('/crm/configuration'), 'PUT', {
    expected_version: configuration.data.version,
    stages,
    teams,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const lead = await api(path('/crm/entries'), 'POST', {
    kind: 'opportunity',
    customer_id: customerId,
    title: 'Configurable pipeline fixture',
    stage: 'negotiation',
    team_id: teamId,
    assigned_to: actor,
    probability_bps: 7500,
    expected_close_on: '2026-12-01',
    tags: ['priority'],
  });
  assert.equal(lead.status, 201, JSON.stringify(lead.data));
  const { id, version, created_at, updated_at, ...entry } = lead.data;
  const changed = await api(path('/crm/entries/' + id), 'PATCH', {
    expected_version: version,
    entry: { ...entry, stage: 'won', outcome_reason: 'Synthetic commercial review complete' },
  });
  assert.equal(changed.status, 200);
  const history = await api(path('/crm/entries/' + id + '/history'));
  assert.equal(history.status, 200);
  assert.equal(history.data.data.length, 2);
  assert.equal(history.data.data[0].snapshot.stage, 'negotiation');
  assert.equal(history.data.data[1].snapshot.stage, 'won');
  assert.equal(
    (
      await api(path('/crm/configuration'), 'PUT', {
        expected_version: saved.data.version,
        stages: configuration.data.stages,
        teams,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(path('/crm/configuration'), 'PUT', {
        expected_version: configuration.data.version,
        stages,
        teams,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(path('/crm/configuration'), 'PUT', {
        expected_version: saved.data.version,
        stages,
        teams: [{ ...teams[0], members: [approverId], owner: approverId }],
      })
    ).status,
    409,
  );
  assert.ok(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac2_events WHERE org_id=? AND resource_id=? AND event_type='crm.stage_changed'",
          [org, id],
        )
      ).n,
    ) === 1,
  );
  const archived = await api(path('/crm/entries/' + id), 'PATCH', {
    expected_version: 2,
    entry: { ...entry, stage: 'won', status: 'archived' },
  });
  assert.equal(archived.status, 200);
  assert.equal((await api(path('/crm/entries/' + id + '/history'))).data.data.length, 3);
});

test('CRM bulk import is atomic and deduplicated by stable source even with a different retry key', async () => {
  const source_id = 'source-' + randomUUID(),
    row = { kind: 'lead', customer_id: customerId, title: 'Imported controlled lead' },
    body = { source_id, rows: [row] };
  const first = await api(path('/crm/import'), 'POST', body);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const replay = await api(path('/crm/import'), 'POST', body);
  assert.deepEqual(replay.data, first.data);
  assert.equal(
    (
      await api(path('/crm/import'), 'POST', {
        source_id,
        rows: [{ ...row, title: 'Changed imported content' }],
      })
    ).status,
    409,
  );
  const before = Number(
    (await dbGet('SELECT COUNT(*) AS n FROM ac_crm_entries WHERE org_id=?', [org])).n,
  );
  assert.equal(
    (
      await api(path('/crm/import'), 'POST', {
        source_id: 'invalid-' + randomUUID(),
        rows: [row, { ...row, customer_id: randomUUID() }],
      })
    ).status,
    404,
  );
  assert.equal(
    Number((await dbGet('SELECT COUNT(*) AS n FROM ac_crm_entries WHERE org_id=?', [org])).n),
    before,
  );
});

test('CRM reporting filters before grouping, retains exact probability arithmetic and isolates currencies and history', async () => {
  const opportunity = await api(path('/crm/entries'), 'POST', {
    kind: 'opportunity',
    customer_id: customerId,
    title: 'Synthetic weighted report',
    assigned_to: actor,
    amount_minor: 12345,
    currency: 'KES',
    probability_bps: 7500,
    expected_close_on: '2026-12-10',
  });
  assert.equal(opportunity.status, 201);
  const foreign = await api(path('/crm/entries'), 'POST', {
    kind: 'opportunity',
    customer_id: customerId,
    title: 'Separate currency fixture',
    amount_minor: 9000000,
    currency: 'USD',
  });
  assert.equal(foreign.status, 201);
  const report = await api(path('/crm/report?currency=KES&assignee=' + actor));
  assert.equal(report.status, 200, JSON.stringify(report.data));
  assert.ok(report.data.records.some((r: any) => r.id === opportunity.data.id));
  assert.ok(report.data.records.every((r: any) => r.currency === 'KES' && r.assigned_to === actor));
  assert.equal(report.data.timezone, 'Africa/Nairobi');
  const before = report.data.by_assignee.find((r: any) => r.id === actor);
  assert.ok(before.weighted_open_minor >= 9259);
  assert.equal((await api(path('/crm/report?from=2026-12-31&to=2026-01-01'))).status, 400);
  const stranger = await api('/api/auth/signup', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-crm-report-outsider-2026!',
  });
  assert.equal(
    (
      await api(
        path('/crm/entries/' + opportunity.data.id + '/history'),
        'GET',
        undefined,
        stranger.cookie,
      )
    ).status,
    403,
  );
  assert.equal((await api(path('/crm/report'), 'GET', undefined, stranger.cookie)).status, 403);
  const body = await api('/api/auth/account', 'GET', undefined, stranger.cookie);
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'operations')", [
    org,
    body.data.user.id,
  ]);
  await api(
    '/api/auth/verify',
    'POST',
    { token: stranger.data.verification_token },
    stranger.cookie,
  );
  const config = await api(path('/crm/configuration'));
  assert.equal(
    (
      await api(
        path('/crm/configuration'),
        'PUT',
        {
          expected_version: config.data.version,
          stages: config.data.stages,
          teams: config.data.teams,
        },
        stranger.cookie,
      )
    ).status,
    403,
  );
});

test('quotation revision retains shared history and expired terms cannot be accepted without review', async () => {
  const old = await api(path('/sales/quotations'), 'POST', {
    ...document(1),
    issue_date: addDays(day(), -30),
    valid_until: addDays(day(), -1),
  });
  assert.equal(old.status, 201);
  const id = old.data.id;
  const shared = await api(path('/sales/quotations/' + id + '/action'), 'POST', {
    action: 'mark_shared',
    expected_version: 1,
  });
  assert.equal(shared.status, 200);
  assert.equal(
    (
      await api(path('/sales/quotations/' + id + '/action'), 'POST', {
        action: 'accept',
        expected_version: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(path('/sales/quotations/' + id), 'PATCH', {
        expected_version: 2,
        document: document(2),
      })
    ).status,
    409,
  );
  const revised = await api(path('/sales/quotations/' + id + '/action'), 'POST', {
    action: 'revise',
    expected_version: 2,
    reason: 'Synthetic validity extension requested',
  });
  assert.equal(revised.status, 200, JSON.stringify(revised.data));
  assert.equal(revised.data.status, 'draft');
  const updated = await api(path('/sales/quotations/' + id), 'PATCH', {
    expected_version: 3,
    document: { ...document(2), valid_until: addDays(day(), 30) },
  });
  assert.equal(updated.status, 200);
  const history = await api(path('/sales/quotations/' + id + '/history'));
  assert.equal(history.status, 200);
  assert.deepEqual(
    history.data.data.map((r: any) => r.quotation_version),
    [1, 2, 3, 4],
  );
  assert.equal(history.data.data[1].snapshot.status, 'shared');
  assert.equal(history.data.data[1].snapshot.valid_until, addDays(day(), -1));
  assert.equal(history.data.data[3].snapshot.items[0].quantity, 2);
});

test('customer price tiers are explicit, scoped and version-bound without changing saved quotations', async () => {
  const configuration = {
    name: 'Synthetic repeat-customer pricing',
    currency: 'KES',
    customer_id: customerId,
    starts_on: '2026-01-01',
    active: true,
    rules: [
      { product_id: productId, minimum_quantity_milli: 1000, unit_price_minor: 90000 },
      { product_id: productId, minimum_quantity_milli: 3000, unit_price_minor: 80000 },
    ],
  };
  const list = await api(path('/sales/price-lists'), 'POST', {
    expected_version: 0,
    configuration,
  });
  assert.equal(list.status, 201, JSON.stringify(list.data));
  const preview = await api(path('/sales/pricing-preview'), 'POST', {
    price_list_id: list.data.id,
    document: document(3),
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.document.items[0].unit_price_minor, 80000);
  assert.equal(preview.data.document.total_minor, 240000);
  const priced = {
      ...preview.data.document,
      price_list_id: list.data.id,
      expected_price_list_version: 1,
    },
    saved = await api(path('/sales/quotations'), 'POST', priced);
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  assert.equal(saved.data.price_list_snapshot.version, 1);
  assert.equal(
    (
      await api(path('/sales/price-lists/' + list.data.id), 'PUT', {
        expected_version: 1,
        configuration: {
          ...configuration,
          rules: [{ product_id: productId, minimum_quantity_milli: 1000, unit_price_minor: 75000 }],
        },
      })
    ).status,
    200,
  );
  assert.equal((await api(path('/sales/quotations'), 'POST', priced)).status, 409);
  assert.equal((await api(path('/sales/quotations/' + saved.data.id))).data.total_minor, 240000);
  const other = await api(path('/records/customers'), 'POST', { name: 'Other price customer' });
  assert.equal(
    (
      await api(path('/sales/pricing-preview'), 'POST', {
        price_list_id: list.data.id,
        document: { ...document(3), customer_id: other.data.id },
      })
    ).status,
    400,
  );
});

test('conditional CRM workflows bind current stage and version, skip unmatched branches and deduplicate tasks', async () => {
  const config = {
    name: 'Synthetic stage branch',
    template: 'crm_stage_follow_up',
    enabled: true,
    conditions: { currency: 'KES', minimum_minor: 0, days_before_due: 1 },
    branches: [
      {
        conditions: [{ field: 'stage', operator: 'eq', value: 'qualified' }],
        action: 'create_crm_follow_up',
      },
    ],
    fallback_action: 'skip',
    retry_policy: { max_attempts: 2, base_delay_seconds: 3 },
  };
  const workflow = await api(path('/automations'), 'POST', config);
  assert.equal(workflow.status, 201, JSON.stringify(workflow.data));
  const lead = await api(path('/crm/entries'), 'POST', {
    kind: 'opportunity',
    customer_id: customerId,
    title: 'Conditional stage source',
  });
  assert.equal(lead.status, 201);
  const { id, version, created_at, updated_at, ...entry } = lead.data;
  assert.equal(
    (
      await api(path('/crm/entries/' + id), 'PATCH', {
        expected_version: 1,
        entry: { ...entry, stage: 'qualified' },
      })
    ).status,
    200,
  );
  await runAutomations(a(), new Date(Date.now() + 1000));
  let runs = await dbAll('SELECT * FROM ac2_runs WHERE workflow_id=?', [workflow.data.id]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'succeeded');
  assert.equal(JSON.parse(runs[0].result).action, 'create_crm_follow_up');
  const task = await dbGet('SELECT * FROM ac_crm_entries WHERE id=?', [runs[0].id]);
  assert.equal(task.kind, 'follow_up');
  await runAutomations(a(), new Date(Date.now() + 2000));
  assert.equal(
    Number((await dbGet('SELECT COUNT(*) AS n FROM ac_crm_entries WHERE id=?', [runs[0].id])).n),
    1,
  );
  assert.equal(
    (
      await api(path('/crm/entries/' + id), 'PATCH', {
        expected_version: 2,
        entry: { ...entry, stage: 'proposal' },
      })
    ).status,
    200,
  );
  await runAutomations(a(), new Date(Date.now() + 3000));
  runs = await dbAll('SELECT * FROM ac2_runs WHERE workflow_id=? ORDER BY created_at,id', [
    workflow.data.id,
  ]);
  assert.equal(runs.length, 2);
  assert.ok(runs.some((r) => JSON.parse(r.result).action === 'skip'));
  const invalid = await api(path('/automations'), 'POST', {
    ...config,
    branches: [
      {
        conditions: [{ field: 'stage', operator: 'eq', value: 'won' }],
        action: 'replenishment_suggestion',
      },
    ],
  });
  assert.equal(invalid.status, 400);
  const delayed = await api(path('/automations'), 'POST', {
    ...config,
    name: 'Synthetic stale-stage delayed branch',
    delay_minutes: 1,
  });
  assert.equal(delayed.status, 201);
  const source = await api(path('/crm/entries'), 'POST', {
      kind: 'opportunity',
      customer_id: customerId,
      title: 'Delayed current-stage source',
    }),
    { id: sourceId, version: sv, created_at: sc, updated_at: su, ...sourceEntry } = source.data;
  await api(path('/crm/entries/' + sourceId), 'PATCH', {
    expected_version: 1,
    entry: { ...sourceEntry, stage: 'qualified' },
  });
  await runAutomations(a());
  await api(path('/crm/entries/' + sourceId), 'PATCH', {
    expected_version: 2,
    entry: { ...sourceEntry, stage: 'proposal' },
  });
  await runAutomations(a(), new Date(Date.now() + 120000));
  const delayedRuns = await dbAll('SELECT * FROM ac2_runs WHERE workflow_id=?', [delayed.data.id]);
  assert.ok(
    delayedRuns.some(
      (r) => r.status === 'cancelled' && JSON.parse(r.result).reason === 'source_changed',
    ),
  );
});

test('automation directories filter before pagination and run history uses its saved version with sanitized results', async () => {
  const originalName = 'Phase 2.13 history 100% literal',
    configuration = {
      name: originalName,
      template: 'crm_stage_follow_up',
      enabled: false,
      conditions: { currency: 'KES', minimum_minor: 0, days_before_due: 1 },
      branches: [],
      fallback_action: 'skip',
      retry_policy: { max_attempts: 2, base_delay_seconds: 3 },
    },
    workflow = await api(path('/automations'), 'POST', configuration);
  assert.equal(workflow.status, 201, JSON.stringify(workflow.data));
  const directory = await api(
    path('/automations') + '?search=' + encodeURIComponent('100%') + '&source=crm&state=paused&limit=1&offset=0',
  );
  assert.equal(directory.status, 200, JSON.stringify(directory.data));
  assert.equal(directory.data.total, 1);
  assert.equal(directory.data.data.length, 1);
  assert.equal(directory.data.data[0].id, workflow.data.id);
  assert.equal(directory.data.data[0].owner_name, 'Synthetic owner');
  assert.equal(directory.data.data[0].owner_permission_revoked, false);

  const revised = await api(path('/automations/' + workflow.data.id + '/configuration'), 'PUT', {
    expected_version: 1,
    configuration: { ...configuration, name: 'Phase 2.13 current version' },
  });
  assert.equal(revised.status, 200, JSON.stringify(revised.data));
  assert.equal(revised.data.version, 2);

  const runId = randomUUID(), occurred = new Date().toISOString();
  await dbRun(
    'INSERT INTO ac2_runs(id,org_id,environment,workflow_id,trigger_key,status,attempts,next_at,result,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [runId, org, 'sandbox', workflow.data.id, 'phase2.13.synthetic', 'succeeded', 1, occurred, JSON.stringify({ action: 'skip', completed_units: 1, secret: 'must-not-leak' }), occurred, occurred],
  );
  await dbRun('INSERT INTO ac_workflow_run_versions(run_id,workflow_id,version) VALUES (?,?,?)', [
    runId,
    workflow.data.id,
    1,
  ]);
  const history = await api(
    path('/automation-runs') + '?workflow_id=' + workflow.data.id + '&status=succeeded&limit=1&offset=0',
  );
  assert.equal(history.status, 200, JSON.stringify(history.data));
  assert.equal(history.data.total, 1);
  assert.equal(history.data.data[0].workflow_name, originalName);
  assert.equal(history.data.data[0].version, 1);
  assert.deepEqual(history.data.data[0].result, { action: 'skip', completed_units: 1 });
  const runDetail = await api(path('/automation-runs/' + runId));
  assert.equal(runDetail.status, 200);
  assert.equal(runDetail.data.workflow_name, originalName);
  assert.equal(runDetail.data.action_name, 'skip');
  assert.deepEqual(runDetail.data.result, { action: 'skip', completed_units: 1 });

  const versions = await api(path('/automations/' + workflow.data.id + '/versions'));
  assert.equal(versions.status, 200);
  assert.deepEqual(versions.data.data.map((item: any) => item.version), [2, 1]);
  assert.equal(versions.data.data[0].actor_name, 'Synthetic owner');
  assert.equal('actor' in versions.data.data[0], false);

  const from = new Date(occurred).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }),
    runReport = await api(path(`/business/analytics/report?metric=automations.runs&group_by=status&from=${from}&to=${from}`)),
    rulesReport = await api(path(`/business/analytics/report?metric=automations.rules&group_by=status&from=${from}&to=${from}`));
  assert.equal(runReport.status, 200, JSON.stringify(runReport.data));
  assert.ok(runReport.data.rows.find((row: any) => row.key === 'succeeded')?.value >= 1);
  assert.equal(rulesReport.status, 200, JSON.stringify(rulesReport.data));
  assert.ok(rulesReport.data.rows.some((row: any) => row.key === 'enabled' || row.key === 'paused'));
});

test('a finance member can recover a paused automation after its former owner loses authority', async () => {
  const rule = await api(
    path('/automations'),
    'POST',
    {
      name: 'Phase 2.13 former owner recovery',
      template: 'crm_stage_follow_up',
      enabled: false,
      conditions: { currency: 'KES', minimum_minor: 0, days_before_due: 1 },
      branches: [],
      fallback_action: 'skip',
      retry_policy: { max_attempts: 2, base_delay_seconds: 3 },
    },
    approverCookie,
  );
  assert.equal(rule.status, 201, JSON.stringify(rule.data));
  try {
    await dbRun("UPDATE ac_memberships SET role='operations' WHERE org_id=? AND user_id=?", [org, approverId]);
    const details = await api(path('/automations/' + rule.data.id));
    assert.equal(details.status, 200);
    assert.equal(details.data.owner_permission_revoked, true);
    const enable = await api(path('/automations/' + rule.data.id), 'PATCH', { enabled: true });
    assert.equal(enable.status, 409);
    const takeover = await api(path('/automations/' + rule.data.id + '/take-ownership'), 'POST', {});
    assert.equal(takeover.status, 200, JSON.stringify(takeover.data));
    assert.equal(takeover.data.created_by, actor);
    assert.equal(takeover.data.enabled, false);
    assert.equal(takeover.data.version, 2);
  } finally {
    await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?", [org, approverId]);
  }
});

test('daily and weekly automations respect the configured local timezone through the DST transition', async () => {
  const daily = await api(path('/automations'), 'POST', {
    name: 'Phase 2.13 New York daily schedule',
    template: 'daily_summary',
    enabled: true,
    schedule: { frequency: 'daily', hour: 9, timezone: 'America/New_York' },
  });
  assert.equal(daily.status, 201, JSON.stringify(daily.data));
  await runAutomations(a(), new Date('2026-03-08T12:59:00.000Z'));
  assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac2_runs WHERE workflow_id=?', [daily.data.id])).n), 0);
  await runAutomations(a(), new Date('2026-03-08T13:00:00.000Z'));
  await runAutomations(a(), new Date('2026-03-08T13:01:00.000Z'));
  assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac2_runs WHERE workflow_id=?', [daily.data.id])).n), 1);

  const weekly = await api(path('/automations'), 'POST', {
    name: 'Phase 2.13 New York weekly schedule',
    template: 'daily_summary',
    enabled: true,
    schedule: { frequency: 'weekly', hour: 9, timezone: 'America/New_York' },
  });
  assert.equal(weekly.status, 201, JSON.stringify(weekly.data));
  await runAutomations(a(), new Date('2026-03-09T13:00:00.000Z'));
  await runAutomations(a(), new Date('2026-03-10T13:00:00.000Z'));
  assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac2_runs WHERE workflow_id=?', [weekly.data.id])).n), 1);
});

test('manual scheduled execution runs only the selected enabled rule before its target hour', async () => {
  const configuration = (name: string) => ({
    name,
    template: 'daily_summary',
    enabled: true,
    schedule: { frequency: 'daily', hour: 23, timezone: 'Africa/Nairobi' },
  });
  const selected = await api(path('/automations'), 'POST', configuration('Manual schedule selected')),
    unrelated = await api(path('/automations'), 'POST', configuration('Manual schedule unrelated'));
  assert.equal(selected.status, 201, JSON.stringify(selected.data));
  assert.equal(unrelated.status, 201, JSON.stringify(unrelated.data));
  const unrelatedPendingId = randomUUID(), stamp = new Date(Date.now() - 1000).toISOString();
  await dbRun(
    "INSERT INTO ac2_runs(id,org_id,environment,workflow_id,trigger_key,status,next_at,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?,?)",
    [unrelatedPendingId, org, 'sandbox', unrelated.data.id, 'synthetic-pending-run', stamp, stamp, stamp],
  );
  await dbRun('INSERT INTO ac_workflow_run_versions(run_id,workflow_id,version) VALUES (?,?,?)', [
    unrelatedPendingId,
    unrelated.data.id,
    unrelated.data.version,
  ]);

  const result = await api(path('/automations/' + selected.data.id + '/process'), 'POST', {});
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.manual, true);
  assert.equal(result.data.workflow_id, selected.data.id);
  assert.equal(result.data.queued, 1);
  assert.equal(result.data.processed, 1);
  const selectedRuns = await dbAll('SELECT status FROM ac2_runs WHERE workflow_id=?', [selected.data.id]),
    unrelatedRuns = await dbAll('SELECT status FROM ac2_runs WHERE workflow_id=?', [unrelated.data.id]);
  assert.deepEqual(selectedRuns.map((run: any) => run.status), ['succeeded']);
  assert.deepEqual(unrelatedRuns.map((run: any) => run.status), ['pending']);

  await api(path('/automations/' + selected.data.id), 'PATCH', { enabled: false });
  const paused = await api(path('/automations/' + selected.data.id + '/process'), 'POST', {});
  assert.equal(paused.status, 409);
});

test('company contacts and legacy tag edits retain canonical relationships without cross-workspace lookup', async () => {
  const company = await api(path('/records/customers'), 'POST', {
      name: 'Synthetic parent company',
    }),
    person = await api(path('/records/customers'), 'POST', { name: 'Synthetic company contact' });
  assert.equal(
    (
      await api(path('/crm/customers/' + company.data.id), 'PUT', {
        expected_version: 0,
        tags: [],
        assigned_to: null,
        contact_type: 'company',
        company_id: null,
      })
    ).status,
    200,
  );
  const linked = await api(path('/crm/customers/' + person.data.id), 'PUT', {
    expected_version: 0,
    tags: ['buyer'],
    assigned_to: actor,
    contact_type: 'individual',
    company_id: company.data.id,
  });
  assert.equal(linked.status, 200, JSON.stringify(linked.data));
  const companies = await api(path('/crm/companies?q=parent%20company'));
  assert.equal(companies.status, 200, JSON.stringify(companies.data));
  assert.deepEqual(companies.data.data.map((item: any) => item.id), [company.data.id]);
  await api(path('/records/customers/' + company.data.id), 'PATCH', { status: 'archived' });
  assert.equal((await api(path('/crm/companies?q=parent%20company'))).data.total, 0);
  const legacy = await api(path('/crm/customers/' + person.data.id), 'PUT', {
    expected_version: 1,
    tags: ['repeat'],
    assigned_to: actor,
  });
  assert.equal(legacy.status, 200);
  assert.equal(legacy.data.profile.company_id, company.data.id);
  assert.equal(
    (
      await api(path('/crm/customers/' + company.data.id), 'PUT', {
        expected_version: 1,
        tags: [],
        assigned_to: null,
        contact_type: 'individual',
        company_id: null,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(path('/crm/customers/' + person.data.id), 'PUT', {
        expected_version: 2,
        tags: [],
        assigned_to: null,
        contact_type: 'individual',
        company_id: randomUUID(),
      })
    ).status,
    404,
  );
});

test('CRM customer activity pages canonical linked records and reports complete counts', async () => {
  const customer = await api(path('/records/customers'), 'POST', {
    name: 'Synthetic paged activity customer',
  });
  assert.equal(customer.status, 201, JSON.stringify(customer.data));
  const created = await Promise.all(
    ['A', 'B', 'C'].map((suffix) =>
      api(path('/crm/entries'), 'POST', {
        kind: 'interaction',
        customer_id: customer.data.id,
        title: 'Paged customer interaction ' + suffix,
      }),
    ),
  );
  assert.ok(created.every((result) => result.status === 201));
  const first = await api(
    path('/crm/customers/' + customer.data.id + '/activity?limit=2&offset=0'),
  );
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.entries_total, 3);
  assert.equal(first.data.entries.length, 2);
  assert.equal(first.data.has_more, true);
  const second = await api(
    path('/crm/customers/' + customer.data.id + '/activity?limit=2&offset=2'),
  );
  assert.equal(second.data.entries.length, 1);
  assert.equal(second.data.has_more, false);
  assert.equal(
    new Set([...first.data.entries, ...second.data.entries].map((entry: any) => entry.id)).size,
    3,
  );
  assert.equal(typeof first.data.quotation_count, 'number');
  assert.equal(typeof first.data.order_count, 'number');
});

test('legacy completed CRM creation remains replayable after adding defaulted opportunity metadata', async () => {
  const input = { kind: 'lead', customer_id: customerId, title: 'Synthetic legacy request' },
    created = await api(path('/crm/entries'), 'POST', input);
  assert.equal(created.status, 201);
  const key = randomUUID(),
    legacy = {
      ...input,
      notes: '',
      stage: 'new',
      status: 'open',
      assigned_to: null,
      due_at: null,
      amount_minor: 0,
      currency: 'KES',
      quotation_id: null,
      order_id: null,
    };
  await dbRun(
    'INSERT INTO ac_finance_operations(org_id,environment,operation,idempotency_key,fingerprint,response,created_at) VALUES (?,?,?,?,?,?,?)',
    [
      org,
      'sandbox',
      'crm.entry.create',
      key,
      hash(canonical(legacy)),
      JSON.stringify(created.data),
      new Date().toISOString(),
    ],
  );
  const replay = await api(path('/crm/entries'), 'POST', input, cookie, key);
  assert.equal(replay.status, 201, JSON.stringify(replay.data));
  assert.equal(replay.data.id, created.data.id);
});

test('quotation templates retain reusable terms without creating customer documents and workflow creation replays safely', async () => {
  const template = await api(path('/sales/templates'), 'POST', {
    expected_version: 0,
    name: 'Synthetic reusable service offer',
    active: true,
    configuration: { ...document(1), due_days: 14, valid_days: 7 },
  });
  assert.equal(template.status, 201, JSON.stringify(template.data));
  assert.ok(!('customer_id' in template.data.configuration));
  assert.equal(template.data.configuration.due_days, 14);
  assert.equal(
    (
      await api(path('/sales/templates/' + template.data.id), 'PUT', {
        expected_version: 0,
        name: 'Stale template change',
        active: false,
        configuration: template.data.configuration,
      })
    ).status,
    409,
  );
  const key = randomUUID(),
    body = {
      name: 'Synthetic idempotent workflow setup',
      template: 'daily_summary',
      enabled: false,
    },
    first = await api(path('/automations'), 'POST', body, cookie, key),
    second = await api(path('/automations'), 'POST', body, cookie, key);
  assert.equal(first.status, 201);
  assert.equal(second.data.id, first.data.id);
});

test('opportunity activities retain scoped customer linkage and completed history', async () => {
  const parent = await api(path('/crm/entries'), 'POST', {
    kind: 'opportunity',
    customer_id: customerId,
    title: 'Linked follow-up opportunity',
  });
  assert.equal(parent.status, 201);
  const body = {
    kind: 'follow_up',
    customer_id: customerId,
    parent_entry_id: parent.data.id,
    title: 'Synthetic call',
    activity_type: 'call',
    due_at: '2026-12-01T09:00:00.000Z',
    assigned_to: actor,
  };
  const activity = await api(path('/crm/entries'), 'POST', body);
  assert.equal(activity.status, 201, JSON.stringify(activity.data));
  assert.equal(activity.data.parent_entry_id, parent.data.id);
  const { id, version, created_at, updated_at, ...record } = activity.data;
  const done = await api(path('/crm/entries/' + id), 'PATCH', {
    expected_version: version,
    entry: { ...record, status: 'completed', notes: 'Call completed' },
  });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(
    (await api(path('/crm/entries/' + id + '/history'))).data.data.at(-1).snapshot.status,
    'completed',
  );
  assert.equal(
    (await api(path('/crm/entries'), 'POST', { ...body, parent_entry_id: randomUUID() })).status,
    400,
  );
  assert.equal(
    (await api(path('/crm/entries'), 'POST', { ...body, kind: 'opportunity' })).status,
    400,
  );
  assert.equal(
    (
      await api(path('/crm/entries/' + id), 'PATCH', {
        expected_version: 2,
        entry: { ...record, status: 'completed', parent_entry_id: null },
      })
    ).status,
    400,
  );
});

test('lead conversion validates and persists assignment without changing the customer', async () => {
  const lead = await api(path('/crm/entries'), 'POST', {
    kind: 'lead',
    customer_id: customerId,
    title: 'Assignment conversion fixture',
  });
  assert.equal(lead.status, 201);
  assert.equal(
    (
      await api(path('/crm/entries/' + lead.data.id + '/convert'), 'POST', {
        expected_version: 1,
        assigned_to: randomUUID(),
      })
    ).status,
    400,
  );
  const converted = await api(path('/crm/entries/' + lead.data.id + '/convert'), 'POST', {
    expected_version: 1,
    assigned_to: actor,
    team_id: null,
  });
  assert.equal(converted.status, 200, JSON.stringify(converted.data));
  assert.equal(converted.data.assigned_to, actor);
  assert.equal(converted.data.customer_id, customerId);
  assert.equal(
    (
      await api(path('/crm/entries/' + lead.data.id + '/convert'), 'POST', {
        expected_version: 2,
        assigned_to: actor,
      })
    ).status,
    409,
  );
});

test('CRM cursor continues after a stable record even when newer records arrive', async () => {
  const initial = await api(path('/crm/entries'));
  assert.equal(initial.status, 200);
  assert.ok(initial.data.data.length > 1);
  const first = initial.data.data[0],
    expected = initial.data.data.slice(1).map((e: any) => e.id);
  await api(path('/crm/entries'), 'POST', {
    kind: 'lead',
    customer_id: customerId,
    title: 'Newer pagination fixture',
  });
  const query = new URLSearchParams({ before_created_at: first.created_at, before_id: first.id });
  const next = await api(path('/crm/entries?' + query));
  assert.equal(next.status, 200);
  assert.deepEqual(
    next.data.data.map((e: any) => e.id),
    expected,
  );
  assert.equal((await api(path('/crm/entries?before_id=' + first.id))).status, 400);
});

test('CRM directory searches and pages filtered records on the server with matching stage summaries', async () => {
  const created = await api(path('/crm/entries'), 'POST', {
    kind: 'opportunity',
    customer_id: customerId,
    title: 'Filtered board fixture',
    stage: 'new',
    currency: 'KES',
    amount_minor: 24500,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const other = await api(path('/crm/entries'), 'POST', {
    kind: 'lead',
    customer_id: customerId,
    title: 'Filtered lead fixture',
  });
  assert.equal(other.status, 201);
  const result = await api(
    path('/crm/entries?') +
      new URLSearchParams({ kind: 'opportunity', q: 'Filtered board', currency: 'KES', limit: '1' }),
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.total, 1);
  assert.equal(result.data.data[0].id, created.data.id);
  assert.equal(result.data.has_more, false);
  assert.deepEqual(result.data.stages, [
    { stage: 'new', count: 1, totals: { KES: 24500 } },
  ]);
  const mismatch = await api(path('/crm/entries?kind=opportunity&q=Filtered%20lead'));
  assert.equal(mismatch.data.total, 0);
});

test('CRM priority is bounded, persists and retains legacy replay behavior', async () => {
  const body = { kind: 'opportunity', customer_id: customerId, title: 'Priority fixture' },
    key = randomUUID();
  const created = await api(path('/crm/entries'), 'POST', body, cookie, key);
  assert.equal(created.status, 201);
  assert.equal(created.data.priority, 0);
  assert.deepEqual((await api(path('/crm/entries'), 'POST', body, cookie, key)).data, created.data);
  const { id, version, created_at, updated_at, ...entry } = created.data;
  const changed = await api(path('/crm/entries/' + id), 'PATCH', {
    expected_version: version,
    entry: { ...entry, priority: 3 },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.priority, 3);
  assert.equal(
    (
      await api(path('/crm/entries/' + id), 'PATCH', {
        expected_version: 2,
        entry: { ...entry, priority: 4 },
      })
    ).status,
    400,
  );
});

test('CRM quotation links require the same canonical customer', async () => {
  const opportunity = await api(path('/crm/entries'), 'POST', {
    kind: 'opportunity',
    customer_id: customerId,
    title: 'Quotation link fixture',
  });
  assert.equal(opportunity.status, 201);
  const quote = await api(path('/sales/quotations'), 'POST', document(1));
  assert.equal(quote.status, 201);
  const { id, version, created_at, updated_at, ...entry } = opportunity.data;
  const linked = await api(path('/crm/entries/' + id), 'PATCH', {
    expected_version: version,
    entry: { ...entry, quotation_id: quote.data.id },
  });
  assert.equal(linked.status, 200);
  assert.equal(linked.data.quotation_id, quote.data.id);
  const other = await api(path('/records/customers'), 'POST', {
    name: 'Synthetic unrelated quotation customer',
  });
  assert.equal(other.status, 201);
  const otherOpportunity = await api(path('/crm/entries'), 'POST', {
    kind: 'opportunity',
    customer_id: other.data.id,
    title: 'Different customer fixture',
  });
  const {
    id: otherId,
    version: otherVersion,
    created_at: otherCreated,
    updated_at: otherUpdated,
    ...otherEntry
  } = otherOpportunity.data;
  assert.equal(
    (
      await api(path('/crm/entries/' + otherId), 'PATCH', {
        expected_version: otherVersion,
        entry: { ...otherEntry, quotation_id: quote.data.id },
      })
    ).status,
    400,
  );
});

test('lead conversion links an explicitly selected canonical customer in the same workspace', async () => {
  const other = await api(path('/records/customers'), 'POST', {
    name: 'Synthetic conversion customer',
  });
  assert.equal(other.status, 201);
  const lead = await api(path('/crm/entries'), 'POST', {
    kind: 'lead',
    customer_id: customerId,
    title: 'Customer reassignment fixture',
  });
  assert.equal(lead.status, 201);
  assert.equal(
    (
      await api(path('/crm/entries/' + lead.data.id + '/convert'), 'POST', {
        expected_version: 1,
        customer_id: randomUUID(),
      })
    ).status,
    404,
  );
  const converted = await api(path('/crm/entries/' + lead.data.id + '/convert'), 'POST', {
    expected_version: 1,
    customer_id: other.data.id,
  });
  assert.equal(converted.status, 200, JSON.stringify(converted.data));
  assert.equal(converted.data.customer_id, other.data.id);
  const history = await api(path('/crm/entries/' + lead.data.id + '/history'));
  assert.equal(history.data.data[0].snapshot.customer_id, customerId);
});

test('lead conversion creates a customer atomically and blocks matching contact details', async () => {
  const lead = await api(path('/crm/entries'), 'POST', {
    kind: 'lead',
    customer_id: customerId,
    title: 'New customer conversion fixture',
  });
  assert.equal(lead.status, 201);
  const candidate = {
    name: 'Synthetic new conversion customer',
    type: 'business',
    email: randomUUID() + '@example.test',
    phone: '',
  };
  const before = Number(
    (
      await dbGet(
        "SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND environment='sandbox' AND kind='customers'",
        [org],
      )
    ).n,
  );
  assert.equal(
    (
      await api(path('/crm/entries/' + lead.data.id + '/convert'), 'POST', {
        expected_version: 1,
        new_customer: candidate,
        assigned_to: randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND environment='sandbox' AND kind='customers'",
          [org],
        )
      ).n,
    ),
    before,
  );
  const key = randomUUID(),
    body = { expected_version: 1, new_customer: candidate };
  const converted = await api(
    path('/crm/entries/' + lead.data.id + '/convert'),
    'POST',
    body,
    cookie,
    key,
  );
  assert.equal(converted.status, 200, JSON.stringify(converted.data));
  assert.notEqual(converted.data.customer_id, customerId);
  assert.deepEqual(
    (await api(path('/crm/entries/' + lead.data.id + '/convert'), 'POST', body, cookie, key)).data,
    converted.data,
  );
  const second = await api(path('/crm/entries'), 'POST', {
    kind: 'lead',
    customer_id: customerId,
    title: 'Duplicate conversion customer fixture',
  });
  assert.equal(
    (
      await api(path('/crm/entries/' + second.data.id + '/convert'), 'POST', {
        expected_version: 1,
        new_customer: candidate,
      })
    ).status,
    409,
  );
});

test('CRM lost reasons are administrator-managed and retained when legacy configuration clients omit them', async () => {
  const old = await api(path('/crm/configuration'));
  assert.equal(old.status, 200);
  const body = {
    expected_version: old.data.version,
    stages: old.data.stages,
    teams: old.data.teams,
    lost_reasons: ['Synthetic price', 'Synthetic timing'],
  };
  const saved = await api(path('/crm/configuration'), 'PUT', body);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(saved.data.lost_reasons, body.lost_reasons);
  assert.equal(
    (
      await api(path('/crm/configuration'), 'PUT', {
        ...body,
        expected_version: saved.data.version,
        lost_reasons: ['Same', 'same'],
      })
    ).status,
    400,
  );
  const legacy = await api(path('/crm/configuration'), 'PUT', {
    expected_version: saved.data.version,
    stages: body.stages,
    teams: body.teams,
  });
  assert.equal(legacy.status, 200);
  assert.deepEqual(legacy.data.lost_reasons, body.lost_reasons);
});

test('CRM activity reporting isolates assignment and retains completed follow-ups', async () => {
  const created = await api(path('/crm/entries'), 'POST', {
    kind: 'follow_up',
    customer_id: customerId,
    title: 'Activity report fixture',
    assigned_to: actor,
    due_at: '2020-01-01T00:00:00.000Z',
  });
  assert.equal(created.status, 201);
  const from = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const query = new URLSearchParams({ from, to: from, assignee: actor });
  const before = await api(path('/crm/activity-report?' + query));
  assert.equal(before.status, 200, JSON.stringify(before.data));
  assert.ok(before.data.by_assignee.some((r: any) => r.id === actor && r.overdue > 0));
  const { id, version, created_at, updated_at, ...entry } = created.data;
  assert.equal(
    (
      await api(path('/crm/entries/' + id), 'PATCH', {
        expected_version: version,
        entry: { ...entry, status: 'completed' },
      })
    ).status,
    200,
  );
  const after = await api(path('/crm/activity-report?' + query));
  assert.equal(after.status, 200);
  const prior = before.data.by_assignee.find((r: any) => r.id === actor),
    next = after.data.by_assignee.find((r: any) => r.id === actor);
  assert.equal(next.completed, prior.completed + 1);
  assert.equal(next.overdue, prior.overdue - 1);
  const outsider = await api('/api/auth/signup', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-activity-outsider-2026!',
  });
  assert.equal(
    (await api(path('/crm/activity-report?' + query), 'GET', undefined, outsider.cookie)).status,
    403,
  );
});

test('due follow-up reminders deduplicate and do not notify for completed activities', async () => {
  const item = await api(path('/crm/entries'), 'POST', {
    kind: 'follow_up',
    customer_id: customerId,
    title: 'Synthetic due reminder',
    assigned_to: actor,
    due_at: '2020-01-01T00:00:00.000Z',
  });
  assert.equal(item.status, 201);
  await processCrmDueReminders(a());
  await processCrmDueReminders(a());
  const events = await dbAll(
    "SELECT id FROM ac2_events WHERE org_id=? AND environment='sandbox' AND event_type='crm.followup_due' AND resource_id=?",
    [org, item.data.id],
  );
  assert.equal(events.length, 1);
  for (let i = 0; i < 5; i++) await processBusinessEvents(a());
  assert.equal(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=? AND user_id=? AND resource_id=? AND title='Follow-up overdue'",
          [org, actor, item.data.id],
        )
      ).n,
    ),
    1,
  );
  const {
    id: reassignedId,
    version: reassignedVersion,
    created_at: reassignedCreated,
    updated_at: reassignedUpdated,
    ...reassignedEntry
  } = item.data;
  assert.equal(
    (
      await api(path('/crm/entries/' + reassignedId), 'PATCH', {
        expected_version: reassignedVersion,
        entry: { ...reassignedEntry, assigned_to: approverId },
      })
    ).status,
    200,
  );
  await processCrmDueReminders(a());
  for (let i = 0; i < 5; i++) await processBusinessEvents(a());
  assert.equal(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=? AND user_id=? AND resource_id=? AND title='Follow-up overdue'",
          [org, approverId, item.data.id],
        )
      ).n,
    ),
    1,
  );
  const finished = await api(path('/crm/entries'), 'POST', {
    kind: 'follow_up',
    customer_id: customerId,
    title: 'Finished reminder fixture',
    assigned_to: actor,
    due_at: '2020-01-01T00:00:00.000Z',
    status: 'completed',
  });
  assert.equal(finished.status, 201);
  await processCrmDueReminders(a());
  assert.equal(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac2_events WHERE org_id=? AND event_type='crm.followup_due' AND resource_id=?",
          [org, finished.data.id],
        )
      ).n,
    ),
    0,
  );
  const stale = await api(path('/crm/entries'), 'POST', {
    kind: 'follow_up',
    customer_id: customerId,
    title: 'Stale reminder fixture',
    assigned_to: actor,
    due_at: '2020-01-01T00:00:00.000Z',
  });
  await processCrmDueReminders(a());
  const {
    id: staleId,
    version: staleVersion,
    created_at: staleCreated,
    updated_at: staleUpdated,
    ...staleEntry
  } = stale.data;
  await api(path('/crm/entries/' + staleId), 'PATCH', {
    expected_version: staleVersion,
    entry: { ...staleEntry, status: 'completed' },
  });
  for (let i = 0; i < 5; i++) await processBusinessEvents(a());
  assert.equal(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=? AND resource_id=? AND title='Follow-up overdue'",
          [org, staleId],
        )
      ).n,
    ),
    0,
  );
});

test('CRM expansion captures prospects, imports safely, reviews merges, executes plans once and reconciles currency forecasts', async () => {
  const prospect = await api(path('/crm/entries'), 'POST', {
    kind: 'lead', title: 'Synthetic customerless CRM prospect', contact_name: 'Casey Example',
    company: 'Northstar Office', email: 'casey.northstar@example.test', source: 'referral',
    source_ref: 'partner-2026-11', website: 'https://northstar.example.test',
    country: 'Kenya', business_need: 'Furniture for a new office', qualification_notes: 'Met at a trade event',
    assigned_to: actor, amount_minor: 425000, currency: 'KES', expected_close_on: '2030-06-15', tags: ['Office'],
  });
  assert.equal(prospect.status, 201, JSON.stringify(prospect.data));
  assert.equal(prospect.data.customer_id, null);
  const searchedProspect = await api(path('/crm/entries?kind=lead&q=casey.northstar%40example.test'));
  assert.equal(searchedProspect.data.data.some((r: any) => r.id === prospect.data.id), true);
  assert.deepEqual(searchedProspect.data.data.find((r: any) => r.id === prospect.data.id).contact_completeness, { complete: false, missing_fields: ['phone'] });
  const qualified = await api(path('/crm/entries/' + prospect.data.id + '/qualify'), 'POST', {
    expected_version: prospect.data.version, outcome: 'qualified', notes: 'Confirmed budget and timeline',
  });
  assert.equal(qualified.status, 200, JSON.stringify(qualified.data));
  assert.equal(qualified.data.kind, 'lead');
  assert.equal(qualified.data.stage, 'qualified');
  assert.equal(qualified.data.customer_id, null);

  const importRow = { title: 'Synthetic CSV prospect', contact_name: 'Jamie CSV', company: 'CSV Works', email: 'jamie.csv@example.test', source: 'imported', amount: '2500.00', currency: 'KES', expected_close_on: '2030-07-10', tags: 'CSV, Event' };
  const preview = await api(path('/crm/import/preview'), 'POST', { rows: [importRow] });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.valid_rows, 1);
  const importBody = { source_id: 'crm-expansion-' + randomUUID(), rows: [importRow] }, importKey = randomUUID();
  const imported = await api(path('/crm/import'), 'POST', importBody, cookie, importKey);
  assert.equal(imported.status, 200, JSON.stringify(imported.data));
  assert.equal(imported.data.entries[0].customer_id, null);
  assert.equal(imported.data.entries[0].amount_minor, 250000);
  assert.deepEqual((await api(path('/crm/import'), 'POST', importBody, cookie, randomUUID())).data, imported.data);

  const duplicate = await api(path('/crm/entries'), 'POST', {
    kind: 'lead', title: 'Synthetic possible duplicate prospect', contact_name: 'Casey E.', company: 'Northstar Office',
    email: ' CASEY.NORTHSTAR@example.test ', phone: '+254 700 123 456', source: 'campaign', assigned_to: actor,
  });
  assert.equal(duplicate.status, 201, JSON.stringify(duplicate.data));
  const suggestions = await api(path('/crm/duplicates?limit=100'));
  assert.equal(suggestions.status, 200);
  const pair = suggestions.data.data.find((m: any) => [m.left.id, m.right.id].includes(prospect.data.id) && [m.left.id, m.right.id].includes(duplicate.data.id));
  assert.ok(pair, 'deterministic duplicate should be suggested, never automatically merged');
  assert.ok(pair.reasons.includes('Same normalized email'));

  const followup = await api(path('/crm/entries'), 'POST', {
    kind: 'follow_up', customer_id: null, parent_entry_id: duplicate.data.id, title: 'Synthetic merge follow-up',
    assigned_to: actor, due_at: '2030-06-20T06:00:00.000Z', activity_type: 'call',
  });
  assert.equal(followup.status, 201, JSON.stringify(followup.data));
  const planBody = { name: 'Synthetic prospect follow-up plan', description: 'Short review sequence', source: 'lead', active: true, steps: [
    { id: randomUUID(), type: 'call', summary: 'Initial discovery call', instructions: 'Confirm needs', offset_days: 0, assignment: 'target_owner', assigned_to: null },
    { id: randomUUID(), type: 'meeting', summary: 'Schedule a product meeting', instructions: '', offset_days: 3, assignment: 'plan_owner', assigned_to: null },
  ] };
  const plan = await api(path('/crm/activity-plans'), 'POST', planBody);
  assert.equal(plan.status, 201, JSON.stringify(plan.data));
  assert.equal(plan.data.steps.length, 2);
  const executionKey = randomUUID(), applyBody = { plan_id: plan.data.id, expected_plan_version: plan.data.version, target_id: duplicate.data.id, plan_date: '2030-06-01', assigned_to: null, execution_key: executionKey };
  const applyKey = randomUUID(), applied = await api(path('/crm/activity-plans/apply'), 'POST', applyBody, cookie, applyKey);
  assert.equal(applied.status, 201, JSON.stringify(applied.data));
  assert.equal(applied.data.activities.length, 2);
  assert.equal(applied.data.activities[0].due_at, '2030-06-01T06:00:00.000Z');
  assert.equal(applied.data.activities[1].due_at, '2030-06-04T06:00:00.000Z');
  const replay = await api(path('/crm/activity-plans/apply'), 'POST', applyBody, cookie, applyKey);
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.data, applied.data);
  const activityRows = await dbAll(
    "SELECT data FROM ac_crm_entries WHERE org_id=? AND environment='sandbox' AND kind='follow_up'",
    [org],
  );
  const activityCount = activityRows.filter(
    (row) => JSON.parse(String(row.data)).parent_entry_id === duplicate.data.id,
  ).length;
  assert.equal(activityCount, 3);

  const mergeBody = { primary_id: prospect.data.id, records: [{ id: prospect.data.id, expected_version: qualified.data.version }, { id: duplicate.data.id, expected_version: duplicate.data.version }] }, mergeKey = randomUUID();
  const merged = await api(path('/crm/merge'), 'POST', mergeBody, cookie, mergeKey);
  assert.equal(merged.status, 200, JSON.stringify(merged.data));
  assert.deepEqual(merged.data.merged_ids, [duplicate.data.id]);
  assert.equal(merged.data.remapped_activity_ids.length, 3);
  const archive = await dbGet('SELECT status,merged_into FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?', [duplicate.data.id, org, 'sandbox']);
  assert.equal(archive.status, 'archived');
  assert.equal(archive.merged_into, prospect.data.id);
  const retainedActivity = await dbGet('SELECT data FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?', [followup.data.id, org, 'sandbox']);
  assert.equal(JSON.parse(retainedActivity.data).parent_entry_id, prospect.data.id);
  assert.equal((await api(path('/crm/entries/' + duplicate.data.id + '/history'))).status, 200);
  assert.deepEqual((await api(path('/crm/merge'), 'POST', mergeBody, cookie, mergeKey)).data, merged.data);

  const convertedLead = await api(path('/crm/entries'), 'POST', { kind: 'lead', title: 'Synthetic conversion without customer', contact_name: 'Taylor New', company: 'Taylor New Ltd', email: 'taylor.convert@example.test', phone: '+254700765432', source: 'website' });
  assert.equal(convertedLead.status, 201);
  const converted = await api(path('/crm/entries/' + convertedLead.data.id + '/convert'), 'POST', {
    expected_version: convertedLead.data.version,
    new_customer: { name: 'Taylor New Ltd', type: 'business', email: 'taylor.convert@example.test', phone: '+254700765432', address: '', notes: 'Created from CRM prospect' },
  });
  assert.equal(converted.status, 200, JSON.stringify(converted.data));
  assert.equal(converted.data.kind, 'opportunity');
  assert.ok(converted.data.customer_id);
  assert.equal(converted.data.email, 'taylor.convert@example.test');

  const forecastOpportunity = await api(path('/crm/entries'), 'POST', { kind: 'opportunity', customer_id: customerId, title: 'Synthetic June forecast opportunity', stage: 'proposal', amount_minor: 100000, currency: 'KES', probability_bps: 5000, expected_close_on: '2030-06-21' });
  const foreignOpportunity = await api(path('/crm/entries'), 'POST', { kind: 'opportunity', customer_id: customerId, title: 'Synthetic separate currency opportunity', stage: 'proposal', amount_minor: 99000000, currency: 'USD', probability_bps: 2500, expected_close_on: '2030-06-25' });
  assert.equal(forecastOpportunity.status, 201);
  assert.equal(foreignOpportunity.status, 201);
  const board = await api(path('/crm/forecast?currency=KES'));
  assert.equal(board.status, 200, JSON.stringify(board.data));
  const june = board.data.groups.find((g: any) => g.bucket === '2030-06' && g.currency === 'KES');
  assert.ok(june);
  assert.ok(june.open_amount_minor >= 100000);
  assert.ok(june.weighted_open_minor >= 50000);
  const byCurrency = await api(path('/crm/forecast/report?group_by=close_month'));
  assert.equal(byCurrency.status, 200, JSON.stringify(byCurrency.data));
  assert.equal(byCurrency.data.totals, null, 'unfiltered multi-currency totals must not be combined');
  assert.ok(byCurrency.data.totals_by_currency.some((t: any) => t.currency === 'KES'));
  assert.ok(byCurrency.data.totals_by_currency.some((t: any) => t.currency === 'USD'));
  assert.ok(byCurrency.data.groups.some((g: any) => g.bucket === '2030-06' && g.currency === 'USD'));
  const pivot = await api(path('/crm/forecast/pivot?row_by=stage&column_by=close_month&currency=KES'));
  assert.equal(pivot.status, 200, JSON.stringify(pivot.data));
  const pivotTotal = pivot.data.grand_totals.find((t: any) => t.currency === 'KES');
  assert.ok(pivotTotal);
  assert.equal(pivotTotal.opportunity_count, pivot.data.cells.reduce((sum: number, c: any) => sum + c.opportunity_count, 0));
  assert.equal(pivotTotal.open_amount_minor, pivot.data.cells.reduce((sum: number, c: any) => sum + c.open_amount_minor, 0));
  assert.equal((await api(path('/crm/forecast/pivot?row_by=stage&column_by=stage'))).status, 400);
});
