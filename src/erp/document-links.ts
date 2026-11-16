import { randomUUID } from 'node:crypto';
import { documentSource } from './documents-contracts';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { permitted } from '../platform/domain';
import { now } from '../platform/crypto';
import { requireServices, checkLimits, recordUsage } from '../marketplace/engine';
import { currentMember, read, authorize, operation, decode, update } from './store';
import { decode as decodeTrust } from '../trust/store';
import { z } from 'zod';
import { employeeAccess } from './people-access';
import {
  documentsContext,
  documentAccess,
  documentRights,
  personnelDocumentFilter,
} from './documents-access';
export const documentLinkInput = documentSource;

const documentSourceOptionsInput = z
  .object({
    source_kind: documentSource.shape.source_kind,
    q: z.string().trim().max(100).default(''),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  })
  .strict();

function sourceLabel(kind: string, data: any, id: string) {
  const values: Record<string, unknown> = {
    customer: data.name,
    invoice: data.reference || data.number,
    sales_quotation: data.reference || data.number,
    sales_order: data.number || data.reference,
    expense: data.description,
    purchase_order: data.reference || data.name || data.supplier,
    supplier_bill: data.reference || data.bill_number || data.supplier,
    employee: data.name,
    work_task: data.name || data.title,
    verification: 'Business identity review · ' + (data.status || 'pending'),
  };
  const fallback = kind.replace(/_/g, ' '),
    label = String(values[kind] || fallback)
      .trim()
      .slice(0, 180);
  return label || fallback + ' ' + id.slice(0, 8);
}

/** Search a bounded, authorized source window for human-selectable document relationships. */
export async function documentSourceOptions(a: Access, input: unknown) {
  const q = documentSourceOptionsInput.parse(input),
    role = await currentMember(a);
  await documentsContext(a);
  const service: Record<string, string> = {
    customer: 'customers',
    invoice: 'invoicing',
    sales_quotation: 'sales',
    sales_order: 'orders',
    expense: 'expenses',
    purchase_order: 'procurement',
    supplier_bill: 'procurement',
    employee: 'people',
    work_task: 'work',
    verification: 'verification',
  };
  await requireServices(a, [service[q.source_kind]], true);
  if (
    ['invoice', 'expense', 'supplier_bill'].includes(q.source_kind) &&
    !permitted(role, 'finance')
  )
    fail(403, 'Financial source authority required independently of document access');
  if (
    ['purchase_order', 'work_task', 'sales_quotation', 'sales_order'].includes(q.source_kind) &&
    !permitted(role, 'operations')
  )
    fail(403, 'Operational source authority required');
  if (q.source_kind === 'verification' && !['owner', 'admin'].includes(role))
    fail(403, 'Current verification administrator required');

  const table = ['customer', 'invoice', 'sales_order'].includes(q.source_kind)
      ? 'ac_records'
      : q.source_kind === 'sales_quotation'
        ? 'ac_sales_quotes'
        : q.source_kind === 'expense'
          ? 'ac2_objects'
          : q.source_kind === 'verification'
            ? 'ac3_objects'
            : 'ac_erp_objects',
    kind =
      q.source_kind === 'customer'
        ? 'customers'
        : q.source_kind === 'invoice'
          ? 'invoices'
          : q.source_kind === 'sales_quotation'
            ? 'sales_quotation'
            : q.source_kind === 'sales_order'
              ? 'orders'
              : q.source_kind === 'expense'
                ? 'expenses'
                : q.source_kind === 'purchase_order'
                  ? 'purchase_order'
                  : q.source_kind === 'supplier_bill'
                    ? 'supplier_bill'
                    : q.source_kind === 'employee'
                      ? 'employee'
                      : q.source_kind === 'work_task'
                        ? 'work_task'
                        : 'identity_review',
    rows = await dbAll(
      `SELECT * FROM ${table} WHERE org_id=? AND environment=?${table === 'ac_sales_quotes' ? '' : ' AND kind=?'} ORDER BY created_at DESC,id DESC LIMIT 5001`,
      [a.org, a.environment, ...(table === 'ac_sales_quotes' ? [] : [kind])],
    ),
    needle = q.q.normalize('NFKC').toLocaleLowerCase(),
    matching: { id: string; source_kind: string; label: string }[] = [];

  for (const row of rows.slice(0, 5000)) {
    try {
      await documentSourceAccess(a, q.source_kind, row.id);
    } catch (error) {
      if ([400, 402, 403, 404, 409].includes((error as any).status)) continue;
      throw error;
    }
    const data =
        table === 'ac_erp_objects'
          ? decode(a, row).data
          : table === 'ac3_objects'
            ? decodeTrust(row)
            : JSON.parse(row.data),
      label = sourceLabel(q.source_kind, data, row.id);
    if (!needle || label.normalize('NFKC').toLocaleLowerCase().includes(needle))
      matching.push({ id: row.id, source_kind: q.source_kind, label });
  }
  return {
    data: matching.slice(q.offset, q.offset + 50),
    offset: q.offset,
    limit: 50,
    has_more: matching.length > q.offset + 50,
    truncated: rows.length > 5000,
    notice:
      'Only source records that pass the current service, role and record authorization checks are listed. Search covers at most 5,000 recent candidates for this source kind; the link is checked again when saved.',
  };
}

