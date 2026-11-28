import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { type Access, audit, fail } from '../platform/auth';
import { currencySchema } from '../platform/domain';
import { requireServices } from '../marketplace/engine';
import { accountingPython } from './bank-python';
import { decode, insert, operation, update, type ERPKind } from './store';

const uuid = z.uuid();
const day = z.iso.date();
const scope = (a: Access) => [a.org, a.environment];

async function records(a: Access, kind: ERPKind) {
  return (
    await dbAll(
      'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ORDER BY created_at,id',
      [...scope(a), kind],
    )
  ).map((row) => decode(a, row));
}

async function getOne(a: Access, id: string, kind: ERPKind, label: string) {
  const row = await dbGet(
    'SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?',
    [uuid.parse(id), ...scope(a), kind],
  );
  if (!row) fail(404, label + ' not found');
  return decode(a, row);
}

// ---------------------------------------------------------------------------
// PHASE 8: Subscriptions & Recurring Billing (NEW Odoo App)
// ---------------------------------------------------------------------------
const planInput = z
  .object({
    code: z.string().trim().min(2).max(40),
    name: z.string().trim().min(2).max(120),
    currency: currencySchema.default('KES'),
    interval: z.enum(['monthly', 'quarterly', 'annual']),
    price_minor: z.number().int().min(0).max(100_000_000_000),
    trial_days: z.number().int().min(0).max(365).default(0),
  })
  .strict();

const contractInput = z
  .object({
    customer_name: z.string().trim().min(2).max(200),
    plan_id: uuid,
    quantity: z.number().int().positive().max(100_000).default(1),
    starts_on: day,
    next_invoice_on: day,
  })
  .strict();

const contractPatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['active', 'paused', 'cancelled']),
    reason: z.string().trim().min(3).max(500).default('Status changed'),
  })
  .strict();

const prorationInput = z
  .object({
    period_start: day,
    period_end: day,
    change_on: day,
    old_price_minor: z.number().int().min(0).max(100_000_000_000),
    new_price_minor: z.number().int().min(0).max(100_000_000_000),
  })
  .strict();

