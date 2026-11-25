import { approvalQueue } from '../erp/approval-privacy';
import {
  salesTemplates,
  saveSalesTemplate,
  priceLists,
  savePriceList,
  pricingPreview,
} from './sales-pricing';
import {
  addOptionalProduct,
  createDownPayment,
  decideOptionalProduct,
  listDownPayments,
  listOptionalProducts,
  previewDownPayment,
  salesMarginReport,
} from './sales-phase2';
import { crmReport, crmActivityReport } from './crm-report';
import { crmConfiguration, saveCrmConfiguration } from './crm-configuration';
import { replenishmentSuggestions, reviewReplenishment } from '../inventory/replenishment';
import { financialOperation } from '../finance/service';
import { Router } from 'express';
import { z } from 'zod';
import { access, route, fail, audit } from '../platform/auth';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/adapter';
import { now } from '../platform/crypto';
import {
  stockCountSnapshot,
  postStockCount,
  products,
  productCount,
  product,
  createProduct,
  editProduct,
  warehouses,
  createWarehouse,
  editWarehouse,
  createLocation,
  postMovement,
  inventoryOverview,
  planIncoming,
  resolveIncoming,
} from '../inventory/service';
import {
  createLandedCost,
  createLot,
  createScrap,
  listLandedCosts,
  listLots,
  listScraps,
  previewLandedCost,
  saveCostingPolicy,
  stockValuationReport,
  updateLot,
} from '../inventory/phase1';
import {
  importCrmEntries,
  crmEntryHistory,
  convertCrmLead,
  crmOverview,
  crmEntries,
  crmEntryPage,
  crmCompanySearch,
  createCrmEntry,
  editCrmEntry,
  customerProfile,
  setCustomerProfile,
  crmCustomerActivity,
  qualifyCrmLead,
} from './crm';
import { applyCrmActivityPlan, crmActivityPlans, crmDuplicateSuggestions, crmForecastBoard, crmForecastPivot, crmForecastReport, crmImportPreview, duplicateCrmActivityPlan, mergeCrmEntries, saveCrmActivityPlan } from './crm-expansion';
import {
  quotationHistory,
  createQuote,
  quote,
  editQuote,
  quoteAction,
  orderDraft,
  editOrderDraft,
} from './sales';
import { businessPolicyFor, setBusinessPolicy } from './business-policy';
import { requestApproval, previewAutomation, notificationPreferences } from './automation';
import { movementInput } from '../inventory/contracts';
import { creditInput } from '../finance/contracts';
import {
  businessAnalytics,
  analyticsRecords,
  savedReports,
  saveReport,
  removeReport,
  analyticsRegistry,
  analyticsReport,
  analyticsPivot,
  analyticsDashboards,
  createAnalyticsDashboard,
  updateAnalyticsDashboard,
  deleteAnalyticsDashboard,
  duplicateAnalyticsDashboard,
  businessAnalyticsExport,
  analyticsCSV,
} from './business-analytics';
import { safeCSV, all } from './store';
export const business = Router();
business.get(
  '/organizations/:org/inventory/replenishment-suggestions',
  route(async (req, res) => res.json(await replenishmentSuggestions(await access(req), req.query))),
);
business.post(
  '/organizations/:org/inventory/replenishment-suggestions/:id/review',
  route(async (req, res) =>
    res.json(
      await reviewReplenishment(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

business.get(
  '/organizations/:org/notifications/preferences',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human member required');
    res.json(
      (await all(a, 'notification_preferences')).find((p) => p.user_id === a.actor) || {
        paused: false,
        muted_categories: [],
      },
    );
  }),
);
business.put(
  '/organizations/:org/notifications/preferences',
  route(async (req, res) => res.json(await notificationPreferences(await access(req), req.body))),
);
business.get(
  '/organizations/:org/business/orders/:id/draft',
  route(async (req, res) => res.json(await orderDraft(await access(req), String(req.params.id)))),
);
business.post(
  '/organizations/:org/business/orders/:id/draft',
  route(async (req, res) =>
    res.json(
      await editOrderDraft(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
business.post(
  '/organizations/:org/business/workflows/:id/test',
  route(async (req, res) => {
    z.object({ confirm: z.literal(true) })
      .strict()
      .parse(req.body);
    res.json(await previewAutomation(await access(req, 'finance'), String(req.params.id)));
  }),
);
business.get(
  '/organizations/:org/business/analytics/registry',
  route(async (req, res) => res.json(await analyticsRegistry(await access(req)))),
);
business.get(
  '/organizations/:org/business/analytics/report',
  route(async (req, res) => res.json(await analyticsReport(await access(req), req.query))),
);
business.get(
  '/organizations/:org/business/analytics/pivot',
  route(async (req, res) => res.json(await analyticsPivot(await access(req), req.query))),
);
business.get(
  '/organizations/:org/business/analytics/report/export',
  route(async (req, res) => {
    const report = await analyticsReport(await access(req), req.query),
      rows: any[][] = [
        ['Metric', report.label],
        ['Period', `${report.period.from} to ${report.period.to}`],
        ['Timezone', report.timezone],
        ['Currency', report.currency || 'Not applicable'],
        ['Definition', report.definition],
        [],
        ['Group', 'Value', 'Currency'],
        ...report.rows.map((row: any) => [row.label, row.value, row.currency || report.currency || 'count']),
      ];
    res.type('text/csv').attachment('africore-analytics-report.csv').send(analyticsCSV(rows));
  }),
);
business.get(
  '/organizations/:org/business/analytics/report/export-data',
  route(async (req, res) => {
    const report = await analyticsReport(await access(req), req.query),
      rows: any[][] = [
        ['Metric', report.label],
        ['Period', `${report.period.from} to ${report.period.to}`],
        ['Timezone', report.timezone],
        ['Currency', report.currency || 'Not applicable'],
        ['Definition', report.definition],
        [],
        ['Group', 'Value', 'Currency'],
        ...report.rows.map((row: any) => [row.label, row.value, row.currency || report.currency || 'count']),
      ];
    res.json({ filename: 'africore-analytics-report.csv', content: analyticsCSV(rows), content_type: 'text/csv' });
  }),
);
business.get(
  '/organizations/:org/business/analytics/pivot/export-data',
  route(async (req, res) => {
    const result = await analyticsPivot(await access(req), req.query),
      rows: unknown[][] = [
        ['Metric', result.label],
        ['Definition', result.definition],
        ['Period', `${result.period.from} to ${result.period.to}`],
        ['Timezone', result.timezone],
        ['Row dimension', result.row_by],
        ['Column dimension', result.column_by],
        ['Currency filter', result.currency || 'Not applicable'],
        [],
        [result.row_by, ...result.columns, 'Total'],
        ...result.rows.map((row: any) => [row.label, ...result.columns.map((column: string) => row.values[column] || 0), row.total]),
        ['Total', ...result.columns.map((column: string) => (result.totals.columns as Record<string, number>)[column] || 0), result.totals.overall],
      ];
    res.json({ filename: 'africore-analytics-pivot.csv', content: analyticsCSV(rows), content_type: 'text/csv' });
  }),
);
business.get(
  '/organizations/:org/business/analytics/dashboards',
  route(async (req, res) => res.json(await analyticsDashboards(await access(req)))),
);
business.post(
  '/organizations/:org/business/analytics/dashboards',
  route(async (req, res) => res.status(201).json(await createAnalyticsDashboard(await access(req), req.body))),
);
business.patch(
  '/organizations/:org/business/analytics/dashboards/:id',
  route(async (req, res) => res.json(await updateAnalyticsDashboard(await access(req), String(req.params.id), req.body))),
);
business.post(
  '/organizations/:org/business/analytics/dashboards/:id/duplicate',
  route(async (req, res) => res.status(201).json(await duplicateAnalyticsDashboard(await access(req), String(req.params.id), req.body))),
);
business.delete(
  '/organizations/:org/business/analytics/dashboards/:id',
  route(async (req, res) => res.json(await deleteAnalyticsDashboard(await access(req), String(req.params.id)))),
);
business.get(
  '/organizations/:org/business/analytics/records',
  route(async (req, res) => res.json(await analyticsRecords(await access(req), req.query))),
);
business.get(
  '/organizations/:org/business/analytics',
  route(async (req, res) => res.json(await businessAnalytics(await access(req), req.query))),
);
business.get(
  '/organizations/:org/business/analytics/export-data',
  route(async (req, res) => res.json(await businessAnalyticsExport(await access(req), req.query))),
);
business.get(
  '/organizations/:org/business/analytics/export',
  route(async (req, res) => {
    const a = await access(req),
      report = await businessAnalytics(a, req.query),
      rows: any[][] = [['Metric', 'Value', 'Currency', 'From', 'To']];
    for (const [metric, value] of Object.entries(report.financial?.totals || {}))
      if (typeof value === 'number')
        rows.push([metric, value, report.currency, report.period.from, report.period.to]);
    for (const row of report.series)
      rows.push([
        row.kind + '_created:' + row.date,
        row.count,
        'count',
        report.period.from,
        report.period.to,
      ]);
    rows.push(['classification', report.classification, '', report.period.from, report.period.to]);
    res.type('text/csv').attachment('africore-authorized-analytics.csv').send(safeCSV(rows));
  }),
);
business.get(
  '/organizations/:org/business/saved-reports',
  route(async (req, res) => res.json({ data: await savedReports(await access(req)) })),
);
business.post(
  '/organizations/:org/business/saved-reports',
  route(async (req, res) => res.status(201).json(await saveReport(await access(req), req.body))),
);
business.delete(
  '/organizations/:org/business/saved-reports/:id',
  route(async (req, res) => res.json(await removeReport(await access(req), String(req.params.id)))),
);
const key = (req: any) => z.string().min(8).max(200).parse(req.headers['idempotency-key']);
const offset = (req: any) =>
  z.coerce.number().int().min(0).max(1e6).default(0).parse(req.query.offset);
business.get(
  '/organizations/:org/products',
  route(async (req, res) => {
    const a = await access(req),
      q = z.string().max(100).default('').parse(req.query.q);
    if (req.query.limit !== undefined || req.query.offset !== undefined) {
      const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit),
        pageOffset = offset(req),
        total = await productCount(a, q);
      return res.json({
        data: await products(a, q, limit, pageOffset),
        total,
        offset: pageOffset,
        limit,
        has_more: pageOffset + limit < total,
      });
    }
    res.json({
      data: await products(a, q),
      limit: 200,
      coverage: 'First 200 matching shared products; archived records retain their history.',
    });
  }),
);
business.get(
  '/organizations/:org/products/:id',
  route(async (req, res) => res.json(await product(await access(req), String(req.params.id)))),
);
business.post(
  '/organizations/:org/products',
  route(async (req, res) =>
    res.status(201).json(await createProduct(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.patch(
  '/organizations/:org/products/:id',
  route(async (req, res) =>
    res.json(
      await editProduct(await access(req, 'operations'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
business.get(
  '/organizations/:org/inventory/stock-counts/preview',
  route(async (req, res) => res.json(await stockCountSnapshot(await access(req), req.query))),
);
business.post(
  '/organizations/:org/inventory/stock-counts',
  route(async (req, res) =>
    res.json(await postStockCount(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.get(
  '/organizations/:org/inventory/lots',
  route(async (req, res) =>
    res.json(
      await listLots(
        await access(req),
        z
          .object({ product_id: z.uuid().optional(), warehouse_id: z.uuid().optional() })
          .parse(req.query),
      ),
    ),
  ),
);
business.post(
  '/organizations/:org/inventory/lots',
  route(async (req, res) =>
    res.status(201).json(await createLot(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.patch(
  '/organizations/:org/inventory/lots/:id',
  route(async (req, res) =>
    res.json(
      await updateLot(await access(req, 'operations'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
business.get(
  '/organizations/:org/inventory/scraps',
  route(async (req, res) => res.json(await listScraps(await access(req)))),
);
business.post(
  '/organizations/:org/inventory/scraps',
  route(async (req, res) =>
    res.status(201).json(await createScrap(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.get(
  '/organizations/:org/inventory/valuation',
  route(async (req, res) =>
    res.json(
      await stockValuationReport(
        await access(req),
        z.object({ product_id: z.uuid().optional() }).parse(req.query).product_id,
      ),
    ),
  ),
);
business.put(
  '/organizations/:org/inventory/valuation/policy',
  route(async (req, res) =>
    res.json(await saveCostingPolicy(await access(req, 'admin'), req.body, key(req))),
  ),
);
business.get(
  '/organizations/:org/inventory/landed-costs',
  route(async (req, res) => res.json(await listLandedCosts(await access(req)))),
);
business.post(
  '/organizations/:org/inventory/landed-costs/preview',
  route(async (req, res) =>
    res.json(await previewLandedCost(await access(req, 'operations'), req.body)),
  ),
);
business.post(
  '/organizations/:org/inventory/landed-costs',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createLandedCost(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.get(
  '/organizations/:org/inventory',
  route(async (req, res) => res.json(await inventoryOverview(await access(req)))),
);
business.get(
  '/organizations/:org/inventory/warehouses',
  route(async (req, res) => res.json(await warehouses(await access(req)))),
);
business.patch(
  '/organizations/:org/inventory/warehouses/:id',
  route(async (req, res) =>
    res.json(
      await editWarehouse(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
business.post(
  '/organizations/:org/inventory/warehouses',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createWarehouse(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.post(
  '/organizations/:org/inventory/warehouses/:id/locations',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await createLocation(
          await access(req, 'operations'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);
business.get(
  '/organizations/:org/inventory/movements',
  route(async (req, res) => {
    const a = await access(req),
      q = z
        .object({ product: z.string().uuid().optional(), warehouse: z.string().uuid().optional() })
        .parse(req.query),
      page = offset(req);
    res.json({
      data: await dbAll(
        'SELECT * FROM ac_stock_movements WHERE org_id=? AND environment=?' +
          (q.product ? ' AND product_id=?' : '') +
          (q.warehouse ? ' AND warehouse_id=?' : '') +
          ' ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET ?',
        [
          a.org,
          a.environment,
          ...(q.product ? [q.product] : []),
          ...(q.warehouse ? [q.warehouse] : []),
          page,
        ],
      ),
      offset: page,
      limit: 100,
    });
  }),
);
business.post(
  '/organizations/:org/inventory/movements',
  route(async (req, res) =>
    res.status(201).json(await postMovement(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.get(
  '/organizations/:org/inventory/reservations',
  route(async (req, res) => {
    const a = await access(req);
    res.json({
      data: await dbAll(
        'SELECT * FROM ac_stock_reservations WHERE org_id=? AND environment=? ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET ?',
        [a.org, a.environment, offset(req)],
      ),
      limit: 100,
    });
  }),
);
business.get(
  '/organizations/:org/inventory/incoming',
  route(async (req, res) => {
    const a = await access(req);
    res.json({
      data: await dbAll(
        'SELECT s.*, (SELECT p.order_id FROM ac_purchase_incoming p WHERE p.incoming_id=s.id AND p.org_id=s.org_id AND p.environment=s.environment) AS purchase_order_id FROM ac_stock_incoming s WHERE s.org_id=? AND s.environment=? ORDER BY s.due_on,s.id LIMIT 100 OFFSET ?',
        [a.org, a.environment, offset(req)],
      ),
      limit: 100,
    });
  }),
);
business.post(
  '/organizations/:org/inventory/incoming',
  route(async (req, res) =>
    res.status(201).json(await planIncoming(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.post(
  '/organizations/:org/inventory/incoming/:id/action',
  route(async (req, res) =>
    res.json(
      await resolveIncoming(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
business.post(
  '/organizations/:org/inventory/adjustment-approvals',
  route(async (req, res) => {
    const a = await access(req, 'operations'),
      d = z
        .object({
          approver: z.string().uuid(),
          movement: movementInput.omit({ approval_id: true }),
        })
        .strict()
        .parse(req.body);
    res.status(201).json(
      await financialOperation(a, 'stock.approval.request', key(req), d, () =>
        requestApproval(a, {
          approver: d.approver,
          action: 'stock_adjustment',
          resource_id: d.movement.product_id,
          parameters: { movement: d.movement },
        }),
      ),
    );
  }),
);
business.get(
  '/organizations/:org/crm/activity-report',
  route(async (req, res) => res.json(await crmActivityReport(await access(req), req.query))),
);
business.get('/organizations/:org/crm/duplicates', route(async (req, res) => res.json(await crmDuplicateSuggestions(await access(req), req.query))));
business.post('/organizations/:org/crm/import/preview', route(async (req, res) => res.json(await crmImportPreview(await access(req), req.body))));
business.post('/organizations/:org/crm/merge', route(async (req, res) => res.json(await mergeCrmEntries(await access(req, 'operations'), req.body, key(req)))));
business.get('/organizations/:org/crm/activity-plans', route(async (req, res) => res.json(await crmActivityPlans(await access(req)))));
business.post('/organizations/:org/crm/activity-plans', route(async (req, res) => res.status(201).json(await saveCrmActivityPlan(await access(req, 'operations'), null, req.body, key(req)))));
business.put('/organizations/:org/crm/activity-plans/:id', route(async (req, res) => res.json(await saveCrmActivityPlan(await access(req, 'operations'), String(req.params.id), req.body, key(req)))));
business.post('/organizations/:org/crm/activity-plans/:id/duplicate', route(async (req, res) => res.status(201).json(await duplicateCrmActivityPlan(await access(req, 'operations'), String(req.params.id), key(req)))));
business.post('/organizations/:org/crm/activity-plans/apply', route(async (req, res) => res.status(201).json(await applyCrmActivityPlan(await access(req, 'operations'), req.body, key(req)))));
business.get('/organizations/:org/crm/forecast', route(async (req, res) => res.json(await crmForecastBoard(await access(req), req.query))));
business.get('/organizations/:org/crm/forecast/report', route(async (req, res) => res.json(await crmForecastReport(await access(req), req.query))));
business.get('/organizations/:org/crm/forecast/pivot', route(async (req, res) => res.json(await crmForecastPivot(await access(req), req.query))));
business.get('/organizations/:org/crm/pipeline-report', route(async (req, res) => res.json(await crmForecastReport(await access(req), req.query, 'pipeline'))));
business.get(
  '/organizations/:org/crm/report',
  route(async (req, res) => res.json(await crmReport(await access(req), req.query))),
);
business.get(
  '/organizations/:org/crm/export',
  route(async (req, res) => {
    const report = await crmReport(await access(req), req.query);
    res
      .type('text/csv')
      .attachment('africore-opportunities.csv')
      .send(
        safeCSV([
          [
            'id',
            'customer_id',
            'title',
            'stage',
            'amount_minor',
            'currency',
            'probability_bps',
            'expected_close_on',
            'assigned_to',
            'team_id',
          ],
          ...report.records.map((r) => [
            r.id,
            r.customer_id,
            r.title,
            r.stage,
            r.amount_minor,
            r.currency,
            r.probability_bps,
            r.expected_close_on,
            r.assigned_to,
            r.team_id,
          ]),
        ]),
      );
  }),
);
business.post(
  '/organizations/:org/crm/import',
  route(async (req, res) =>
    res.json(await importCrmEntries(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.get(
  '/organizations/:org/crm/configuration',
  route(async (req, res) => res.json(await crmConfiguration(await access(req)))),
);
business.put(
  '/organizations/:org/crm/configuration',
  route(async (req, res) =>
    res.json(await saveCrmConfiguration(await access(req, 'admin'), req.body, key(req))),
  ),
);
business.get(
  '/organizations/:org/crm/entries/:id/history',
  route(async (req, res) =>
    res.json(await crmEntryHistory(await access(req), String(req.params.id))),
  ),
);
business.get(
  '/organizations/:org/crm',
  route(async (req, res) => res.json(await crmOverview(await access(req)))),
);
business.get(
  '/organizations/:org/crm/entries',
  route(async (req, res) => {
    const a = await access(req),
      query = z
        .object({
          kind: z.enum(['lead', 'opportunity', 'follow_up', 'interaction']).optional(),
          status: z.enum(['open', 'completed', 'cancelled', 'archived']).optional(),
          stage: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional(),
          assigned_to: z.string().uuid().optional(),
          team_id: z.string().uuid().optional(),
          currency: z.enum(['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF']).optional(),
          unassigned: z.enum(['true']).optional(),
          customer_id: z.string().uuid().optional(),
          parent_entry_id: z.string().uuid().optional(),
          q: z.string().trim().max(200).optional(),
          activity_window: z.enum(['today','overdue','upcoming','completed']).optional(),
          outcome: z.enum(['active', 'won', 'lost']).optional(),
          sort: z.enum(['recent', 'title']).default('recent'),
          before_created_at: z.string().datetime({ offset: true }).optional(),
          before_id: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(100),
          offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
        })
        .strict()
        .superRefine((value, context) => {
          if (!!value.before_created_at !== !!value.before_id)
            context.addIssue({ code: 'custom', message: 'Both cursor fields are required' });
        })
        .parse(req.query);
    if (query.before_created_at && query.before_id) {
      res.json({
        data: await crmEntries(a, query.kind, query.customer_id, {
          created_at: query.before_created_at,
          id: query.before_id,
        }),
        limit: 200,
      });
      return;
    }
    const { before_created_at: _beforeAt, before_id: _beforeId, ...pageQuery } = query;
    res.json(await crmEntryPage(a, { ...pageQuery, unassigned: query.unassigned === 'true' }));
  }),
);
business.post(
  '/organizations/:org/crm/entries',
  route(async (req, res) =>
    res.status(201).json(await createCrmEntry(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.patch(
  '/organizations/:org/crm/entries/:id',
  route(async (req, res) =>
    res.json(
      await editCrmEntry(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
business.post(
  '/organizations/:org/crm/entries/:id/convert',
  route(async (req, res) =>
    res.json(
      await convertCrmLead(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
business.post('/organizations/:org/crm/entries/:id/qualify', route(async (req, res) => res.json(await qualifyCrmLead(await access(req, 'operations'), String(req.params.id), req.body, key(req)))));
business.get(
  '/organizations/:org/crm/companies',
  route(async (req, res) => {
    const query = z
      .object({ q: z.string().trim().max(100).default(''), limit: z.coerce.number().int().min(1).max(50).default(20) })
      .strict()
      .parse(req.query);
    res.json(await crmCompanySearch(await access(req), query));
  }),
);
business.get(
  '/organizations/:org/crm/customers/:id',
  route(async (req, res) =>
    res.json(await customerProfile(await access(req), String(req.params.id))),
  ),
);
business.put(
  '/organizations/:org/crm/customers/:id',
  route(async (req, res) =>
    res.json(
      await setCustomerProfile(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
business.get(
  '/organizations/:org/crm/customers/:id/activity',
  route(async (req, res) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
      })
      .strict()
      .parse(req.query);
    res.json(await crmCustomerActivity(await access(req), String(req.params.id), query));
  }),
);
business.get(
  '/organizations/:org/sales/templates',
  route(async (req, res) => res.json(await salesTemplates(await access(req)))),
);
business.post(
  '/organizations/:org/sales/templates',
  route(async (req, res) =>
    res
      .status(201)
      .json(await saveSalesTemplate(await access(req, 'operations'), null, req.body, key(req))),
  ),
);
business.put(
  '/organizations/:org/sales/templates/:id',
  route(async (req, res) =>
    res.json(
      await saveSalesTemplate(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
business.get(
  '/organizations/:org/sales/price-lists',
  route(async (req, res) => res.json(await priceLists(await access(req)))),
);
business.post(
  '/organizations/:org/sales/price-lists',
  route(async (req, res) =>
    res.status(201).json(await savePriceList(await access(req, 'admin'), null, req.body, key(req))),
  ),
);
business.put(
  '/organizations/:org/sales/price-lists/:id',
  route(async (req, res) =>
    res.json(
      await savePriceList(await access(req, 'admin'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
business.post(
  '/organizations/:org/sales/pricing-preview',
  route(async (req, res) => res.json(await pricingPreview(await access(req), req.body))),
);
business.get(
  '/organizations/:org/sales/margin-report',
  route(async (req, res) =>
    res.json(
      await salesMarginReport(
        await access(req),
        z
          .object({
            currency: z.string().trim().min(3).max(3).optional(),
            from: z.iso.date().optional(),
            to: z.iso.date().optional(),
          })
          .parse(req.query),
      ),
    ),
  ),
);
business.get(
  '/organizations/:org/sales/down-payments',
  route(async (req, res) =>
    res.json(
      await listDownPayments(
        await access(req),
        z.object({ order_id: z.uuid().optional() }).parse(req.query).order_id,
      ),
    ),
  ),
);
business.post(
  '/organizations/:org/sales/down-payments/preview',
  route(async (req, res) =>
    res.json(await previewDownPayment(await access(req, 'operations'), req.body)),
  ),
);
business.post(
  '/organizations/:org/sales/down-payments',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createDownPayment(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.get(
  '/organizations/:org/sales/optional-products',
  route(async (req, res) =>
    res.json(
      await listOptionalProducts(
        await access(req),
        z.object({ quotation_id: z.uuid().optional() }).parse(req.query).quotation_id,
      ),
    ),
  ),
);
business.post(
  '/organizations/:org/sales/optional-products',
  route(async (req, res) =>
    res
      .status(201)
      .json(await addOptionalProduct(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.patch(
  '/organizations/:org/sales/optional-products/:id',
  route(async (req, res) =>
    res.json(
      await decideOptionalProduct(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
business.get(
  '/organizations/:org/sales/quotations/:id/history',
  route(async (req, res) =>
    res.json(await quotationHistory(await access(req), String(req.params.id))),
  ),
);
business.get(
  '/organizations/:org/sales/quotations',
  route(async (req, res) => {
    const a = await access(req),
      page = offset(req),
      status = z
        .enum(['draft', 'shared', 'accepted', 'converted', 'cancelled'])
        .optional()
        .parse(req.query.status),
      customerId = z.string().uuid().optional().parse(req.query.customer_id);
    const rows = await dbAll(
      'SELECT id FROM ac_sales_quotes WHERE org_id=? AND environment=?' +
        (status ? ' AND status=?' : '') +
        (customerId ? ' AND customer_id=?' : '') +
        ' ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET ?',
      [a.org, a.environment, ...(status ? [status] : []), ...(customerId ? [customerId] : []), page],
    );
    res.json({
      data: await Promise.all(rows.map((row) => quote(a, row.id))),
      offset: page,
      limit: 100,
      customer_id: customerId || null,
    });
  }),
);
business.get(
  '/organizations/:org/sales/quotations/:id',
  route(async (req, res) => res.json(await quote(await access(req), String(req.params.id)))),
);
business.post(
  '/organizations/:org/sales/quotations',
  route(async (req, res) =>
    res.status(201).json(await createQuote(await access(req, 'operations'), req.body, key(req))),
  ),
);
business.patch(
  '/organizations/:org/sales/quotations/:id',
  route(async (req, res) =>
    res.json(
      await editQuote(await access(req, 'operations'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
business.post(
  '/organizations/:org/sales/quotations/:id/action',
  route(async (req, res) =>
    res.json(
      await quoteAction(await access(req, 'operations'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
business.post(
  '/organizations/:org/sales/quotations/:id/discount-approvals',
  route(async (req, res) => {
    const a = await access(req, 'operations'),
      d = z.object({ approver: z.string().uuid() }).strict().parse(req.body),
      q = await quote(a, String(req.params.id));
    res.status(201).json(
      await financialOperation(
        a,
        'sales.discount.review:' + q.id,
        key(req),
        { ...d, quote_version: q.version, discount_minor: q.discount_minor },
        () =>
          requestApproval(a, {
            approver: d.approver,
            action: 'sales_discount',
            resource_id: q.id,
            parameters: {
              sales_discount: { quote_version: q.version, discount_minor: q.discount_minor },
            },
          }),
      ),
    );
  }),
);
business.get(
  '/organizations/:org/business/policy',
  route(async (req, res) => res.json(await businessPolicyFor(await access(req, 'admin')))),
);
business.put(
  '/organizations/:org/business/policy',
  route(async (req, res) =>
    res.json(await setBusinessPolicy(await access(req, 'admin'), req.body)),
  ),
);
business.get(
  '/organizations/:org/business/approvals',
  route(async (req, res) => res.json(await approvalQueue(await access(req), 100, offset(req)))),
);
business.post(
  '/organizations/:org/business/invoices/:id/correction-review',
  route(async (req, res) => {
    const a = await access(req, 'finance'),
      d = z
        .object({
          approver: z.string().uuid(),
          credit_note: creditInput.omit({ approval_id: true }),
        })
        .strict()
        .parse(req.body);
    res.status(201).json(
      await financialOperation(
        a,
        'invoice.credit.review:' + String(req.params.id),
        key(req),
        d,
        () =>
          requestApproval(a, {
            approver: d.approver,
            action: 'invoice_adjustment',
            resource_id: String(req.params.id),
            parameters: { credit_note: d.credit_note },
          }),
      ),
    );
  }),
);
business.get(
  '/organizations/:org/notifications/summary',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human member required');
    const page = offset(req),
      total = await dbGet(
        'SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=? AND environment=? AND user_id=? AND dismissed_at IS NULL',
        [a.org, a.environment, a.actor],
      );
    const unread = await dbGet(
      'SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=? AND environment=? AND user_id=? AND read_at IS NULL AND dismissed_at IS NULL',
      [a.org, a.environment, a.actor],
    );
    res.json({
      total: Number(total.n),
      offset: page,
      limit: 30,
      unread: Number(unread.n),
      data: await dbAll(
        "SELECT n.*,CASE WHEN a.status='pending' AND a.expires_at>? THEN 1 ELSE 0 END AS approval_pending,CASE WHEN a.status='pending' AND a.expires_at<=? THEN 'expired' ELSE a.status END AS approval_state FROM ac2_notifications n LEFT JOIN ac2_approvals a ON a.id=n.resource_id AND a.org_id=n.org_id AND a.environment=n.environment WHERE n.org_id=? AND n.environment=? AND n.user_id=? AND n.dismissed_at IS NULL ORDER BY n.created_at DESC,n.id DESC LIMIT 30 OFFSET ?",
        [now(), now(), a.org, a.environment, a.actor, page],
      ),
      as_of: now(),
    });
  }),
);
business.post(
  '/organizations/:org/notifications/read-all',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human member required');
    z.object({ confirm: z.literal(true) })
      .strict()
      .parse(req.body);
    const changed = await dbRun(
      'UPDATE ac2_notifications SET read_at=? WHERE org_id=? AND environment=? AND user_id=? AND read_at IS NULL',
      [now(), a.org, a.environment, a.actor],
    );
    await audit(a.org, a.actor, 'notifications.read_all');
    res.json({ updated: changed.changes });
  }),
);
business.post(
  '/organizations/:org/notifications/:id/dismiss',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human member required');
    z.object({ confirm: z.literal(true) })
      .strict()
      .parse(req.body);
    await dbTransaction(async () => {
      const row = await dbGet(
        'SELECT * FROM ac2_notifications WHERE id=? AND org_id=? AND environment=? AND user_id=?',
        [String(req.params.id), a.org, a.environment, a.actor],
      );
      if (!row) fail(404, 'Notification not found');
      if (row.severity === 'approval_required') {
        const approval = await dbGet(
          "SELECT id FROM ac2_approvals WHERE id=? AND org_id=? AND environment=? AND status='pending' AND expires_at>?",
          [row.resource_id, a.org, a.environment, now()],
        );
        if (approval) fail(409, 'Resolve the pending approval instead of dismissing it');
      }
      await dbRun('UPDATE ac2_notifications SET dismissed_at=? WHERE id=?', [now(), row.id]);
      await audit(a.org, a.actor, 'notification.dismissed', row.id);
    });
    res.json({ dismissed: true });
  }),
);
