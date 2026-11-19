import { z } from 'zod';
import { dbAll, dbGet, dbTransaction, isPostgres } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { quantityMilli } from '../inventory/quantity';
import { calendarDay, sumMinor, exactNumber } from '../finance/money';
import { documentBalance } from '../finance/ledger';
import { decode } from '../erp/store';
import { registerAccess, registers as visibleRegisters } from './registers';
import { registerDayWindow } from './calendar';

/** All totals name their coverage; register assignment is never general Finance
 * or Inventory access. Filtering happens before the bounded encrypted read. */
export async function posDailyReport(a: Access, id: string, input: unknown = {}) {
  const q = z.object({ date: z.string().date().optional() }).strict().parse(input);
  return dbTransaction(async () => {
    // Serialize with every register financial write for a coherent readback.
    await dbGet('SELECT id FROM ac_organizations WHERE id=?' + (isPostgres ? ' FOR UPDATE' : ''), [
      a.org,
    ]);
    const { register, manager } = await registerAccess(a, id),
      date = q.date || calendarDay(new Date().toISOString(), register.data.timezone);
    let window: { from: string; to: string };
    try {
      window = registerDayWindow(date, register.data.timezone);
    } catch (e) {
      fail(400, (e as Error).message);
    }
    const scope =
      'l.org_id=? AND l.environment=? AND l.register_id=?' + (manager ? '' : ' AND s.cashier_id=?');
    const params = [a.org, a.environment, id, ...(manager ? [] : [a.actor])];
    const filter = scope + ' AND l.created_at>=? AND l.created_at<?',
      filtered = [...params, window!.from, window!.to];
    const total = await dbGet(
      'SELECT COUNT(*) AS n FROM ac_pos_sale_links l JOIN ac_pos_sessions s ON s.session_id=l.session_id AND s.org_id=l.org_id AND s.environment=l.environment WHERE ' +
        filter,
      filtered,
    );
    const rows = await dbAll(
      'SELECT l.invoice_id FROM ac_pos_sale_links l JOIN ac_pos_sessions s ON s.session_id=l.session_id AND s.org_id=l.org_id AND s.environment=l.environment WHERE ' +
        filter +
        ' ORDER BY l.created_at,l.sale_id LIMIT 1000',
      filtered,
    );
    const balances: Awaited<ReturnType<typeof documentBalance>>[] = [];
    for (const row of rows) balances.push(await documentBalance(a, row.invoice_id));
    const productTotals = new Map<
      string,
      {
        id: string;
        name: string;
        unit: string;
        quantity_milli: number;
        line_subtotal_minor: number;
      }
    >();
    for (const invoice of balances)
      for (const line of invoice.items) {
        if (!line.product_id) continue;
        const quantity = quantityMilli(line.quantity),
          prior = productTotals.get(line.product_id) || {
            id: line.product_id,
            name: line.product_snapshot?.name || line.description,
            unit: line.product_snapshot?.unit || 'unit',
            quantity_milli: 0,
            line_subtotal_minor: 0,
          };
        prior.quantity_milli = sumMinor([prior.quantity_milli, quantity]);
        prior.line_subtotal_minor = sumMinor([
          prior.line_subtotal_minor,
          exactNumber((BigInt(quantity) * BigInt(line.unit_price_minor) + 500n) / 1000n),
        ]);
        productTotals.set(prior.id, prior);
      }
    const cash = await dbAll(
      'SELECT c.kind,SUM(c.amount_minor) AS amount_minor,COUNT(*) AS n FROM ac_cash_movements c JOIN ac_pos_sessions s ON s.session_id=c.session_id AND s.org_id=c.org_id AND s.environment=c.environment WHERE c.org_id=? AND c.environment=? AND s.register_id=?' +
        (manager ? '' : ' AND s.cashier_id=?') +
        ' AND c.occurred_at>=? AND c.occurred_at<? GROUP BY c.kind',
      filtered,
    );
    const closures = await dbAll(
      'SELECT COUNT(*) AS n,COALESCE(SUM(c.variance_minor),0) AS variance_minor FROM ac_pos_session_closures c JOIN ac_pos_sessions s ON s.session_id=c.session_id AND s.org_id=c.org_id AND s.environment=c.environment WHERE c.org_id=? AND c.environment=? AND s.register_id=?' +
        (manager ? '' : ' AND s.cashier_id=?') +
        ' AND c.created_at>=? AND c.created_at<?',
      filtered,
    );
    const open = await dbGet(
      "SELECT COUNT(*) AS n FROM ac_pos_sessions s WHERE s.org_id=? AND s.environment=? AND s.register_id=? AND s.status='open'" +
        (manager ? '' : ' AND s.cashier_id=?'),
      params,
    );
    const inventory = await dbGet(
      "SELECT e.status,s.enabled FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.service_id='inventory'",
      [a.org, a.environment],
    );
    const warehouse =
      register.data.warehouse_id &&
      (await dbGet(
        "SELECT id FROM ac_warehouses WHERE id=? AND org_id=? AND environment=? AND status='active'",
        [register.data.warehouse_id, a.org, a.environment],
      ));
    let stock: { available: boolean; data: any[]; has_more: boolean; definition: string } = {
      available: false,
      data: [],
      has_more: false,
      definition:
        'Activate Inventory and configure a current register warehouse for exact-location stock warnings.',
    };
    if (warehouse && inventory?.status === 'active' && Number(inventory.enabled) === 1) {
      const json = (name: string) =>
        isPostgres ? "(p.data::jsonb->>'" + name + "')" : "json_extract(p.data,'$." + name + "')";
      const stockRows = await dbAll(
        "SELECT * FROM (SELECT p.id,p.name,p.data,COALESCE(m.n,0)-COALESCE(r.n,0) AS available_milli FROM ac_products p LEFT JOIN (SELECT product_id,SUM(quantity_milli) AS n FROM ac_stock_movements WHERE org_id=? AND environment=? AND warehouse_id=? AND COALESCE(location_id,'')=? GROUP BY product_id) m ON m.product_id=p.id LEFT JOIN (SELECT product_id,SUM(quantity_milli-dispatched_milli) AS n FROM ac_stock_reservations WHERE org_id=? AND environment=? AND warehouse_id=? AND COALESCE(location_id,'')=? AND status='held' GROUP BY product_id) r ON r.product_id=p.id WHERE p.org_id=? AND p.environment=? AND p.status='active' AND " +
          json('currency') +
          '=? AND ' +
          (isPostgres ? json('track_inventory') + "='true'" : json('track_inventory') + '=1') +
          ' AND COALESCE(m.n,0)-COALESCE(r.n,0)<=CAST(' +
          json('reorder_point_milli') +
          ' AS BIGINT)) low ORDER BY available_milli,name,id LIMIT 51',
        [
          ...Array(2)
            .fill([
              a.org,
              a.environment,
              register.data.warehouse_id,
              register.data.location_id || '',
            ])
            .flat(),
          a.org,
          a.environment,
          register.data.currency,
        ],
      );
      stock = {
        available: true,
        data: stockRows.slice(0, 50).map((row) => ({
          id: row.id,
          name: row.name,
          unit: JSON.parse(row.data).unit,
          available_milli: sumMinor([row.available_milli]),
          reorder_point_milli: JSON.parse(row.data).reorder_point_milli,
        })),
        has_more: stockRows.length > 50,
        definition:
          'Current active tracked products in this currency at the exact register warehouse/location. Available stock subtracts held reservations; warnings use each product reorder point. At most 50 matching warnings are shown. Not historical inventory or valuation.',
      };
    }
    return {
      date,
      timezone: register.data.timezone,
      currency: register.data.currency,
      register_id: id,
      window: window!,
      scope: manager ? 'assigned_register' : 'own_cashier_shifts',
      sales: {
        total_count: Number(total.n),
        covered_count: rows.length,
        truncated: Number(total.n) > rows.length,
        gross_invoice_minor: sumMinor(balances.map((b) => b.total_minor)),
        credited_minor: sumMinor(balances.map((b) => b.credited_minor)),
        outstanding_minor: sumMinor(balances.map((b) => b.outstanding_minor)),
        recorded_cash_retained_minor: sumMinor(balances.map((b) => b.recorded_cash_paid_minor)),
        simulated_electronic_paid_minor: sumMinor(balances.map((b) => b.provider_paid_minor)),
      },
      cash_activity: {
        received_minor: sumMinor(
          cash.filter((r) => r.kind === 'receipt').map((r) => r.amount_minor),
        ),
        returned_minor: -sumMinor(
          cash.filter((r) => r.kind === 'return').map((r) => r.amount_minor),
        ),
        return_count: Number(cash.find((r) => r.kind === 'return')?.n || 0),
      },
      shifts: {
        currently_open: Number(open.n),
        closed_on_date: Number(closures[0].n),
        closed_variance_minor: Number(closures[0].variance_minor),
      },
      stock,
      top_products: [...productTotals.values()]
        .sort((x, y) => y.line_subtotal_minor - x.line_subtotal_minor || x.id.localeCompare(y.id))
        .slice(0, 10),
      as_of: new Date().toISOString(),
      definition:
        'Sales are invoices confirmed on the selected register-local date, with current settlement and credits as of refresh. At most 1,000 matching sales are covered; truncation applies to monetary totals and top products. Cash activity and closed-shift variance cover all matching facts occurring on the selected date, including older sales. Open shifts are current. Product subtotals precede document discount/tax and physical returns; units are not combined. No recognized revenue, profit, bank balance or live provider qualification is implied.',
    };
  });
}

