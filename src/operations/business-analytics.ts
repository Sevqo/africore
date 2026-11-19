import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun, dbTransaction, isPostgres } from '../db/adapter';
import { type Access, audit, fail } from '../platform/auth';
import { permitted } from '../platform/domain';
import { now } from '../platform/crypto';
import { requireServices, workspaceKind } from '../marketplace/engine';
import { financialSnapshot, analyticsQuery } from './intelligence';
import { inventoryOverview } from '../inventory/service';
export function analyticsCSV(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let text = String(value ?? '');
          if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(value)) text = `'${text}`;
          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
}
function localDate(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function localMidnight(date: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number),
    wallTime = Date.UTC(year, month - 1, day);
  let candidate = wallTime;
  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(candidate));
    const value = (type: string) => Number(parts.find((entry) => entry.type === type)?.value || 0),
      represented = Date.UTC(
        value('year'),
        value('month') - 1,
        value('day'),
        value('hour'),
        value('minute'),
        value('second'),
      );
    const next = candidate + wallTime - represented;
    if (next === candidate) break;
    candidate = next;
  }
  return new Date(candidate).toISOString();
}
function shiftLocalDate(date: string, amount: number) {
  const [year, month, day] = date.split('-').map(Number),
    value = new Date(Date.UTC(year, month - 1, day + amount));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}
