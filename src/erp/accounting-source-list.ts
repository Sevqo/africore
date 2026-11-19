import { purchaseList } from './procurement';
import { z } from 'zod';
import { dbAll, dbGet, isPostgres } from '../db/adapter';
import type { Access } from '../platform/auth';
import { currencySchema } from '../platform/domain';
import { requireServices } from '../marketplace/engine';
import { accountingAccess, accountingSettings } from './accounting';
export const sourceListQuery = z
  .object({
    source_type: z
      .enum([
        'invoice',
        'credit_note',
        'allocation',
        'cash_receipt',
        'cash_return',
        'expense',
        'supplier_bill',
        'supplier_payment',
        'supplier_credit',
      ])
      .default('invoice'),
    currency: currencySchema.optional(),
    search: z.string().trim().max(200).default(''),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  })
  .strict();
const field = (alias: string, key: string) =>
  isPostgres
    ? '(' + alias + ".data::jsonb#>>'{" + key.split('.').join(',') + "}')"
    : 'json_extract(' + alias + ".data,'$." + key + "')";
export async function accountingSourceList(a: Access, input: unknown) {
  await accountingAccess(a);
  const q = sourceListQuery.parse(input),
    s = await accountingSettings(a),
    args: any[] = [q.source_type, a.org, a.environment];
  let sql: string;
  if (['supplier_bill', 'supplier_payment', 'supplier_credit'].includes(q.source_type)) {
    const kind =
      q.source_type === 'supplier_bill'
        ? 'bill'
        : q.source_type === 'supplier_payment'
          ? 'payment'
          : 'credit';
    const result = await purchaseList(a, {
      type: kind,
      offset: q.offset,
      limit: 50,
      search: q.search,
      status: kind === 'payment' ? 'recorded' : 'approved',
      date_from: s.start_on,
      ...(q.currency ? { currency: q.currency } : {}),
    });
    const rows = [];
    for (const r of result.data) {
      const existing = await dbAll(
        'SELECT id,status FROM ac_accounting_entries WHERE org_id=? AND environment=? AND source_type=? AND source_id=?',
        [a.org, a.environment, q.source_type, r.id],
      );
      rows.push({
        id: r.id,
        reference: r.data.reference || r.data.bill_reference || r.data.payment_reference || r.id,
        vendor: r.data.supplier_snapshot?.name || r.data.contact_snapshot?.name || r.data.supplier_id || 'Canonical supplier',
        status: r.status,
        amount_minor: r.data.total_minor ?? r.data.amount_minor,
        currency: r.data.currency,
        source_on: r.data.issued_on || r.data.paid_on,
        entry_id: existing[0]?.id || null,
        entry_status: existing[0]?.status || null,
      });
    }
    return {
      source_type: q.source_type,
      data: rows,
      has_more: result.has_more,
      total: result.total,
      offset: q.offset,
      limit: 50,
      notice:
        'Reviewed supplier records. Tracked costs require an explicitly configured 1300 purchase-cost clearing account; this is not stock valuation or automatic cost of sales. Manual payments retain their unverified evidence classification.',
    };
  }
  const join =
    ' LEFT JOIN ac_accounting_entries e ON e.org_id=r.org_id AND e.environment=r.environment AND e.source_type=? AND e.source_id=r.id ';
  if (['cash_receipt', 'cash_return'].includes(q.source_type)) {
    await requireServices(a, ['cash_flow'], true);
    await requireServices(a, ['invoicing'], true);
    if (
      !(await dbGet('SELECT version FROM platform_migrations WHERE version=?', [
        '019-point-of-sale',
      ]))
    )
      return {
        source_type: q.source_type,
        data: [],
        has_more: false,
        offset: q.offset,
        limit: 50,
        notice:
          'Recorded cash sources require the qualified POS migration. No cash journal is inferred.',
      };
    sql =
      "SELECT r.id,'Recorded cash '||r.kind||' '||SUBSTR(r.id,1,8) AS reference,r.amount_minor,r.currency,r.occurred_at AS source_on,'merchant_observation' AS time_basis,e.id AS entry_id,e.status AS entry_status FROM ac_cash_movements r JOIN ac_records i ON i.id=r.document_id AND i.org_id=r.org_id AND i.environment=r.environment AND i.kind='invoices'" +
      join +
      ' WHERE r.org_id=? AND r.environment=? AND r.kind=? AND r.occurred_at>=?';
    args.push(
      q.source_type === 'cash_receipt' ? 'receipt' : 'return',
      new Date(s.start_on + 'T00:00:00+03:00').toISOString(),
    );
    if (q.currency) {
      sql += ' AND r.currency=?';
      args.push(q.currency);
    }
    sql += ' ORDER BY r.occurred_at DESC,r.id DESC';
    let selectedSql = sql.replace(/ ORDER BY[\s\S]*$/, '');
    const search = q.search ? '%' + q.search.toLowerCase() + '%' : '';
    if (q.search)
      selectedSql =
        'SELECT * FROM (' + selectedSql + ') source_rows WHERE LOWER(reference) LIKE ? OR LOWER(id) LIKE ?';
    const count = await dbGet(
      'SELECT COUNT(*) AS total FROM (' + selectedSql + ') counted_rows',
      q.search ? [...args, search, search] : args,
    );
    const rows = await dbAll(
      'SELECT * FROM (' + selectedSql + ') source_rows ORDER BY source_on DESC,reference DESC,id DESC LIMIT 51 OFFSET ?',
      [...(q.search ? [...args, search, search] : args), q.offset],
    );
    return {
      source_type: q.source_type,
      data: rows.slice(0, 50).map((r) => ({ ...r, amount_minor: Number(r.amount_minor) })),
      has_more: rows.length > 50,
      total: Number(count?.total || 0),
      offset: q.offset,
      limit: 50,
      notice:
        'Merchant-observed physical cash, not provider confirmation. Post the original invoice and, for returns, original cash receipt first. Journal posting still requires independent review.',
    };
  }
  if (q.source_type === 'invoice') {
    await requireServices(a, ['invoicing'], true);
    sql =
      'SELECT r.id,COALESCE(NULLIF(' +
      field('r', 'number') +
      ",''),NULLIF(" +
      field('r', 'reference') +
      ",''),'Invoice '||SUBSTR(r.id,1,8))||COALESCE(' · '||" +
      field('r', 'customer_snapshot.name') +
      ",'') AS reference," +
      field('r', 'total_minor') +
      ' AS amount_minor,' +
      field('r', 'currency') +
      ' AS currency,' +
      field('r', 'issue_date') +
      ' AS source_on,' +
      field('r', 'customer_snapshot.name') +
      ' AS partner,' +
      field('r', 'status') +
      ' AS status,e.id AS entry_id,e.status AS entry_status FROM ac_records r' +
      join +
      " WHERE r.org_id=? AND r.environment=? AND r.kind='invoices' AND " +
      field('r', 'status') +
      " IN ('issued','partially_paid','paid','credited') AND " +
      field('r', 'issue_date') +
      '>=?';
    args.push(s.start_on);
    if (q.currency) {
      sql += ' AND ' + field('r', 'currency') + '=?';
      args.push(q.currency);
    }
    sql += ' ORDER BY r.created_at DESC,r.id DESC';
  } else if (q.source_type === 'credit_note') {
    await requireServices(a, ['invoicing'], true);
    sql =
      'SELECT r.id,r.reference,r.amount_minor,' +
      field('i', 'currency') +
      ' AS currency,r.issued_on AS source_on,' +
      field('i', 'customer_snapshot.name') +
      " AS partner,'issued' AS status,e.id AS entry_id,e.status AS entry_status FROM ac_credit_notes r JOIN ac_records i ON i.id=r.invoice_id AND i.org_id=r.org_id AND i.environment=r.environment" +
      join +
      ' WHERE r.org_id=? AND r.environment=? AND r.issued_on>=?';
    args.push(s.start_on);
    if (q.currency) {
      sql += ' AND ' + field('i', 'currency') + '=?';
      args.push(q.currency);
    }
    sql += ' ORDER BY r.created_at DESC,r.id DESC';
  } else if (q.source_type === 'allocation') {
    await requireServices(a, ['payments', 'reconciliation'], true);
    await requireServices(a, ['invoicing'], true);
    sql =
      "SELECT r.id,COALESCE(NULLIF(" +
      field('i', 'number') +
      ",''),r.document_id) AS reference,r.amount_minor,p.currency,r.created_at AS source_on," +
      field('i', 'customer_snapshot.name') +
      " AS partner,p.status AS status,r.time_basis,e.id AS entry_id,e.status AS entry_status FROM ac_effective_allocations r JOIN ac_events p ON p.id=r.event_id AND p.org_id=r.org_id AND p.environment=r.environment JOIN ac_records i ON i.id=r.document_id AND i.org_id=r.org_id AND i.environment=r.environment AND i.kind='invoices'" +
      join +
      " WHERE r.org_id=? AND r.environment=? AND p.status='succeeded' AND r.amount_minor<>0 AND r.created_at>=?";
    args.push(new Date(s.start_on + 'T00:00:00+03:00').toISOString());
    if (q.currency) {
      sql += ' AND p.currency=?';
      args.push(q.currency);
    }
    sql += ' ORDER BY r.created_at DESC,r.id DESC';
  } else {
    await requireServices(a, ['expenses', 'cash_flow'], true);
    sql =
      'SELECT r.id,' +
      field('r', 'description') +
      ' AS reference,' +
      field('r', 'amount_minor') +
      ' AS amount_minor,' +
      field('r', 'currency') +
      ' AS currency,' +
      field('r', 'occurred_on') +
      ' AS source_on,e.id AS entry_id,e.status AS entry_status FROM ac2_objects r' +
      join +
      " WHERE r.org_id=? AND r.environment=? AND r.kind='expenses' AND COALESCE(" +
      field('r', 'status') +
      ",'recorded')='recorded' AND " +
      field('r', 'occurred_on') +
      ">=? AND NOT EXISTS(SELECT 1 FROM ac2_objects superseding WHERE superseding.org_id=r.org_id AND superseding.environment=r.environment AND superseding.kind='expenses' AND " +
      field('superseding', 'supersedes_id') +
      '=r.id)';
    args.push(s.start_on);
    if (q.currency) {
      sql += ' AND ' + field('r', 'currency') + '=?';
      args.push(q.currency);
    }
    sql += ' ORDER BY r.created_at DESC,r.id DESC';
  }
  const baseSql = sql.replace(/ ORDER BY[\s\S]*$/, '');
  const search = q.search ? '%' + q.search.toLowerCase() + '%' : '';
  const selectedSql = q.search
    ? 'SELECT * FROM (' + baseSql + ') source_rows WHERE LOWER(COALESCE(reference,\'\')) LIKE ? OR LOWER(id) LIKE ?'
    : baseSql;
  const selectedArgs = q.search ? [...args, search, search] : args;
  const count = await dbGet(
    'SELECT COUNT(*) AS total FROM (' + selectedSql + ') counted_rows',
    selectedArgs,
  );
  const rows = await dbAll(
    'SELECT * FROM (' + selectedSql + ') source_rows ORDER BY source_on DESC,reference DESC,id DESC LIMIT 51 OFFSET ?',
    [...selectedArgs, q.offset],
  );
  return {
    source_type: q.source_type,
    data: rows.slice(0, 50).map((r) => ({ ...r, amount_minor: Number(r.amount_minor) })),
    has_more: rows.length > 50,
    total: Number(count?.total || 0),
    limit: 50,
    offset: q.offset,
    notice:
      'Canonical sources from the reviewed accounting start. Preparing a draft rechecks source eligibility, prior invoice posting, expense corrections and open periods. No source record is copied into a second invoice or payment system.',
  };
}