const analysisQuery = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    register_ids: z.string().max(4_000).default(''),
    cashier_id: z.string().uuid().optional(),
    payment_method: z.enum(['cash', 'electronic', 'split', 'pending', 'unknown']).optional(),
    status: z.enum(['paid', 'partially_paid', 'outstanding', 'credited']).optional(),
    product_id: z.string().uuid().optional(),
    category: z.string().trim().max(120).optional(),
    currency: z.enum(['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF']).optional(),
    session_id: z.string().uuid().optional(),
    group_by: z
      .enum([
        'register',
        'cashier',
        'date',
        'hour',
        'payment_method',
        'status',
        'session',
        'product',
        'category',
      ])
      .default('register'),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    limit: z.coerce.number().int().min(1).max(100_000).default(50),
  })
  .strict();

type AnalysisTotals = {
  transaction_count: number;
  invoice_total_minor: number;
  paid_minor: number;
  outstanding_minor: number;
  credited_minor: number;
  recorded_cash_minor: number;
  simulated_electronic_minor: number;
  cash_returned_minor: number;
  discount_minor: number;
  tax_minor: number;
  product_quantity_milli: number;
  product_subtotal_minor: number;
};
const emptyAnalysisTotals = (): AnalysisTotals => ({
  transaction_count: 0,
  invoice_total_minor: 0,
  paid_minor: 0,
  outstanding_minor: 0,
  credited_minor: 0,
  recorded_cash_minor: 0,
  simulated_electronic_minor: 0,
  cash_returned_minor: 0,
  discount_minor: 0,
  tax_minor: 0,
  product_quantity_milli: 0,
  product_subtotal_minor: 0,
});
function addAnalysisTotals(target: AnalysisTotals, values: Partial<AnalysisTotals>) {
  for (const key of Object.keys(target) as (keyof AnalysisTotals)[])
    target[key] = sumMinor([target[key], values[key] || 0]);
}