export async function documentSourceAccess(a: Access, kind: string, id: string) {
  const role = await currentMember(a);
  if (['invoice', 'expense', 'supplier_bill'].includes(kind) && !permitted(role, 'finance'))
    fail(403, 'Financial source authority required independently of document access');
  if (kind === 'employee') {
    await employeeAccess(a, id, 'personnel');
    return;
  }
  if (kind === 'work_task') {
    const task = await read(a, id, 'work_task');
    await authorize(a, 'work', task.root_id);
    return;
  }
  if (kind === 'supplier_bill') {
    await requireServices(a, ['procurement'], true);
    await read(a, id, 'supplier_bill');
    return;
  }
  if (kind === 'purchase_order') {
    if (!permitted(role, 'operations')) fail(403, 'Operational source authority required');
    await requireServices(a, ['procurement'], true);
    await read(a, id, 'purchase_order');
    return;
  }
  if (kind === 'sales_quotation') {
    if (!permitted(role, 'operations')) fail(403, 'Operational source authority required');
    await requireServices(a, ['sales'], true);
    if (
      !(await dbGet('SELECT id FROM ac_sales_quotes WHERE org_id=? AND environment=? AND id=?', [
        a.org,
        a.environment,
        id,
      ]))
    )
      fail(404, 'Sales quotation not found');
    return;
  }
  if (kind === 'sales_order') {
    if (!permitted(role, 'operations')) fail(403, 'Operational source authority required');
    await requireServices(a, ['orders'], true);
    if (
      !(await dbGet(
        "SELECT id FROM ac_records WHERE org_id=? AND environment=? AND id=? AND kind='orders'",
        [a.org, a.environment, id],
      ))
    )
      fail(404, 'Sales order not found');
    return;
  }
  if (kind === 'verification') {
    if (!['owner', 'admin'].includes(role))
      fail(403, 'Current verification administrator required');
    await requireServices(a, ['verification'], true);
    if (
      !(await dbGet(
        "SELECT id FROM ac3_objects WHERE org_id=? AND environment=? AND id=? AND kind='identity_review'",
        [a.org, a.environment, id],
      ))
    )
      fail(404, 'Verification source not found');
    return;
  }
  if (kind === 'expense') {
    await requireServices(a, ['expenses'], true);
    if (
      !(await dbGet(
        "SELECT id FROM ac2_objects WHERE org_id=? AND environment=? AND id=? AND kind='expenses'",
        [a.org, a.environment, id],
      ))
    )
      fail(404, 'Expense source not found');
    return;
  }
  if (['customer', 'invoice'].includes(kind)) {
    await requireServices(a, [kind === 'invoice' ? 'invoicing' : 'customers'], true);
    if (
      !(await dbGet(
        'SELECT id FROM ac_records WHERE org_id=? AND environment=? AND id=? AND kind=?',
        [a.org, a.environment, id, kind === 'invoice' ? 'invoices' : 'customers'],
      ))
    )
      fail(404, 'Canonical source not found');
    return;
  }
  fail(400, 'Unsupported document attachment source');
}
/** A financial attachment cannot bypass the financial source through its file URL. */
export async function sensitiveDocumentLinks(a: Access, id: string) {
  const rows = await dbAll(
    "SELECT source_kind,source_id FROM ac_document_links WHERE document_id=? AND org_id=? AND environment=? AND source_kind IN ('invoice','expense','supplier_bill','employee','sales_quotation','sales_order')",
    [id, a.org, a.environment],
  );
  for (const row of rows) await documentSourceAccess(a, row.source_kind, row.source_id);
}
export async function financialDocumentFilter(a: Access) {
  const role = await currentMember(a),
    denied: string[] = [];
  for (const [kind, service, capability] of [
    ['invoice', 'invoicing', 'finance'],
    ['expense', 'expenses', 'finance'],
    ['supplier_bill', 'procurement', 'finance'],
    ['sales_quotation', 'sales', 'operations'],
    ['sales_order', 'orders', 'operations'],
  ]) {
    if (!permitted(role, capability)) {
      denied.push(kind);
      continue;
    }
    try {
      await requireServices(a, [service], true);
    } catch (e) {
      if ([402, 403].includes((e as any).status)) denied.push(kind);
      else throw e;
    }
  }
  return denied.length
    ? {
        sql:
          'NOT EXISTS(SELECT 1 FROM ac_document_links sensitive WHERE sensitive.org_id=d.org_id AND sensitive.environment=d.environment AND sensitive.document_id=d.id AND sensitive.source_kind IN (' +
          denied.map(() => '?').join(',') +
          '))',
        params: denied,
      }
    : { sql: '1=1', params: [] };
}
export async function linkDocument(a: Access, id: string, input: unknown, key: string) {
  const d = documentLinkInput.parse(input);
  return operation(
    a,
    'documents.link:' + id,
    key,
    d,
    async () => {
      await documentAccess(a, id, 'edit');
      await documentSourceAccess(a, d.source_kind, d.source_id);
    },
    async () => {
      const c = await documentAccess(a, id, 'edit');
      if (d.source_kind === 'employee' && c.row.employee_id !== d.source_id)
        fail(409, 'Employee attachments must retain the matching personnel classification');
      const old = await dbGet(
        'SELECT id FROM ac_document_links WHERE org_id=? AND environment=? AND document_id=? AND source_kind=? AND source_id=?',
        [a.org, a.environment, id, d.source_kind, d.source_id],
      );
      if (old) return { ...d, id: old.id, document_id: id };
      if (
        Number(
          (
            await dbGet(
              'SELECT COUNT(*) AS n FROM ac_document_links WHERE document_id=? AND org_id=? AND environment=?',
              [id, a.org, a.environment],
            )
          ).n,
        ) >= 200
      )
        fail(409, 'Document attachment reference limit reached');
      await checkLimits(a, 'documents', 1);
      const link = randomUUID();
      await dbRun(
        'INSERT INTO ac_document_links(id,org_id,environment,document_id,source_kind,source_id,actor,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [link, a.org, a.environment, id, d.source_kind, d.source_id, a.actor, now()],
      );
      const document = await read(a, id, 'document');
      await update(
        a,
        document,
        {
          ...document.data,
          attachment_revision: Number(document.data.attachment_revision || 0) + 1,
        },
        {},
        'reference_linked',
      );
      await recordUsage(
        a,
        'documents',
        'document-link:' + id + ':' + d.source_kind + ':' + d.source_id,
        1,
        'document_reference_linked',
      );
      return { id: link, document_id: id, ...d };
    },
    { meter: false },
  );
}
export async function sourceDocuments(a: Access, input: unknown) {
  await documentsContext(a);
  const d = documentLinkInput.parse(input);
  await documentSourceAccess(a, d.source_kind, d.source_id);
  const rights = documentRights(a),
    personnel = await personnelDocumentFilter(a),
    financial = await financialDocumentFilter(a),
    rows = await dbAll(
      rights.sql +
        "SELECT o.* FROM ac_document_links link JOIN ac_documents d ON d.id=link.document_id AND d.org_id=link.org_id AND d.environment=link.environment JOIN allowed allowed_doc ON allowed_doc.id=d.id JOIN ac_erp_objects o ON o.id=d.id AND o.org_id=d.org_id AND o.environment=d.environment WHERE link.org_id=? AND link.environment=? AND link.source_kind=? AND link.source_id=? AND d.status='active' AND " +
        personnel.sql +
        ' AND ' +
        financial.sql +
        ' ORDER BY o.updated_at DESC,o.id DESC LIMIT 51',
      [
        ...rights.params,
        a.org,
        a.environment,
        d.source_kind,
        d.source_id,
        ...personnel.params,
        ...financial.params,
      ],
    );
  return {
    data: rows.slice(0, 50).map((row) => decode(a, row)),
    has_more: rows.length > 50,
    limit: 50,
    notice:
      'Each attachment retains its own current access. Source membership or project participation does not grant file access.',
  };
}