const mrrResultSchema = z
  .object({
    totals_by_currency: z.record(
      z.string(),
      z
        .object({
          active_count: z.number().int(),
          paused_count: z.number().int(),
          cancelled_count: z.number().int(),
          mrr_minor: z.number().int(),
          arr_minor: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

const prorationResultSchema = z
  .object({
    total_days: z.number().int(),
    remaining_days: z.number().int(),
    unused_credit_minor: z.number().int(),
    new_charge_minor: z.number().int(),
    net_adjustment_minor: z.number().int(),
  })
  .strict();

export async function listSubscriptionPlans(a: Access) {
  return {
    data: (await records(a, 'subscription_plan'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createSubscriptionPlan(a: Access, input: unknown, key: string) {
  const d = planInput.parse(input);
  return operation(a, 'customers.subscriptions.plan.create', key, d, () => requireServices(a, ['customers']), async () => {
    const saved = await insert(a, 'subscription_plan', d, { status: 'active' });
    await audit(a.org, a.actor, 'subscriptions.plan_created', saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function listSubscriptionContracts(a: Access) {
  return {
    data: (await records(a, 'subscription_contract'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createSubscriptionContract(a: Access, input: unknown, key: string) {
  const d = contractInput.parse(input);
  return operation(a, 'customers.subscriptions.contract.create', key, d, () => requireServices(a, ['customers']), async () => {
    const plan = await getOne(a, d.plan_id, 'subscription_plan', 'Subscription plan');
    const saved = await insert(
      a,
      'subscription_contract',
      {
        ...d,
        plan_code: plan.data.code,
        plan_name: plan.data.name,
        currency: plan.data.currency,
        interval: plan.data.interval,
        price_minor: plan.data.price_minor,
      },
      { parent: plan.id, status: 'active', due: d.next_invoice_on },
    );
    await audit(a.org, a.actor, 'subscriptions.contract_created', saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function updateSubscriptionContract(
  a: Access,
  id: string,
  input: unknown,
  key: string,
) {
  const d = contractPatchInput.parse(input);
  return operation(a, 'customers.subscriptions.contract.update:' + id, key, d, () => requireServices(a, ['customers']), async () => {
    const old = await getOne(a, id, 'subscription_contract', 'Subscription contract');
    if (old.version !== d.expected_version) fail(409, 'Contract changed; reload');
    const saved = await update(
      a,
      old,
      { ...old.data, last_reason: d.reason },
      { status: d.status },
      'contract_' + d.status,
    );
    await audit(a.org, a.actor, 'subscriptions.contract_' + d.status, saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function previewSubscriptionProration(a: Access, input: unknown) {
  return accountingPython(
    'subscriptions',
    { op: 'proration', ...prorationInput.parse(input) },
    prorationResultSchema,
  );
}

export async function subscriptionMrrReport(a: Access) {
  const contracts = (await records(a, 'subscription_contract')).map((r) => ({
    status: r.status,
    currency: r.data.currency,
    interval: r.data.interval,
    price_minor: Number(r.data.price_minor || 0),
    quantity: Number(r.data.quantity || 1),
  }));
  return accountingPython('subscriptions', { op: 'mrr', contracts }, mrrResultSchema);
}

// ---------------------------------------------------------------------------
// PHASE 9: Support Helpdesk & Marketing Campaigns (NEW Odoo Apps)
// ---------------------------------------------------------------------------
const ticketInput = z
  .object({
    subject: z.string().trim().min(3).max(200),
    customer_name: z.string().trim().min(2).max(200),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    sla_due_on: day,
    description: z.string().trim().max(2000).default(''),
  })
  .strict();

const ticketPatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['new', 'in_progress', 'waiting_customer', 'solved', 'closed']),
    rating: z.number().int().min(1).max(5).optional(),
    resolution_note: z.string().trim().max(1000).optional(),
  })
  .strict();

const campaignInput = z
  .object({
    name: z.string().trim().min(2).max(160),
    channel: z.enum(['email', 'sms', 'event', 'social']),
    audience_segment: z.string().trim().min(2).max(200),
    scheduled_on: day,
    subject_line: z.string().trim().min(2).max(200),
  })
  .strict();

const campaignPatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['draft', 'scheduled', 'sent', 'archived']),
    observed_delivered: z.number().int().min(0).max(10_000_000).optional(),
    observed_clicks: z.number().int().min(0).max(10_000_000).optional(),
  })
  .strict();

export async function listSupportTickets(a: Access) {
  return {
    data: (await records(a, 'support_ticket'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createSupportTicket(a: Access, input: unknown, key: string) {
  const d = ticketInput.parse(input);
  return operation(a, 'customers.support.ticket.create', key, d, () => requireServices(a, ['customers']), async () => {
    const saved = await insert(a, 'support_ticket', { ...d, created_by: a.actor }, {
      status: 'new',
      due: d.sla_due_on,
    });
    await audit(a.org, a.actor, 'support.ticket_created', saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function updateSupportTicket(a: Access, id: string, input: unknown, key: string) {
  const d = ticketPatchInput.parse(input);
  return operation(a, 'customers.support.ticket.update:' + id, key, d, () => requireServices(a, ['customers']), async () => {
    const old = await getOne(a, id, 'support_ticket', 'Support ticket');
    if (old.version !== d.expected_version) fail(409, 'Ticket changed; reload');
    const saved = await update(
      a,
      old,
      {
        ...old.data,
        ...(d.rating !== undefined ? { rating: d.rating } : {}),
        ...(d.resolution_note !== undefined ? { resolution_note: d.resolution_note } : {}),
      },
      { status: d.status },
      'ticket_' + d.status,
    );
    await audit(a.org, a.actor, 'support.ticket_' + d.status, saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function supportSlaReport(a: Access) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
  const all = await records(a, 'support_ticket');
  const open = all.filter((t) => !['solved', 'closed'].includes(t.status));
  const overdue = open.filter((t) => t.data.sla_due_on && t.data.sla_due_on < today);
  const rated = all.filter((t) => typeof t.data.rating === 'number');
  const avgRatingTenths = rated.length
    ? Math.round((rated.reduce((s, t) => s + Number(t.data.rating), 0) * 10) / rated.length)
    : null;
  return {
    today,
    total: all.length,
    open: open.length,
    solved_or_closed: all.length - open.length,
    overdue_sla: overdue.length,
    avg_rating_tenths: avgRatingTenths,
  };
}

export async function listMarketingCampaigns(a: Access) {
  const [campaigns, activities] = await Promise.all([
    records(a, 'marketing_campaign'),
    records(a, 'crm_scheduled_activity'),
  ]);
  return {
    data: campaigns
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
    attributed_leads: activities
      .filter((r) => Boolean(r.data?.source_campaign_id))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createMarketingCampaign(a: Access, input: unknown, key: string) {
  const d = campaignInput.parse(input);
  return operation(a, 'customers.marketing.campaign.create', key, d, () => requireServices(a, ['customers']), async () => {
    const saved = await insert(
      a,
      'marketing_campaign',
      { ...d, observed_delivered: 0, observed_clicks: 0 },
      { status: 'draft', due: d.scheduled_on },
    );
    await audit(a.org, a.actor, 'marketing.campaign_created', saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function updateMarketingCampaign(a: Access, id: string, input: unknown, key: string) {
  const d = campaignPatchInput.parse(input);
  return operation(a, 'customers.marketing.campaign.update:' + id, key, d, () => requireServices(a, ['customers']), async () => {
    const old = await getOne(a, id, 'marketing_campaign', 'Marketing campaign');
    if (old.version !== d.expected_version) fail(409, 'Campaign changed; reload');
    const saved = await update(
      a,
      old,
      {
        ...old.data,
        ...(d.observed_delivered !== undefined ? { observed_delivered: d.observed_delivered } : {}),
        ...(d.observed_clicks !== undefined ? { observed_clicks: d.observed_clicks } : {}),
      },
      { status: d.status },
      'campaign_' + d.status,
    );
    await audit(a.org, a.actor, 'marketing.campaign_' + d.status, saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

// ---------------------------------------------------------------------------
// PHASE 10: Manufacturing (MRP), Maintenance, Fleet & Logistics (NEW Odoo Apps)
// ---------------------------------------------------------------------------
const bomInput = z
  .object({
    code: z.string().trim().min(2).max(60),
    finished_product_name: z.string().trim().min(2).max(200),
    currency: currencySchema.default('KES'),
    bom_quantity_milli: z.number().int().positive().max(1e12).default(1000),
    components: z
      .array(
        z
          .object({
            sku: z.string().trim().min(1).max(80),
            quantity_milli: z.number().int().positive().max(1e12),
            unit_cost_minor: z.number().int().min(0).max(100_000_000_000),
            scrap_bps: z.number().int().min(0).max(5000).default(0),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    operations: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            duration_minutes: z.number().int().min(0).max(100_000),
            hourly_cost_minor: z.number().int().min(0).max(10_000_000),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();

const bomCostResultSchema = z
  .object({
    produce_quantity_milli: z.number().int(),
    material_cost_minor: z.number().int(),
    labor_overhead_minor: z.number().int(),
    total_minutes: z.number().int(),
    total_cost_minor: z.number().int(),
    unit_cost_minor: z.number().int(),
    components: z.array(
      z
        .object({
          sku: z.string(),
          required_quantity_milli: z.number().int(),
          unit_cost_minor: z.number().int(),
          total_cost_minor: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

const moInput = z
  .object({
    reference: z.string().trim().min(2).max(120),
    bom_id: uuid,
    produce_quantity_milli: z.number().int().positive().max(1e12),
    scheduled_on: day,
  })
  .strict();

const moPatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['draft', 'confirmed', 'in_progress', 'done', 'cancelled']),
  })
  .strict();

const maintenanceInput = z
  .object({
    equipment_name: z.string().trim().min(2).max(200),
    kind: z.enum(['preventive', 'corrective']),
    scheduled_on: day,
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();

const maintenancePatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['new', 'in_progress', 'repaired', 'scrap']),
  })
  .strict();

const fleetInput = z
  .object({
    plate_number: z.string().trim().min(2).max(40),
    model: z.string().trim().min(2).max(120),
    driver_name: z.string().trim().max(120).default(''),
    odometer_km: z.number().int().min(0).max(10_000_000).default(0),
    next_service_on: day.nullable().default(null),
  })
  .strict();

const fleetPatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    odometer_km: z.number().int().min(0).max(10_000_000).optional(),
    status: z.enum(['active', 'in_service', 'retired']).optional(),
  })
  .strict();

const shipmentInput = z
  .object({
    tracking_number: z.string().trim().min(2).max(120),
    carrier_name: z.string().trim().min(2).max(120),
    destination: z.string().trim().min(2).max(200),
    currency: currencySchema.default('KES'),
    freight_cost_minor: z.number().int().min(0).max(100_000_000_000).default(0),
    estimated_arrival_on: day,
  })
  .strict();

const shipmentPatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['booked', 'in_transit', 'out_for_delivery', 'delivered', 'exception']),
  })
  .strict();

export async function listMrpBoms(a: Access) {
  return {
    data: (await records(a, 'mrp_bom'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createMrpBom(a: Access, input: unknown, key: string) {
  const d = bomInput.parse(input);
  return operation(a, 'inventory.mrp.bom.create', key, d, () => requireServices(a, ['inventory']), async () => {
    const cost = await accountingPython(
      'mrp_costing',
      {
        produce_quantity_milli: d.bom_quantity_milli,
        bom_quantity_milli: d.bom_quantity_milli,
        components: d.components,
        operations: d.operations,
      },
      bomCostResultSchema,
    );
    const saved = await insert(a, 'mrp_bom', { ...d, standard_rollup: cost }, { status: 'active' });
    await audit(a.org, a.actor, 'mrp.bom_created', saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function previewMrpBomCost(a: Access, input: unknown) {
  const d = z
    .object({
      bom_id: uuid,
      produce_quantity_milli: z.number().int().positive().max(1e12),
    })
    .strict()
    .parse(input);
  const bom = await getOne(a, d.bom_id, 'mrp_bom', 'Bill of Materials');
  return accountingPython(
    'mrp_costing',
    {
      produce_quantity_milli: d.produce_quantity_milli,
      bom_quantity_milli: bom.data.bom_quantity_milli,
      components: bom.data.components,
      operations: bom.data.operations,
    },
    bomCostResultSchema,
  );
}

export async function listMrpOrders(a: Access) {
  return {
    data: (await records(a, 'mrp_order'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createMrpOrder(a: Access, input: unknown, key: string) {
  const d = moInput.parse(input);
  return operation(a, 'inventory.mrp.order.create', key, d, () => requireServices(a, ['inventory']), async () => {
    const bom = await getOne(a, d.bom_id, 'mrp_bom', 'Bill of Materials');
    const cost = await accountingPython(
      'mrp_costing',
      {
        produce_quantity_milli: d.produce_quantity_milli,
        bom_quantity_milli: bom.data.bom_quantity_milli,
        components: bom.data.components,
        operations: bom.data.operations,
      },
      bomCostResultSchema,
    );
    const saved = await insert(
      a,
      'mrp_order',
      {
        ...d,
        bom_code: bom.data.code,
        finished_product_name: bom.data.finished_product_name,
        currency: bom.data.currency,
        cost_rollup: cost,
      },
      { parent: bom.id, status: 'confirmed', due: d.scheduled_on },
    );
    await audit(a.org, a.actor, 'mrp.order_created', saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function updateMrpOrder(a: Access, id: string, input: unknown, key: string) {
  const d = moPatchInput.parse(input);
  return operation(a, 'inventory.mrp.order.update:' + id, key, d, () => requireServices(a, ['inventory']), async () => {
    const old = await getOne(a, id, 'mrp_order', 'Manufacturing order');
    if (old.version !== d.expected_version) fail(409, 'Manufacturing order changed; reload');
    const saved = await update(a, old, old.data, { status: d.status }, 'mrp_' + d.status);
    await audit(a.org, a.actor, 'mrp.order_' + d.status, saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function listMaintenanceRequests(a: Access) {
  return {
    data: (await records(a, 'maintenance_request'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createMaintenanceRequest(a: Access, input: unknown, key: string) {
  const d = maintenanceInput.parse(input);
  return operation(a, 'inventory.maintenance.request.create', key, d, () => requireServices(a, ['inventory']), async () => {
    const saved = await insert(a, 'maintenance_request', d, { status: 'new', due: d.scheduled_on });
    await audit(a.org, a.actor, 'maintenance.request_created', saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function updateMaintenanceRequest(a: Access, id: string, input: unknown, key: string) {
  const d = maintenancePatchInput.parse(input);
  return operation(a, 'inventory.maintenance.request.update:' + id, key, d, () => requireServices(a, ['inventory']), async () => {
    const old = await getOne(a, id, 'maintenance_request', 'Maintenance request');
    if (old.version !== d.expected_version) fail(409, 'Maintenance request changed; reload');
    const saved = await update(a, old, old.data, { status: d.status }, 'maint_' + d.status);
    await audit(a.org, a.actor, 'maintenance.request_' + d.status, saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function listFleetVehicles(a: Access) {
  return {
    data: (await records(a, 'fleet_vehicle'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createFleetVehicle(a: Access, input: unknown, key: string) {
  const d = fleetInput.parse(input);
  return operation(a, 'inventory.fleet.vehicle.create', key, d, () => requireServices(a, ['inventory']), async () => {
    const saved = await insert(a, 'fleet_vehicle', d, {
      status: 'active',
      due: d.next_service_on ?? undefined,
    });
    await audit(a.org, a.actor, 'fleet.vehicle_created', saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function updateFleetVehicle(a: Access, id: string, input: unknown, key: string) {
  const d = fleetPatchInput.parse(input);
  return operation(a, 'inventory.fleet.vehicle.update:' + id, key, d, () => requireServices(a, ['inventory']), async () => {
    const old = await getOne(a, id, 'fleet_vehicle', 'Fleet vehicle');
    if (old.version !== d.expected_version) fail(409, 'Vehicle changed; reload');
    const saved = await update(
      a,
      old,
      { ...old.data, ...(d.odometer_km !== undefined ? { odometer_km: d.odometer_km } : {}) },
      { status: d.status ?? old.status },
      'fleet_updated',
    );
    await audit(a.org, a.actor, 'fleet.vehicle_updated', saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function listLogisticsShipments(a: Access) {
  return {
    data: (await records(a, 'logistics_shipment'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createLogisticsShipment(a: Access, input: unknown, key: string) {
  const d = shipmentInput.parse(input);
  return operation(a, 'inventory.logistics.shipment.create', key, d, () => requireServices(a, ['inventory']), async () => {
    const saved = await insert(a, 'logistics_shipment', d, {
      status: 'booked',
      due: d.estimated_arrival_on,
    });
    await audit(a.org, a.actor, 'logistics.shipment_created', saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function updateLogisticsShipment(a: Access, id: string, input: unknown, key: string) {
  const d = shipmentPatchInput.parse(input);
  return operation(a, 'inventory.logistics.shipment.update:' + id, key, d, () => requireServices(a, ['inventory']), async () => {
    const old = await getOne(a, id, 'logistics_shipment', 'Logistics shipment');
    if (old.version !== d.expected_version) fail(409, 'Shipment changed; reload');
    const saved = await update(a, old, old.data, { status: d.status }, 'shipment_' + d.status);
    await audit(a.org, a.actor, 'logistics.shipment_' + d.status, saved.id);
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}