/**
 * Cross-register report over confirmed POS invoice links. Authorization is
 * resolved per register, date boundaries use each register's own timezone,
 * aggregates remain separated by currency, and no partial result is returned
 * when the requested window exceeds the supported scan size.
 */
export async function posAnalysisReport(a: Access, input: unknown = {}) {
  const q = analysisQuery.parse(input);
  return dbTransaction(async () => {
    await dbGet('SELECT id FROM ac_organizations WHERE id=?' + (isPostgres ? ' FOR UPDATE' : ''), [
      a.org,
    ]);
    const directory = await visibleRegisters(a),
      requested = q.register_ids
        ? q.register_ids.split(',').filter(Boolean)
        : directory.data.map((row: any) => row.id),
      uniqueRequested = [...new Set(requested)];
    if (requested.length !== uniqueRequested.length || uniqueRequested.length > 100)
      fail(400, 'Choose each register once; at most 100 registers can be analyzed');
    const visible = new Map(directory.data.map((row: any) => [row.id, row]));
    if (uniqueRequested.some((id) => !visible.has(id))) fail(404, 'Register not found');
    if (!uniqueRequested.length)
      return {
        from: q.from || '',
        to: q.to || '',
        group_by: q.group_by,
        currencies: [],
        groups: [],
        records: [],
        has_more: false,
        total_count: 0,
        definition:
          'No POS registers are assigned to this user. Totals never include registers outside current authorization.',
      };

    const chosen = [] as {
      register: any;
      manager: boolean;
      from: string;
      to: string;
      localFrom: string;
      localTo: string;
    }[];
    for (const id of uniqueRequested) {
      const { register, manager } = await registerAccess(a, id),
        today = calendarDay(new Date().toISOString(), register.data.timezone),
        from = q.from || q.to || today,
        to = q.to || q.from || today;
      if (Date.parse(to + 'T00:00:00Z') < Date.parse(from + 'T00:00:00Z'))
        fail(400, 'The report end date must be on or after the start date');
      if (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z') > 365 * 86400000)
        fail(400, 'Report windows are limited to 366 calendar days');
      if (q.cashier_id && !manager && q.cashier_id !== a.actor)
        fail(403, 'Cashier reports are limited to your own assigned shifts');
      let window: { from: string; to: string };
      try {
        const endDate = new Date(Date.parse(to + 'T00:00:00Z') + 86400000)
          .toISOString()
          .slice(0, 10);
        window = {
          from: registerDayWindow(from, register.data.timezone).from,
          to: registerDayWindow(endDate, register.data.timezone).from,
        };
      } catch (error) {
        fail(400, (error as Error).message);
      }
      chosen.push({
        register,
        manager,
        from: window!.from,
        to: window!.to,
        localFrom: from,
        localTo: to,
      });
    }

    const scopes = chosen.map(({ register, manager, from, to }) => {
      const clause =
        '(l.register_id=? AND l.created_at>=? AND l.created_at<?' +
        (manager ? ')' : ' AND s.cashier_id=?)');
      return {
        clause,
        params: [register.id, from, to, ...(!manager ? [a.actor] : [])],
      };
    });
    const where = ['(' + scopes.map((scope) => scope.clause).join(' OR ') + ')'],
      params: (string | number)[] = scopes.flatMap((scope) => scope.params);
    if (q.cashier_id) {
      where.push('s.cashier_id=?');
      params.push(q.cashier_id);
    }
    if (q.session_id) {
      where.push('l.session_id=?');
      params.push(q.session_id);
    }
    const select =
      "SELECT o.*,l.register_id AS pos_register_id,l.session_id AS pos_session_id,l.invoice_id AS pos_invoice_id,l.created_at AS pos_created_at,s.cashier_id AS pos_cashier_id,r.data AS pos_register_data FROM ac_pos_sale_links l JOIN ac_pos_sessions s ON s.session_id=l.session_id AND s.org_id=l.org_id AND s.environment=l.environment JOIN ac_erp_objects o ON o.id=l.sale_id AND o.org_id=l.org_id AND o.environment=l.environment JOIN ac_erp_objects r ON r.id=l.register_id AND r.org_id=l.org_id AND r.environment=l.environment WHERE l.org_id=? AND l.environment=? AND r.kind='pos_register' AND " +
      where.join(' AND ') +
      ' ORDER BY l.created_at DESC,l.sale_id DESC LIMIT 100001';
    const rows = await dbAll(select, [a.org, a.environment, ...params]);
    if (rows.length > 100_000)
      fail(
        409,
        'This report matches more than 100,000 sales. Narrow the dates or register filters; no partial totals were returned.',
      );

    const registerById = new Map(chosen.map((item) => [item.register.id, item.register])),
      products = await dbAll('SELECT id,data FROM ac_products WHERE org_id=? AND environment=?', [
        a.org,
        a.environment,
      ]),
      productById = new Map(
        products.map((row: any) => {
          const data = JSON.parse(row.data);
          return [
            row.id,
            { name: data.name || row.id, category: data.category || '', unit: data.unit || 'unit' },
          ];
        }),
      ),
      groupMap = new Map<string, any>(),
      summaries = new Map<string, AnalysisTotals>(),
      records: any[] = [],
      categoryValues = new Set<string>();
    let totalCount = 0;
    const productChoices = new Map<string, { id: string; name: string; category: string }>();
    const dimValue = (
      sale: any,
      balance: any,
      tender: any,
      register: any,
      category: string,
      line?: any,
    ) => {
      switch (q.group_by) {
        case 'register':
          return { key: register.id, label: register.data.name, id: register.id };
        case 'cashier':
          return { key: sale.pos_cashier_id, label: sale.pos_cashier_id, id: sale.pos_cashier_id };
        case 'date':
          return {
            key: calendarDay(sale.pos_created_at, register.data.timezone),
            label: calendarDay(sale.pos_created_at, register.data.timezone),
          };
        case 'hour': {
          const hour = new Intl.DateTimeFormat('en-GB', {
            timeZone: register.data.timezone,
            hour: '2-digit',
            hourCycle: 'h23',
          }).format(new Date(sale.pos_created_at));
          return { key: hour, label: hour + ':00' };
        }
        case 'payment_method':
          return { key: tender.payment_intent, label: tender.payment_intent };
        case 'status':
          return { key: balance.status, label: balance.status };
        case 'session':
          return { key: sale.pos_session_id, label: sale.pos_session_id, id: sale.pos_session_id };
        case 'product':
          return {
            key: line?.product_id || 'unlinked',
            label: line?.product_snapshot?.name || line?.description || 'Unlinked item',
            id: line?.product_id,
          };
        case 'category':
          return { key: category || 'Uncategorised', label: category || 'Uncategorised' };
      }
    };
    for (const row of rows) {
      const sale = decode(a, row),
        register = registerById.get(row.pos_register_id),
        balance = await documentBalance(a, row.pos_invoice_id),
        tender = sale.data.tender || {},
        quote = sale.data.confirmed_quote,
        originalTotal = balance.total_minor,
        method =
          tender.payment_intent ||
          (tender.pending_minor
            ? 'pending'
            : tender.cash_applied_minor && tender.electronic_request_minor
              ? 'split'
              : tender.cash_applied_minor
                ? 'cash'
                : tender.electronic_request_minor
                  ? 'electronic'
                  : 'unknown');
      if (!register || !quote) continue;
      balance.status =
        balance.credited_minor >= originalTotal
          ? 'credited'
          : balance.outstanding_minor === 0
            ? 'paid'
            : balance.paid_minor > 0
              ? 'partially_paid'
              : 'outstanding';
      if (q.currency && balance.currency !== q.currency) continue;
      if (q.status && balance.status !== q.status) continue;
      if (q.payment_method && method !== q.payment_method) continue;
      const lines = balance.items.map((line: any) => {
        const product = line.product_id ? productById.get(line.product_id) : null,
          category = product?.category || '';
        categoryValues.add(category || 'Uncategorised');
        return { ...line, category, unit: product?.unit || line.product_snapshot?.unit || 'unit' };
      });
      const matchingLines = lines.filter(
        (line: any) =>
          (!q.product_id || line.product_id === q.product_id) &&
          (!q.category || (line.category || 'Uncategorised') === q.category),
      );
      if ((q.product_id || q.category) && !matchingLines.length) continue;
      for (const line of lines) {
        if (!line.product_id) continue;
        const product = productById.get(line.product_id);
        productChoices.set(line.product_id, {
          id: line.product_id,
          name: line.product_snapshot?.name || product?.name || line.product_id,
          category: line.category || '',
        });
      }
      totalCount++;
      const includedLines = q.product_id || q.category ? matchingLines : lines;
      const summary: AnalysisTotals = {
        transaction_count: 1,
        invoice_total_minor: balance.total_minor,
        paid_minor: balance.paid_minor,
        outstanding_minor: balance.outstanding_minor,
        credited_minor: balance.credited_minor,
        recorded_cash_minor: balance.recorded_cash_paid_minor,
        simulated_electronic_minor: balance.provider_paid_minor,
        cash_returned_minor: balance.cash_returned_minor,
        discount_minor: balance.discount_minor,
        tax_minor: balance.tax_minor,
        product_quantity_milli: sumMinor(
          includedLines.map((line: any) => quantityMilli(line.quantity)),
        ),
        product_subtotal_minor: sumMinor(
          includedLines.map((line: any) => {
            const quantity = quantityMilli(line.quantity);
            return exactNumber((BigInt(quantity) * BigInt(line.unit_price_minor) + 500n) / 1000n);
          }),
        ),
      };
      const currencySummary = summaries.get(balance.currency) || emptyAnalysisTotals();
      addAnalysisTotals(currencySummary, summary);
      summaries.set(balance.currency, currencySummary);
      const record = {
        id: sale.id,
        reference: 'POS-' + sale.id.slice(0, 12).toUpperCase(),
        created_at: row.pos_created_at,
        register_id: register.id,
        register_name: register.data.name,
        session_id: row.pos_session_id,
        cashier_id: row.pos_cashier_id,
        order_id: sale.data.order_id,
        invoice_id: sale.data.invoice_id,
        payment_method: method,
        status: balance.status,
        currency: balance.currency,
        total_minor: balance.total_minor,
        paid_minor: balance.paid_minor,
        outstanding_minor: balance.outstanding_minor,
        credited_minor: balance.credited_minor,
      };
      records.push(record);

      const linesForGroup =
        q.group_by === 'product' || q.group_by === 'category' ? matchingLines : [null];
      for (const line of linesForGroup) {
        const dim = dimValue(
            sale,
            balance,
            { payment_intent: method },
            register,
            line?.category || '',
            line,
          ),
          key = balance.currency + '\0' + dim.key,
          item = groupMap.get(key) || {
            key: String(dim.key),
            label: dim.label,
            id: dim.id,
            currency: balance.currency,
            totals: emptyAnalysisTotals(),
            _saleIds: new Set<string>(),
          };
        if (line) {
          const quantity = quantityMilli(line.quantity),
            subtotal = exactNumber(
              (BigInt(quantity) * BigInt(line.unit_price_minor) + 500n) / 1000n,
            );
          item.totals.product_quantity_milli = sumMinor([
            item.totals.product_quantity_milli,
            quantity,
          ]);
          item.totals.product_subtotal_minor = sumMinor([
            item.totals.product_subtotal_minor,
            subtotal,
          ]);
        } else {
          addAnalysisTotals(item.totals, summary);
        }
        item._saleIds.add(sale.id);
        groupMap.set(key, item);
      }
    }
    const groups = [...groupMap.values()]
      .map((item) => {
        item.totals.transaction_count = item._saleIds.size;
        delete item._saleIds;
        return item;
      })
      .sort(
        (left, right) =>
          right.totals.invoice_total_minor - left.totals.invoice_total_minor ||
          right.totals.product_subtotal_minor - left.totals.product_subtotal_minor ||
          left.label.localeCompare(right.label),
      );
    if (groups.length > 10_000)
      fail(
        409,
        'This report creates more than 10,000 analysis groups. Add a product, category, date or register filter.',
      );
    const selectedRecords = records.slice(q.offset, q.offset + q.limit),
      currencies = [...summaries.entries()].map(([currency, totals]) => ({ currency, totals })),
      registerCurrency = new Map(
        chosen.map(({ register }) => [register.id, register.data.currency]),
      );
    const eventChosen = chosen.filter(
        ({ register }) => !q.currency || register.data.currency === q.currency,
      ),
      eventScope = (alias: string, item: (typeof chosen)[number]) => {
        const cashierClause = !item.manager ? ' AND s.cashier_id=?' : '',
          requestedCashierClause = q.cashier_id ? ' AND s.cashier_id=?' : '',
          sessionClause = q.session_id ? ' AND s.session_id=?' : '';
        return {
          clause:
            '(s.register_id=? AND ' +
            alias +
            '>=? AND ' +
            alias +
            '<?' +
            cashierClause +
            requestedCashierClause +
            sessionClause +
            ')',
          params: [
            item.register.id,
            item.from,
            item.to,
            ...(!item.manager ? [a.actor] : []),
            ...(q.cashier_id ? [q.cashier_id] : []),
            ...(q.session_id ? [q.session_id] : []),
          ],
        };
      },
      cashScopes = eventChosen.map((item) => eventScope('c.occurred_at', item));
    const cashRows = cashScopes.length
      ? await dbAll(
          'SELECT c.currency,c.kind,SUM(c.amount_minor) AS amount_minor,COUNT(*) AS transaction_count FROM ac_cash_movements c JOIN ac_pos_sessions s ON s.session_id=c.session_id AND s.org_id=c.org_id AND s.environment=c.environment WHERE c.org_id=? AND c.environment=? AND (' +
            cashScopes.map((scope) => scope.clause).join(' OR ') +
            ') GROUP BY c.currency,c.kind',
          [a.org, a.environment, ...cashScopes.flatMap((scope) => scope.params)],
        )
      : [];
    const cashByCurrency = new Map<string, any>();
    for (const row of cashRows) {
      const item = cashByCurrency.get(row.currency) || {
        currency: row.currency,
        received_minor: 0,
        returned_minor: 0,
        receipt_count: 0,
        return_count: 0,
      };
      if (row.kind === 'receipt') {
        item.received_minor = sumMinor([item.received_minor, row.amount_minor]);
        item.receipt_count = sumMinor([item.receipt_count, row.transaction_count]);
      } else if (row.kind === 'return') {
        item.returned_minor = sumMinor([item.returned_minor, -Number(row.amount_minor)]);
        item.return_count = sumMinor([item.return_count, row.transaction_count]);
      }
      cashByCurrency.set(row.currency, item);
    }
    const adjustmentScopes = eventChosen.map((item) => eventScope('d.created_at', item));
    const adjustmentRows = adjustmentScopes.length
      ? await dbAll(
          'SELECT s.register_id,SUM(d.amount_minor) AS amount_minor,COUNT(*) AS transaction_count FROM ac_pos_drawer_adjustments d JOIN ac_pos_sessions s ON s.session_id=d.session_id AND s.org_id=d.org_id AND s.environment=d.environment WHERE d.org_id=? AND d.environment=? AND (' +
            adjustmentScopes.map((scope) => scope.clause).join(' OR ') +
            ') GROUP BY s.register_id',
          [a.org, a.environment, ...adjustmentScopes.flatMap((scope) => scope.params)],
        )
      : [];
    const adjustmentsByCurrency = new Map<string, any>();
    for (const row of adjustmentRows) {
      const currency = registerCurrency.get(row.register_id) || 'unknown',
        item = adjustmentsByCurrency.get(currency) || {
          currency,
          net_minor: 0,
          transaction_count: 0,
        };
      item.net_minor = sumMinor([item.net_minor, row.amount_minor]);
      item.transaction_count = sumMinor([item.transaction_count, row.transaction_count]);
      adjustmentsByCurrency.set(currency, item);
    }
    const closureScopes = eventChosen.map((item) => eventScope('c.created_at', item));
    const closureRows = closureScopes.length
      ? await dbAll(
          'SELECT s.register_id,COUNT(*) AS session_count,SUM(c.expected_minor) AS expected_minor,SUM(c.counted_minor) AS counted_minor,SUM(c.variance_minor) AS variance_minor FROM ac_pos_session_closures c JOIN ac_pos_sessions s ON s.session_id=c.session_id AND s.org_id=c.org_id AND s.environment=c.environment WHERE c.org_id=? AND c.environment=? AND (' +
            closureScopes.map((scope) => scope.clause).join(' OR ') +
            ') GROUP BY s.register_id',
          [a.org, a.environment, ...closureScopes.flatMap((scope) => scope.params)],
        )
      : [];
    const closuresByCurrency = new Map<string, any>();
    for (const row of closureRows) {
      const currency = registerCurrency.get(row.register_id) || 'unknown',
        item = closuresByCurrency.get(currency) || {
          currency,
          session_count: 0,
          expected_minor: 0,
          counted_minor: 0,
          variance_minor: 0,
        };
      item.session_count = sumMinor([item.session_count, row.session_count]);
      item.expected_minor = sumMinor([item.expected_minor, row.expected_minor]);
      item.counted_minor = sumMinor([item.counted_minor, row.counted_minor]);
      item.variance_minor = sumMinor([item.variance_minor, row.variance_minor]);
      closuresByCurrency.set(currency, item);
    }
    const closureDetailRows = closureScopes.length
      ? await dbAll(
          'SELECT c.session_id,c.expected_minor,c.counted_minor,c.variance_minor,c.created_at AS closed_at,s.register_id,s.cashier_id,so.* FROM ac_pos_session_closures c JOIN ac_pos_sessions s ON s.session_id=c.session_id AND s.org_id=c.org_id AND s.environment=c.environment JOIN ac_erp_objects so ON so.id=s.session_id AND so.org_id=s.org_id AND so.environment=s.environment WHERE c.org_id=? AND c.environment=? AND (' +
            closureScopes.map((scope) => scope.clause).join(' OR ') +
            ') ORDER BY c.created_at DESC,c.session_id DESC LIMIT 1001',
          [a.org, a.environment, ...closureScopes.flatMap((scope) => scope.params)],
        )
      : [];
    const sessionCashReports = closureDetailRows.slice(0, 1000).map((row: any) => {
      const session = decode(a, row),
        register = registerById.get(row.register_id);
      return {
        session_id: row.session_id,
        register_id: row.register_id,
        register_name: register?.data.name || 'Register',
        cashier_id: row.cashier_id,
        currency: session.data.currency,
        opened_at: session.data.opened_at,
        closed_at: row.closed_at,
        opening_cash_minor: session.data.opening_cash_minor,
        expected_minor: Number(row.expected_minor),
        counted_minor: Number(row.counted_minor),
        variance_minor: Number(row.variance_minor),
      };
    });
    return {
      from: q.from || q.to || null,
      to: q.to || q.from || null,
      date_windows: chosen.map(({ register, localFrom, localTo }) => ({
        register_id: register.id,
        register_name: register.data.name,
        timezone: register.data.timezone,
        from: localFrom,
        to: localTo,
      })),
      group_by: q.group_by,
      filters: {
        register_ids: uniqueRequested,
        cashier_id: q.cashier_id || null,
        payment_method: q.payment_method || null,
        status: q.status || null,
        product_id: q.product_id || null,
        category: q.category || null,
        currency: q.currency || null,
        session_id: q.session_id || null,
      },
      currencies,
      products: [...productChoices.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
      groups,
      categories: [...categoryValues].sort((left, right) => left.localeCompare(right)),
      cash_activity: [...cashByCurrency.values()],
      drawer_adjustments: [...adjustmentsByCurrency.values()],
      session_closures: [...closuresByCurrency.values()],
      session_cash_reports: sessionCashReports,
      session_cash_reports_has_more: closureDetailRows.length > 1000,
      records: selectedRecords,
      has_more: q.offset + selectedRecords.length < totalCount,
      total_count: totalCount,
      coverage: {
        complete: true,
        confirmed_sales_scanned: rows.length,
        cash_movements_scanned: cashRows.reduce(
          (count: number, row: any) => count + Number(row.transaction_count),
          0,
        ),
        session_closures_scanned: closureRows.reduce(
          (count: number, row: any) => count + Number(row.session_count),
          0,
        ),
        definition:
          'All authorized confirmed POS sales in this window are included. Sales totals are current canonical invoice totals and current credits/payment allocations as of refresh. Recorded cash is a merchant observation; electronic allocations are simulator/provider evidence and do not imply live POS settlement. Product subtotal is before invoice-level discount and tax. Product/category uses current canonical catalog category; no profitability or FX conversion is computed.',
      },
      as_of: new Date().toISOString(),
    };
  });
}
