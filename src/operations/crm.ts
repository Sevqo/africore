import { crmConfiguration } from './crm-configuration';
import { create as createObject } from './store';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun, isPostgres } from '../db/adapter';
import { type Access, audit, fail } from '../platform/auth';
import { permitted, currencySchema } from '../platform/domain';
import { now, hash } from '../platform/crypto';
import { record, save as saveRecord } from '../platform/payments';
import { financialOperation, customerActivity, canonical } from '../finance/service';
import { requireServices, checkLimits, recordUsage } from '../marketplace/engine';
import { emit } from './events';
export const crmEntryInput = z
  .object({
    kind: z.enum(['lead', 'opportunity', 'follow_up', 'interaction']),
    customer_id: z.string().uuid(),
    title: z.string().trim().min(2).max(200),
    notes: z.string().max(4000).default(''),
    stage: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,39}$/)
      .default('new'),
    status: z.enum(['open', 'completed', 'cancelled', 'archived']).default('open'),
    assigned_to: z.string().uuid().nullable().default(null),
    due_at: z.string().datetime({ offset: true }).nullable().default(null),
    amount_minor: z.number().int().min(0).max(1e11).default(0),
    currency: currencySchema.default('KES'),
    quotation_id: z.string().uuid().nullable().default(null),
    order_id: z.string().uuid().nullable().default(null),
    team_id: z.string().uuid().nullable().default(null),
    probability_bps: z.number().int().min(0).max(10000).nullable().default(null),
    expected_close_on: z.string().date().nullable().default(null),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    outcome_reason: z.string().max(2000).default(''),
    activity_type: z.enum(['call', 'meeting', 'task', 'note']).default('note'),
    position: z.number().int().min(0).max(1e9).default(0),
    parent_entry_id: z.string().uuid().nullable().default(null),
    priority: z.number().int().min(0).max(3).default(0),
  })
  .strict();
