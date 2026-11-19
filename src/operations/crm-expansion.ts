import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun, dbTransaction, isPostgres } from '../db/adapter';
import { type Access, audit, fail } from '../platform/auth';
import { permitted, currencySchema } from '../platform/domain';
import { hash, now } from '../platform/crypto';
import { financialOperation } from '../finance/service';
import { requireServices } from '../marketplace/engine';
import { createCrmEntry, editCrmEntry, crmImportLeadRow } from './crm';
import { crmConfiguration } from './crm-configuration';

const json = (key: string, column = 'data') =>
  isPostgres ? `${column}::jsonb ->> '${key}'` : `json_extract(${column},'$.${key}')`;
const entryData = (row: any) => ({ ...JSON.parse(row.data), id: row.id, customer_id: row.customer_id, status: row.status, assigned_to: row.assigned_to, due_at: row.due_at, version: Number(row.version), merged_into: row.merged_into || null, created_at: row.created_at, updated_at: row.updated_at });
const norm = (v: unknown) => String(v || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const phoneNorm = (v: unknown) => String(v || '').replace(/\D/g, '');

export async function crmDuplicateSuggestions(a: Access, input: unknown) {
  await requireServices(a, ['crm']);
  const q = z.object({ id: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict().parse(input);
  const all = (await dbAll(`SELECT * FROM ac_crm_entries WHERE org_id=? AND environment=? AND kind IN ('lead','opportunity') AND status='open' AND ${json('stage')} NOT IN ('won','lost') AND merged_into IS NULL ORDER BY created_at DESC LIMIT 5000`, [a.org, a.environment])).map(entryData);
  const records = q.id ? all.filter((x) => x.id === q.id) : all;
  if (q.id && !records.length) fail(404, 'CRM record not found in this workspace');
  const signatures = (entry: any) => [
    norm(entry.email) ? ['email', norm(entry.email)] : null,
    phoneNorm(entry.phone).length >= 7 ? ['phone', phoneNorm(entry.phone)] : null,
    norm(entry.company) && norm(entry.contact_name) ? ['company-contact', norm(entry.company) + '\0' + norm(entry.contact_name)] : null,
  ].filter(Boolean) as string[][];
  const groups = new Map<string, any[]>();
  for (const entry of all) for (const [type, value] of signatures(entry)) {
    const key = type + ':' + value;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const pairs = new Map<string, { left: any; right: any; reasons: Set<string> }>();
  const addPair = (first: any, second: any, reason: string) => {
    if (first.id === second.id) return;
    const [left, right] = first.id < second.id ? [first, second] : [second, first];
    const key = left.id + ':' + right.id;
    const item = pairs.get(key) || { left, right, reasons: new Set<string>() };
    item.reasons.add(reason);
    pairs.set(key, item);
  };
  if (q.id) {
    const source = records[0];
    for (const [signature, candidates] of groups) {
      if (!signatures(source).some(([type, value]) => signature === type + ':' + value)) continue;
      const reason = signature.startsWith('email:') ? 'Same normalized email' : signature.startsWith('phone:') ? 'Same normalized phone' : 'Same company and contact name';
      for (const candidate of candidates) addPair(source, candidate, reason);
    }
  } else {
    for (const [signature, candidates] of groups) {
      const reason = signature.startsWith('email:') ? 'Same normalized email' : signature.startsWith('phone:') ? 'Same normalized phone' : 'Same company and contact name';
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          addPair(candidates[i], candidates[j], reason);
          if (pairs.size > q.limit) break;
        }
        if (pairs.size > q.limit) break;
      }
      if (pairs.size > q.limit) break;
    }
  }
  const data = [...pairs.values()].slice(0, q.limit).map(({ left, right, reasons }) => ({ left, right, reasons: [...reasons] }));
  return { data, limit: q.limit, candidate_pairs_truncated: pairs.size > q.limit, scanned_records: Math.min(all.length, 5000), truncated: all.length >= 5000, definition: 'Deterministic normalized email, phone, or company and contact-name matches. Suggestions require human review and are never merged automatically.' };
}

export const crmImportPreviewInput = z.object({ rows: z.array(crmImportLeadRow).min(1).max(100) }).strict();
export async function crmImportPreview(a: Access, input: unknown) {
  await requireServices(a, ['crm']);
  const q = crmImportPreviewInput.parse(input);
  const existing = (await dbAll(`SELECT * FROM ac_crm_entries WHERE org_id=? AND environment=? AND kind='lead' AND status='open' AND ${json('stage')} NOT IN ('won','lost') AND merged_into IS NULL ORDER BY created_at DESC LIMIT 5000`, [a.org, a.environment])).map(entryData);
  const rows = q.rows.map((row, index) => {
    const reasons: string[] = [], matches: any[] = [];
    for (const prior of existing) {
      const why: string[] = [];
      if (norm(row.email) && norm(row.email) === norm(prior.email)) why.push('Same normalized email');
      if (phoneNorm(row.phone).length >= 7 && phoneNorm(row.phone) === phoneNorm(prior.phone)) why.push('Same normalized phone');
      if (norm(row.company) && norm(row.contact_name) && norm(row.company) === norm(prior.company) && norm(row.contact_name) === norm(prior.contact_name)) why.push('Same company and contact name');
      if (why.length) matches.push({ id: prior.id, title: prior.title, contact_name: prior.contact_name, company: prior.company, reasons: why });
    }
    for (let i = 0; i < index; i++) {
      const candidate = q.rows[i];
      if (norm(row.email) && norm(row.email) === norm(candidate.email)) reasons.push(`Same email as CSV row ${i + 2}`);
      if (phoneNorm(row.phone).length >= 7 && phoneNorm(row.phone) === phoneNorm(candidate.phone)) reasons.push(`Same phone as CSV row ${i + 2}`);
    }
    return { row: index + 2, potential_duplicates: matches, duplicate_csv_rows: reasons };
  });
  return { rows, valid_rows: rows.length, duplicate_candidates: rows.filter((r) => r.potential_duplicates.length || r.duplicate_csv_rows.length).length, existing_scan_truncated: existing.length >= 5000, decision: 'Duplicates are displayed for review. Import does not merge records.' };
}

export const crmMergeInput = z.object({
  primary_id: z.string().uuid(),
  records: z.array(z.object({ id: z.string().uuid(), expected_version: z.number().int().positive() }).strict()).min(2).max(20),
}).strict().superRefine((v, ctx) => {
  if (!v.records.some((r) => r.id === v.primary_id) || new Set(v.records.map((r) => r.id)).size !== v.records.length)
    ctx.addIssue({ code: 'custom', message: 'Select one primary record and unique secondary records' });
});

export async function mergeCrmEntries(a: Access, input: unknown, key: string) {
  const d = crmMergeInput.parse(input);
  return financialOperation(a, 'crm.merge', key, d, async () => {
    await requireServices(a, ['crm']);
    const source = new Map<string, any>();
    for (const requested of d.records) {
      const row = await dbGet('SELECT * FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?', [requested.id, a.org, a.environment]);
      if (!row) fail(404, 'A selected record is unavailable in this workspace');
      if (Number(row.version) !== requested.expected_version) fail(409, 'A selected record changed; reload the comparison');
      const e = entryData(row);
      if (!['lead', 'opportunity'].includes(e.kind) || e.status !== 'open' || e.merged_into) fail(409, 'Only active, unmerged leads or opportunities can be merged');
      source.set(e.id, e);
    }
    const primary = source.get(d.primary_id), rows = [...source.values()];
    if (rows.some((r) => r.kind !== primary.kind)) fail(409, 'Merge records of the same type');
    if (rows.some((r) => r.customer_id !== primary.customer_id)) fail(409, 'Records have different canonical customer links; resolve the customer conflict first');
    for (const field of ['quotation_id', 'order_id']) {
      const ids = new Set(rows.map((r) => r[field]).filter(Boolean));
      if (ids.size > 1) fail(409, `Records have incompatible linked ${field === 'order_id' ? 'sales orders' : 'quotations'}`);
    }
    const losers = rows.filter((r) => r.id !== primary.id), merged = { ...primary };
    for (const field of ['contact_name', 'company', 'email', 'phone', 'website', 'country', 'source_ref', 'business_need', 'qualification_notes'] as const)
      if (!merged[field]) merged[field] = losers.find((r) => r[field])?.[field] || '';
    merged.tags = [...new Set(rows.flatMap((r) => r.tags || []))];
    const { id: _id, version: _version, created_at: _created, updated_at: _updated, merged_into: _merged, ...primaryPayload } = primary;
    const { id: _newId, version: _newVersion, created_at: _newCreated, updated_at: _newUpdated, merged_into: _newMerged, ...mergedPayload } = merged;
    await editCrmEntry(a, primary.id, { expected_version: primary.version, entry: { ...primaryPayload, ...mergedPayload } }, `merge-primary:${hash(key)}`);
    const remapped: string[] = [];
    for (const loser of losers) {
      const children = await dbAll(`SELECT * FROM ac_crm_entries WHERE org_id=? AND environment=? AND kind IN ('follow_up','interaction') AND ${json('parent_entry_id')}=? ORDER BY created_at,id`, [a.org, a.environment, loser.id]);
      for (const childRow of children) {
        const child = entryData(childRow);
        const { id, version, created_at, updated_at, merged_into, ...payload } = child;
        await editCrmEntry(a, id, { expected_version: version, entry: { ...payload, parent_entry_id: primary.id } }, `merge-activity:${hash(key + ':' + id)}`, { allowParentReassignment: true });
        remapped.push(id);
      }
      const { id, version, created_at, updated_at, merged_into, ...payload } = loser;
      await editCrmEntry(a, id, { expected_version: version, entry: { ...payload, status: 'archived' } }, `merge-archive:${hash(key + ':' + id)}`);
      await dbRun('UPDATE ac_crm_entries SET merged_into=? WHERE id=? AND org_id=? AND environment=? AND version=?', [primary.id, loser.id, a.org, a.environment, version + 1]);
    }
    const result = { primary_id: primary.id, merged_ids: losers.map((r) => r.id), remapped_activity_ids: remapped, resolution: 'merged', retained_history: true };
    await dbRun('INSERT INTO ac_crm_merges(id,org_id,environment,operation_key,primary_id,losers,data,actor,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [randomUUID(), a.org, a.environment, key, primary.id, JSON.stringify(losers.map((r) => r.id)), JSON.stringify({ ...result, snapshots: rows }), a.actor, now()]);
    await audit(a.org, a.actor, 'crm.records_merged', primary.id);
    return result;
  });
}

const planStep = z.object({ id: z.string().uuid().optional(), type: z.enum(['task', 'call', 'meeting', 'note']), summary: z.string().trim().min(2).max(200), instructions: z.string().max(2000).default(''), offset_days: z.number().int().min(0).max(3650), assignment: z.enum(['plan_owner', 'target_owner', 'selected_member']).default('target_owner'), assigned_to: z.string().uuid().nullable().default(null) }).strict().superRefine((s, ctx) => { if (s.assignment === 'selected_member' && !s.assigned_to) ctx.addIssue({ code: 'custom', path: ['assigned_to'], message: 'Choose the assigned member' }); });
export const crmActivityPlanInput = z.object({ name: z.string().trim().min(2).max(120), description: z.string().max(2000).default(''), source: z.enum(['lead', 'opportunity', 'either']).default('either'), active: z.boolean().default(true), steps: z.array(planStep).min(1).max(50) }).strict();
const planFrom = (r: any) => ({ id: r.id, name: r.name, owner: r.owner, active: !!r.active, version: Number(r.version), ...JSON.parse(r.data), created_at: r.created_at, updated_at: r.updated_at });
async function planAccess(a: Access, owner: string) {
  if (a.actor === owner || ['owner', 'admin'].includes(a.role)) return;
  fail(403, 'Only the plan owner or a workspace administrator may edit this plan');
}
export async function crmActivityPlans(a: Access) {
  await requireServices(a, ['crm']);
  return { data: (await dbAll('SELECT * FROM ac_crm_activity_plans WHERE org_id=? AND environment=? ORDER BY active DESC,name,id', [a.org, a.environment])).map(planFrom), schedule_semantics: 'Offsets are calendar days from the selected plan date; activities are due at 09:00 Africa/Nairobi.' };
}
export async function saveCrmActivityPlan(a: Access, id: string | null, input: unknown, key: string) {
  const parsed: any = id ? crmActivityPlanInput.extend({ expected_version: z.number().int().positive() }).strict().parse(input) : crmActivityPlanInput.parse(input),
    { expected_version, ...d } = parsed, version = expected_version || 0;
  return financialOperation(a, 'crm.plan:' + (id || 'new'), key, { ...d, version }, async () => {
    await requireServices(a, ['crm']);
    const steps = (d.steps as z.infer<typeof crmActivityPlanInput>['steps']).map((s, i) => ({ ...s, id: s.id || randomUUID(), order: i }));
    for (const step of steps) {
      const member = step.assigned_to || (step.assignment === 'plan_owner' ? a.actor : null);
      if (member) { const m = await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?', [a.org, member]); if (!m || !permitted(m.role, 'operations')) fail(400, 'Plan assignees must be current operational members'); }
    }
    const data = JSON.stringify({ description: d.description, source: d.source, steps });
    if (!id) {
      const planId = randomUUID(), at = now();
      await dbRun('INSERT INTO ac_crm_activity_plans(id,org_id,environment,name,owner,active,data,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [planId, a.org, a.environment, d.name, a.actor, d.active ? 1 : 0, data, 1, at, at]);
      await audit(a.org, a.actor, 'crm.activity_plan_created', planId);
      return planFrom(await dbGet('SELECT * FROM ac_crm_activity_plans WHERE id=? AND org_id=? AND environment=?', [planId, a.org, a.environment]));
    }
    const old = await dbGet('SELECT * FROM ac_crm_activity_plans WHERE id=? AND org_id=? AND environment=?', [id, a.org, a.environment]);
    if (!old) fail(404, 'Activity plan not found');
    await planAccess(a, old.owner);
    if (Number(old.version) !== version) fail(409, 'Activity plan changed; reload before editing');
    const at = now();
    await dbRun('UPDATE ac_crm_activity_plans SET name=?,active=?,data=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND environment=? AND version=?', [d.name, d.active ? 1 : 0, data, at, id, a.org, a.environment, version]);
    await audit(a.org, a.actor, 'crm.activity_plan_updated', id);
    return planFrom(await dbGet('SELECT * FROM ac_crm_activity_plans WHERE id=? AND org_id=? AND environment=?', [id, a.org, a.environment]));
  });
}
export async function duplicateCrmActivityPlan(a: Access, id: string, key: string) {
  const old = await dbGet('SELECT * FROM ac_crm_activity_plans WHERE id=? AND org_id=? AND environment=?', [id, a.org, a.environment]);
  if (!old) fail(404, 'Activity plan not found');
  const plan = planFrom(old); plan.name = plan.name + ' (copy)'; plan.active = false; plan.steps = plan.steps.map(({ order: _order, ...step }: any) => step); delete plan.id; delete plan.owner; delete plan.version; delete plan.created_at; delete plan.updated_at;
  return saveCrmActivityPlan(a, null, plan, key);
}
export const crmActivityPlanApplyInput = z.object({ plan_id: z.string().uuid(), expected_plan_version: z.number().int().positive(), target_id: z.string().uuid(), plan_date: z.string().date(), assigned_to: z.string().uuid().nullable().default(null), execution_key: z.string().trim().min(8).max(200) }).strict();
export async function applyCrmActivityPlan(a: Access, input: unknown, key: string) {
  const d = crmActivityPlanApplyInput.parse(input);
  return financialOperation(a, 'crm.plan.apply:' + hash(d.execution_key), key, d, async () => {
    await requireServices(a, ['crm']);
    const prior = await dbGet('SELECT response FROM ac_crm_plan_executions WHERE org_id=? AND environment=? AND execution_key=?', [a.org, a.environment, d.execution_key]);
    if (prior) return JSON.parse(prior.response);
    const planRow = await dbGet('SELECT * FROM ac_crm_activity_plans WHERE id=? AND org_id=? AND environment=?', [d.plan_id, a.org, a.environment]);
    if (!planRow || !planRow.active) fail(409, 'Choose an active activity plan');
    if (Number(planRow.version) !== d.expected_plan_version) fail(409, 'Activity plan changed; reload its preview');
    const targetRow = await dbGet('SELECT * FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?', [d.target_id, a.org, a.environment]);
    if (!targetRow || targetRow.status !== 'open') fail(404, 'Choose an active CRM lead or opportunity');
    const target = entryData(targetRow), plan = planFrom(planRow);
    if (!['lead', 'opportunity'].includes(target.kind) || ['won', 'lost'].includes(target.stage) || (plan.source !== 'either' && plan.source !== target.kind)) fail(400, 'This activity plan does not apply to the selected record');
    const fallback = d.assigned_to || target.assigned_to || a.actor, activities = [];
    for (const step of plan.steps) {
      const user = step.assignment === 'plan_owner' ? plan.owner : step.assignment === 'selected_member' ? step.assigned_to : fallback;
      const member = await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?', [a.org, user]);
      if (!member || !permitted(member.role, 'operations')) fail(400, 'A planned activity assignee is no longer eligible');
      const [year, month, day] = d.plan_date.split('-').map(Number),
        localDueDate = new Date(Date.UTC(year, month - 1, day + step.offset_days)).toISOString().slice(0, 10),
        due = new Date(`${localDueDate}T09:00:00+03:00`).toISOString();
      activities.push(await createCrmEntry(a, { kind: 'follow_up', customer_id: target.customer_id, parent_entry_id: target.id, title: step.summary, notes: step.instructions, activity_type: step.type, assigned_to: user, due_at: due, source: 'manual' }, `plan:${hash(d.execution_key)}:${step.id}`));
    }
    const result = { execution_key: d.execution_key, plan_id: plan.id, plan_version: plan.version, target_id: target.id, activities };
    await dbRun('INSERT INTO ac_crm_plan_executions(id,org_id,environment,execution_key,plan_id,target_id,plan_version,response,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [randomUUID(), a.org, a.environment, d.execution_key, plan.id, target.id, plan.version, JSON.stringify(result), now()]);
    await audit(a.org, a.actor, 'crm.activity_plan_applied', target.id);
    return result;
  });
}

const reportQuery = z.object({ currency: currencySchema.optional(), from: z.string().date().optional(), to: z.string().date().optional(), group_by: z.enum(['close_month', 'stage', 'team', 'assignee', 'currency', 'source', 'outcome']).default('close_month') }).strict();
export async function crmForecastBoard(a: Access, input: unknown) {
  await requireServices(a, ['crm']);
  const q = z.object({ currency: currencySchema.optional(), limit: z.coerce.number().int().min(1).max(200).default(200), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().parse(input);
  const bucket = `CASE WHEN ${json('expected_close_on')} IS NULL OR ${json('expected_close_on')}='' THEN 'no_date' WHEN ${json('expected_close_on')}<? THEN 'overdue' ELSE SUBSTR(${json('expected_close_on')},1,7) END`, filterParams: any[] = [a.org, a.environment], today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const where = "org_id=? AND environment=? AND kind='opportunity' AND status NOT IN ('archived','cancelled') AND merged_into IS NULL";
  if (q.currency) { filterParams.push(q.currency); }
  const currencyClause = q.currency ? ` AND ${json('currency')}=?` : '', amount = `CAST(COALESCE(${json('amount_minor')},'0') AS BIGINT)`, stage = json('stage'), probability = `CAST(COALESCE(${json('probability_bps')},'0') AS BIGINT)`, open = `${stage} NOT IN ('won','lost')`;
  const groups = await dbAll(`SELECT ${bucket} AS bucket,${json('currency')} AS currency,COUNT(*) AS count,SUM(CASE WHEN ${open} THEN 1 ELSE 0 END) AS open_count,SUM(CASE WHEN ${open} THEN ${amount} ELSE 0 END) AS open_amount_minor,SUM(CASE WHEN ${open} AND ${json('probability_bps')} IS NOT NULL THEN CAST(${amount}*${probability}/10000 AS BIGINT) ELSE 0 END) AS weighted_open_minor,SUM(CASE WHEN ${open} AND ${json('probability_bps')} IS NULL THEN 1 ELSE 0 END) AS missing_probability FROM ac_crm_entries WHERE ${where}${currencyClause} GROUP BY 1,2 ORDER BY 1,2`, [today, ...filterParams]);
  const records = (await dbAll(`SELECT * FROM ac_crm_entries WHERE ${where}${currencyClause} ORDER BY ${json('expected_close_on')},id LIMIT ? OFFSET ?`, [...filterParams, q.limit, q.offset])).map(entryData);
  return { groups: groups.map((g: any) => ({ ...g, count: Number(g.count), open_count: Number(g.open_count), open_amount_minor: Number(g.open_amount_minor || 0), weighted_open_minor: Number(g.weighted_open_minor || 0), missing_probability: Number(g.missing_probability || 0) })), records, limit: q.limit, offset: q.offset, currency_filter: q.currency || null, coverage: 'SQL group totals cover every active, unmerged opportunity in the workspace; the opportunity card page is bounded and paginated. Amounts are forecasts, never recognized revenue. Currencies are not converted.' };
}

export async function crmForecastReport(a: Access, input: unknown, mode: 'forecast' | 'pipeline' = 'forecast') {
  await requireServices(a, ['crm']);
  const q = reportQuery.parse(input), field = q.group_by;
  const groupExpr = field === 'close_month' ? `CASE WHEN ${json('expected_close_on')} IS NULL OR ${json('expected_close_on')}='' THEN 'No expected close date' ELSE SUBSTR(${json('expected_close_on')},1,7) END` : field === 'stage' ? json('stage') : field === 'team' ? json('team_id') : field === 'assignee' ? 'assigned_to' : field === 'currency' ? json('currency') : field === 'source' ? json('source') : `CASE WHEN ${json('stage')}='won' THEN 'won' WHEN ${json('stage')}='lost' THEN 'lost' ELSE 'open' END`;
  const predicates = ['org_id=?', 'environment=?', "kind='opportunity'", "status NOT IN ('archived','cancelled')", 'merged_into IS NULL'], params: any[] = [a.org, a.environment];
  if (q.currency && field !== 'currency') { predicates.push(`${json('currency')}=?`); params.push(q.currency); }
  if (field === 'close_month' && q.from) { predicates.push(`${json('expected_close_on')}>=?`); params.push(q.from); }
  if (field === 'close_month' && q.to) { predicates.push(`${json('expected_close_on')}<=?`); params.push(q.to); }
  const curr = json('currency'), amount = `CAST(COALESCE(${json('amount_minor')},'0') AS BIGINT)`, probability = `CAST(COALESCE(${json('probability_bps')},'0') AS BIGINT)`, stage = json('stage'), open = `${stage} NOT IN ('won','lost')`;
  const rows = await dbAll(`SELECT ${groupExpr} AS bucket,${curr} AS currency,COUNT(*) AS opportunity_count,SUM(CASE WHEN ${open} THEN 1 ELSE 0 END) AS open_count,SUM(CASE WHEN ${stage}='won' THEN 1 ELSE 0 END) AS won_count,SUM(CASE WHEN ${stage}='lost' THEN 1 ELSE 0 END) AS lost_count,SUM(CASE WHEN ${open} THEN ${amount} ELSE 0 END) AS open_amount_minor,SUM(CASE WHEN ${open} AND ${json('probability_bps')} IS NOT NULL THEN CAST(${amount}*${probability}/10000 AS BIGINT) ELSE 0 END) AS weighted_open_minor,SUM(CASE WHEN ${stage}='won' THEN ${amount} ELSE 0 END) AS won_amount_minor,SUM(CASE WHEN ${stage}='lost' THEN ${amount} ELSE 0 END) AS lost_amount_minor,SUM(CASE WHEN ${open} AND ${json('probability_bps')} IS NULL THEN 1 ELSE 0 END) AS missing_probability FROM ac_crm_entries WHERE ${predicates.join(' AND ')} GROUP BY 1,2 ORDER BY 1,2`, params);
  const labels = field === 'team'
    ? new Map((await crmConfiguration(a)).teams.map((team) => [team.id, team.name]))
    : field === 'assignee'
      ? new Map((await dbAll('SELECT u.id,COALESCE(NULLIF(p.display_name,\'\'),u.email) AS label FROM ac_memberships m JOIN ac_users u ON u.id=m.user_id LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE m.org_id=?', [a.org])).map((member) => [member.id, member.label]))
      : null;
  const groups = rows.map((r) => ({ ...r, bucket: labels ? (r.bucket ? labels.get(String(r.bucket)) || (field === 'team' ? 'Former or unknown team' : 'Former workspace member') : 'Unassigned') : r.bucket, opportunity_count: Number(r.opportunity_count), open_count: Number(r.open_count), won_count: Number(r.won_count), lost_count: Number(r.lost_count), open_amount_minor: Number(r.open_amount_minor || 0), weighted_open_minor: Number(r.weighted_open_minor || 0), won_amount_minor: Number(r.won_amount_minor || 0), lost_amount_minor: Number(r.lost_amount_minor || 0), missing_probability: Number(r.missing_probability || 0) }));
  const totals_by_currency = groups.reduce((all: Record<string, any>, r: any) => {
    const total = all[r.currency] ||= { currency: r.currency, opportunity_count: 0, open_count: 0, won_count: 0, lost_count: 0, open_amount_minor: 0, weighted_open_minor: 0, won_amount_minor: 0, lost_amount_minor: 0, missing_probability: 0 };
    for (const k of ['opportunity_count','open_count','won_count','lost_count','open_amount_minor','weighted_open_minor','won_amount_minor','lost_amount_minor','missing_probability']) total[k] += Number(r[k] || 0);
    return all;
  }, {});
  return { mode, group_by: field, filters: q, groups, totals_by_currency: Object.values(totals_by_currency), totals: q.currency ? Object.values(totals_by_currency)[0] || null : null, timezone: 'Africa/Nairobi', definition: mode === 'pipeline' ? 'Current opportunity-stage snapshot grouped by the selected dimension; this is not a historical stage reconstruction.' : 'Active CRM opportunities grouped by expected closing date or selected dimension. Weighted open amounts use only explicitly recorded probability. Values are estimates, not recognized revenue. Totals are separate for each recorded currency.', source: 'all matching workspace CRM records; aggregated in SQL' };
}

export async function crmForecastPivot(a: Access, input: unknown) {
  await requireServices(a, ['crm']);
  const q = z.object({ row_by: z.enum(['stage','team','assignee','currency','close_month','source','outcome']).default('stage'), column_by: z.enum(['stage','team','assignee','currency','close_month','source','outcome']).default('close_month'), currency: currencySchema.optional() }).strict().parse(input);
  if (q.row_by === q.column_by) fail(400, 'Choose two different pivot dimensions');
  const expr = (d: string) => d === 'team' ? json('team_id') : d === 'assignee' ? 'assigned_to' : d === 'currency' ? json('currency') : d === 'close_month' ? `CASE WHEN ${json('expected_close_on')} IS NULL OR ${json('expected_close_on')}='' THEN 'No expected close date' ELSE SUBSTR(${json('expected_close_on')},1,7) END` : d === 'outcome' ? `CASE WHEN ${json('stage')}='won' THEN 'won' WHEN ${json('stage')}='lost' THEN 'lost' ELSE 'open' END` : json('stage');
  const predicates = ['org_id=?','environment=?',"kind='opportunity'","status NOT IN ('archived','cancelled')",'merged_into IS NULL'], params: any[] = [a.org,a.environment];
  if (q.currency && q.row_by !== 'currency' && q.column_by !== 'currency') { predicates.push(`${json('currency')}=?`); params.push(q.currency); }
  const row = expr(q.row_by), col = expr(q.column_by), stage = json('stage'), amt = `CAST(COALESCE(${json('amount_minor')},'0') AS BIGINT)`, prob = `CAST(COALESCE(${json('probability_bps')},'0') AS BIGINT)`, open = `${stage} NOT IN ('won','lost')`, curr = json('currency');
  const rows = await dbAll(`SELECT ${row} AS row_key,${col} AS column_key,${curr} AS currency,COUNT(*) AS opportunity_count,SUM(CASE WHEN ${open} THEN ${amt} ELSE 0 END) AS open_amount_minor,SUM(CASE WHEN ${stage}='won' THEN 1 ELSE 0 END) AS won_count,SUM(CASE WHEN ${stage}='lost' THEN 1 ELSE 0 END) AS lost_count,SUM(CASE WHEN ${open} AND ${json('probability_bps')} IS NOT NULL THEN CAST(${amt}*${prob}/10000 AS BIGINT) ELSE 0 END) AS weighted_open_minor FROM ac_crm_entries WHERE ${predicates.join(' AND ')} GROUP BY 1,2,3 ORDER BY 1,2,3`, params);
  const [rowLabels, columnLabels] = await Promise.all([q.row_by === 'team' ? crmConfiguration(a).then((config) => new Map(config.teams.map((team) => [team.id, team.name]))) : q.row_by === 'assignee' ? dbAll('SELECT u.id,COALESCE(NULLIF(p.display_name,\'\'),u.email) AS label FROM ac_memberships m JOIN ac_users u ON u.id=m.user_id LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE m.org_id=?', [a.org]).then((members) => new Map(members.map((member) => [member.id, member.label]))) : null, q.column_by === 'team' ? crmConfiguration(a).then((config) => new Map(config.teams.map((team) => [team.id, team.name]))) : q.column_by === 'assignee' ? dbAll('SELECT u.id,COALESCE(NULLIF(p.display_name,\'\'),u.email) AS label FROM ac_memberships m JOIN ac_users u ON u.id=m.user_id LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE m.org_id=?', [a.org]).then((members) => new Map(members.map((member) => [member.id, member.label]))) : null]);
  const numericFields = ['opportunity_count','open_amount_minor','won_count','lost_count','weighted_open_minor'];
  const cells = [...rows.reduce((all, r) => {
    const rowKey = rowLabels ? (r.row_key ? rowLabels.get(String(r.row_key)) || (q.row_by === 'team' ? 'Former or unknown team' : 'Former workspace member') : 'Unassigned') : r.row_key;
    const columnKey = columnLabels ? (r.column_key ? columnLabels.get(String(r.column_key)) || (q.column_by === 'team' ? 'Former or unknown team' : 'Former workspace member') : 'Unassigned') : r.column_key;
    const key = JSON.stringify([rowKey, columnKey, r.currency]), previous = all.get(key) || { row_key: rowKey, column_key: columnKey, currency: r.currency, ...Object.fromEntries(numericFields.map((field) => [field, 0])) };
    for (const field of numericFields) previous[field] += Number(r[field] || 0);
    all.set(key, previous); return all;
  }, new Map<string, any>()).values()];
  const by = (key: 'row_key' | 'column_key') => {
    const totals = new Map<string, any>();
    for (const cell of cells as any[]) {
      const value = cell[key] ?? 'Unassigned', totalKey = String(value) + ':' + String(cell.currency);
      const total = totals.get(totalKey) || { [key]: value, currency: cell.currency, opportunity_count: 0, open_amount_minor: 0, won_count: 0, lost_count: 0, weighted_open_minor: 0 };
      for (const field of ['opportunity_count','open_amount_minor','won_count','lost_count','weighted_open_minor']) total[field] += cell[field];
      totals.set(totalKey, total);
    }
    return [...totals.values()];
  };
  const grand_totals = by('row_key').reduce((totals: any[], item: any) => {
    const existing = totals.find((total) => total.currency === item.currency);
    if (existing) for (const field of ['opportunity_count','open_amount_minor','won_count','lost_count','weighted_open_minor']) existing[field] += item[field];
    else totals.push({ currency: item.currency, opportunity_count: item.opportunity_count, open_amount_minor: item.open_amount_minor, won_count: item.won_count, lost_count: item.lost_count, weighted_open_minor: item.weighted_open_minor });
    return totals;
  }, []);
  return { row_by: q.row_by, column_by: q.column_by, currency_filter: q.currency || null, cells, row_totals: by('row_key'), column_totals: by('column_key'), grand_totals, definition: 'All matching records are aggregated by the server. Amounts stay in their recorded currency; select Currency as a grouping or filter to one currency.' };
}