async function workspaceTimezone(a: Access) {
  const row = await dbGet('SELECT profile FROM ac_organizations WHERE id=?', [a.org]),
    actor = a.api
      ? null
      : await dbGet('SELECT timezone FROM ac_profiles WHERE user_id=?', [a.actor]);
  let profile: any = {};
  try {
    profile = JSON.parse(row?.profile || '{}');
  } catch {
    profile = {};
  }
  const zone = profile.timezone || actor?.timezone || 'Africa/Nairobi';
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return 'Africa/Nairobi';
  }
}
function analyticsWindow(input: unknown, timeZone = 'Africa/Nairobi') {
  const q = analyticsQuery.parse(input),
    today = localDate(new Date(), timeZone),
    to = q.to || today,
    from = q.from || (q.range === 'all' ? '1970-01-01' : shiftLocalDate(to, -89));
  if (
    from > to ||
    to > today ||
    (q.range !== 'all' && Date.parse(to) - Date.parse(from) > 366 * 86400000)
  )
    fail(400, 'Choose a historical range of at most 366 days, or all recorded history');
  return {
    q,
    to,
    from,
    timeZone,
    startAt: localMidnight(from, timeZone),
    endAt: localMidnight(shiftLocalDate(to, 1), timeZone),
  };
}
function bucketRows(from: string, to: string, timeZone: string, granularity: 'day' | 'month') {
  if (granularity === 'day' && to >= '1971-01-01' && from === '1970-01-01')
    fail(400, 'Choose a date range before grouping all history by day');
  const result: { start: string; end: string; label: string }[] = [];
  let cursor = granularity === 'month' ? `${from.slice(0, 7)}-01` : from;
  while (cursor <= to) {
    const next =
        granularity === 'month'
          ? (() => {
              const [year, month] = cursor.split('-').map(Number),
                date = new Date(Date.UTC(year, month, 1));
              return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
            })()
          : shiftLocalDate(cursor, 1),
      bucketStart = cursor < from ? from : cursor,
      bucketEnd = next > shiftLocalDate(to, 1) ? shiftLocalDate(to, 1) : next;
    result.push({
      start: localMidnight(bucketStart, timeZone),
      end: localMidnight(bucketEnd, timeZone),
      label: granularity === 'month' ? cursor.slice(0, 7) : cursor,
    });
    cursor = next;
  }
  if (result.length > 1000) fail(400, 'Choose a shorter date range for this report');
  return result;
}
async function dailyActivity(
  a: Access,
  from: string,
  to: string,
  timeZone: string,
  status?: string,
) {
  const buckets = bucketRows(from, to, timeZone, 'day'),
    values = buckets.map(() => '(?,?,?)').join(','),
    parameters = buckets.flatMap((bucket) => [bucket.start, bucket.end, bucket.label]),
    orderStatus = isPostgres ? "r.data::jsonb->>'status'" : "json_extract(r.data,'$.status')",
    customerStatus = isPostgres
      ? "COALESCE(r.data::jsonb->>'status','active')"
      : "COALESCE(json_extract(r.data,'$.status'),'active')",
    orderFilter = status
      ? status === '__unclassified__'
        ? ` AND ${orderStatus} IS NULL`
        : ` AND ${orderStatus}=?`
      : '',
    customerFilter = status
      ? status === '__unclassified__'
        ? ` AND ${isPostgres ? "r.data::jsonb->>'status'" : "json_extract(r.data,'$.status')"} IS NULL`
        : ` AND ${customerStatus}=?`
      : '',
    rows = await dbAll(
      `WITH buckets(start_at,end_at,label) AS (VALUES ${values})
       SELECT 'orders' AS kind,b.label AS date,COUNT(r.id) AS records FROM buckets b
       LEFT JOIN ac_records r ON r.org_id=? AND r.environment=? AND r.kind='orders'${orderFilter} AND r.created_at>=b.start_at AND r.created_at<b.end_at
       GROUP BY b.label
       UNION ALL
       SELECT 'customers' AS kind,b.label AS date,COUNT(r.id) AS records FROM buckets b
       LEFT JOIN ac_records r ON r.org_id=? AND r.environment=? AND r.kind='customers'${customerFilter} AND r.created_at>=b.start_at AND r.created_at<b.end_at
       GROUP BY b.label ORDER BY date`,
      [
        ...parameters,
        a.org,
        a.environment,
        ...(status && status !== '__unclassified__' ? [status] : []),
        a.org,
        a.environment,
        ...(status && status !== '__unclassified__' ? [status] : []),
      ],
    );
  return rows.map((row) => ({ date: row.date, kind: row.kind, count: Number(row.records) }));
}
async function readable(a: Access, id: string) {
  try {
    await requireServices(a, [id], true);
    return true;
  } catch (error) {
    if ((error as any).status === 402) return false;
    throw error;
  }
}
export const savedReportInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    configuration: z
      .object({
        query: analyticsQuery,
        widgets: z
          .array(z.enum(['financial', 'sales', 'customers', 'inventory', 'automations']))
          .min(1)
          .max(4),
        exploration: z
          .object({
            metric: z.enum([
              'orders.count',
              'customers.count',
              'crm.leads',
              'sales.quotations',
              'inventory.movements',
              'inventory.low_stock',
              'financial.collections',
              'financial.expenses',
              'financial.net_movement',
              'financial.receivables',
              'automations.rules',
              'automations.runs',
            ]),
            group_by: z.enum(['day', 'month', 'status', 'currency', 'snapshot']),
            chart: z.enum(['kpi', 'line', 'bar', 'pie', 'table']),
            view: z.enum(['graph', 'pivot', 'table']),
            source: z.enum(['orders', 'customers', 'crm', 'sales', 'inventory', 'financial', 'automations']),
            row_by: z.enum(['day', 'month', 'status', 'currency', 'snapshot']).optional(),
            column_by: z.enum(['day', 'month', 'status', 'currency', 'snapshot']).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
export async function businessAnalytics(a: Access, input: unknown) {
  if ((await workspaceKind(a.org)) === 'business') await requireServices(a, ['intelligence'], true);
  const timeZone = await workspaceTimezone(a),
    { q, to, from, startAt, endAt } = analyticsWindow(input, timeZone),
    kind = await workspaceKind(a.org),
    financial =
      permitted(a.role, 'finance') && (!q.source || q.source === 'financial')
        ? await financialSnapshot(a, q, to)
        : null;
  const sources = {
    orders: await readable(a, 'orders'),
    customers:
      (await readable(a, 'customers')) ||
      (await readable(a, 'invoicing')) ||
      (await readable(a, 'orders')) ||
      (await readable(a, 'crm')) ||
      (await readable(a, 'sales')),
    inventory: await readable(a, 'inventory'),
    crm: await readable(a, 'crm'),
    financial: !!financial,
    automations: await readable(a, 'automations'),
  };
  const series = (await dailyActivity(a, from, to, timeZone, q.status)).filter((r) =>
    (r.kind === 'orders' ? sources.orders : sources.customers) && (!q.source || q.source === r.kind),
  );
  const stockBuckets = bucketRows(from, to, timeZone, 'day'),
    stockValues = stockBuckets.map(() => '(?,?,?)').join(','),
    stockParams = stockBuckets.flatMap((bucket) => [bucket.start, bucket.end, bucket.label]),
    stockSeries = sources.inventory && (!q.source || q.source === 'inventory')
      ? await dbAll(
          `WITH buckets(start_at,end_at,label) AS (VALUES ${stockValues})
           SELECT b.label AS date,m.kind,COUNT(m.id) AS operations FROM buckets b
           LEFT JOIN ac_stock_movements m ON m.org_id=? AND m.environment=? AND m.created_at>=b.start_at AND m.created_at<b.end_at
           GROUP BY b.label,m.kind ORDER BY b.label,m.kind`,
          [...stockParams, a.org, a.environment],
        )
      : null;
  const inventory = sources.inventory && (!q.source || q.source === 'inventory') ? await inventoryOverview(a) : null;
  const orderStatus = isPostgres ? "(data::jsonb->>'status')" : "json_extract(data,'$.status')";
  const statusCondition = q.status
    ? q.status === '__unclassified__'
      ? ' AND ' + orderStatus + ' IS NULL'
      : ' AND ' + orderStatus + '=?'
    : '';
  const orders = sources.orders && (!q.source || q.source === 'orders')
    ? (
        await dbAll(
          'SELECT ' +
            orderStatus +
            " AS status,COUNT(*) AS count FROM ac_records WHERE org_id=? AND environment=? AND kind='orders' AND created_at>=? AND created_at<?" +
            statusCondition +
            ' GROUP BY ' +
            orderStatus,
          [
            a.org,
            a.environment,
            startAt,
            endAt,
            ...(q.status && q.status !== '__unclassified__' ? [q.status] : []),
          ],
        )
      ).map((row) => ({ ...row, count: Number(row.count) }))
    : null;
  return {
    kind,
    period: { from, to },
    currency: q.currency,
    source_filter: q.source || null,
    financial,
    sources,
    series,
    orders,
    inventory: inventory
      ? {
          total_products: inventory.total_products,
          covered_products: inventory.covered_products,
          truncated: inventory.truncated,
          low_stock: inventory.low_stock,
          out_of_stock: inventory.out_of_stock,
          valuation: null,
          valuation_note: inventory.valuation_note,
        }
      : null,
    stock_series: stockSeries
      ? stockSeries
          .filter((row) => row.kind != null)
          .map((row) => ({ ...row, operations: Number(row.operations) }))
      : null,
    definitions: {
      sales:
        'Canonical order counts by recorded creation date and current status, not recognized revenue.',
      customers: 'Canonical customer creation counts, not invented acquisition or churn.',
      inventory:
        'Physical movement row counts; transfers contain an outgoing and incoming row. No mixed-unit quantity sum or unqualified valuation.',
      financial:
        'Existing canonical financial snapshot; source assurance, coverage, returns and currency rules apply.',
    },
    missing_sources: Object.entries(sources)
      .filter(([, available]) => !available)
      .map(([source]) => source),
    refreshed_at: now(),
    timezone: timeZone,
    classification:
      'Derived from authorized persisted records; current inventory is an as-of snapshot separate from historical movement counts.',
  };
}
export async function businessAnalyticsExport(a: Access, input: unknown) {
  const report = await businessAnalytics(a, input),
    rows: unknown[][] = [
      ['Section', 'Metric', 'Value', 'Unit', 'From', 'To', 'Timezone'],
    ];
  if (report.financial?.totals)
    for (const [metric, value] of Object.entries(report.financial.totals))
      if (typeof value === 'number')
        rows.push(['Finance', metric, value, report.currency, report.period.from, report.period.to, report.timezone]);
  for (const item of report.series)
    rows.push(['Activity', `${item.kind}_created`, item.count, 'records', item.date, item.date, report.timezone]);
  for (const item of report.orders || [])
    rows.push(['Orders', `status:${item.status || 'unclassified'}`, item.count, 'records', report.period.from, report.period.to, report.timezone]);
  for (const item of report.stock_series || [])
    rows.push(['Inventory', `movement:${item.kind}`, item.operations, 'rows', item.date, item.date, report.timezone]);
  if (report.inventory)
    for (const [metric, value] of Object.entries({
      total_products: report.inventory.total_products,
      low_stock: report.inventory.low_stock,
      out_of_stock: report.inventory.out_of_stock,
    }))
      rows.push(['Inventory as of refresh', metric, value as number, 'products', report.period.to, report.period.to, report.timezone]);
  rows.push(['Metadata', 'classification', report.classification, '', report.period.from, report.period.to, report.timezone]);
  for (const [source, available] of Object.entries(report.sources))
    rows.push(['Coverage', source, available ? 'available' : 'unavailable_or_restricted', '', report.period.from, report.period.to, report.timezone]);
  return { filename: 'africore-analytics-dashboard.csv', content_type: 'text/csv', content: analyticsCSV(rows) };
}
export async function savedReports(a: Access) {
  if (a.api) fail(403, 'Personal report preferences require a human session');
  return (
    await dbAll(
      'SELECT * FROM ac_saved_reports WHERE org_id=? AND environment=? AND actor=? ORDER BY updated_at DESC,id DESC LIMIT 100',
      [a.org, a.environment, a.actor],
    )
  ).map((row) => ({ ...row, configuration: JSON.parse(row.configuration) }));
}
export async function saveReport(a: Access, input: unknown) {
  if (a.api) fail(403, 'Human member required');
  const d = savedReportInput.parse(input);
  if ((await workspaceKind(a.org)) === 'business') await requireServices(a, ['intelligence']);
  if (d.configuration.exploration) {
    const exploration = d.configuration.exploration,
      definition = definitions[exploration.metric];
    if (!definition || definition.source !== exploration.source)
      fail(400, 'Saved exploration source does not match its metric');
    if (!(await canReadMetric(a, exploration.metric)))
      fail(403, 'You cannot save this analytics measure');
    if (d.configuration.query.source && d.configuration.query.source !== exploration.source)
      fail(400, 'The selected source filter excludes this saved measure');
    const groups: string[] = definition.source === 'financial' || definition.snapshot
      ? ['snapshot']
      : [
          'day',
          'month',
          ...(definition.status ? ['status'] : []),
          ...(definition.currency ? ['currency'] : []),
        ];
    if (definition.source !== 'financial' && !groups.includes(exploration.group_by))
      fail(400, 'Saved exploration uses an unsupported grouping');
    const allowedCharts: string[] = definition.source === 'financial' || definition.snapshot
      ? ['kpi']
      : ['kpi', 'line', 'bar', 'pie', 'pivot', 'table'];
    if (exploration.view === 'graph' && !allowedCharts.includes(exploration.chart))
      fail(400, 'Saved exploration uses an unsupported chart');
    if (exploration.view === 'pivot') {
      if (
        !exploration.row_by ||
        !exploration.column_by ||
        exploration.row_by === exploration.column_by ||
        !groups.includes(exploration.row_by) ||
        !groups.includes(exploration.column_by)
      )
        fail(400, 'Saved pivot must use two distinct supported dimensions');
    }
  }
  return dbTransaction(async () => {
    await dbRun('UPDATE ac_organizations SET name=name WHERE id=?', [a.org]);
    if (
      Number(
        (
          await dbGet(
            'SELECT COUNT(*) AS n FROM ac_saved_reports WHERE org_id=? AND environment=? AND actor=?',
            [a.org, a.environment, a.actor],
          )
        ).n,
      ) >= 100
    )
      fail(409, 'Remove an old saved report before adding another');
    const id = randomUUID(),
      at = now();
    await dbRun(
      'INSERT INTO ac_saved_reports(id,org_id,environment,actor,name,configuration,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, a.org, a.environment, a.actor, d.name, JSON.stringify(d.configuration), at, at],
    );
    await audit(a.org, a.actor, 'analytics.report_saved', id);
    return { id, ...d };
  });
}
export async function removeReport(a: Access, id: string) {
  if (a.api) fail(403, 'Human member required');
  const changed = await dbRun(
    'DELETE FROM ac_saved_reports WHERE id=? AND org_id=? AND environment=? AND actor=?',
    [id, a.org, a.environment, a.actor],
  );
  if (!changed.changes) fail(404, 'Saved report not found');
  await audit(a.org, a.actor, 'analytics.saved_report_removed', id);
  return { removed: true };
}

const reportMetric = z.enum([
    'orders.count',
    'customers.count',
    'crm.leads',
    'sales.quotations',
    'inventory.movements',
    'inventory.low_stock',
    'financial.collections',
    'financial.expenses',
    'financial.net_movement',
    'financial.receivables',
    'automations.rules',
    'automations.runs',
  ]),
  reportGroup = z.enum(['day', 'month', 'status', 'currency', 'snapshot']),
  reportInput = analyticsQuery.extend({
    metric: reportMetric,
    group_by: reportGroup.default('month'),
  }).strict();
const definitions: Record<string, any> = {
  'orders.count': {
    label: 'Orders created',
    source: 'orders',
    table: 'ac_records',
    kind: 'orders',
    status: true,
    currency: true,
    service: ['orders'],
    drill: 'orders',
    definition: 'Count of canonical orders created in the selected local-date window. Not revenue.',
  },
  'customers.count': {
    label: 'Customers created',
    source: 'customers',
    table: 'ac_records',
    kind: 'customers',
    status: true,
    currency: false,
    service: ['customers', 'invoicing', 'orders', 'crm', 'sales'],
    drill: 'customers',
    definition: 'Count of canonical customer records created in the selected local-date window.',
  },
  'crm.leads': {
    label: 'CRM leads',
    source: 'crm',
    table: 'ac_crm_entries',
    kind: 'lead',
    status: true,
    currency: false,
    service: ['crm'],
    role: 'operations',
    definition:
      'Count of CRM entries whose canonical type is lead, grouped by their current status.',
  },
  'sales.quotations': {
    label: 'Quotations',
    source: 'sales',
    table: 'ac_sales_quotes',
    kind: null,
    status: true,
    currency: true,
    service: ['sales'],
    role: 'operations',
    definition:
      'Count of canonical sales quotations by issue record date and current status. Not recognized revenue.',
  },
  'inventory.movements': {
    label: 'Stock movement rows',
    source: 'inventory',
    table: 'ac_stock_movements',
    kind: null,
    status: false,
    currency: false,
    service: ['inventory'],
    definition:
      'Count of physical stock movement rows. Transfers have separate outgoing and incoming rows; this is not quantity or value.',
  },
  'inventory.low_stock': {
    label: 'Low stock products',
    source: 'inventory',
    snapshot: 'low_stock',
    service: ['inventory'],
    definition:
      'Current count of tracked products at or below their reorder point, from the bounded inventory overview snapshot; not a historical measure.',
  },
  'financial.collections': {
    label: 'Confirmed collections',
    source: 'financial',
    financialField: 'confirmed_inflows_minor',
    service: ['intelligence'],
    role: 'finance',
    definition:
      'Authorized confirmed collections from the canonical financial snapshot, in the selected currency.',
  },
  'financial.expenses': {
    label: 'Recorded expenses',
    source: 'financial',
    financialField: 'recorded_outflows_minor',
    service: ['intelligence'],
    role: 'finance',
    definition:
      'Authorized recorded outflows from the canonical financial snapshot, in the selected currency.',
  },
  'financial.net_movement': {
    label: 'Net movement',
    source: 'financial',
    financialField: 'net_movement_minor',
    service: ['intelligence'],
    role: 'finance',
    definition:
      'Confirmed collections minus recorded outflows in the canonical financial snapshot; not profit or cash balance.',
  },
  'financial.receivables': {
    label: 'Outstanding receivables',
    source: 'financial',
    financialField: 'outstanding_minor',
    service: ['intelligence'],
    role: 'finance',
    definition:
      'Outstanding receivables from the canonical financial snapshot, in the selected currency.',
  },
  'automations.rules': {
    label: 'Automation rules',
    source: 'automations',
    table: 'ac2_objects',
    kind: 'automations',
    status: true,
    statusField: 'enabled',
    filterStatus: false,
    service: ['automations'],
    role: 'finance',
    definition:
      'Count of canonical automation rules created in the selected period, grouped by enabled or paused state. This does not indicate that a scheduled run completed.',
  },
  'automations.runs': {
    label: 'Automation runs',
    source: 'automations',
    table: 'ac2_runs',
    status: true,
    statusField: 'status',
    service: ['automations'],
    role: 'finance',
    definition:
      'Count of canonical workflow execution records created in the selected period, grouped by persisted run status. Pending includes runs waiting for retry; counts do not imply uninterrupted schedule delivery.',
  },
};
const dashboardWidgetSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    metric: reportMetric,
    title: z.string().trim().min(1).max(100),
    chart: z.enum(['kpi', 'line', 'bar', 'pie', 'table']).default('bar'),
    group_by: reportGroup.default('month'),
    color: z
      .string()
      .regex(/^#[\da-fA-F]{6}$/)
      .default('#52a6e8'),
    span: z.enum(['normal', 'wide']).default('normal'),
  })
  .strict();
const dashboardConfigSchema = z
  .object({
    filters: analyticsQuery.default({ currency: 'KES' }),
    widgets: z.array(dashboardWidgetSchema).max(12),
  })
  .strict();
const dashboardCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    template: z
      .enum(['blank', 'overview', 'sales', 'finance', 'customers', 'inventory', 'automations'])
      .default('blank'),
    configuration: dashboardConfigSchema,
  })
  .strict();
const dashboardUpdateSchema = z
  .object({
    expected_version: z.number().int().positive(),
    name: z.string().trim().min(2).max(120),
    configuration: dashboardConfigSchema,
  })
  .strict();
function dashboardOnly(a: Access) {
  if (a.api) fail(403, 'Human member required');
  if (!['owner', 'admin'].includes(a.role))
    fail(403, 'Workspace owner or admin permission required');
}
function dashboardValue(row: any) {
  const configuration = JSON.parse(row.configuration);
  if (configuration.type !== 'analytics_dashboard' || configuration.schema_version !== 2)
    return null;
  return {
    id: row.id,
    name: row.name,
    version: Number(configuration.version || 1),
    configuration: {
      filters: configuration.filters || { currency: 'KES' },
      widgets: configuration.widgets || [],
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner: row.actor,
  };
}
async function canReadMetric(a: Access, metric: string) {
  const definition = definitions[metric];
  if (!definition) return false;
  if (definition.role && !permitted(a.role, definition.role)) return false;
  if (definition.service.length === 1) return readable(a, definition.service[0]);
  for (const service of definition.service) if (await readable(a, service)) return true;
  return false;
}
async function assertDashboardMetrics(
  a: Access,
  configuration: z.infer<typeof dashboardConfigSchema>,
) {
  for (const widget of configuration.widgets) {
    if (!(await canReadMetric(a, widget.metric)))
      fail(403, `You cannot add the ${definitions[widget.metric].label} metric to this dashboard`);
    const definition = definitions[widget.metric],
      supported = definition.source === 'financial' || definition.snapshot
        ? []
        : [
            'day',
            'month',
            ...(definition.status && definition.filterStatus !== false ? ['status'] : []),
            ...(definition.currency ? ['currency'] : []),
          ];
    if ((definition.source === 'financial' || definition.snapshot) && widget.chart !== 'kpi')
      fail(400, 'Snapshot measures can only be shown as KPI widgets');
    if (definition.source !== 'financial' && !definition.snapshot && !supported.includes(widget.group_by))
      fail(400, `The ${definition.label} measure cannot be grouped by ${widget.group_by}`);
  }
}
export async function analyticsRegistry(a: Access) {
  if ((await workspaceKind(a.org)) === 'business') await requireServices(a, ['intelligence'], true);
  const timeZone = await workspaceTimezone(a),
    sources: Record<string, any> = {};
  for (const [id, label, services, role] of [
    ['orders', 'Orders', ['orders'], 'read'],
    ['customers', 'Customers', ['customers', 'invoicing', 'orders', 'crm', 'sales'], 'read'],
    ['crm', 'CRM', ['crm'], 'operations'],
    ['sales', 'Sales', ['sales'], 'operations'],
    ['inventory', 'Inventory', ['inventory'], 'read'],
    ['financial', 'Finance', ['intelligence'], 'finance'],
    ['automations', 'Automations', ['automations'], 'finance'],
  ] as [string, string, string[], string][]) {
    let serviceAccess = false;
    for (const service of services) if (await readable(a, service)) serviceAccess = true;
    const roleAccess = role === 'read' || permitted(a.role, role);
    const table =
        id === 'orders' || id === 'customers'
          ? 'ac_records'
          : id === 'crm'
            ? 'ac_crm_entries'
            : id === 'sales'
              ? 'ac_sales_quotes'
              : id === 'inventory'
                ? 'ac_stock_movements'
                : id === 'automations'
                  ? 'ac2_runs'
                : null,
      kindCondition =
        id === 'orders' || id === 'customers'
          ? ' AND kind=?'
          : id === 'crm'
            ? " AND kind='lead'"
            : id === 'automations'
              ? " AND kind='automations'"
            : '',
      coverageTable = id === 'automations' ? 'ac2_objects' : table,
      coverage =
        roleAccess && serviceAccess && coverageTable
          ? await dbGet(
              `SELECT COUNT(*) AS n,MIN(created_at) AS first_record,MAX(created_at) AS last_record FROM ${coverageTable} WHERE org_id=? AND environment=?${kindCondition}`,
              [a.org, a.environment, ...(kindCondition === ' AND kind=?' ? [id] : [])],
            )
          : null;
    sources[id] = {
      label,
      status: !roleAccess
        ? 'restricted'
        : !serviceAccess
          ? 'not_configured'
          : coverage && Number(coverage.n) === 0
            ? 'no_data'
            : 'available',
      readable: roleAccess && serviceAccess,
      records: coverage ? Number(coverage.n) : null,
      covered_from: coverage?.first_record ? localDate(new Date(coverage.first_record), timeZone) : null,
      covered_to: coverage?.last_record ? localDate(new Date(coverage.last_record), timeZone) : null,
      refreshed_at: now(),
      reason: !roleAccess
        ? 'Your workspace role does not allow this source.'
        : serviceAccess
          ? coverage && Number(coverage.n) === 0
            ? 'Service is available, but this environment has no records yet.'
            : 'Authorized service source.'
          : 'Enable an eligible service to include this source.',
    };
  }
  const statusOptions: Record<string, string[]> = {};
  const statusSources = {
    orders: {
      table: 'ac_records',
      expression: isPostgres
        ? "COALESCE(data::jsonb->>'status','__unclassified__')"
        : "COALESCE(json_extract(data,'$.status'),'__unclassified__')",
      where: " AND kind='orders'",
    },
    customers: {
      table: 'ac_records',
      expression: isPostgres
        ? "COALESCE(data::jsonb->>'status','active')"
        : "COALESCE(json_extract(data,'$.status'),'active')",
      where: " AND kind='customers'",
    },
    crm: { table: 'ac_crm_entries', expression: 'status', where: " AND kind='lead'" },
    sales: { table: 'ac_sales_quotes', expression: 'status', where: '' },
    automations: { table: 'ac2_runs', expression: 'status', where: '' },
  } as const;
  for (const [source, config] of Object.entries(statusSources))
    if (sources[source]?.readable) {
      const values = await dbAll(
        `SELECT DISTINCT ${config.expression} AS value FROM ${config.table} WHERE org_id=? AND environment=?${config.where} ORDER BY value LIMIT 100`,
        [a.org, a.environment],
      );
      statusOptions[source] = values.map((row) => String(row.value));
    }
  return {
    timezone: timeZone,
    sources,
    metrics: Object.entries(definitions).map(([id, definition]) => ({
      id,
      label: definition.label,
      source: definition.source,
      unit:
        definition.source === 'financial'
          ? 'selected currency minor units'
          : definition.snapshot
            ? 'products'
            : 'records',
      aggregation:
        definition.source === 'financial'
          ? 'canonical financial snapshot'
          : definition.snapshot
            ? 'bounded current inventory snapshot'
            : 'COUNT of authorized source rows',
      calculation: definition.definition,
      groups:
        definition.source === 'financial'
          ? []
          : definition.snapshot
            ? ['snapshot']
            : [
              'day',
              'month',
              ...(definition.status ? ['status'] : []),
              ...(definition.currency ? ['currency'] : []),
            ],
      currency_filter: !!definition.currency,
      filters: definition.snapshot
        ? ['source']
        : [
            'period',
            'source',
            ...(definition.status ? ['status'] : []),
            ...(definition.currency ? ['currency'] : []),
          ],
      allowed_charts:
        definition.source === 'financial' || definition.snapshot
          ? ['kpi']
          : ['kpi', 'line', 'bar', 'pie', 'pivot', 'table'],
      required_services: definition.service,
      required_role: definition.role || 'read',
      drilldown_source: definition.drill || null,
      available: !!sources[definition.source]?.readable,
      definition: definition.definition,
    })),
    filters: [
      { id: 'period', label: 'Period', available: true },
      { id: 'source', label: 'Record source', options: Object.entries(sources).filter(([, value]) => value.readable).map(([id, value]) => ({ id, label: value.label })), available: true },
      { id: 'status', label: 'Status', options_by_source: statusOptions, requires_source: true, available: true },
      { id: 'currency', label: 'Currency', available: true },
    ],
  };
}
export async function analyticsReport(a: Access, input: unknown) {
  const d = reportInput.parse(input),
    definition = definitions[d.metric],
    timeZone = await workspaceTimezone(a),
    { from, to, startAt, endAt } = analyticsWindow(d, timeZone);
  if (!(await canReadMetric(a, d.metric)))
    fail(403, 'This analytics source is not available to your role or workspace');
  if (d.source && d.source !== definition.source)
    return {
      metric: d.metric,
      label: definition.label,
      source: definition.source,
      period: { from, to },
      timezone: timeZone,
      currency: definition.currency ? d.currency : null,
      value: null,
      rows: [],
      excluded_by_source_filter: true,
      ignored_filters: [
        ...(d.status && !definition.status ? ['status'] : []),
        ...(d.currency && !definition.currency ? ['currency'] : []),
      ],
      definition: `${definition.definition} Excluded by the selected record-source filter.`,
      refreshed_at: now(),
      drilldown: null,
    };
  if (definition.snapshot) {
    const inventory = await inventoryOverview(a),
      value = Number(inventory.low_stock || 0);
    return {
      metric: d.metric,
      label: definition.label,
      source: definition.source,
      period: { from, to },
      timezone: timeZone,
      currency: null,
      value,
      rows: [{ key: 'current', label: 'Current', value }],
      ignored_filters: [
        'period',
        ...(d.status ? ['status'] : []),
        ...(d.currency ? ['currency'] : []),
      ],
      definition: `${definition.definition} As of ${inventory.as_of}; ${inventory.covered_products} of ${inventory.total_products} products are included${inventory.truncated ? ' (truncated at the service limit)' : ''}.`,
      coverage: `${inventory.covered_products} of ${inventory.total_products} products included${inventory.truncated ? '; snapshot is truncated at the service limit' : ''}.`,
      refreshed_at: inventory.as_of,
      drilldown: null,
    };
  }
  if (definition.source === 'financial') {
    const snapshot = await financialSnapshot(
        a,
        { currency: d.currency, from, to, ...(d.range === 'all' ? { range: 'all' as const } : {}) },
        to,
      ),
      value = Number(
        snapshot.totals[definition.financialField as keyof typeof snapshot.totals] || 0,
      );
    return {
      metric: d.metric,
      label: definition.label,
      source: definition.source,
      period: { from, to },
      timezone: timeZone,
      currency: d.currency,
      value,
      rows: [{ key: d.currency, label: d.currency, value, currency: d.currency }],
      ignored_filters: [...(d.status ? ['status'] : [])],
      definition: definition.definition,
      coverage: `${snapshot.quality.history_days} days of recorded financial history; ${snapshot.quality.unreconciled_count} unreconciled exceptions; ${snapshot.quality.unallocated_confirmations} unallocated confirmations.${snapshot.quality.limited_history ? ' History is limited.' : ''}`,
      quality: snapshot.quality,
      refreshed_at: snapshot.refreshed_at,
      drilldown: null,
    };
  }
  if (
    !['day', 'month', 'status', 'currency'].includes(d.group_by) ||
    (d.group_by === 'status' && !definition.status) ||
    (d.group_by === 'currency' && !definition.currency)
  )
    fail(400, 'Choose a supported group for this metric');
  const statusRaw = isPostgres ? "r.data::jsonb->>'status'" : "json_extract(r.data,'$.status')",
    statusExpr = definition.statusField === 'enabled'
      ? isPostgres
        ? "CASE WHEN r.data::jsonb->>'enabled'='true' THEN 'enabled' ELSE 'paused' END"
        : "CASE WHEN json_extract(r.data,'$.enabled')=1 THEN 'enabled' ELSE 'paused' END"
      : definition.table === 'ac2_runs' || definition.table === 'ac_crm_entries' || definition.table === 'ac_sales_quotes'
        ? 'r.status'
        : definition.table === 'ac_stock_movements'
          ? 'r.kind'
          : d.metric === 'customers.count' ? `COALESCE(${statusRaw},'active')` : statusRaw,
    bucketed = d.group_by === 'day' || d.group_by === 'month';
  if (bucketed && d.group_by === 'day' && d.range === 'all')
    fail(400, 'Choose a date window to group by day');
  const buckets = bucketed ? bucketRows(from, to, timeZone, d.group_by as 'day' | 'month') : [],
    values = buckets.map(() => '(?,?,?)').join(','),
    bucketParams = buckets.flatMap((bucket) => [bucket.start, bucket.end, bucket.label]);
  let table = definition.table,
    baseKind = definition.table === 'ac_records' ? definition.kind : null,
    currencyExpr =
      definition.table === 'ac_sales_quotes'
        ? 'r.currency'
        : isPostgres
          ? "r.data::jsonb->>'currency'"
          : "json_extract(r.data,'$.currency')",
    groupExpr =
      d.group_by === 'currency'
        ? currencyExpr
        : d.group_by === 'status'
          ? definition.table === 'ac_crm_entries'
            ? 'r.status'
            : definition.table === 'ac_sales_quotes'
              ? 'r.status'
              : definition.table === 'ac_stock_movements'
                ? 'r.kind'
                : statusExpr
          : null,
    sourceConditions = '';
  if (definition.table === 'ac_records') sourceConditions = ' AND r.kind=?';
  if (definition.table === 'ac_crm_entries') sourceConditions = " AND r.kind='lead'";
  if (definition.kind && definition.table !== 'ac_records') sourceConditions = ` AND r.kind='${definition.kind}'`;
  if (definition.currency && d.group_by !== 'currency')
    sourceConditions += ` AND ${currencyExpr}=?`;
  const statusCondition =
    d.status && definition.status && definition.filterStatus !== false && d.group_by !== 'status'
      ? definition.table === 'ac_records'
        ? d.status === '__unclassified__' && d.metric === 'orders.count'
          ? ` AND ${statusRaw} IS NULL`
          : ` AND ${statusExpr}=?`
        : ` AND ${statusExpr}=?`
      : '';
  let rows: any[];
  const commonParams = [
    a.org,
    a.environment,
    ...(baseKind ? [baseKind] : []),
    ...(definition.currency && d.group_by !== 'currency' ? [d.currency] : []),
    ...(statusCondition.includes('?') ? [d.status] : []),
  ];
  if (bucketed) {
    rows = await dbAll(
      `WITH buckets(start_at,end_at,label) AS (VALUES ${values})
       SELECT b.label AS key,b.label AS label,COUNT(r.id) AS value FROM buckets b
       LEFT JOIN ${table} r ON r.org_id=? AND r.environment=?${sourceConditions}${statusCondition} AND r.created_at>=b.start_at AND r.created_at<b.end_at
       GROUP BY b.label ORDER BY b.label`,
      [...bucketParams, ...commonParams],
    );
  } else {
    rows = await dbAll(
      `SELECT ${groupExpr} AS key,COUNT(r.id) AS value FROM ${table} r
       WHERE r.org_id=? AND r.environment=?${sourceConditions}${statusCondition} AND r.created_at>=? AND r.created_at<?
       GROUP BY ${groupExpr} ORDER BY value DESC,key`,
      [...commonParams, startAt, endAt],
    );
    rows = rows.map((row) => ({
      ...row,
      label: row.key == null ? 'Unclassified' : String(row.key),
    }));
  }
  const detail =
    definition.drill && d.group_by !== 'currency'
      ? rows.map((row) => {
          const drill: any = { kind: definition.drill, from, to };
          if (definition.currency) drill.currency = d.currency;
          if (d.status) drill.status = d.status;
          if (d.group_by === 'status')
            drill.status = row.key == null ? '__unclassified__' : row.key;
          if (d.group_by === 'day') drill.date = row.key;
          if (d.group_by === 'month') {
            drill.from = row.key + '-01';
            const [year, month] = row.key.split('-').map(Number),
              next = new Date(Date.UTC(year, month, 1));
            drill.to = shiftLocalDate(
              `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`,
              -1,
            );
          }
          return { ...row, drilldown: drill };
        })
      : rows;
  return {
    metric: d.metric,
    label: definition.label,
    source: definition.source,
    group_by: d.group_by,
    period: { from, to },
    timezone: timeZone,
    currency: null,
    value: detail.reduce((sum, row) => sum + Number(row.value || 0), 0),
    rows: detail.map((row) => ({ ...row, value: Number(row.value || 0) })),
    ignored_filters: [
      ...(d.status && !definition.status ? ['status'] : []),
      ...(d.status && definition.filterStatus === false ? ['status'] : []),
      ...(d.currency && !definition.currency ? ['currency'] : []),
    ],
    definition: definition.definition,
    coverage: `${detail.reduce((sum, row) => sum + Number(row.value || 0), 0)} matching source records across ${detail.length} groups in the selected period. Full source coverage is shown on the Data Quality page.`,
    refreshed_at: now(),
    drilldown: definition.drill || null,
  };
}

const pivotInput = analyticsQuery.extend({
  metric: reportMetric,
  row_by: reportGroup.default('month'),
  column_by: reportGroup.default('status'),
}).strict();
export async function analyticsPivot(a: Access, input: unknown) {
  const d = pivotInput.parse(input),
    definition = definitions[d.metric],
    timeZone = await workspaceTimezone(a),
    { from, to, startAt, endAt } = analyticsWindow(d, timeZone);
  if (!(await canReadMetric(a, d.metric)))
    fail(403, 'This analytics source is not available to your role or workspace');
  if (definition.source === 'financial')
    fail(400, 'Financial totals do not support a mixed-dimension pivot');
  if (definition.snapshot)
    fail(400, 'Current inventory snapshots do not support historical pivots');
  if (d.source && d.source !== definition.source)
    return {
      metric: d.metric,
      label: definition.label,
      period: { from, to },
      timezone: timeZone,
      row_by: d.row_by,
      column_by: d.column_by,
      columns: [],
      rows: [],
      totals: { columns: {}, overall: 0 },
      excluded_by_source_filter: true,
      ignored_filters: [
        ...(d.status && !definition.status ? ['status'] : []),
        ...(d.currency && !definition.currency ? ['currency'] : []),
      ],
      currency: d.currency,
      definition: `${definition.definition} Excluded by the selected record-source filter.`,
      refreshed_at: now(),
    };
  const dimensions = new Set<string>(['day', 'month']);
  if (definition.status) dimensions.add('status');
  if (definition.currency) dimensions.add('currency');
  if (!dimensions.has(d.row_by) || !dimensions.has(d.column_by) || d.row_by === d.column_by)
    fail(400, 'Choose two distinct dimensions supported by this metric');
  if (d.range === 'all' && (d.row_by === 'day' || d.column_by === 'day'))
    fail(400, 'Choose a date window before grouping all history by day');
  const dateDimension = (dimension: string) => dimension === 'day' || dimension === 'month',
    needsBuckets = dateDimension(d.row_by) || dateDimension(d.column_by),
    granularity = d.row_by === 'day' || d.column_by === 'day' ? 'day' : 'month',
    buckets = needsBuckets ? bucketRows(from, to, timeZone, granularity) : [],
    values = buckets.map(() => '(?,?,?)').join(','),
    bucketParams = buckets.flatMap((bucket) => [bucket.start, bucket.end, bucket.label]),
    statusRaw = isPostgres ? "r.data::jsonb->>'status'" : "json_extract(r.data,'$.status')",
    currencyExpr =
      definition.table === 'ac_sales_quotes'
        ? 'r.currency'
        : isPostgres
          ? "r.data::jsonb->>'currency'"
          : "json_extract(r.data,'$.currency')",
    dimensionExpr = (dimension: string) => {
      if (dimension === 'day' || dimension === 'month') return 'b.label';
      if (dimension === 'currency') return currencyExpr;
      if (definition.table === 'ac_crm_entries' || definition.table === 'ac_sales_quotes' || definition.table === 'ac2_runs')
        return 'r.status';
      if (definition.table === 'ac_stock_movements') return 'r.kind';
      if (definition.statusField === 'enabled')
        return isPostgres
          ? "CASE WHEN r.data::jsonb->>'enabled'='true' THEN 'enabled' ELSE 'paused' END"
          : "CASE WHEN json_extract(r.data,'$.enabled')=1 THEN 'enabled' ELSE 'paused' END";
      return d.metric === 'customers.count' ? `COALESCE(${statusRaw},'active')` : statusRaw;
    },
    rowExpr = dimensionExpr(d.row_by),
    columnExpr = dimensionExpr(d.column_by),
    sourceConditions =
      definition.table === 'ac_records'
        ? ' AND r.kind=?'
        : definition.table === 'ac_crm_entries'
          ? " AND r.kind='lead'"
          : definition.kind
            ? ` AND r.kind='${definition.kind}'`
          : '',
    statusCondition =
      d.status && definition.status && definition.filterStatus !== false
        ? definition.table === 'ac_records'
          ? d.status === '__unclassified__' && d.metric === 'orders.count'
            ? ` AND ${statusRaw} IS NULL`
            : ` AND ${d.metric === 'customers.count' ? `COALESCE(${statusRaw},'active')` : statusRaw}=?`
          : ` AND ${definition.table === 'ac2_runs' || definition.table === 'ac_crm_entries' || definition.table === 'ac_sales_quotes'
            ? 'r.status'
            : definition.statusField === 'enabled'
              ? isPostgres
                ? "CASE WHEN r.data::jsonb->>'enabled'='true' THEN 'enabled' ELSE 'paused' END"
                : "CASE WHEN json_extract(r.data,'$.enabled')=1 THEN 'enabled' ELSE 'paused' END"
              : 'r.kind'}=?`
        : '',
    currencyCondition =
      definition.currency && ![d.row_by, d.column_by].includes('currency')
        ? ` AND ${currencyExpr}=?`
        : '',
    parameters = [
      ...bucketParams,
      a.org,
      a.environment,
      ...(definition.table === 'ac_records' ? [definition.kind] : []),
      ...(statusCondition.includes('?') ? [d.status] : []),
      ...(currencyCondition ? [d.currency] : []),
      ...(needsBuckets ? [] : [startAt, endAt]),
    ],
    fromJoin = needsBuckets
      ? `FROM buckets b LEFT JOIN ${definition.table} r ON r.org_id=? AND r.environment=?${sourceConditions}${statusCondition}${currencyCondition} AND r.created_at>=b.start_at AND r.created_at<b.end_at`
      : `FROM ${definition.table} r WHERE r.org_id=? AND r.environment=?${sourceConditions}${statusCondition}${currencyCondition} AND r.created_at>=? AND r.created_at<?`,
    sql = `${needsBuckets ? `WITH buckets(start_at,end_at,label) AS (VALUES ${values}) ` : ''}
      SELECT ${rowExpr} AS row_key,${columnExpr} AS column_key,COUNT(r.id) AS value ${fromJoin}
      GROUP BY ${rowExpr},${columnExpr} ORDER BY row_key,column_key`,
    raw = await dbAll(sql, parameters),
    columns = [...new Set(raw.map((row) => String(row.column_key ?? 'Unclassified')))].sort(),
    rowMap = new Map<
      string,
      { key: string; label: string; total: number; values: Record<string, number> }
    >();
  for (const item of raw) {
    const key = String(item.row_key ?? 'Unclassified'),
      column = String(item.column_key ?? 'Unclassified'),
      current = rowMap.get(key) || { key, label: key, total: 0, values: {} };
    current.values[column] = Number(item.value || 0);
    current.total += Number(item.value || 0);
    rowMap.set(key, current);
  }
  const resultRows = [...rowMap.values()].sort((left, right) => left.key.localeCompare(right.key)),
    totals = Object.fromEntries(
      columns.map((column) => [
        column,
        resultRows.reduce((sum, row) => sum + (row.values[column] || 0), 0),
      ]),
    );
  return {
    metric: d.metric,
    label: definition.label,
    period: { from, to },
    timezone: timeZone,
    row_by: d.row_by,
    column_by: d.column_by,
    columns,
    rows: resultRows,
    totals: { columns: totals, overall: resultRows.reduce((sum, row) => sum + row.total, 0) },
    currency: d.currency,
    ignored_filters: [
      ...(d.status && !definition.status ? ['status'] : []),
      ...(d.status && definition.filterStatus === false ? ['status'] : []),
      ...(d.currency && !definition.currency ? ['currency'] : []),
    ],
    definition: definition.definition,
    refreshed_at: now(),
  };
}

async function checkedDashboardAccess(a: Access) {
  if ((await workspaceKind(a.org)) === 'business') await requireServices(a, ['intelligence'], true);
}
export async function analyticsDashboards(a: Access) {
  await checkedDashboardAccess(a);
  const values = (
    await dbAll(
      'SELECT * FROM ac_saved_reports WHERE org_id=? AND environment=? ORDER BY updated_at DESC,id DESC LIMIT 200',
      [a.org, a.environment],
    )
  )
    .map(dashboardValue)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  for (const dashboard of values) {
    dashboard.configuration.widgets = await Promise.all(
      dashboard.configuration.widgets
        .filter((widget: any) => definitions[widget.metric])
        .map(async (widget: any) => ((await canReadMetric(a, widget.metric)) ? widget : null)),
    ).then((widgets) => widgets.filter(Boolean));
  }
  return { data: values };
}
export async function createAnalyticsDashboard(a: Access, input: unknown) {
  dashboardOnly(a);
  await checkedDashboardAccess(a);
  const d = dashboardCreateSchema.parse(input);
  await assertDashboardMetrics(a, d.configuration);
  return dbTransaction(async () => {
    await dbRun('UPDATE ac_organizations SET name=name WHERE id=?', [a.org]);
    const count = await dbGet(
      "SELECT COUNT(*) AS n FROM ac_saved_reports WHERE org_id=? AND environment=? AND configuration LIKE '%analytics_dashboard%'",
      [a.org, a.environment],
    );
    if (Number(count.n) >= 200) fail(409, 'Remove an unused dashboard before creating another');
    const id = randomUUID(),
      at = now(),
      configuration = {
        type: 'analytics_dashboard',
        schema_version: 2,
        version: 1,
        template: d.template,
        filters: d.configuration.filters,
        widgets: d.configuration.widgets,
      };
    await dbRun(
      'INSERT INTO ac_saved_reports(id,org_id,environment,actor,name,configuration,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, a.org, a.environment, a.actor, d.name, JSON.stringify(configuration), at, at],
    );
    await audit(a.org, a.actor, 'analytics.dashboard_created', id);
    return dashboardValue({
      id,
      actor: a.actor,
      name: d.name,
      configuration: JSON.stringify(configuration),
      created_at: at,
      updated_at: at,
    });
  });
}
export async function updateAnalyticsDashboard(a: Access, id: string, input: unknown) {
  dashboardOnly(a);
  await checkedDashboardAccess(a);
  const d = dashboardUpdateSchema.parse(input);
  await assertDashboardMetrics(a, d.configuration);
  return dbTransaction(async () => {
    const row = await dbGet(
      'SELECT * FROM ac_saved_reports WHERE id=? AND org_id=? AND environment=?',
      [id, a.org, a.environment],
    );
    if (!row || !dashboardValue(row)) fail(404, 'Analytics dashboard not found');
    const current = JSON.parse(row.configuration);
    if (Number(current.version || 1) !== d.expected_version)
      fail(409, 'Dashboard changed since you opened it; reload before saving');
    const at = now(),
      configuration = {
        type: 'analytics_dashboard',
        schema_version: 2,
        version: d.expected_version + 1,
        template: current.template || 'custom',
        filters: d.configuration.filters,
        widgets: d.configuration.widgets,
      };
    const changed = await dbRun(
      'UPDATE ac_saved_reports SET name=?,configuration=?,updated_at=? WHERE id=? AND org_id=? AND environment=? AND updated_at=?',
      [d.name, JSON.stringify(configuration), at, id, a.org, a.environment, row.updated_at],
    );
    if (!changed.changes) fail(409, 'Dashboard changed while saving; reload before trying again');
    await audit(a.org, a.actor, 'analytics.dashboard_updated', id);
    return dashboardValue({
      ...row,
      name: d.name,
      configuration: JSON.stringify(configuration),
      updated_at: at,
    });
  });
}
export async function deleteAnalyticsDashboard(a: Access, id: string) {
  dashboardOnly(a);
  await checkedDashboardAccess(a);
  const row = await dbGet(
    'SELECT * FROM ac_saved_reports WHERE id=? AND org_id=? AND environment=?',
    [id, a.org, a.environment],
  );
  if (!row || !dashboardValue(row)) fail(404, 'Analytics dashboard not found');
  const changed = await dbRun(
    'DELETE FROM ac_saved_reports WHERE id=? AND org_id=? AND environment=? AND updated_at=?',
    [id, a.org, a.environment, row.updated_at],
  );
  if (!changed.changes) fail(409, 'Dashboard changed while deleting; reload before trying again');
  await audit(a.org, a.actor, 'analytics.dashboard_removed', id);
  return { removed: true };
}
export async function duplicateAnalyticsDashboard(a: Access, id: string, input: unknown) {
  dashboardOnly(a);
  await checkedDashboardAccess(a);
  const d = z
      .object({ name: z.string().trim().min(2).max(120).optional() })
      .strict()
      .parse(input || {}),
    row = await dbGet('SELECT * FROM ac_saved_reports WHERE id=? AND org_id=? AND environment=?', [
      id,
      a.org,
      a.environment,
    ]);
  if (!row || !dashboardValue(row)) fail(404, 'Analytics dashboard not found');
  const source = JSON.parse(row.configuration),
    at = now(),
    nextId = randomUUID(),
    configuration = { ...source, version: 1, template: 'custom' },
    name = d.name || `${row.name} (copy)`;
  const parsed = dashboardConfigSchema.parse({
    filters: configuration.filters,
    widgets: configuration.widgets,
  });
  await assertDashboardMetrics(a, parsed);
  await dbTransaction(async () => {
    await dbRun('UPDATE ac_organizations SET name=name WHERE id=?', [a.org]);
    const count = await dbGet(
      "SELECT COUNT(*) AS n FROM ac_saved_reports WHERE org_id=? AND environment=? AND configuration LIKE '%analytics_dashboard%'",
      [a.org, a.environment],
    );
    if (Number(count.n) >= 200) fail(409, 'Remove an unused dashboard before duplicating another');
    await dbRun(
      'INSERT INTO ac_saved_reports(id,org_id,environment,actor,name,configuration,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [nextId, a.org, a.environment, a.actor, name, JSON.stringify(configuration), at, at],
    );
    await audit(a.org, a.actor, 'analytics.dashboard_duplicated', nextId);
  });
  return dashboardValue({
    id: nextId, actor: a.actor, name, configuration: JSON.stringify(configuration), created_at: at, updated_at: at,
  });
}

export async function analyticsRecords(a: Access, input: unknown) {
  const d = analyticsQuery
      .extend({
        kind: z.enum(['customers', 'orders']),
        date: z.string().date().optional(),
        status: z.string().max(40).optional(),
        offset: z.coerce.number().int().min(0).max(1e6).default(0),
      })
      .parse(input),
    kind = await workspaceKind(a.org);
  if (kind === 'business') await requireServices(a, ['intelligence'], true);
  if (kind === 'personal' && d.kind === 'orders')
    fail(403, 'Order analytics is not available in Personal');
  await requireServices(
    a,
    d.kind === 'orders' ? ['orders'] : ['customers', 'invoicing', 'orders', 'crm', 'sales'],
    true,
  );
  const timeZone = await workspaceTimezone(a),
    { from, to, startAt, endAt } = analyticsWindow(d, timeZone),
    where = ['org_id=?', 'environment=?', 'kind=?', 'created_at>=?', 'created_at<?'],
    params: any[] = [a.org, a.environment, d.kind, startAt, endAt];
  if (d.source && d.source !== d.kind) {
    return {
      kind: d.kind, period: { from, to }, date: d.date || null, status: d.status ?? null,
      timezone: timeZone, offset: d.offset, limit: 100, total: 0, data: [],
      definition: 'The selected record-source filter excludes this drill-down source.',
    };
  }
  if (d.kind === 'orders' && typeof (input as any)?.currency === 'string') {
    where.push(isPostgres ? "data::jsonb->>'currency'=?" : "json_extract(data,'$.currency')=?");
    params.push(d.currency);
  }
  if (d.date) {
    where.push('created_at>=?', 'created_at<?');
    params.push(
      localMidnight(d.date, timeZone),
      localMidnight(shiftLocalDate(d.date, 1), timeZone),
    );
  }
  if (d.status !== undefined) {
    const raw = isPostgres ? "data::jsonb->>'status'" : "json_extract(data,'$.status')";
    if (d.status === '__unclassified__') where.push(raw + ' IS NULL');
    else {
      where.push((d.kind === 'customers' ? 'COALESCE(' + raw + ",'active')" : raw) + '=?');
      params.push(d.status);
    }
  }
  const filter = where.join(' AND '),
    count = await dbGet('SELECT COUNT(*) AS n FROM ac_records WHERE ' + filter, params),
    rows = await dbAll(
      'SELECT id,data,created_at FROM ac_records WHERE ' +
        filter +
        ' ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET ?',
      [...params, d.offset],
    );
  return {
    kind: d.kind,
    period: { from, to },
    date: d.date || null,
    status: d.status ?? null,
    timezone: timeZone,
    offset: d.offset,
    limit: 100,
    total: Number(count.n),
    data: rows.map((row) => {
      const record = JSON.parse(row.data);
      return {
        id: row.id,
        name: record.name || record.number || record.reference || row.id,
        status: record.status || (d.kind === 'customers' ? 'active' : 'unclassified'),
        created_at: row.created_at,
      };
    }),
    definition:
      'Canonical record headers matching the selected creation window and current status. Orders are not recognized revenue. Open a record for its separately authorized detail.',
  };
}