function crmFingerprint(d: z.infer<typeof crmEntryInput>) {
  const {
    team_id,
    probability_bps,
    expected_close_on,
    tags,
    outcome_reason,
    activity_type,
    position,
    parent_entry_id,
    priority,
    ...legacy
  } = d;
  return !priority &&
    !parent_entry_id &&
    !team_id &&
    probability_bps === null &&
    !expected_close_on &&
    !tags.length &&
    !outcome_reason &&
    activity_type === 'note' &&
    position === 0
    ? legacy
    : priority
      ? d
      : parent_entry_id
        ? {
            ...legacy,
            team_id,
            probability_bps,
            expected_close_on,
            tags,
            outcome_reason,
            activity_type,
            position,
            parent_entry_id,
          }
        : {
            ...legacy,
            team_id,
            probability_bps,
            expected_close_on,
            tags,
            outcome_reason,
            activity_type,
            position,
          };
}
async function assignedMember(a: Access, id: string | null) {
  if (id) {
    const member = await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?', [
      a.org,
      id,
    ]);
    if (!member || !permitted(member.role, 'operations'))
      fail(400, 'Assign a current member who can perform operational work');
  }
}
async function links(a: Access, d: z.infer<typeof crmEntryInput>) {
  if (d.parent_entry_id) {
    if (!['follow_up', 'interaction'].includes(d.kind))
      fail(400, 'Only activities and notes can link to an opportunity');
    const parent = await dbGet(
      'SELECT kind,customer_id FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?',
      [d.parent_entry_id, a.org, a.environment],
    );
    if (!parent || parent.kind !== 'opportunity' || parent.customer_id !== d.customer_id)
      fail(400, 'Choose an opportunity for the same customer');
  }
  const settings = await crmConfiguration(a);
  if (!settings.stages.some((s) => s.id === d.stage)) fail(400, 'Choose a configured CRM stage');
  if (d.team_id) {
    const team = settings.teams.find((t) => t.id === d.team_id);
    if (!team || !team.active || (d.assigned_to && !team.members.includes(d.assigned_to)))
      fail(400, 'Choose an active team and one of its current members');
  }
  const customer = await record(a, d.customer_id, 'customers');
  if (customer.status === 'archived') fail(409, 'Choose an active customer');
  await assignedMember(a, d.assigned_to);
  if (d.order_id) {
    const order = await record(a, d.order_id, 'orders');
    if (order.customer_id !== d.customer_id) fail(400, 'Order belongs to another customer');
  }
  if (d.quotation_id) {
    const quote = await dbGet(
      'SELECT customer_id FROM ac_sales_quotes WHERE id=? AND org_id=? AND environment=?',
      [d.quotation_id, a.org, a.environment],
    );
    if (!quote || quote.customer_id !== d.customer_id)
      fail(400, 'Quotation is not linked to this customer');
  }
  if (d.kind === 'follow_up' && !d.due_at) fail(400, 'A follow-up needs a due date');
}
function decode(row: any) {
  return {
    ...crmEntryInput.parse(JSON.parse(row.data)),
    id: row.id,
    kind: row.kind,
    status: row.status,
    customer_id: row.customer_id,
    assigned_to: row.assigned_to,
    due_at: row.due_at,
    version: Number(row.version),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
async function revision(a: Access, entry: any, action: string) {
  const id = 'crm.revision:' + a.org + ':' + a.environment + ':' + entry.id + ':' + entry.version;
  const prior = await dbGet(
    'SELECT id FROM ac2_objects WHERE id=? AND org_id=? AND environment=?',
    [id, a.org, a.environment],
  );
  if (!prior)
    await createObject(
      a,
      'crm_entry_revision',
      { entry_id: entry.id, entry_version: entry.version, action, snapshot: entry, actor: a.actor },
      id,
    );
}
export async function crmEntryHistory(a: Access, id: string) {
  const row = await dbGet(
    'SELECT * FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?',
    [id, a.org, a.environment],
  );
  if (!row) fail(404, 'CRM entry not found');
  return {
    entry: decode(row),
    data: (
      await dbAll(
        "SELECT data,created_at FROM ac2_objects WHERE org_id=? AND environment=? AND kind='crm_entry_revision' AND id LIKE ? ORDER BY created_at,id LIMIT 500",
        [a.org, a.environment, 'crm.revision:' + a.org + ':' + a.environment + ':' + id + ':%'],
      )
    ).map((r) => ({ ...JSON.parse(r.data), recorded_at: r.created_at })),
    coverage:
      'Persisted snapshots since history support; the first captured baseline does not reconstruct earlier edits.',
  };
}
export async function crmEntries(
  a: Access,
  kind?: string,
  customerId?: string,
  cursor?: { created_at: string; id: string },
) {
  return (
    await dbAll(
      'SELECT * FROM ac_crm_entries WHERE org_id=? AND environment=?' +
        (kind ? ' AND kind=?' : '') +
        (customerId ? ' AND customer_id=?' : '') +
        (cursor ? ' AND (created_at<? OR (created_at=? AND id<?))' : '') +
        ' ORDER BY created_at DESC,id DESC LIMIT 200',
      [
        a.org,
        a.environment,
        ...(kind ? [kind] : []),
        ...(customerId ? [customerId] : []),
        ...(cursor ? [cursor.created_at, cursor.created_at, cursor.id] : []),
      ],
    )
  ).map(decode);
}
export async function crmEntryPage(
  a: Access,
  query: {
    kind?: string;
    status?: string;
    stage?: string;
    assigned_to?: string;
    team_id?: string;
    currency?: string;
    unassigned?: boolean;
    customer_id?: string;
    parent_entry_id?: string;
    q?: string;
    outcome?: 'active' | 'won' | 'lost';
    sort?: 'recent' | 'title';
    limit: number;
    offset: number;
  },
) {
  const value = (column: string, key: string) =>
    isPostgres ? `${column}.data::jsonb ->> '${key}'` : `json_extract(${column}.data,'$.${key}')`;
  const where = ['e.org_id=?', 'e.environment=?'];
  const params: (string | number)[] = [a.org, a.environment];
  if (query.kind) {
    where.push('e.kind=?');
    params.push(query.kind);
  }
  if (query.status) {
    where.push('e.status=?');
    params.push(query.status);
  }
  if (query.stage) {
    where.push(value('e', 'stage') + '=?');
    params.push(query.stage);
  }
  if (query.team_id) {
    where.push(value('e', 'team_id') + '=?');
    params.push(query.team_id);
  }
  if (query.currency) {
    where.push(value('e', 'currency') + '=?');
    params.push(query.currency);
  }
  if (query.assigned_to) {
    where.push('e.assigned_to=?');
    params.push(query.assigned_to);
  }
  if (query.unassigned) where.push('e.assigned_to IS NULL');
  if (query.customer_id) {
    where.push('e.customer_id=?');
    params.push(query.customer_id);
  }
  if (query.parent_entry_id) {
    where.push(value('e', 'parent_entry_id') + '=?');
    params.push(query.parent_entry_id);
  }
  if (query.outcome === 'active') where.push(value('e', 'stage') + " NOT IN ('won','lost')");
  else if (query.outcome) {
    where.push(value('e', 'stage') + '=?');
    params.push(query.outcome);
  }
  if (query.q) {
    const pattern = '%' + query.q.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%';
    const textSearch = [value('e', 'title'), value('e', 'notes'), 'e.id'].map(
      (expression) => `LOWER(COALESCE(${expression},'')) LIKE ? ESCAPE '\\'`,
    );
    const customerName = value('c', 'name');
    where.push(
      '(' +
        textSearch.join(' OR ') +
        ` OR EXISTS (SELECT 1 FROM ac_records c WHERE c.org_id=? AND c.environment=? AND c.kind='customers' AND c.id=e.customer_id AND LOWER(COALESCE(${customerName},'')) LIKE ? ESCAPE '\\'))`,
    );
    params.push(...textSearch.map(() => pattern), a.org, a.environment, pattern);
  }
  const predicate = where.join(' AND ');
  const count = await dbGet<{ total: number }>(
    'SELECT COUNT(*) AS total FROM ac_crm_entries e WHERE ' + predicate,
    params,
  );
  const rows = await dbAll(
    'SELECT e.* FROM ac_crm_entries e WHERE ' +
      predicate +
      (query.sort === 'title'
        ? ` ORDER BY LOWER(${value('e', 'title')}),e.id`
        : ' ORDER BY e.created_at DESC,e.id DESC') +
      ' LIMIT ? OFFSET ?',
    [...params, query.limit, query.offset],
  );
  const stageRows = await dbAll<{ stage: string; currency: string; count: number; amount_minor: number }>(
    'SELECT ' +
      value('e', 'stage') +
      ' AS stage,' +
      value('e', 'currency') +
      ' AS currency,COUNT(*) AS count,SUM(CAST(COALESCE(' +
      value('e', 'amount_minor') +
      ",'0') AS BIGINT)) AS amount_minor FROM ac_crm_entries e WHERE " +
      predicate +
      ' GROUP BY ' +
      value('e', 'stage') +
      ',' +
      value('e', 'currency'),
    params,
  );
  const stageMap = new Map<string, { stage: string; count: number; totals: Record<string, number> }>();
  for (const row of stageRows) {
    const id = row.stage || 'new';
    const entry = stageMap.get(id) || { stage: id, count: 0, totals: {} };
    entry.count += Number(row.count);
    entry.totals[row.currency || 'KES'] = Number(row.amount_minor || 0);
    stageMap.set(id, entry);
  }
  const total = Number(count?.total || 0);
  return {
    data: rows.map(decode),
    limit: query.limit,
    offset: query.offset,
    total,
    has_more: query.offset + rows.length < total,
    stages: [...stageMap.values()],
    coverage: 'All current CRM records matching the selected server filters.',
  };
}
export async function createCrmEntry(a: Access, input: unknown, key: string, resourceId?: string) {
  const d = crmEntryInput.parse(input);
  return financialOperation(a, 'crm.entry.create', key, crmFingerprint(d), async () => {
    await requireServices(a, ['crm']);
    await links(a, d);
    const id = resourceId || randomUUID(),
      at = now();
    const prior = resourceId
      ? await dbGet('SELECT * FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?', [
          resourceId,
          a.org,
          a.environment,
        ])
      : null;
    if (prior) {
      if (canonical(crmEntryInput.parse(JSON.parse(prior.data))) !== canonical(d))
        fail(409, 'Existing workflow task changed; manual review required');
      return decode(prior);
    }
    await checkLimits(a, 'crm', 1);
    await dbRun(
      'INSERT INTO ac_crm_entries(id,org_id,environment,customer_id,kind,status,assigned_to,due_at,data,actor,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        id,
        a.org,
        a.environment,
        d.customer_id,
        d.kind,
        d.status,
        d.assigned_to,
        d.due_at ? new Date(d.due_at).toISOString() : null,
        JSON.stringify(d),
        a.actor,
        at,
        at,
      ],
    );
    await recordUsage(a, 'crm', 'crm.entry:' + id, 1, 'crm.entry_created');
    await audit(a.org, a.actor, 'crm.' + d.kind + '_created', id);
    await emit(
      a,
      'crm.entry_created',
      {
        id,
        customer_id: d.customer_id,
        kind: d.kind,
        assigned_to: d.assigned_to,
        schema_version: 1,
      },
      { key: 'crm.entry:' + id },
    );
    const entry = { id, ...d, version: 1, created_at: at, updated_at: at };
    await revision(a, entry, 'created');
    return entry;
  });
}
export async function editCrmEntry(a: Access, id: string, input: unknown, key: string) {
  const d = z
    .object({ expected_version: z.number().int().positive(), entry: crmEntryInput })
    .strict()
    .parse(input);
  return financialOperation(
    a,
    'crm.entry.edit:' + id,
    key,
    { expected_version: d.expected_version, entry: crmFingerprint(d.entry) },
    async () => {
      await requireServices(a, ['crm']);
      const row = await dbGet(
        'SELECT * FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?',
        [id, a.org, a.environment],
      );
      if (!row) fail(404, 'CRM entry not found');
      if (Number(row.version) !== d.expected_version)
        fail(409, 'CRM entry changed; reload before editing');
      if (row.kind !== d.entry.kind || row.customer_id !== d.entry.customer_id)
        fail(400, 'Entry type and customer identity are retained');
      if ((JSON.parse(row.data).parent_entry_id || null) !== d.entry.parent_entry_id)
        fail(400, 'Activity opportunity linkage is retained');
      await links(a, d.entry);
      await revision(a, decode(row), 'baseline');
      await dbRun(
        'UPDATE ac_crm_entries SET status=?,assigned_to=?,due_at=?,data=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND environment=? AND version=?',
        [
          d.entry.status,
          d.entry.assigned_to,
          d.entry.due_at ? new Date(d.entry.due_at).toISOString() : null,
          JSON.stringify(d.entry),
          now(),
          id,
          a.org,
          a.environment,
          d.expected_version,
        ],
      );
      await audit(a.org, a.actor, 'crm.entry_updated', id);
      const entry = {
        ...d.entry,
        id,
        version: d.expected_version + 1,
        created_at: row.created_at,
        updated_at: now(),
      };
      await revision(a, entry, 'updated');
      if (JSON.parse(row.data).stage !== d.entry.stage)
        await emit(
          a,
          'crm.stage_changed',
          {
            id,
            customer_id: row.customer_id,
            previous_stage: JSON.parse(row.data).stage,
            stage: d.entry.stage,
            amount_minor: d.entry.amount_minor,
            currency: d.entry.currency,
            kind: d.entry.kind,
            assigned_to: d.entry.assigned_to,
            schema_version: 1,
          },
          { key: 'crm.stage:' + id + ':' + entry.version },
        );
      return entry;
    },
  );
}
export const crmLeadConversionInput = z
  .object({
    expected_version: z.number().int().positive(),
    assigned_to: z.string().uuid().nullable().optional(),
    team_id: z.string().uuid().nullable().optional(),
    customer_id: z.string().uuid().optional(),
    new_customer: z
      .object({
        name: z.string().trim().min(1).max(200),
        type: z.enum(['individual', 'business']).default('individual'),
        email: z.string().email().or(z.literal('')).default(''),
        phone: z.string().max(50).default(''),
        address: z.string().max(1000).default(''),
        notes: z.string().max(3000).default(''),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((d) => !(d.customer_id && d.new_customer), {
    message: 'Choose an existing customer or create a new one',
  });
/** Explicit lifecycle transition; edits cannot silently change a record's identity or type. */
export async function convertCrmLead(a: Access, id: string, input: unknown, key: string) {
  const d = crmLeadConversionInput.parse(input);
  return financialOperation(a, 'crm.lead.convert:' + id, key, d, async () => {
    await requireServices(a, ['crm']);
    const row = await dbGet(
      'SELECT * FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?',
      [id, a.org, a.environment],
    );
    if (!row) fail(404, 'CRM entry not found');
    if (Number(row.version) !== d.expected_version)
      fail(409, 'CRM entry changed; reload before converting');
    const old = decode(row);
    if (old.kind !== 'lead' || old.status !== 'open' || ['won', 'lost'].includes(old.stage))
      fail(409, 'Only an open active lead can be converted');
    let customerId = d.customer_id;
    if (d.new_customer) {
      await requireServices(a, ['customers']);
      const existing = await dbAll(
        "SELECT data FROM ac_records WHERE org_id=? AND environment=? AND kind='customers'",
        [a.org, a.environment],
      );
      const email = d.new_customer.email.trim().toLowerCase(),
        phone = d.new_customer.phone.replace(/\s+/g, '');
      if (
        existing.some((r) => {
          const c = JSON.parse(r.data);
          return (
            (email &&
              String(c.email || '')
                .trim()
                .toLowerCase() === email) ||
            (phone && String(c.phone || '').replace(/\s+/g, '') === phone)
          );
        })
      )
        fail(
          409,
          'A customer with this email or phone already exists; link the existing customer after review',
        );
      customerId = (await saveRecord(a, 'customers', d.new_customer)).id;
    }
    const next = crmEntryInput.parse({
      ...JSON.parse(row.data),
      kind: 'opportunity',
      stage: 'qualified',
      ...(customerId !== undefined ? { customer_id: customerId } : {}),
      ...(d.assigned_to !== undefined ? { assigned_to: d.assigned_to } : {}),
      ...(d.team_id !== undefined ? { team_id: d.team_id } : {}),
    });
    await links(a, next);
    await revision(a, old, 'baseline');
    const at = now();
    await dbRun(
      'UPDATE ac_crm_entries SET kind=?,customer_id=?,assigned_to=?,data=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND environment=? AND version=?',
      [
        'opportunity',
        next.customer_id,
        next.assigned_to,
        JSON.stringify(next),
        at,
        id,
        a.org,
        a.environment,
        d.expected_version,
      ],
    );
    await audit(a.org, a.actor, 'crm.lead_converted', id);
    const entry = {
      ...next,
      id,
      version: d.expected_version + 1,
      created_at: row.created_at,
      updated_at: at,
    };
    await revision(a, entry, 'converted');
    return entry;
  });
}
export async function customerProfile(a: Access, id: string) {
  const customer = await record(a, id, 'customers'),
    row = await dbGet(
      'SELECT * FROM ac_crm_profiles WHERE customer_id=? AND org_id=? AND environment=?',
      [id, a.org, a.environment],
    );
  return {
    customer,
    profile: row
      ? { ...JSON.parse(row.data), version: Number(row.version) }
      : { tags: [], assigned_to: null, contact_type: 'individual', company_id: null, version: 0 },
  };
}

/** Search only canonical customer records explicitly classified as companies in CRM. */
export async function crmCompanySearch(a: Access, input: unknown) {
  const query = z.object({ q: z.string().trim().max(100).default(''), limit: z.number().int().min(1).max(50).default(20) }).strict().parse(input);
  const fields = (column: string, key: string) =>
    isPostgres
      ? `${column}.data::jsonb ->> '${key}'`
      : `json_extract(${column}.data,'$.${key}')`;
  const where = [
    'c.org_id=?',
    'c.environment=?',
    "c.kind='customers'",
    "COALESCE(" + fields('c', 'status') + ",'active')<>'archived'",
    fields('p', 'contact_type') + "='company'",
  ];
  const params: (string | number)[] = [a.org, a.environment];
  if (query.q) {
    const pattern = '%' + query.q.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%';
    where.push(
      '(' + ['name', 'email', 'phone'].map((field) => `LOWER(COALESCE(${fields('c', field)},'')) LIKE ? ESCAPE '\\'`).join(' OR ') + ')',
    );
    params.push(pattern, pattern, pattern);
  }
  const predicate = where.join(' AND ');
  const [count, rows] = await Promise.all([
    dbGet<{ total: number }>(
      'SELECT COUNT(*) AS total FROM ac_records c JOIN ac_crm_profiles p ON p.customer_id=c.id AND p.org_id=c.org_id AND p.environment=c.environment WHERE ' + predicate,
      params,
    ),
    dbAll(
      'SELECT c.* FROM ac_records c JOIN ac_crm_profiles p ON p.customer_id=c.id AND p.org_id=c.org_id AND p.environment=c.environment WHERE ' + predicate + ' ORDER BY c.created_at DESC,c.id DESC LIMIT ?',
      [...params, query.limit],
    ),
  ]);
  return {
    data: rows.map((row) => ({ ...JSON.parse(row.data), id: row.id, created_at: row.created_at })),
    total: Number(count?.total || 0),
    limit: query.limit,
    coverage: 'Active shared customers classified as companies in this CRM workspace.',
  };
}

export async function setCustomerProfile(a: Access, id: string, input: unknown, key: string) {
  const d = z
    .object({
      expected_version: z.number().int().min(0),
      tags: z.array(z.string().trim().min(1).max(60)).max(20),
      assigned_to: z.string().uuid().nullable(),
      contact_type: z.enum(['individual', 'company']).optional(),
      company_id: z.string().uuid().nullable().optional(),
    })
    .strict()
    .parse(input);
  return financialOperation(a, 'crm.profile:' + id, key, d, async () => {
    await requireServices(a, ['crm']);
    const old = await customerProfile(a, id),
      contactType = d.contact_type ?? old.profile.contact_type ?? 'individual',
      companyId = d.company_id === undefined ? (old.profile.company_id ?? null) : d.company_id;
    if (old.profile.version !== d.expected_version) fail(409, 'Customer profile changed');
    await assignedMember(a, d.assigned_to);
    if (companyId) {
      if (companyId === id || contactType === 'company')
        fail(400, 'Choose a separate company for an individual contact');
      await record(a, companyId, 'customers');
      const parent = await dbGet(
        'SELECT data FROM ac_crm_profiles WHERE customer_id=? AND org_id=? AND environment=?',
        [companyId, a.org, a.environment],
      );
      if (!parent || JSON.parse(parent.data).contact_type !== 'company')
        fail(400, 'The linked contact must be a company');
    }
    if (contactType !== 'company') {
      const children = await dbAll(
        'SELECT data FROM ac_crm_profiles WHERE org_id=? AND environment=?',
        [a.org, a.environment],
      );
      if (children.some((row) => JSON.parse(row.data).company_id === id))
        fail(409, 'Resolve linked individual contacts before changing company type');
    }
    await dbRun(
      'INSERT INTO ac_crm_profiles(customer_id,org_id,environment,data,version,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(customer_id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at',
      [
        id,
        a.org,
        a.environment,
        JSON.stringify({
          tags: [...new Set(d.tags)],
          assigned_to: d.assigned_to,
          contact_type: contactType,
          company_id: companyId,
        }),
        d.expected_version + 1,
        now(),
      ],
    );
    await audit(a.org, a.actor, 'crm.customer_profile_updated', id);
    return customerProfile(a, id);
  });
}
export async function crmCustomerActivity(
  a: Access,
  id: string,
  page: { limit: number; offset: number } = { limit: 50, offset: 0 },
) {
  const profile = await customerProfile(a, id),
    total = await dbGet<{ total: number }>(
      'SELECT COUNT(*) AS total FROM ac_crm_entries WHERE org_id=? AND environment=? AND customer_id=?',
      [a.org, a.environment, id],
    ),
    entries = (
      await dbAll(
        'SELECT * FROM ac_crm_entries WHERE org_id=? AND environment=? AND customer_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',
        [a.org, a.environment, id, page.limit, page.offset],
      )
    ).map(decode),
    quotes = await dbGet<{ total: number }>(
      'SELECT COUNT(*) AS total FROM ac_sales_quotes WHERE org_id=? AND environment=? AND customer_id=?',
      [a.org, a.environment, id],
    );
  const finance = permitted(a.role, 'finance') ? await customerActivity(a, id) : null;
  const orders = await dbGet<{ total: number }>(
    "SELECT COUNT(*) AS total FROM ac_records WHERE org_id=? AND environment=? AND kind='orders' AND " +
      (isPostgres ? "data::jsonb ->> 'customer_id'=?" : "json_extract(data,'$.customer_id')=?"),
    [a.org, a.environment, id],
  );
  return {
    ...profile,
    entries,
    entries_total: Number(total?.total || 0),
    limit: page.limit,
    offset: page.offset,
    has_more: page.offset + entries.length < Number(total?.total || 0),
    quotation_count: Number(quotes?.total || 0),
    order_count: Number(orders?.total || 0),
    financial_activity: finance,
    financial_visibility: !!finance,
    coverage:
      'Customer CRM activity is paginated from canonical entries; quotation and order counts are workspace scoped. Private finance is omitted unless the current role has finance authority.',
  };
}
export async function crmOverview(a: Access) {
  const stage = isPostgres ? "(data::jsonb->>'stage')" : "json_extract(data,'$.stage')",
    cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const [customers, newCustomers, opportunities, due, pipeline, entries, recent] =
    await Promise.all([
      dbGet(
        "SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND environment=? AND kind='customers'",
        [a.org, a.environment],
      ),
      dbGet(
        "SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND environment=? AND kind='customers' AND created_at>=?",
        [a.org, a.environment, cutoff],
      ),
      dbGet(
        "SELECT COUNT(*) AS n FROM ac_crm_entries WHERE org_id=? AND environment=? AND kind='opportunity' AND status='open' AND " +
          stage +
          " NOT IN ('won','lost')",
        [a.org, a.environment],
      ),
      dbGet(
        "SELECT COUNT(*) AS n FROM ac_crm_entries WHERE org_id=? AND environment=? AND kind='follow_up' AND status='open' AND due_at<=?",
        [a.org, a.environment, now()],
      ),
      dbAll(
        'SELECT ' +
          stage +
          " AS stage,COUNT(*) AS count FROM ac_crm_entries WHERE org_id=? AND environment=? AND kind='opportunity' AND status NOT IN ('cancelled','archived') GROUP BY " +
          stage,
        [a.org, a.environment],
      ),
      crmEntries(a),
      crmEntries(a, 'interaction'),
    ]);
  const configuration = await crmConfiguration(a),
    profiles = (
      await dbAll('SELECT customer_id,data FROM ac_crm_profiles WHERE org_id=? AND environment=?', [
        a.org,
        a.environment,
      ])
    ).map((r) => ({ customer_id: r.customer_id, ...JSON.parse(r.data) }));
  return {
    configuration,
    profiles,
    current_actor: a.actor,
    total_customers: Number(customers.n),
    new_customers_30d: Number(newCustomers.n),
    active_opportunities: Number(opportunities.n),
    follow_ups_due: Number(due.n),
    pipeline: configuration.stages.map((s) => ({
      stage: s.id,
      name: s.name,
      count: Number(pipeline.find((p) => p.stage === s.id)?.count || 0),
    })),
    recent_interactions: recent.slice(0, 10),
    entries,
    as_of: now(),
    coverage:
      'Metrics cover canonical workspace records; entry lists initially show at most 200 recent matches; older records can be loaded. Contacts include archived history. Pipeline amounts are opportunities, not recognized revenue.',
  };
}

export const crmImportInput = z
  .object({
    source_id: z.string().trim().min(3).max(100),
    rows: z.array(crmEntryInput).min(1).max(100),
  })
  .strict();
export async function importCrmEntries(a: Access, input: unknown, key: string) {
  const d = crmImportInput.parse(input);
  return financialOperation(a, 'crm.import', key, d, () =>
    financialOperation(
      a,
      'crm.import.source:' + hash(d.source_id),
      'source:' + hash(d.source_id),
      d,
      async () => {
        await requireServices(a, ['crm']);
        const entries = [];
        for (const [index, row] of d.rows.entries())
          entries.push(await createCrmEntry(a, row, 'import:' + hash(d.source_id) + ':' + index));
        return { source_id: d.source_id, imported: entries.length, entries };
      },
    ),
  );
}
