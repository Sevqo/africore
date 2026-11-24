import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('erp-accounting-ledger-2');
import { migrate, dbRun, dbGet, closeDb } from '../db';
import { createApp } from '../app';
import { processProviderResult } from '../platform/payments';
let server: any,
  base: string,
  org: string,
  cookie: string,
  reviewer: string,
  reviewerCookie: string,
  operationsCookie: string,
  postedPaymentId: string,
  postedPaymentReference: string,
  config: any,
  periodId: string,
  postedId: string;
const root = () => '/api/v1/organizations/' + org;
async function api(path: string, method = 'GET', body?: any, session = cookie, key = randomUUID()) {
  const r = await fetch(base + path, {
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
async function identity() {
  const r = await api(
    '/api/auth/signup',
    'POST',
    { email: randomUUID() + '@example.test', password: 'Synthetic-accounting-test-2026!' },
    '',
  );
  await api('/api/auth/verify', 'POST', { token: r.data.verification_token }, r.cookie);
  return {
    id: (await api('/api/auth/account', 'GET', undefined, r.cookie)).data.user.id,
    cookie: r.cookie,
  };
}
const account = (code: string) => config.accounts.find((a: any) => a.code === code).id;
const draft = (value = 100000, currency = 'KES', extra: any = {}) => ({
  expected_version: 0,
  journal_id: config.journals[0].id,
  entry_on: '2026-11-04',
  currency,
  description: 'Synthetic reviewed sale',
  lines: [
    { account_id: account('1100'), debit_minor: value, credit_minor: 0 },
    { account_id: account('4000'), debit_minor: 0, credit_minor: value },
  ],
  ...extra,
});
async function review(entry: any) {
  const r = await api(root() + '/accounting/entries/' + entry.id + '/review', 'POST', {
    approver: reviewer,
    expected_version: entry.version,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const decision = await api(
    root() + '/approvals/' + r.data.id + '/decide',
    'POST',
    { decision: 'approved', reason: 'Synthetic separate reviewer acceptance' },
    reviewerCookie,
  );
  assert.equal(decision.status, 200, JSON.stringify(decision.data));
  return r.data.id;
}
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  const owner = await identity();
  cookie = owner.cookie;
  const w = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Synthetic Accounting suite',
    display_name: 'Synthetic owner',
    services: [
      'accounting',
      'work',
      'invoicing',
      'payments',
      'expenses',
      'procurement',
      'customers',
      'products',
    ],
  });
  assert.equal(w.status, 201, JSON.stringify(w.data));
  org = w.data.id;
  const second = await identity();
  reviewer = second.id;
  reviewerCookie = second.cookie;
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'admin')", [
    org,
    reviewer,
  ]);
  const ops = await identity();
  operationsCookie = ops.cookie;
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'operations')", [
    org,
    ops.id,
  ]);
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDb();
});
test('accounting access requires current financial authority, independently of Work installation', async () => {
  assert.equal(
    (await api(root() + '/accounting/configuration', 'GET', undefined, operationsCookie)).status,
    403,
  );
  assert.equal((await api(root() + '/accounting/configuration')).data.settings, null);
  assert.equal(
    (
      await api(root() + '/accounting/setup', 'POST', {
        start_on: '2026-11-01',
        currency: 'KES',
        opening_policy: 'new_books_no_prior_balances',
      })
    ).status,
    400,
  );
  const s = await api(root() + '/accounting/setup', 'POST', {
    start_on: '2026-11-01',
    currency: 'KES',
    opening_policy: 'new_books_no_prior_balances',
    acknowledge_history_boundary: true,
  });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  config = s.data;
  assert.equal(config.accounts.length, 9);
  assert.equal(config.readiness.etims, 'not_connected_or_certified');
  assert.equal(
    (
      await api(root() + '/accounting/setup', 'POST', {
        start_on: '2026-10-01',
        currency: 'KES',
        opening_policy: 'new_books_no_prior_balances',
        acknowledge_history_boundary: true,
      })
    ).status,
    409,
  );
});
test('journals are configured with finance authority and stale versions cannot overwrite', async () => {
  const created = await api(root() + '/accounting/journals', 'POST', {
    expected_version: 0,
    code: 'BANK2',
    name: 'Synthetic bank journal',
    active: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.version, 1);
  const duplicate = await api(root() + '/accounting/journals', 'POST', {
    expected_version: 0,
    code: 'BANK2',
    name: 'Duplicate journal',
    active: true,
  });
  assert.equal(duplicate.status, 409);
  const stale = await api(root() + '/accounting/journals/' + created.data.id, 'PUT', {
    expected_version: 0,
    code: 'BANK2',
    name: 'Stale edit',
    active: true,
  });
  assert.equal(stale.status, 409);
  const denied = await api(
    root() + '/accounting/journals',
    'POST',
    { expected_version: 0, code: 'CASH2', name: 'Unauthorized journal', active: true },
    operationsCookie,
  );
  assert.equal(denied.status, 403);
  const updated = await api(root() + '/accounting/journals/' + created.data.id, 'PUT', {
    expected_version: 1,
    code: 'BANK2',
    name: 'Reviewed bank journal',
    active: true,
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.version, 2);
  const after = await api(root() + '/accounting/configuration');
  assert.equal(
    after.data.journals.find((j: any) => j.id === created.data.id).name,
    'Reviewed bank journal',
  );
});
test('fiscal periods cannot overlap and entries cannot post before the reviewed start boundary', async () => {
  const p = await api(root() + '/accounting/periods', 'POST', {
    name: 'November 2026',
    starts_on: '2026-11-01',
    ends_on: '2026-11-30',
  });
  assert.equal(p.status, 201);
  periodId = p.data.id;
  assert.equal(
    (
      await api(root() + '/accounting/periods', 'POST', {
        name: 'Overlap',
        starts_on: '2026-11-20',
        ends_on: '2026-12-20',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        root() + '/accounting/entries',
        'POST',
        draft(1000, 'KES', { entry_on: '2026-10-31' }),
      )
    ).status,
    409,
  );
  const other = await api(
    root() + '/accounting/entries',
    'POST',
    draft(1000, 'KES', {
      lines: [
        { account_id: randomUUID(), debit_minor: 1000, credit_minor: 0 },
        { account_id: account('4000'), debit_minor: 0, credit_minor: 1000 },
      ],
    }),
  );
  assert.equal(other.status, 400);
});
test('an unbalanced draft is never posted, including direct database posting attempts', async () => {
  const body = draft();
  body.lines[1].credit_minor = 99999;
  const r = await api(root() + '/accounting/entries', 'POST', body);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const approval = await review(r.data);
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + r.data.id + '/post', 'POST', {
        expected_version: 1,
        approval_id: approval,
      })
    ).status,
    409,
  );
  assert.equal(
    (await dbGet('SELECT consumed_at FROM ac_approval_bindings WHERE approval_id=?', [approval]))
      .consumed_at,
    null,
  );
  await assert.rejects(
    dbRun("UPDATE ac_accounting_entries SET status='posted' WHERE id=?", [r.data.id]),
  );
  assert.equal((await api(root() + '/accounting/entries/' + r.data.id)).data.status, 'draft');
});
test('posting consumes a separate exact-version approval; a replay does not add entries or usage', async () => {
  const r = await api(root() + '/accounting/entries', 'POST', draft());
  assert.equal(r.status, 201);
  postedId = r.data.id;
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + postedId + '/post', 'POST', {
        expected_version: 1,
        approval_id: randomUUID(),
      })
    ).status,
    403,
  );
  const approval = await review(r.data);
  assert.equal((await api(root() + '/accounting/entries/' + postedId)).data.status, 'draft');
  const key = randomUUID(),
    body = { expected_version: 1, approval_id: approval },
    posted = await api(
      root() + '/accounting/entries/' + postedId + '/post',
      'POST',
      body,
      cookie,
      key,
    );
  assert.equal(posted.status, 200, JSON.stringify(posted.data));
  assert.equal(posted.data.status, 'posted');
  const before = Number(
    (
      await dbGet(
        "SELECT COUNT(*) AS n FROM ac_usage_events WHERE org_id=? AND service_id='accounting'",
        [org],
      )
    ).n,
  );
  const again = await api(
    root() + '/accounting/entries/' + postedId + '/post',
    'POST',
    body,
    cookie,
    key,
  );
  assert.equal(again.status, 200);
  assert.equal(again.data.version, 2);
  assert.equal(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac_usage_events WHERE org_id=? AND service_id='accounting'",
          [org],
        )
      ).n,
    ),
    before,
  );
  assert.ok(
    (await dbGet('SELECT consumed_at FROM ac_approval_bindings WHERE approval_id=?', [approval]))
      .consumed_at,
  );
});
test('posted entries and their lines reject edits, deletes and appended lines at the database boundary', async () => {
  const e = (await api(root() + '/accounting/entries/' + postedId)).data;
  assert.equal(
    (
      await api(
        root() + '/accounting/entries/' + postedId,
        'PUT',
        draft(200000, 'KES', { expected_version: 2 }),
      )
    ).status,
    409,
  );
  await assert.rejects(
    dbRun('UPDATE ac_accounting_entries SET reference=? WHERE id=?', ['ILLEGAL', postedId]),
  );
  await assert.rejects(dbRun('DELETE FROM ac_accounting_entries WHERE id=?', [postedId]));
  await assert.rejects(
    dbRun('UPDATE ac_accounting_lines SET debit_minor=1 WHERE id=?', [e.lines[0].id]),
  );
  await assert.rejects(dbRun('DELETE FROM ac_accounting_lines WHERE id=?', [e.lines[0].id]));
  await assert.rejects(
    dbRun(
      'INSERT INTO ac_accounting_lines(id,org_id,environment,entry_id,account_id,debit_minor,credit_minor,data) VALUES (?,?,?,?,?,?,?,?)',
      [randomUUID(), org, 'sandbox', postedId, account('1100'), 1, 0, 'fixture'],
    ),
  );
  assert.equal((await api(root() + '/accounting/entries/' + postedId)).data.lines.length, 2);
});
test('period locks and edits invalidate posting without consuming the review', async () => {
  let e = (await api(root() + '/accounting/entries', 'POST', draft(25000))).data;
  const stale = await review(e);
  const edited = await api(
    root() + '/accounting/entries/' + e.id,
    'PUT',
    draft(26000, 'KES', { expected_version: 1 }),
  );
  assert.equal(edited.status, 200);
  e = edited.data;
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + e.id + '/post', 'POST', {
        expected_version: 2,
        approval_id: stale,
      })
    ).status,
    409,
  );
  const approval = await review(e);
  assert.equal(
    (
      await api(root() + '/accounting/periods/' + periodId + '/state', 'PUT', {
        expected_version: 1,
        status: 'locked',
        reason: 'Synthetic month close review',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + e.id + '/post', 'POST', {
        expected_version: 2,
        approval_id: approval,
      })
    ).status,
    409,
  );
  assert.equal(
    (await dbGet('SELECT consumed_at FROM ac_approval_bindings WHERE approval_id=?', [approval]))
      .consumed_at,
    null,
  );
  assert.equal(
    (
      await api(root() + '/accounting/periods/' + periodId + '/state', 'PUT', {
        expected_version: 2,
        status: 'open',
        reason: 'Synthetic correction review',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + e.id + '/post', 'POST', {
        expected_version: 2,
        approval_id: approval,
      })
    ).status,
    200,
  );
});
test('reports balance and retain currency separation; reversals append exact opposite posted lines', async () => {
  const usd = (await api(root() + '/accounting/entries', 'POST', draft(7000, 'USD'))).data;
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + usd.id + '/post', 'POST', {
        expected_version: 1,
        approval_id: await review(usd),
      })
    ).status,
    200,
  );
  const report = await api(
    root() + '/accounting/report?from=2026-11-01&to=2026-11-30&currency=KES',
  );
  assert.equal(report.status, 200);
  assert.equal(report.data.balanced, true);
  assert.equal(report.data.total_debit_minor, 126000);
  assert.equal(report.data.net_profit_minor, 126000);
  const ledgerFilter = await api(
    root() + '/accounting/report?from=2026-11-01&to=2026-11-30&currency=KES&search=1100',
  );
  assert.equal(ledgerFilter.status, 200, JSON.stringify(ledgerFilter.data));
  assert.ok(ledgerFilter.data.total > 0);
  assert.ok(ledgerFilter.data.general_ledger.every((line: any) => line.account_code === '1100'));
  const reversal = await api(root() + '/accounting/entries/' + postedId + '/reverse', 'POST', {
    entry_on: '2026-11-05',
    reason: 'Synthetic duplicate sale correction',
  });
  assert.equal(reversal.status, 201, JSON.stringify(reversal.data));
  assert.equal(reversal.data.status, 'draft');
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + postedId + '/reverse', 'POST', {
        entry_on: '2026-11-05',
        reason: 'Synthetic retry with another request key',
      })
    ).data.id,
    reversal.data.id,
  );
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + reversal.data.id + '/post', 'POST', {
        expected_version: 1,
        approval_id: await review(reversal.data),
      })
    ).status,
    200,
  );
  const after = (
    await api(root() + '/accounting/report?from=2026-11-01&to=2026-11-30&currency=KES')
  ).data;
  assert.equal(after.net_profit_minor, 26000);
  assert.equal(after.balanced, true);
  assert.equal(
    (await api(root() + '/accounting/report?from=2026-11-01&to=2026-11-30&currency=USD')).data
      .net_profit_minor,
    7000,
  );
  assert.equal((await api(root() + '/accounting/entries/' + postedId)).data.status, 'posted');
});
async function postSource(type: string, id: string) {
  const prepared = await api(root() + '/accounting/sources', 'POST', {
    source_type: type,
    source_id: id,
  });
  assert.equal(prepared.status, 201, JSON.stringify(prepared.data));
  const e = prepared.data;
  if (e.status === 'draft') {
    const result = await api(root() + '/accounting/entries/' + e.id + '/post', 'POST', {
      expected_version: e.version,
      approval_id: await review(e),
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  }
  return e;
}
test('canonical issued invoices, partial confirmed allocations and credits post exactly once without copying the invoice system', async () => {
  const contact = await api(root() + '/records/customers', 'POST', {
    name: 'Synthetic shared books customer',
  });
  assert.equal(contact.status, 201);
  const doc = {
    customer_id: contact.data.id,
    items: [{ description: 'Synthetic taxable service', quantity: 1, unit_price_minor: 100000 }],
    currency: 'KES',
    tax_bps: 1600,
    issue_date: '2026-11-04',
    due_date: '2026-11-30',
  };
  const invoice = await api(root() + '/records/invoices', 'POST', doc);
  assert.equal(invoice.status, 201);
  assert.equal(
    (
      await api(root() + '/accounting/sources', 'POST', {
        source_type: 'invoice',
        source_id: invoice.data.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (await api(root() + '/records/invoices/' + invoice.data.id, 'PATCH', { status: 'issued' }))
      .status,
    200,
  );
  const posted = await postSource('invoice', invoice.data.id);
  assert.equal(posted.data.source_snapshot.amount_minor, 116000);
  assert.equal(posted.lines.find((l: any) => l.account_id === account('2100')).credit_minor, 16000);
  assert.equal(
    (
      await api(root() + '/accounting/sources', 'POST', {
        source_type: 'invoice',
        source_id: invoice.data.id,
      })
    ).data.id,
    posted.id,
  );
  const request = await api(root() + '/payment-requests', 'POST', {
    document_id: invoice.data.id,
    amount_minor: 40000,
  });
  assert.equal(request.status, 201, JSON.stringify(request.data));
  postedPaymentReference = 'synthetic-books-' + randomUUID();
  await processProviderResult(request.data.id, {
    reference: postedPaymentReference,
    status: 'succeeded',
    amount_minor: 40000,
    currency: 'KES',
  });
  const allocation = await dbGet('SELECT id FROM ac_allocations WHERE org_id=? AND document_id=?', [
    org,
    invoice.data.id,
  ]);
  postedPaymentId = (await postSource('allocation', allocation.id)).id;
  const credited = await api(root() + '/invoices/' + invoice.data.id + '/credits', 'POST', {
    amount_minor: 10000,
    reason: 'Synthetic agreed service adjustment',
    issued_on: '2026-11-04',
  });
  assert.equal(credited.status, 201, JSON.stringify(credited.data));
  await postSource('credit_note', credited.data.id);
  const report = (
    await api(root() + '/accounting/report?from=2026-11-01&to=2026-11-30&currency=KES')
  ).data;
  assert.equal(report.balanced, true);
  const receivables = report.trial_balance.find((r: any) => r.code === '1100');
  assert.equal(receivables.net_debit_minor, 26000 + 66000);
  const canonical = (await api(root() + '/records/invoices/' + invoice.data.id)).data;
  assert.equal(canonical.outstanding_minor, 66000);
  assert.equal(canonical.paid_minor, 40000);
  assert.equal(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac_accounting_entries WHERE org_id=? AND source_type='invoice' AND source_id=?",
          [org, invoice.data.id],
        )
      ).n,
    ),
    1,
  );
});
test('historical invoices cannot be silently rebooked after the reviewed opening boundary', async () => {
  const c = await api(root() + '/records/customers', 'POST', {
    name: 'Synthetic historical customer',
  });
  const i = await api(root() + '/records/invoices', 'POST', {
    customer_id: c.data.id,
    items: [{ description: 'Historical source', quantity: 1, unit_price_minor: 1000 }],
    issue_date: '2026-10-20',
    due_date: '2026-10-30',
  });
  assert.equal(
    (await api(root() + '/records/invoices/' + i.data.id, 'PATCH', { status: 'issued' })).status,
    200,
  );
  assert.equal(
    (
      await api(root() + '/accounting/sources', 'POST', {
        source_type: 'invoice',
        source_id: i.data.id,
        posting_on: '2026-11-04',
        adjustment_reason: 'Attempt to bypass opening policy',
      })
    ).status,
    409,
  );
});
test('recorded expenses recognize a payable, not invented cash; a correction requires the original reversal', async () => {
  const original = await api(root() + '/expenses', 'POST', {
    description: 'Synthetic recognized cost',
    amount_minor: 20000,
    currency: 'KES',
    occurred_on: '2026-11-04',
  });
  assert.equal(original.status, 201);
  const expense = await postSource('expense', original.data.id);
  assert.equal(
    expense.lines.find((l: any) => l.account_id === account('2000')).credit_minor,
    20000,
  );
  assert.equal(
    expense.lines.some((l: any) => l.account_id === account('1000')),
    false,
  );
  const corrected = await api(root() + '/expenses', 'POST', {
    description: 'Synthetic corrected cost',
    amount_minor: 18000,
    currency: 'KES',
    occurred_on: '2026-11-04',
    supersedes_id: original.data.id,
  });
  assert.equal(corrected.status, 201, JSON.stringify(corrected.data));
  assert.equal(
    (
      await api(root() + '/accounting/sources', 'POST', {
        source_type: 'expense',
        source_id: corrected.data.id,
      })
    ).status,
    409,
  );
  const reverse = await api(root() + '/accounting/entries/' + expense.id + '/reverse', 'POST', {
    entry_on: '2026-11-04',
    reason: 'Reverse the superseded expense before replacement',
  });
  assert.equal(reverse.status, 201);
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + reverse.data.id + '/post', 'POST', {
        expected_version: 1,
        approval_id: await review(reverse.data),
      })
    ).status,
    200,
  );
  await postSource('expense', corrected.data.id);
  const r = (await api(root() + '/accounting/report?from=2026-11-01&to=2026-11-30&currency=KES'))
    .data;
  assert.equal(r.trial_balance.find((a: any) => a.code === '5000').net_debit_minor, 18000);
  assert.equal(r.balanced, true);
});
test('source selectors filter the canonical date, currency and supersession state before pagination', async () => {
  for (const type of ['invoice', 'credit_note', 'allocation', 'expense']) {
    const r = await api(root() + '/accounting/sources?source_type=' + type + '&currency=KES');
    assert.equal(r.status, 200, type + ': ' + JSON.stringify(r.data));
    assert.equal(r.data.data.length, 1, type);
    assert.equal(r.data.total, 1, type);
    assert.equal(r.data.data[0].entry_status, 'posted');
    assert.equal(r.data.has_more, false);
  }
  const items = await api(root() + '/accounting/items?account_id=' + account('1100'));
  assert.equal(items.status, 200, JSON.stringify(items.data));
  assert.ok(items.data.total >= 3);
  assert.ok(items.data.data.length > 1, 'Journal Items returns separate ledger lines');
  assert.ok(items.data.data.every((line: any) => line.account_code === '1100'));
  assert.ok(items.data.data.every((line: any) => Number.isInteger(line.debit_minor)));
  assert.ok(items.data.data.every((line: any) => line.journal_code && line.journal_name));
  assert.ok(items.data.data.every((line: any) => line.source_type && line.source_id));
  const matchingReference = items.data.data.find((line: any) => line.reference)?.reference;
  assert.ok(matchingReference);
  assert.ok(
    (
      await api(root() + '/accounting/items?search=' + encodeURIComponent(matchingReference))
    ).data.data.some((line: any) => line.reference === matchingReference),
  );
  const filteredItems = await api(
    root() +
      '/accounting/items?journal_id=' +
      config.journals[0].id +
      '&from=2026-11-01&to=2026-11-30&partner=not-a-partner',
  );
  assert.equal(filteredItems.status, 200, JSON.stringify(filteredItems.data));
  assert.equal(filteredItems.data.total, 0);
  const filteredEntries = await api(
    root() +
      '/accounting/entries?journal_id=' +
      config.journals[0].id +
      '&from=2026-11-01&to=2026-11-30',
  );
  assert.equal(filteredEntries.status, 200, JSON.stringify(filteredEntries.data));
  assert.ok(filteredEntries.data.total > 0);
  assert.ok(
    filteredEntries.data.data.every((row: any) => row.journal_id === config.journals[0].id),
  );
  const supplierPayments = await api(root() + '/accounting/sources?source_type=supplier_payment');
  assert.equal(supplierPayments.status, 200, JSON.stringify(supplierPayments.data));
  assert.equal(supplierPayments.data.source_type, 'supplier_payment');
  assert.equal(supplierPayments.data.total, 0);
  assert.equal(
    (await api(root() + '/accounting/sources?source_type=invoice&currency=USD')).data.data.length,
    0,
  );
  const invoiceReference = (await api(root() + '/accounting/sources?source_type=invoice')).data
    .data[0].id;
  const searchedInvoice = await api(
    root() +
      '/accounting/sources?source_type=invoice&search=' +
      encodeURIComponent(invoiceReference),
  );
  assert.equal(searchedInvoice.status, 200, JSON.stringify(searchedInvoice.data));
  assert.equal(searchedInvoice.data.total, 1);
  assert.equal(
    (await api(root() + '/accounting/sources?source_type=expense')).data.data[0].amount_minor,
    18000,
  );
  assert.equal(
    (
      await api(
        root() + '/accounting/sources?source_type=invoice',
        'GET',
        undefined,
        operationsCookie,
      )
    ).status,
    403,
  );
});
test('revoked reviewer authority prevents posting even with a previously approved binding', async () => {
  const e = (await api(root() + '/accounting/entries', 'POST', draft(1200))).data,
    approval = await review(e);
  await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?", [
    org,
    reviewer,
  ]);
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + e.id + '/post', 'POST', {
        expected_version: 1,
        approval_id: approval,
      })
    ).status,
    403,
  );
  assert.equal(
    (await dbGet('SELECT consumed_at FROM ac_approval_bindings WHERE approval_id=?', [approval]))
      .consumed_at,
    null,
  );
  await dbRun("UPDATE ac_memberships SET role='admin' WHERE org_id=? AND user_id=?", [
    org,
    reviewer,
  ]);
});
test('an explicit opening policy must be satisfied before ordinary entries are posted', async () => {
  const originalOrg = org,
    originalConfig = config;
  try {
    const w = await api('/api/auth/workspaces', 'POST', {
      kind: 'business',
      name: 'Synthetic opening books',
      display_name: 'Synthetic owner',
      services: ['accounting'],
    });
    assert.equal(w.status, 201);
    org = w.data.id;
    await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'admin')", [
      org,
      reviewer,
    ]);
    const setup = await api(root() + '/accounting/setup', 'POST', {
      start_on: '2026-11-01',
      currency: 'KES',
      opening_policy: 'reviewed_opening_entry_required',
      acknowledge_history_boundary: true,
    });
    assert.equal(setup.status, 200);
    config = setup.data;
    assert.equal(
      (
        await api(root() + '/accounting/periods', 'POST', {
          name: 'Opening month',
          starts_on: '2026-11-01',
          ends_on: '2026-11-30',
        })
      ).status,
      201,
    );
    const ordinary = (await api(root() + '/accounting/entries', 'POST', draft(3000))).data,
      approval = await review(ordinary);
    assert.equal(
      (
        await api(root() + '/accounting/entries/' + ordinary.id + '/post', 'POST', {
          expected_version: 1,
          approval_id: approval,
        })
      ).status,
      409,
    );
    const opening = await api(
      root() + '/accounting/entries',
      'POST',
      draft(50000, 'KES', {
        entry_on: '2026-11-01',
        opening_entry: true,
        description: 'Reviewed opening cash and equity',
        lines: [
          { account_id: account('1000'), debit_minor: 50000, credit_minor: 0 },
          { account_id: account('3000'), debit_minor: 0, credit_minor: 50000 },
        ],
      }),
    );
    assert.equal(opening.status, 201, JSON.stringify(opening.data));
    assert.equal(
      (
        await api(root() + '/accounting/entries/' + opening.data.id + '/post', 'POST', {
          expected_version: 1,
          approval_id: await review(opening.data),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(root() + '/accounting/entries/' + ordinary.id + '/post', 'POST', {
          expected_version: 1,
          approval_id: approval,
        })
      ).status,
      200,
    );
    assert.equal(
      (await api(root() + '/accounting/configuration')).data.settings.data.opening_entries.KES,
      opening.data.id,
    );
  } finally {
    org = originalOrg;
    config = originalConfig;
  }
});

