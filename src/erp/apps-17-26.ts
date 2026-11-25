import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { type Access, audit, fail } from '../platform/auth';
import { currencySchema } from '../platform/domain';
import { save as saveRecord } from '../platform/payments';
import { requireServices } from '../marketplace/engine';
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

function addMonthsIso(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

/** Records an immutable cross-app handoff event visible in App 26 (Integrations Hub). */
export async function recordHubEvent(
  a: Access,
  payload: {
    source_app: string;
    target_app: string;
    event_type: string;
    source_id: string;
    target_id: string;
    summary: string;
  },
) {
  return insert(
    a,
    'hub_event',
    { ...payload, triggered_by: a.actor },
    { status: 'delivered' },
  );
}

/** Creates a genuine canonical Invoice in ac_records so Accounting/Finance/Invoicing see it immediately. */
async function createCanonicalInvoice(
  a: Access,
  opts: {
    customer_id?: string | null;
    customer_name: string;
    reference: string;
    currency: string;
    issue_date: string;
    due_date: string;
    description: string;
    amount_minor: number;
    source_app: string;
    source_id: string;
    order_id?: string;
  },
) {
  const inv = await saveRecord(a, 'invoices', {
    reference: opts.reference,
    customer_id: opts.customer_id ?? undefined,
    customer_name: opts.customer_name,
    order_id: opts.order_id,
    currency: opts.currency,
    issue_date: opts.issue_date,
    due_date: opts.due_date,
    status: 'issued',
    source_app: opts.source_app,
    source_id: opts.source_id,
    items: [
      {
        description: opts.description,
        quantity: 1,
        unit_price: opts.amount_minor / 100,
        unit_price_minor: opts.amount_minor,
        line_total_minor: opts.amount_minor,
      },
    ],
    subtotal_minor: opts.amount_minor,
    tax_minor: 0,
    total_minor: opts.amount_minor,
    balance_minor: opts.amount_minor,
  });
  await recordHubEvent(a, {
    source_app: opts.source_app,
    target_app: 'accounting',
    event_type: 'invoice.auto_created',
    source_id: opts.source_id,
    target_id: inv.id,
    summary: `Auto-created invoice ${opts.reference} (${opts.currency} ${(opts.amount_minor / 100).toFixed(2)}) for ${opts.customer_name}`,
  });
  return inv;
}

// ---------------------------------------------------------------------------
// CROSS-APP AUTOMATIC CONNECTIONS (Zero Double-Keying)
// ---------------------------------------------------------------------------
const connectedSaleInput = z
  .object({
    reference: z.string().trim().min(2).max(120),
    customer_id: uuid.optional(),
    customer_name: z.string().trim().min(2).max(200),
    currency: currencySchema.default('KES'),
    issue_date: day,
    due_date: day,
    destination: z.string().trim().min(2).max(200).default('Customer Site'),
    carrier_name: z.string().trim().min(2).max(120).default('AfriCore Dispatch'),
    items: z
      .array(
        z
          .object({
            sku: z.string().trim().min(1).max(80),
            description: z.string().trim().min(1).max(200),
            quantity: z.number().int().positive().max(100_000),
            unit_price_minor: z.number().int().min(0).max(100_000_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

/**
 * Connected Sale-to-Cash & Fulfillment Orchestration:
 * Single action atomically creates:
 * 1. Canonical Sales Order (Sales)
 * 2. Canonical Issued Invoice (Accounting / Finance)
 * 3. Inventory Stock Deduction / Outbound Lot records (Inventory)
 * 4. Logistics Shipment ready for dispatch & POD (Logistics)
 * 5. Cross-App Event Bus entries (Integrations Hub)
 */
export async function completeConnectedSale(a: Access, input: unknown, key: string) {
  const d = connectedSaleInput.parse(input);
  return operation(
    a,
    'customers.connections.complete_sale',
    key,
    d,
    () => requireServices(a, ['customers', 'orders', 'invoicing', 'inventory']),
    async () => {
      const totalMinor = d.items.reduce((s, i) => s + i.quantity * i.unit_price_minor, 0);
      // 1. Canonical Sales Order
      const order = await saveRecord(a, 'orders', {
        reference: d.reference,
        customer_id: d.customer_id,
        customer_name: d.customer_name,
        currency: d.currency,
        issue_date: d.issue_date,
        due_date: d.due_date,
        status: 'confirmed',
        items: d.items.map((i) => ({
          sku: i.sku,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price_minor / 100,
          unit_price_minor: i.unit_price_minor,
          line_total_minor: i.quantity * i.unit_price_minor,
        })),
        total_minor: totalMinor,
      });

      // 2. Auto-create Canonical Invoice
      const invoice = await createCanonicalInvoice(a, {
        customer_id: d.customer_id,
        customer_name: d.customer_name,
        reference: 'INV-' + d.reference,
        currency: d.currency,
        issue_date: d.issue_date,
        due_date: d.due_date,
        description: `Auto-invoiced from Sales Order ${d.reference}`,
        amount_minor: totalMinor,
        source_app: 'sales',
        source_id: order.id,
        order_id: order.id,
      });

      // 3. Auto-update Inventory (record outbound stock deduction per item)
      const stockDeductions: any[] = [];
      for (const item of d.items) {
        const move = await insert(
          a,
          'inventory_lot',
          {
            sku: item.sku,
            lot_code: `OUT-${d.reference}-${item.sku}`,
            direction: 'outbound_sale',
            order_id: order.id,
            quantity_milli: -item.quantity * 1000,
            notes: `Auto-deducted for confirmed sale ${d.reference}`,
          },
          { parent: order.id, status: 'dispatched' },
        );
        stockDeductions.push({ id: move.id, sku: item.sku, quantity_milli: -item.quantity * 1000 });
      }
      await recordHubEvent(a, {
        source_app: 'sales',
        target_app: 'inventory',
        event_type: 'inventory.auto_deducted',
        source_id: order.id,
        target_id: stockDeductions[0]?.id || order.id,
        summary: `Auto-deducted ${d.items.length} SKU line(s) for sale ${d.reference}`,
      });

      // 4. Auto-create Logistics Shipment
      const shipment = await insert(
        a,
        'logistics_shipment',
        {
          tracking_number: `SHP-${d.reference}-${randomUUID().slice(0, 6).toUpperCase()}`,
          carrier_name: d.carrier_name,
          destination: d.destination,
          currency: d.currency,
          freight_cost_minor: 0,
          estimated_arrival_on: d.due_date,
          source_order_id: order.id,
          source_invoice_id: invoice.id,
        },
        { parent: order.id, status: 'booked', due: d.due_date },
      );
      await recordHubEvent(a, {
        source_app: 'sales',
        target_app: 'logistics',
        event_type: 'shipment.auto_created',
        source_id: order.id,
        target_id: shipment.id,
        summary: `Auto-booked shipment ${shipment.data.tracking_number} to ${d.destination}`,
      });

      await audit(a.org, a.actor, 'connections.connected_sale_completed', order.id);
      return {
        order,
        invoice,
        stock_deductions: stockDeductions,
        shipment: { id: shipment.id, version: shipment.version, status: shipment.status, ...shipment.data },
      };
    },
  );
}

/** App 19 Subscriptions -> Auto-generate canonical renewal Invoice & advance renewal date. */
export async function billSubscriptionContract(a: Access, contractId: string, input: unknown, key: string) {
  const d = z
    .object({
      expected_version: z.number().int().positive(),
      issue_date: day,
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'customers.subscriptions.contract.bill:' + contractId,
    key,
    d,
    () => requireServices(a, ['customers', 'invoicing']),
    async () => {
      const contract = await getOne(a, contractId, 'subscription_contract', 'Subscription contract');
      if (contract.version !== d.expected_version) fail(409, 'Contract changed; reload');
      if (contract.status !== 'active') fail(409, 'Only active contracts can be billed');
      const months = contract.data.interval === 'annual' ? 12 : contract.data.interval === 'quarterly' ? 3 : 1;
      const amountMinor = Number(contract.data.price_minor) * Number(contract.data.quantity || 1);
      const nextDate = addMonthsIso(contract.data.next_invoice_on || d.issue_date, months);
      const invoice = await createCanonicalInvoice(a, {
        customer_name: contract.data.customer_name,
        reference: `SUB-${contract.data.plan_code}-${d.issue_date}`,
        currency: contract.data.currency || 'KES',
        issue_date: d.issue_date,
        due_date: addMonthsIso(d.issue_date, 1),
        description: `Subscription renewal: ${contract.data.plan_name} (x${contract.data.quantity})`,
        amount_minor: amountMinor,
        source_app: 'subscriptions',
        source_id: contract.id,
      });
      const updated = await update(
        a,
        contract,
        {
          ...contract.data,
          next_invoice_on: nextDate,
          last_invoice_id: invoice.id,
          billed_cycles: Number(contract.data.billed_cycles || 0) + 1,
        },
        { due_on: nextDate },
        'subscription_billed',
      );
      return {
        contract: { id: updated.id, version: updated.version, status: updated.status, ...updated.data },
        invoice,
      };
    },
  );
}

/** App 20 Manufacturing -> Complete MO, auto-create Quality Check & Finished Goods Inventory Lot. */
export async function completeMrpOrderWithStock(a: Access, orderId: string, input: unknown, key: string) {
  const d = z
    .object({
      expected_version: z.number().int().positive(),
      quality_passed: z.boolean().default(true),
      inspector_notes: z.string().trim().max(500).default('Standard final inspection passed'),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'inventory.mrp.order.complete:' + orderId,
    key,
    d,
    () => requireServices(a, ['inventory']),
    async () => {
      const mo = await getOne(a, orderId, 'mrp_order', 'Manufacturing order');
      if (mo.version !== d.expected_version) fail(409, 'Manufacturing order changed; reload');
      const qc = await insert(
        a,
        'mrp_quality_check',
        {
          mrp_order_id: mo.id,
          reference: mo.data.reference,
          product_name: mo.data.finished_product_name,
          passed: d.quality_passed,
          inspector_notes: d.inspector_notes,
          inspected_by: a.actor,
        },
        { parent: mo.id, status: d.quality_passed ? 'passed' : 'failed' },
      );
      const lot = d.quality_passed
        ? await insert(
            a,
            'inventory_lot',
            {
              sku: mo.data.bom_code,
              lot_code: `MFG-${mo.data.reference}`,
              direction: 'inbound_production',
              mrp_order_id: mo.id,
              quantity_milli: mo.data.produce_quantity_milli,
              unit_cost_minor: mo.data.cost_rollup?.unit_cost_minor || 0,
              notes: `Auto-received finished goods from ${mo.data.reference}`,
            },
            { parent: mo.id, status: 'active' },
          )
        : null;
      const saved = await update(
        a,
        mo,
        { ...mo.data, quality_check_id: qc.id, finished_lot_id: lot?.id || null },
        { status: d.quality_passed ? 'done' : 'in_progress' },
        d.quality_passed ? 'mrp_completed_to_stock' : 'mrp_qc_failed',
      );
      if (lot) {
        await recordHubEvent(a, {
          source_app: 'manufacturing',
          target_app: 'inventory',
          event_type: 'inventory.finished_goods_received',
          source_id: mo.id,
          target_id: lot.id,
          summary: `Auto-received ${mo.data.produce_quantity_milli / 1000} units of ${mo.data.finished_product_name} into Inventory`,
        });
      }
      return {
        order: { id: saved.id, version: saved.version, status: saved.status, ...saved.data },
        quality_check: { id: qc.id, status: qc.status, ...qc.data },
        inventory_lot: lot ? { id: lot.id, status: lot.status, ...lot.data } : null,
      };
    },
  );
}

/** App 18 Support -> Escalate ticket into Work Milestone or Field Operations Dispatch. */
export async function escalateSupportTicket(a: Access, ticketId: string, input: unknown, key: string) {
  const d = z
    .object({
      target: z.enum(['work', 'field_operations']),
      scheduled_on: day,
      assignee: z.string().trim().min(2).max(120).default('Operations Team'),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'customers.support.ticket.escalate:' + ticketId,
    key,
    d,
    () => requireServices(a, ['customers']),
    async () => {
      const ticket = await getOne(a, ticketId, 'support_ticket', 'Support ticket');
      let created: any;
      if (d.target === 'work') {
        created = await insert(
          a,
          'work_milestone',
          {
            project_ref: 'SUPPORT-ESCALATIONS',
            name: `[Ticket] ${ticket.data.subject}`,
            target_on: d.scheduled_on,
            progress_pct: 0,
            notes: `Escalated from Support ticket ${ticket.id} (${ticket.data.customer_name})`,
          },
          { parent: ticket.id, status: 'open', due: d.scheduled_on },
        );
      } else {
        created = await insert(
          a,
          'field_dispatch',
          {
            title: `On-site service: ${ticket.data.subject}`,
            customer_name: ticket.data.customer_name,
            kind: 'field_service',
            technician: d.assignee,
            scheduled_on: d.scheduled_on,
            source_ticket_id: ticket.id,
            notes: ticket.data.description || '',
          },
          { parent: ticket.id, status: 'dispatched', due: d.scheduled_on },
        );
      }
      await recordHubEvent(a, {
        source_app: 'support',
        target_app: d.target,
        event_type: 'support.ticket_escalated',
        source_id: ticket.id,
        target_id: created.id,
        summary: `Escalated ticket "${ticket.data.subject}" to ${d.target}`,
      });
      return {
        ticket_id: ticket.id,
        target_app: d.target,
        created_record: { id: created.id, status: created.status, ...created.data },
      };
    },
  );
}

/** App 17 Marketing -> Capture Campaign Lead directly into CRM Scheduled Activity. */
export async function captureMarketingLead(a: Access, campaignId: string, input: unknown, key: string) {
  const d = z
    .object({
      lead_name: z.string().trim().min(2).max(200),
      due_on: day,
      notes: z.string().trim().max(1000).default(''),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'customers.marketing.capture_lead:' + campaignId,
    key,
    d,
    () => requireServices(a, ['customers']),
    async () => {
      const camp = await getOne(a, campaignId, 'marketing_campaign', 'Marketing campaign');
      const activity = await insert(
        a,
        'crm_scheduled_activity',
        {
          lead_ref: `MKT-${d.lead_name}`,
          activity_type: 'call',
          summary: `Campaign follow-up (${camp.data.name}): ${d.lead_name}`,
          due_on: d.due_on,
          notes: d.notes || `Captured from ${camp.data.channel} campaign ${camp.data.name}`,
          source_campaign_id: camp.id,
        },
        { parent: camp.id, status: 'planned', due: d.due_on },
      );
      await recordHubEvent(a, {
        source_app: 'marketing',
        target_app: 'crm',
        event_type: 'crm.lead_captured_from_campaign',
        source_id: camp.id,
        target_id: activity.id,
        summary: `Captured lead "${d.lead_name}" from campaign "${camp.data.name}" into CRM`,
      });
      return { id: activity.id, status: activity.status, ...activity.data };
    },
  );
}

// ---------------------------------------------------------------------------
// APP 18, 20, 21, 22 EXPANSIONS (Support KB, Quality, Field Dispatch, Logistics POD)
// ---------------------------------------------------------------------------
export async function listSupportKbArticles(a: Access) {
  return {
    data: (await records(a, 'support_kb_article'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createSupportKbArticle(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      title: z.string().trim().min(3).max(200),
      category: z.string().trim().min(2).max(80).default('General'),
      body: z.string().trim().min(5).max(10_000),
      published: z.boolean().default(true),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.support.kb.create', key, d, () => requireServices(a, ['customers']), async () => {
    const saved = await insert(a, 'support_kb_article', d, { status: d.published ? 'published' : 'draft' });
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function listMrpQualityChecks(a: Access) {
  return {
    data: (await records(a, 'mrp_quality_check'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function listFieldDispatches(a: Access) {
  return {
    data: (await records(a, 'field_dispatch'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createFieldDispatch(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      title: z.string().trim().min(3).max(200),
      customer_name: z.string().trim().min(2).max(200),
      kind: z.enum(['field_service', 'equipment_rental']).default('field_service'),
      technician: z.string().trim().min(2).max(120),
      scheduled_on: day,
      notes: z.string().trim().max(1000).default(''),
    })
    .strict()
    .parse(input);
  return operation(a, 'inventory.field_ops.dispatch.create', key, d, () => requireServices(a, ['inventory']), async () => {
    const saved = await insert(a, 'field_dispatch', d, { status: 'dispatched', due: d.scheduled_on });
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function recordLogisticsPod(a: Access, shipmentId: string, input: unknown, key: string) {
  const d = z
    .object({
      expected_version: z.number().int().positive(),
      received_by: z.string().trim().min(2).max(160),
      delivered_on: day,
      pod_notes: z.string().trim().max(1000).default('Signed proof of delivery captured'),
    })
    .strict()
    .parse(input);
  return operation(a, 'inventory.logistics.pod:' + shipmentId, key, d, () => requireServices(a, ['inventory']), async () => {
    const old = await getOne(a, shipmentId, 'logistics_shipment', 'Logistics shipment');
    if (old.version !== d.expected_version) fail(409, 'Shipment changed; reload');
    const saved = await update(
      a,
      old,
      { ...old.data, pod: { received_by: d.received_by, delivered_on: d.delivered_on, notes: d.pod_notes } },
      { status: 'delivered' },
      'shipment_pod_captured',
    );
    await recordHubEvent(a, {
      source_app: 'logistics',
      target_app: 'sales',
      event_type: 'delivery.proof_captured',
      source_id: saved.id,
      target_id: saved.data.source_order_id || saved.id,
      summary: `POD captured for ${saved.data.tracking_number} (received by ${d.received_by})`,
    });
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

// ---------------------------------------------------------------------------
// APP 23: PROPERTY & HOSPITALITY (Units, Leases -> Auto-Invoice, Reservations -> Folio Invoice)
// ---------------------------------------------------------------------------
export async function listPropertyUnits(a: Access) {
  return {
    data: (await records(a, 'property_unit'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createPropertyUnit(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      code: z.string().trim().min(2).max(60),
      name: z.string().trim().min(2).max(200),
      unit_type: z.enum(['apartment', 'commercial', 'hotel_room', 'villa', 'conference_hall']),
      currency: currencySchema.default('KES'),
      rate_minor: z.number().int().min(0).max(100_000_000_000),
      rate_period: z.enum(['night', 'month']).default('month'),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.property.unit.create', key, d, () => requireServices(a, ['customers']), async () => {
    const saved = await insert(a, 'property_unit', d, { status: 'available' });
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function listPropertyLeases(a: Access) {
  return {
    data: (await records(a, 'property_lease'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createPropertyLease(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      unit_id: uuid,
      tenant_name: z.string().trim().min(2).max(200),
      starts_on: day,
      ends_on: day,
      monthly_rent_minor: z.number().int().positive().max(100_000_000_000),
      currency: currencySchema.default('KES'),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.property.lease.create', key, d, () => requireServices(a, ['customers']), async () => {
    const unit = await getOne(a, d.unit_id, 'property_unit', 'Property unit');
    const saved = await insert(
      a,
      'property_lease',
      { ...d, unit_code: unit.data.code, unit_name: unit.data.name },
      { parent: unit.id, status: 'active', due: d.ends_on },
    );
    await update(a, unit, unit.data, { status: 'occupied' }, 'unit_leased');
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function billPropertyLease(a: Access, leaseId: string, input: unknown, key: string) {
  const d = z.object({ billing_month: z.string().trim().min(7).max(20), issue_date: day }).strict().parse(input);
  return operation(a, 'customers.property.lease.bill:' + leaseId, key, d, () => requireServices(a, ['customers', 'invoicing']), async () => {
    const lease = await getOne(a, leaseId, 'property_lease', 'Property lease');
    const invoice = await createCanonicalInvoice(a, {
      customer_name: lease.data.tenant_name,
      reference: `RENT-${lease.data.unit_code}-${d.billing_month}`,
      currency: lease.data.currency || 'KES',
      issue_date: d.issue_date,
      due_date: addMonthsIso(d.issue_date, 1),
      description: `Monthly rent for ${lease.data.unit_name} (${d.billing_month})`,
      amount_minor: lease.data.monthly_rent_minor,
      source_app: 'property_hospitality',
      source_id: lease.id,
    });
    return { lease_id: lease.id, invoice };
  });
}

export async function listHospitalityReservations(a: Access) {
  return {
    data: (await records(a, 'hospitality_reservation'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createHospitalityReservation(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      unit_id: uuid,
      guest_name: z.string().trim().min(2).max(200),
      check_in: day,
      check_out: day,
      nights: z.number().int().positive().max(365),
      nightly_rate_minor: z.number().int().positive().max(100_000_000_000),
      currency: currencySchema.default('KES'),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.property.reservation.create', key, d, () => requireServices(a, ['customers']), async () => {
    const unit = await getOne(a, d.unit_id, 'property_unit', 'Hospitality unit');
    const saved = await insert(
      a,
      'hospitality_reservation',
      {
        ...d,
        unit_code: unit.data.code,
        unit_name: unit.data.name,
        folio_total_minor: d.nights * d.nightly_rate_minor,
      },
      { parent: unit.id, status: 'confirmed', due: d.check_in },
    );
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function checkoutHospitalityReservation(a: Access, resId: string, input: unknown, key: string) {
  const d = z
    .object({
      expected_version: z.number().int().positive(),
      checkout_date: day,
      extras_minor: z.number().int().min(0).max(100_000_000_000).default(0),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.property.reservation.checkout:' + resId, key, d, () => requireServices(a, ['customers', 'invoicing']), async () => {
    const old = await getOne(a, resId, 'hospitality_reservation', 'Reservation');
    if (old.version !== d.expected_version) fail(409, 'Reservation changed; reload');
    const totalMinor = Number(old.data.folio_total_minor) + d.extras_minor;
    const invoice = await createCanonicalInvoice(a, {
      customer_name: old.data.guest_name,
      reference: `FOLIO-${old.data.unit_code}-${d.checkout_date}`,
      currency: old.data.currency || 'KES',
      issue_date: d.checkout_date,
      due_date: d.checkout_date,
      description: `Hospitality stay (${old.data.nights} nights @ ${old.data.unit_name}) + extras`,
      amount_minor: totalMinor,
      source_app: 'property_hospitality',
      source_id: old.id,
    });
    const saved = await update(
      a,
      old,
      { ...old.data, extras_minor: d.extras_minor, final_folio_minor: totalMinor, invoice_id: invoice.id },
      { status: 'checked_out' },
      'reservation_checked_out',
    );
    return { reservation: { id: saved.id, version: saved.version, status: saved.status, ...saved.data }, invoice };
  });
}

// ---------------------------------------------------------------------------
// APP 24: KNOWLEDGE & LEARNING (Wiki Articles, Courses, Enrollments & Assessments)
// ---------------------------------------------------------------------------
export async function listLearningArticles(a: Access) {
  return {
    data: (await records(a, 'learning_article'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createLearningArticle(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      title: z.string().trim().min(3).max(200),
      space: z.string().trim().min(2).max(80).default('Company Handbook'),
      content: z.string().trim().min(5).max(20_000),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.learning.article.create', key, d, () => requireServices(a, ['customers']), async () => {
    const saved = await insert(a, 'learning_article', { ...d, author: a.actor }, { status: 'published' });
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function listLearningCourses(a: Access) {
  return {
    data: (await records(a, 'learning_course'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createLearningCourse(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      code: z.string().trim().min(2).max(40),
      title: z.string().trim().min(3).max(200),
      department: z.string().trim().min(2).max(80).default('All Staff'),
      passing_score_pct: z.number().int().min(1).max(100).default(70),
      duration_minutes: z.number().int().positive().max(10_000).default(60),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.learning.course.create', key, d, () => requireServices(a, ['customers']), async () => {
    const saved = await insert(a, 'learning_course', d, { status: 'active' });
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function listLearningEnrollments(a: Access) {
  return {
    data: (await records(a, 'learning_enrollment'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createLearningEnrollment(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      course_id: uuid,
      employee_name: z.string().trim().min(2).max(200),
      due_on: day,
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.learning.enrollment.create', key, d, () => requireServices(a, ['customers']), async () => {
    const course = await getOne(a, d.course_id, 'learning_course', 'Course');
    const saved = await insert(
      a,
      'learning_enrollment',
      {
        ...d,
        course_code: course.data.code,
        course_title: course.data.title,
        passing_score_pct: course.data.passing_score_pct,
        score_pct: null,
      },
      { parent: course.id, status: 'enrolled', due: d.due_on },
    );
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function submitLearningAssessment(a: Access, enrollmentId: string, input: unknown, key: string) {
  const d = z
    .object({
      expected_version: z.number().int().positive(),
      correct_answers: z.number().int().min(0).max(1000),
      total_questions: z.number().int().positive().max(1000),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.learning.enrollment.assess:' + enrollmentId, key, d, () => requireServices(a, ['customers']), async () => {
    if (d.correct_answers > d.total_questions) fail(400, 'Correct answers cannot exceed total questions');
    const old = await getOne(a, enrollmentId, 'learning_enrollment', 'Enrollment');
    if (old.version !== d.expected_version) fail(409, 'Enrollment changed; reload');
    const scorePct = Math.round((d.correct_answers * 100) / d.total_questions);
    const passed = scorePct >= Number(old.data.passing_score_pct || 70);
    const saved = await update(
      a,
      old,
      { ...old.data, score_pct: scorePct, passed, certificate_ref: passed ? `CERT-${old.data.course_code}-${old.id.slice(0, 8).toUpperCase()}` : null },
      { status: passed ? 'certified' : 'needs_retake' },
      passed ? 'assessment_passed' : 'assessment_failed',
    );
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

// ---------------------------------------------------------------------------
// APP 25: AFRICORE STUDIO (No-Code App Builder, Custom Forms & Database Views)
// ---------------------------------------------------------------------------
export async function listStudioApps(a: Access) {
  return {
    data: (await records(a, 'studio_app'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createStudioApp(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/),
      name: z.string().trim().min(2).max(120),
      default_view: z.enum(['table', 'kanban', 'form']).default('table'),
      fields: z
        .array(
          z
            .object({
              key: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/),
              label: z.string().trim().min(1).max(80),
              type: z.enum(['text', 'number', 'date', 'select', 'currency']),
              required: z.boolean().default(false),
            })
            .strict(),
        )
        .min(1)
        .max(40),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.studio.app.create', key, d, () => requireServices(a, ['customers']), async () => {
    const saved = await insert(a, 'studio_app', d, { status: 'published' });
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function listStudioRecords(a: Access, appId: string) {
  const app = await getOne(a, appId, 'studio_app', 'Studio app');
  const rows = (await records(a, 'studio_record'))
    .filter((r) => r.parent_id === app.id)
    .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
    .reverse();
  return { app: { id: app.id, ...app.data }, data: rows };
}

export async function createStudioRecord(a: Access, appId: string, input: unknown, key: string) {
  const d = z.object({ values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) }).strict().parse(input);
  return operation(a, 'customers.studio.record.create:' + appId, key, d, () => requireServices(a, ['customers']), async () => {
    const app = await getOne(a, appId, 'studio_app', 'Studio app');
    for (const field of app.data.fields as any[]) {
      const v = d.values[field.key];
      if (field.required && (v === undefined || v === null || v === '')) {
        fail(400, `Missing required Studio field: ${field.label}`);
      }
    }
    const saved = await insert(a, 'studio_record', { app_slug: app.data.slug, values: d.values }, { parent: app.id, status: 'active' });
    await recordHubEvent(a, {
      source_app: 'studio',
      target_app: 'integrations_hub',
      event_type: 'studio.record_created',
      source_id: app.id,
      target_id: saved.id,
      summary: `Created Studio record in custom app "${app.data.name}"`,
    });
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

// ---------------------------------------------------------------------------
// APP 26: INTEGRATIONS HUB (Connectors, Data Pipelines & Cross-App Event Bus)
// ---------------------------------------------------------------------------
export async function listHubConnectors(a: Access) {
  return {
    data: (await records(a, 'hub_connector'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createHubConnector(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      name: z.string().trim().min(2).max(120),
      connector_type: z.enum(['webhook', 'rest_api', 'database_sync', 'payment_rail', 'messaging_provider']),
      source_app: z.string().trim().min(2).max(60),
      target_app: z.string().trim().min(2).max(60),
      endpoint_hint: z.string().trim().max(200).default('internal://africore-bus'),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.hub.connector.create', key, d, () => requireServices(a, ['customers']), async () => {
    const saved = await insert(a, 'hub_connector', d, { status: 'active' });
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function listHubPipelines(a: Access) {
  return {
    data: (await records(a, 'hub_pipeline'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createHubPipeline(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      name: z.string().trim().min(2).max(160),
      source_app: z.string().trim().min(2).max(60),
      target_app: z.string().trim().min(2).max(60),
      trigger_event: z.string().trim().min(2).max(100),
      action_summary: z.string().trim().min(2).max(240),
    })
    .strict()
    .parse(input);
  return operation(a, 'customers.hub.pipeline.create', key, d, () => requireServices(a, ['customers']), async () => {
    const saved = await insert(a, 'hub_pipeline', { ...d, run_count: 0, last_run_at: null }, { status: 'active' });
    return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
  });
}

export async function runHubPipeline(a: Access, pipelineId: string, key: string) {
  return operation(a, 'customers.hub.pipeline.run:' + pipelineId, key, { pipelineId }, () => requireServices(a, ['customers']), async () => {
    const pipe = await getOne(a, pipelineId, 'hub_pipeline', 'Data pipeline');
    const ranAt = new Date().toISOString();
    const updated = await update(
      a,
      pipe,
      { ...pipe.data, run_count: Number(pipe.data.run_count || 0) + 1, last_run_at: ranAt },
      { status: 'active' },
      'pipeline_executed',
    );
    const ev = await recordHubEvent(a, {
      source_app: pipe.data.source_app,
      target_app: pipe.data.target_app,
      event_type: pipe.data.trigger_event,
      source_id: pipe.id,
      target_id: pipe.id,
      summary: `Pipeline "${pipe.data.name}" executed: ${pipe.data.action_summary}`,
    });
    return {
      pipeline: { id: updated.id, version: updated.version, status: updated.status, ...updated.data },
      event: { id: ev.id, ...ev.data },
    };
  });
}

export async function listHubEvents(a: Access) {
  return {
    data: (await records(a, 'hub_event'))
      .map((r) => ({ id: r.id, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse()
      .slice(0, 100),
  };
}

export async function hubTopology(a: Access) {
  const events = await records(a, 'hub_event');
  const pipelines = await records(a, 'hub_pipeline');
  const connectors = await records(a, 'hub_connector');
  return {
    total_apps: 26,
    active_connectors: connectors.length,
    active_pipelines: pipelines.length,
    events_delivered: events.length,
    built_in_connections: [
      { from: 'sales', to: 'accounting', flow: 'Confirmed sale auto-creates issued canonical Invoice' },
      { from: 'sales', to: 'inventory', flow: 'Confirmed sale auto-deducts stocked line quantities' },
      { from: 'sales', to: 'logistics', flow: 'Confirmed sale auto-books dispatch Shipment' },
      { from: 'subscriptions', to: 'accounting', flow: 'Subscription renewal auto-creates recurring Invoice' },
      { from: 'manufacturing', to: 'inventory', flow: 'Completed MO runs QC & auto-receives finished goods lot' },
      { from: 'property_hospitality', to: 'accounting', flow: 'Lease billing & hospitality checkout auto-create Invoices' },
      { from: 'support', to: 'work', flow: 'Support tickets escalate 1-click into Work milestones or Field Dispatch' },
      { from: 'marketing', to: 'crm', flow: 'Campaign responses auto-create attributed CRM follow-ups' },
      { from: 'logistics', to: 'sales', flow: 'Proof of Delivery updates fulfillment audit trail' },
      { from: 'studio', to: 'integrations_hub', flow: 'No-code Studio records publish live events to Integrations Hub' },
    ],
  };
}