test('private journal reviews encrypt bindings while authorized queues remain readable', async () => {
  const entry = await api(root() + '/accounting/entries', 'POST', draft(12345));
  assert.equal(entry.status, 201);
  const request = await api(root() + '/accounting/entries/' + entry.data.id + '/review', 'POST', {
    approver: reviewer,
    expected_version: entry.data.version,
  });
  assert.equal(request.status, 200);
  const stored = await dbGet(
    'SELECT parameters,review_summary FROM ac_approval_bindings WHERE approval_id=?',
    [request.data.id],
  );
  assert.ok(stored.parameters.startsWith('v2.'));
  assert.ok(stored.review_summary.startsWith('v2.'));
  assert.ok(!stored.review_summary.includes('Synthetic reviewed sale'));
  const queue = await api(root() + '/business/approvals', 'GET', undefined, reviewerCookie);
  assert.equal(queue.status, 200);
  const row = queue.data.data.find((r: any) => r.id === request.data.id);
  assert.ok(row);
  assert.equal(row.can_decide, true);
  assert.equal(JSON.parse(row.parameters).journal_posting.entry_version, 1);
  assert.equal(JSON.parse(row.review_summary).journal_lines.length, 2);
  const denied = await api(
    root() + '/approvals/' + request.data.id + '/decide',
    'POST',
    { decision: 'approved', reason: 'Synthetic unauthorized operational decision' },
    operationsCookie,
  );
  assert.equal(denied.status, 403);
  await dbRun("UPDATE ac_memberships SET role='operations' WHERE org_id=? AND user_id=?", [
    org,
    reviewer,
  ]);
  try {
    const revoked = await api(root() + '/business/approvals', 'GET', undefined, reviewerCookie);
    assert.equal(revoked.status, 200);
    assert.ok(!revoked.data.data.some((r: any) => r.id === request.data.id));
  } finally {
    await dbRun("UPDATE ac_memberships SET role='admin' WHERE org_id=? AND user_id=?", [
      org,
      reviewer,
    ]);
  }
});
test('configured tax codes prepare exact integer manual adjustments and changed codes cannot post stale drafts', async () => {
  const value = {
    expected_version: 0,
    code: 'SYN-TAX',
    name: 'Synthetic configured tax',
    rate_bps: 1600,
    purpose: 'sales',
    account_id: account('2100'),
  };
  assert.equal(
    (await api(root() + '/accounting/tax-codes', 'POST', value, operationsCookie)).status,
    403,
  );
  const code = await api(root() + '/accounting/tax-codes', 'POST', value);
  assert.equal(code.status, 201, JSON.stringify(code.data));
  assert.equal((await api(root() + '/accounting/tax-codes', 'POST', value)).status, 409);
  const input = {
      tax_code_id: code.data.id,
      expected_tax_version: code.data.version,
      entry_on: '2026-11-04',
      currency: 'KES',
      base_minor: 10003,
      base_account_id: account('4000'),
      counter_account_id: account('1100'),
      reason: 'Synthetic separate manual tax adjustment',
      acknowledge_separate_manual_adjustment: true,
    },
    preview = await api(root() + '/accounting/tax-preview', 'POST', input);
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.tax_minor, 1600);
  assert.equal(preview.data.total_minor, 11603);
  const e = await api(root() + '/accounting/tax-entries', 'POST', input);
  assert.equal(e.status, 201, JSON.stringify(e.data));
  assert.equal(e.data.source_type, 'configured_tax_entry');
  const approval = await review(e.data),
    changed = await api(root() + '/accounting/tax-codes/' + code.data.id, 'PUT', {
      ...value,
      expected_version: code.data.version,
      rate_bps: 1500,
    });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(
    (
      await api(root() + '/accounting/entries/' + e.data.id + '/post', 'POST', {
        expected_version: e.data.version,
        approval_id: approval,
      })
    ).status,
    409,
  );
  assert.equal(
    (await dbGet('SELECT consumed_at FROM ac_approval_bindings WHERE approval_id=?', [approval]))
      .consumed_at,
    null,
  );
  const currentInput = { ...input, expected_tax_version: changed.data.version },
    fresh = await api(root() + '/accounting/tax-entries', 'POST', currentInput);
  assert.equal(fresh.status, 201, JSON.stringify(fresh.data));
  const halfMinor = await api(root() + '/accounting/tax-preview', 'POST', {
    ...currentInput,
    base_minor: 10,
  });
  assert.equal(halfMinor.status, 200, JSON.stringify(halfMinor.data));
  assert.equal(halfMinor.data.tax_minor, 2);
  assert.equal(halfMinor.data.total_minor, 12);
  const gain = await api(root() + '/accounting/accounts', 'POST', {
    expected_version: 0,
    code: '4098',
    name: 'Cash rounding gain',
    type: 'revenue',
  });
  assert.equal(gain.status, 201, JSON.stringify(gain.data));
  const round = {
    ...currentInput,
    base_minor: 100,
    cash_rounding: {
      strategy: 'add_invoice_line',
      method: 'HALF-UP',
      increment_minor: 10,
      profit_account_id: gain.data.id,
      loss_account_id: account('5000'),
    },
  };
  const roundingPreview = await api(root() + '/accounting/tax-preview', 'POST', round);
  assert.equal(roundingPreview.status, 200, JSON.stringify(roundingPreview.data));
  assert.equal(roundingPreview.data.total_minor, 120);
  assert.equal(roundingPreview.data.tax_minor, 15);
  assert.equal(
    roundingPreview.data.lines.find((l: any) => l.account_id === gain.data.id).credit_minor,
    5,
  );
  const lowered = await api(root() + '/accounting/tax-preview', 'POST', {
    ...round,
    cash_rounding: { ...round.cash_rounding, method: 'DOWN' },
  });
  assert.equal(
    lowered.data.lines.find((l: any) => l.account_id === account('5000')).debit_minor,
    5,
  );
  const taxRound = {
    ...round,
    cash_rounding: { strategy: 'biggest_tax', method: 'UP', increment_minor: 10 },
  };
  const taxPreview = await api(root() + '/accounting/tax-preview', 'POST', taxRound);
  assert.equal(taxPreview.status, 200, JSON.stringify(taxPreview.data));
  assert.equal(taxPreview.data.tax_minor, 20);
  assert.equal(
    (await api(root() + '/accounting/tax-preview', 'POST', taxRound, operationsCookie)).status,
    403,
  );
  assert.equal(
    (
      await api(root() + '/accounting/tax-preview', 'POST', {
        ...round,
        cash_rounding: { ...round.cash_rounding, profit_account_id: randomUUID() },
      })
    ).status,
    400,
  );
  const roundKey = randomUUID();
  const roundedDraft = await api(
    root() + '/accounting/tax-entries',
    'POST',
    taxRound,
    cookie,
    roundKey,
  );
  assert.equal(roundedDraft.status, 201, JSON.stringify(roundedDraft.data));
  const replay = await api(root() + '/accounting/tax-entries', 'POST', taxRound, cookie, roundKey);
  assert.equal(replay.data.id, roundedDraft.data.id);
  const roundedPost = await api(
    root() + '/accounting/entries/' + roundedDraft.data.id + '/post',
    'POST',
    {
      expected_version: roundedDraft.data.version,
      approval_id: await review(roundedDraft.data),
    },
  );
  assert.equal(roundedPost.status, 200, JSON.stringify(roundedPost.data));
  assert.equal(roundedPost.data.data.source_snapshot.facts.cash_rounding.difference_minor, 5);
  const freshApproval = await review(fresh.data),
    posted = await api(root() + '/accounting/entries/' + fresh.data.id + '/post', 'POST', {
      expected_version: fresh.data.version,
      approval_id: freshApproval,
    });
  assert.equal(posted.status, 200, JSON.stringify(posted.data));
  assert.equal(posted.data.data.source_snapshot.facts.tax_code.rate_bps, 1500);
  const archived = await api(root() + '/accounting/tax-codes/' + code.data.id, 'PUT', {
    ...value,
    expected_version: changed.data.version,
    rate_bps: 1500,
    active: false,
  });
  assert.equal(archived.status, 200);
  assert.equal(
    (await api(root() + '/accounting/entries/' + fresh.data.id)).data.data.source_snapshot.facts
      .tax_code.rate_bps,
    1500,
  );
  assert.equal(
    (
      await api(root() + '/accounting/tax-preview', 'POST', {
        ...currentInput,
        expected_tax_version: archived.data.version,
      })
    ).status,
    409,
  );
});
test('bank statement review matches posted bank items and reverses links without changing the books', async () => {
  const bankRoot = root() + '/accounting';
  const journal = await api(bankRoot + '/journals', 'POST', {
    expected_version: 0,
    code: 'BANKQA',
    name: 'Synthetic bank journal',
  });
  assert.equal(journal.status, 201, JSON.stringify(journal.data));
  const profile = await api(bankRoot + '/bank-journals', 'POST', {
    journal_id: journal.data.id,
    account_id: account('1000'),
    currency: 'KES',
  });
  assert.equal(profile.status, 201, JSON.stringify(profile.data));

  async function post(amount: number, currency = 'KES') {
    const entry = await api(
      bankRoot + '/entries',
      'POST',
      draft(amount, currency, {
        journal_id: journal.data.id,
        lines: [
          { account_id: account('1000'), debit_minor: amount, credit_minor: 0 },
          { account_id: account('4000'), debit_minor: 0, credit_minor: amount },
        ],
      }),
    );
    assert.equal(entry.status, 201, JSON.stringify(entry.data));
    const result = await api(bankRoot + '/entries/' + entry.data.id + '/post', 'POST', {
      expected_version: entry.data.version,
      approval_id: await review(entry.data),
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  }
  const correct = await post(10000),
    incorrect = await post(9000),
    otherCurrency = await post(10000, 'USD');
  const postedPayment = (await api(bankRoot + '/entries/' + postedPaymentId)).data;
  const reviewerName = 'Synthetic separate review';
  const csv =
    'date,reference,description,amount,currency\n' +
    '2026-11-04,' +
    correct.reference +
    ',"Synthetic incoming, booked",100.00,KES\n' +
    '2026-11-05,OUT-UNMATCHED,Unmatched debit,-25.00,KES\n' +
    postedPayment.entry_on +
    ',' +
    postedPaymentReference +
    ',Confirmed allocation,400.00,KES\n';
  const statementInput = {
    bank_journal_id: profile.data.id,
    name: 'Synthetic November statement',
    opening_minor: 1000,
    closing_minor: 48500,
    csv,
  };
  const importPath = bankRoot + '/bank-statements';
  assert.equal(
    (await api(importPath, 'POST', { ...statementInput, closing_minor: 8000 })).status,
    400,
  );
  assert.equal(
    (await api(importPath, 'POST', { ...statementInput, csv: csv.replace('KES', 'USD') })).status,
    400,
  );
  const importKey = randomUUID();
  const imported = await api(importPath, 'POST', statementInput, cookie, importKey);
  assert.equal(imported.status, 201, JSON.stringify(imported.data));
  assert.equal(
    (await api(importPath, 'POST', statementInput, cookie, importKey)).data.id,
    imported.data.id,
  );
  assert.equal((await api(importPath, 'POST', statementInput)).data.id, imported.data.id);
  assert.equal(
    (
      await api(importPath, 'POST', {
        ...statementInput,
        csv: csv.replace('Unmatched debit', 'Edited memo'),
      })
    ).status,
    409,
  );
  assert.equal((await api(importPath, 'GET', undefined, operationsCookie)).status, 403);
  assert.equal((await api(importPath + '?bank_journal_id=' + profile.data.id)).data.data.length, 1);
  const detailsPath = importPath + '/' + imported.data.id;
  const details = (await api(detailsPath)).data;
  assert.deepEqual(details.counts, { unmatched: 3, partial: 0, reconciled: 0 });
  assert.equal(details.outstanding_out_minor, 2500);
  const incoming = details.lines[0];
  const payment = (await api(bankRoot + '/bank-lines/' + details.lines[2].id)).data.candidates.find(
    (row: any) => row.entry_id === postedPaymentId,
  );
  assert.equal(payment.source_type, 'allocation');
  assert.equal(payment.provider_reference, postedPaymentReference);
  const linePath = bankRoot + '/bank-lines/' + incoming.id;
  const candidates = (await api(linePath)).data.candidates;
  assert.equal(candidates[0].entry_id, correct.id);
  assert.equal(candidates[0].score, 100);
  assert.equal(
    candidates.some((row: any) => row.entry_id === otherCurrency.id),
    false,
  );
  const wrongId = candidates.find((row: any) => row.entry_id === incorrect.id).id;
  const correctId = candidates[0].id;
  const propose = (candidate_id: string, amount_minor: number) =>
    api(linePath + '/matches', 'POST', {
      candidate_id,
      amount_minor,
      reason: 'Review bank evidence',
    });
  const decide = (match: any, action: string, session = cookie) =>
    api(
      bankRoot + '/bank-matches/' + match.id + '/decision',
      'POST',
      { action, expected_version: match.version, reason: reviewerName },
      session,
    );
  const wrong = await propose(wrongId, 9000);
  assert.equal(wrong.status, 201, JSON.stringify(wrong.data));
  assert.equal((await decide(wrong.data, 'approve')).status, 403);
  assert.equal((await decide(wrong.data, 'apply')).status, 409);
  assert.equal((await decide(wrong.data, 'reject', reviewerCookie)).data.status, 'rejected');
  assert.equal(
    (await api(linePath)).data.candidates.some((row: any) => row.id === wrongId),
    false,
  );

  const partial = await propose(correctId, 4000);
  const approval = await decide(partial.data, 'approve', reviewerCookie);
  assert.equal(approval.status, 200, JSON.stringify(approval.data));
  assert.equal((await decide(approval.data, 'apply')).data.status, 'applied');
  const remaining = (await api(linePath)).data;
  assert.equal(remaining.line.status, 'partial');
  assert.equal(remaining.candidates[0].available_minor, 6000);
  assert.equal((await propose(correctId, 6001)).status, 409);
  const finalMatch = await propose(correctId, 6000);
  const finalApproval = await decide(finalMatch.data, 'approve', reviewerCookie);
  const applied = await decide(finalApproval.data, 'apply');
  assert.equal(applied.data.status, 'applied');
  const reconciled = (await api(detailsPath + '?status=unmatched&search=debit')).data;
  assert.equal(reconciled.lines.length, 1);
  assert.equal(reconciled.counts.reconciled, 1);
  assert.equal(reconciled.outstanding_in_minor, 40000);
  const outstanding = (await api(bankRoot + '/bank-journals/' + profile.data.id + '/unmatched'))
    .data;
  assert.equal(outstanding.currency, 'KES');
  assert.deepEqual(
    outstanding.data.map((row: any) => row.id).sort(),
    [details.lines[1].id, details.lines[2].id].sort(),
  );
  assert.equal(
    (
      await api(bankRoot + '/entries/' + correct.id + '/reverse', 'POST', {
        entry_on: '2026-11-05',
        reason: 'Synthetic journal reversal',
      })
    ).status,
    409,
  );
  const reversal = await decide(applied.data, 'request_reversal');
  assert.equal((await decide(reversal.data, 'apply')).status, 409);
  const reverseApproval = await decide(reversal.data, 'approve', reviewerCookie);
  assert.equal((await decide(reverseApproval.data, 'apply')).data.status, 'reversed');
  const reopened = (await api(linePath)).data;
  assert.equal(reopened.line.status, 'partial');
  assert.equal(reopened.line.data.matched_minor, 4000);
  assert.ok(reopened.history.some((row: any) => row.action === 'apply_reversal'));
  const unchanged = (await api(bankRoot + '/entries/' + correct.id)).data;
  assert.equal(unchanged.version, correct.version);
  assert.deepEqual(unchanged.lines, correct.lines);

  const other = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Synthetic second books',
    display_name: 'Synthetic owner',
    services: ['accounting'],
  });
  assert.equal(other.status, 201, JSON.stringify(other.data));
  const otherBank = '/api/v1/organizations/' + other.data.id + '/accounting';
  assert.equal((await api(otherBank + '/bank-statements/' + imported.data.id)).status, 404);
  assert.equal((await api(otherBank + '/bank-lines/' + incoming.id)).status, 404);

  const second = await api(importPath, 'POST', {
    ...statementInput,
    name: 'Synthetic competing statement',
    opening_minor: 48500,
    closing_minor: 54500,
    csv: 'date,reference,description,amount,currency\n2026-11-07,COMPETING,Separate bank row,60.00,KES\n',
  });
  assert.equal(second.status, 201, JSON.stringify(second.data));
  const secondLine = (await api(importPath + '/' + second.data.id)).data.lines[0];
  const requests = await Promise.all([
    propose(correctId, 6000),
    api(bankRoot + '/bank-lines/' + secondLine.id + '/matches', 'POST', {
      candidate_id: correctId,
      amount_minor: 6000,
      reason: 'Competing capacity request',
    }),
  ]);
  assert.deepEqual(
    requests.map((row) => row.status),
    [201, 201],
  );
  const approvals = await Promise.all(
    requests.map((row) => decide(row.data, 'approve', reviewerCookie)),
  );
  assert.deepEqual(
    approvals.map((row) => row.status),
    [200, 200],
  );
  const raced = await Promise.all(approvals.map((row) => decide(row.data, 'apply')));
  assert.deepEqual(raced.map((row) => row.status).sort(), [200, 409]);
});

test('fixed asset board uses posted acquisition evidence and the native journal review, lock and reversal controls', async () => {
  const base = root() + '/accounting';
  const makeAccount = async (code: string, name: string, type: string) => {
    const result = await api(base + '/accounts', 'POST', { expected_version: 0, code, name, type });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.id;
  };
  const bankAccounts = {
    asset_account_id: await makeAccount('1510', 'Laptop cost', 'asset'),
    accumulated_account_id: await makeAccount('1519', 'Laptop accumulated depreciation', 'asset'),
    expense_account_id: await makeAccount('5510', 'Laptop depreciation expense', 'expense'),
    journal_id: config.journals[0].id,
  };
  const plan = {
    method: 'straight_line',
    frequency: 'monthly',
    periods: 4,
    rate_bps: 0,
    prorata: false,
  };
  const model = await api(base + '/asset-models', 'POST', {
    expected_version: 0,
    name: 'Synthetic IT equipment',
    accounts: bankAccounts,
    terms: plan,
  });
  assert.equal(model.status, 201, JSON.stringify(model.data));
  assert.equal((await api(base + '/asset-models')).data.data.length, 1);
  const acquisition = await api(
    base + '/entries',
    'POST',
    draft(120000, 'KES', {
      lines: [
        { account_id: bankAccounts.asset_account_id, debit_minor: 120000, credit_minor: 0 },
        { account_id: account('1000'), debit_minor: 0, credit_minor: 120000 },
      ],
    }),
  );
  assert.equal(acquisition.status, 201, JSON.stringify(acquisition.data));
  const post = async (entry: any, approval_id?: string) =>
    api(base + '/entries/' + entry.id + '/post', 'POST', {
      expected_version: entry.version,
      approval_id: approval_id || (await review(entry)),
    });
  assert.equal((await post(acquisition.data)).status, 200);
  const eligible = await api(
    base + '/asset-sources?currency=KES&account=' + bankAccounts.asset_account_id,
  );
  assert.equal(eligible.data.data[0].id, acquisition.data.id);
  const input = {
    expected_version: 0,
    name: 'Synthetic laptop',
    model_id: model.data.id,
    accounts: bankAccounts,
    terms: plan,
    acquisition_entry_id: acquisition.data.id,
    acquisition_on: '2026-11-04',
    start_on: '2026-11-04',
    currency: 'KES',
    gross_minor: 120000,
    salvage_minor: 20000,
    prior_minor: 0,
  };
  assert.equal((await api(base + '/assets', 'POST', { ...input, prior_minor: 5000 })).status, 409);
  assert.equal((await api(base + '/assets', 'POST', { ...input, currency: 'USD' })).status, 409);
  const created = await api(base + '/assets', 'POST', input);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal((await api(base + '/assets', 'POST', input)).status, 409);
  const path = base + '/assets/' + created.data.id;
  assert.equal((await api(path, 'GET', undefined, operationsCookie)).status, 403);
  const act = (asset: any, action: string, body: object = {}) =>
    api(path + '/action', 'POST', { action, expected_version: asset.version, ...body });
  assert.equal((await act(created.data, 'confirm')).status, 409);
  const computed = await act(created.data, 'compute');
  assert.equal(computed.status, 200, JSON.stringify(computed.data));
  const computedBoard = (await api(path)).data;
  assert.equal(
    computedBoard.rows.reduce((n: number, row: any) => n + row.amount_minor, 0),
    100000,
  );
  assert.equal(computedBoard.rows[0].posting, 'proposed');
  assert.equal(computedBoard.book_minor, 120000);
  const running = await act(computed.data, 'confirm');
  const period = { date: '2026-11-30' };
  assert.equal((await act(computed.data, 'prepare', period)).status, 409);
  const first = await act(running.data, 'prepare', period);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(
    first.data.lines.find((line: any) => line.account_id === bankAccounts.expense_account_id)
      .debit_minor,
    25000,
  );
  assert.equal(
    first.data.lines.find((line: any) => line.account_id === bankAccounts.accumulated_account_id)
      .credit_minor,
    25000,
  );
  const approval = await review(first.data);
  assert.equal((await api(path)).data.rows[0].posting, 'approved');
  assert.equal((await post(first.data, approval)).status, 200);
  assert.equal((await post(first.data, approval)).status, 409);
  const after = (await api(path)).data;
  assert.equal(after.book_minor, 95000);
  const report = (await api(base + '/report?from=2026-11-01&to=2026-11-30&currency=KES')).data;
  assert.equal(report.balanced, true);
  assert.equal(report.trial_balance.find((row: any) => row.code === '5510').net_debit_minor, 25000);
  assert.equal(
    report.trial_balance.find((row: any) => row.code === '1519').net_debit_minor,
    -25000,
  );
  const dec = await api(base + '/periods', 'POST', {
    name: 'Synthetic asset December',
    starts_on: '2026-12-01',
    ends_on: '2026-12-31',
  });
  assert.equal(dec.status, 201, JSON.stringify(dec.data));
  const second = await act(after.asset, 'prepare', { date: '2026-12-31' });
  assert.equal(second.status, 200, JSON.stringify(second.data));
  const decApproval = await review(second.data);
  const lock = (status: string, expected_version: number) =>
    api(base + '/periods/' + dec.data.id + '/state', 'PUT', {
      status,
      expected_version,
      reason: 'Synthetic asset period lock',
    });
  assert.equal((await lock('locked', dec.data.version)).status, 200);
  assert.equal((await post(second.data, decApproval)).status, 409);
  assert.equal((await lock('open', dec.data.version + 1)).status, 200);
  const withdrawn = await act((await api(path)).data.asset, 'withdraw', { date: '2026-12-31' });
  assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.data));
  assert.equal((await post(second.data, decApproval)).status, 409);
  const revised = await act(withdrawn.data, 'revise', {
    reason: 'Synthetic revised remaining life',
    terms: { ...plan, periods: 2 },
  });
  assert.equal(revised.status, 200, JSON.stringify(revised.data));
  const revisedBoard = (await api(path)).data;
  assert.deepEqual(
    revisedBoard.rows.map((row: any) => row.amount_minor),
    [25000, 37500, 37500],
  );
  assert.equal(revisedBoard.rows[0].journal_entry_id, first.data.id);
  assert.equal(revisedBoard.rows[0].posting, 'posted');
  const reversal = await api(base + '/entries/' + first.data.id + '/reverse', 'POST', {
    entry_on: '2026-12-01',
    reason: 'Synthetic depreciation correction',
  });
  assert.equal(reversal.status, 201, JSON.stringify(reversal.data));
  assert.equal((await post(reversal.data)).status, 200);
  const reversed = (await api(path)).data;
  assert.equal(reversed.book_minor, 120000);
  assert.equal(reversed.rows[0].posting, 'reversed');
  assert.ok(reversed.history.some((event: any) => event.action === 'board_revised'));
  assert.ok(reversed.history.some((event: any) => event.action === 'depreciation_posted'));
  assert.ok(reversed.history.some((event: any) => event.action === 'depreciation_reversed'));
  assert.equal(
    (
      await api(base + '/entries/' + acquisition.data.id + '/reverse', 'POST', {
        entry_on: '2026-12-01',
        reason: 'Synthetic blocked acquisition reversal',
      })
    ).status,
    409,
  );
});

test('Accounting deactivation retains posted history while new draft and configuration writes stop', async () => {
  assert.equal(
    (await api(root() + '/services/accounting/deactivate', 'POST', { confirm: true })).status,
    200,
  );
  try {
    const cfg = await api(root() + '/accounting/configuration');
    assert.equal(cfg.status, 200);
    assert.equal(cfg.data.writable, false);
    const posted = await api(root() + '/accounting/entries/' + postedId);
    assert.equal(posted.status, 200);
    assert.equal(posted.data.status, 'posted');
    assert.equal((await api(root() + '/accounting/entries', 'POST', draft())).status, 402);
  } finally {
    assert.equal((await api(root() + '/services/accounting/activate', 'POST', {})).status, 200);
  }
});
