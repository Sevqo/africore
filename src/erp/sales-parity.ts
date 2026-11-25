import { createHash } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { type Access, audit, fail } from '../platform/auth';
import { currencySchema } from '../platform/domain';
import { requireServices } from '../marketplace/engine';
import { accountingPython } from './bank-python';
import { recordHubEvent } from './apps-17-26';
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

// ---------------------------------------------------------------------------
// 1. PROMO CODES, COUPONS & DISCOUNTS (Odoo sale_loyalty)
// ---------------------------------------------------------------------------
const promoInput = z
  .object({
    code: z.string().trim().min(2).max(40),
    name: z.string().trim().min(2).max(160),
    currency: currencySchema.default('KES'),
    discount_type: z.enum(['percent_bps', 'fixed_minor', 'buy_x_get_y']),
    value: z.number().int().min(0).max(100_000_000_000).default(0),
    min_order_minor: z.number().int().min(0).max(100_000_000_000).default(0),
    max_discount_minor: z.number().int().min(0).max(100_000_000_000).nullable().default(null),
    buy_x: z.number().int().min(0).max(1000).default(0),
    get_y: z.number().int().min(0).max(1000).default(0),
    valid_until: day.nullable().default(null),
    max_uses: z.number().int().positive().max(1_000_000).nullable().default(null),
  })
  .strict();

const promoEvalSchema = z
  .object({
    eligible: z.boolean(),
    reason: z.string(),
    discount_minor: z.number().int(),
    net_total_minor: z.number().int(),
  })
  .strict();

export async function listSalesPromos(a: Access) {
  await requireServices(a, ['sales']);
  return {
    data: (await records(a, 'sales_promo_code'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createSalesPromo(a: Access, input: unknown, key: string) {
  const d = promoInput.parse(input);
  const code = d.code.toUpperCase();
  return operation(
    a,
    'sales.promo.create',
    key,
    { ...d, code },
    () => requireServices(a, ['sales']),
    async () => {
      const existing = (await records(a, 'sales_promo_code')).find((r) => r.data.code === code);
      if (existing) fail(409, 'Promo code already exists');
      const saved = await insert(
        a,
        'sales_promo_code',
        { ...d, code, uses_count: 0 },
        { status: 'active', due: d.valid_until ?? undefined },
      );
      await audit(a.org, a.actor, 'sales.promo_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function applySalesPromo(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      code: z.string().trim().min(2).max(40),
      order_subtotal_minor: z.number().int().min(0).max(100_000_000_000),
      qualifying_qty: z.number().int().min(0).max(1_000_000).default(0),
      qualifying_unit_price_minor: z.number().int().min(0).max(100_000_000_000).default(0),
      as_of: day.optional(),
      commit: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['sales']);
  const code = d.code.toUpperCase();
  const promo = (await records(a, 'sales_promo_code')).find((r) => r.data.code === code);
  if (!promo || promo.status !== 'active') {
    fail(404, 'Active promo code not found');
    throw new Error('Active promo code not found');
  }
  const todayStr = d.as_of || new Date().toISOString().slice(0, 10);
  if (promo.data.valid_until && todayStr > promo.data.valid_until) {
    return { code, eligible: false, reason: 'Promo code has expired', discount_minor: 0, net_total_minor: d.order_subtotal_minor };
  }
  if (promo.data.max_uses && Number(promo.data.uses_count || 0) >= Number(promo.data.max_uses)) {
    return { code, eligible: false, reason: 'Promo code redemption limit reached', discount_minor: 0, net_total_minor: d.order_subtotal_minor };
  }
  const result = await accountingPython(
    'sales_promotions_commissions',
    {
      op: 'promo_evaluate',
      order_subtotal_minor: d.order_subtotal_minor,
      discount_type: promo.data.discount_type,
      value: promo.data.value,
      min_order_minor: promo.data.min_order_minor,
      max_discount_minor: promo.data.max_discount_minor,
      buy_x: promo.data.buy_x,
      get_y: promo.data.get_y,
      qualifying_qty: d.qualifying_qty,
      qualifying_unit_price_minor: d.qualifying_unit_price_minor,
    },
    promoEvalSchema,
  );
  if (d.commit && result.eligible) {
    await operation(
      a,
      'sales.promo.redeem:' + promo.id,
      key,
      d,
      () => requireServices(a, ['sales']),
      async () => {
        await update(
          a,
          promo,
          { ...promo.data, uses_count: Number(promo.data.uses_count || 0) + 1 },
          {},
          'promo_redeemed',
        );
        return { redeemed: true };
      },
    );
  }
  return { promo_id: promo.id, code, ...result };
}

// ---------------------------------------------------------------------------
// 2. ONLINE QUOTE E-SIGNATURE (Odoo portal_sign)
// ---------------------------------------------------------------------------
export async function listQuoteSignatures(a: Access) {
  await requireServices(a, ['sales']);
  return {
    data: (await records(a, 'sales_quote_signature'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function signSalesQuote(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      quotation_ref: z.string().trim().min(2).max(120),
      signer_name: z.string().trim().min(2).max(160),
      signer_email: z.string().trim().email(),
      agreed_total_minor: z.number().int().min(0).max(100_000_000_000),
      currency: currencySchema.default('KES'),
      signature_text: z.string().trim().min(2).max(200),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'sales.quote.sign',
    key,
    d,
    () => requireServices(a, ['sales']),
    async () => {
      const signedAt = new Date().toISOString();
      const digest = createHash('sha256')
        .update(JSON.stringify({ ...d, signed_at: signedAt, org: a.org }))
        .digest('hex');
      const saved = await insert(
        a,
        'sales_quote_signature',
        { ...d, signed_at: signedAt, signature_sha256: digest, verified_by: a.actor },
        { status: 'signed' },
      );
      await recordHubEvent(a, {
        source_app: 'sales',
        target_app: 'documents',
        event_type: 'quote.electronically_signed',
        source_id: saved.id,
        target_id: saved.id,
        summary: `Quote ${d.quotation_ref} e-signed by ${d.signer_name} (${digest.slice(0, 12)})`,
      });
      await audit(a.org, a.actor, 'sales.quote_signed', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

// ---------------------------------------------------------------------------
// 3. SALES COMMISSIONS & QUOTA TIERS (Odoo sales_team)
// ---------------------------------------------------------------------------
const commissionPlanInput = z
  .object({
    name: z.string().trim().min(2).max(160),
    currency: currencySchema.default('KES'),
    quota_minor: z.number().int().min(0).max(100_000_000_000),
    tiers: z
      .array(
        z
          .object({
            up_to_minor: z.number().int().positive().nullable(),
            rate_bps: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

const commissionResultSchema = z
  .object({
    achieved_revenue_minor: z.number().int(),
    quota_minor: z.number().int(),
    attainment_bps: z.number().int(),
    total_commission_minor: z.number().int(),
    breakdown: z.array(
      z
        .object({
          band_revenue_minor: z.number().int(),
          rate_bps: z.number().int(),
          commission_minor: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

export async function listCommissionPlans(a: Access) {
  await requireServices(a, ['sales']);
  return {
    data: (await records(a, 'sales_commission_plan'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createCommissionPlan(a: Access, input: unknown, key: string) {
  const d = commissionPlanInput.parse(input);
  return operation(
    a,
    'sales.commission_plan.create',
    key,
    d,
    () => requireServices(a, ['sales']),
    async () => {
      const saved = await insert(a, 'sales_commission_plan', d, { status: 'active' });
      await audit(a.org, a.actor, 'sales.commission_plan_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function evaluateSalesCommission(a: Access, input: unknown) {
  await requireServices(a, ['sales']);
  const d = z
    .object({
      plan_id: uuid,
      salesperson_name: z.string().trim().min(2).max(160),
      achieved_revenue_minor: z.number().int().min(0).max(100_000_000_000),
    })
    .strict()
    .parse(input);
  const row = await dbGet(
    'SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?',
    [d.plan_id, ...scope(a), 'sales_commission_plan'],
  );
  if (!row) fail(404, 'Commission plan not found');
  const plan = decode(a, row);
  const calc = await accountingPython(
    'sales_promotions_commissions',
    {
      op: 'commission_calculate',
      achieved_revenue_minor: d.achieved_revenue_minor,
      quota_minor: plan.data.quota_minor,
      tiers: plan.data.tiers,
    },
    commissionResultSchema,
  );
  return { plan_id: plan.id, plan_name: plan.data.name, salesperson_name: d.salesperson_name, currency: plan.data.currency, ...calc };
}

// ---------------------------------------------------------------------------
// 4. SHIPPING / DELIVERY RATE RULES (Odoo delivery)
// ---------------------------------------------------------------------------
const shippingMethodInput = z
  .object({
    name: z.string().trim().min(2).max(160),
    carrier_name: z.string().trim().min(2).max(120),
    currency: currencySchema.default('KES'),
    pricing_mode: z.enum(['fixed', 'weight_based']),
    base_fee_minor: z.number().int().min(0).max(100_000_000_000),
    per_kg_minor: z.number().int().min(0).max(100_000_000_000).default(0),
    free_over_minor: z.number().int().min(0).max(100_000_000_000).nullable().default(null),
  })
  .strict();

const shippingResultSchema = z
  .object({
    shipping_minor: z.number().int(),
    free_shipping_applied: z.boolean(),
  })
  .strict();

export async function listShippingMethods(a: Access) {
  await requireServices(a, ['sales']);
  return {
    data: (await records(a, 'sales_shipping_method'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createShippingMethod(a: Access, input: unknown, key: string) {
  const d = shippingMethodInput.parse(input);
  return operation(
    a,
    'sales.shipping_method.create',
    key,
    d,
    () => requireServices(a, ['sales']),
    async () => {
      const saved = await insert(a, 'sales_shipping_method', d, { status: 'active' });
      await audit(a.org, a.actor, 'sales.shipping_method_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function calculateSalesShipping(a: Access, input: unknown) {
  await requireServices(a, ['sales']);
  const d = z
    .object({
      method_id: uuid,
      order_subtotal_minor: z.number().int().min(0).max(100_000_000_000),
      weight_grams: z.number().int().min(0).max(100_000_000).default(0),
    })
    .strict()
    .parse(input);
  const row = await dbGet(
    'SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?',
    [d.method_id, ...scope(a), 'sales_shipping_method'],
  );
  if (!row) fail(404, 'Shipping method not found');
  const method = decode(a, row);
  const calc = await accountingPython(
    'sales_promotions_commissions',
    {
      op: 'shipping_rate',
      order_subtotal_minor: d.order_subtotal_minor,
      weight_grams: d.weight_grams,
      pricing_mode: method.data.pricing_mode,
      base_fee_minor: method.data.base_fee_minor,
      per_kg_minor: method.data.per_kg_minor,
      free_over_minor: method.data.free_over_minor,
    },
    shippingResultSchema,
  );
  return { method_id: method.id, name: method.data.name, carrier_name: method.data.carrier_name, currency: method.data.currency, ...calc };
}

// ---------------------------------------------------------------------------
// 5. PRODUCT VARIANT MATRIX & INVOICING POLICY (Odoo sale_product_matrix / sale)
// ---------------------------------------------------------------------------
const variantMatrixSchema = z
  .object({
    line_count: z.number().int(),
    total_quantity: z.number().int(),
    grand_total_minor: z.number().int(),
    lines: z.array(
      z
        .object({
          sku: z.string(),
          description: z.string(),
          quantity: z.number().int(),
          unit_price_minor: z.number().int(),
          line_total_minor: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

export async function expandSalesVariantMatrix(a: Access, input: unknown) {
  await requireServices(a, ['sales']);
  const d = z
    .object({
      base_sku: z.string().trim().min(1).max(60),
      base_name: z.string().trim().min(1).max(160),
      base_price_minor: z.number().int().min(0).max(100_000_000_000),
      cells: z
        .array(
          z
            .object({
              row_value: z.string().trim().min(1).max(60),
              col_value: z.string().trim().min(1).max(60),
              quantity: z.number().int().min(0).max(100_000),
              price_delta_minor: z.number().int().min(-100_000_000).max(100_000_000).default(0),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict()
    .parse(input);
  return accountingPython('sales_promotions_commissions', { op: 'variant_matrix', ...d }, variantMatrixSchema);
}

const invoicingPolicyResultSchema = z
  .object({
    policy: z.enum(['ordered_qty', 'delivered_qty']),
    total_invoiceable_minor: z.number().int(),
    can_invoice: z.boolean(),
    lines: z.array(
      z
        .object({
          id: z.string(),
          description: z.string(),
          qty_to_invoice: z.number().int(),
          unit_price_minor: z.number().int(),
          amount_minor: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

export async function evaluateSalesInvoicingPolicy(a: Access, input: unknown) {
  await requireServices(a, ['sales']);
  const d = z
    .object({
      policy: z.enum(['ordered_qty', 'delivered_qty']),
      lines: z
        .array(
          z
            .object({
              id: z.string().trim().min(1).max(80),
              description: z.string().trim().min(1).max(200),
              ordered_qty: z.number().int().min(0).max(1_000_000),
              delivered_qty: z.number().int().min(0).max(1_000_000),
              already_invoiced_qty: z.number().int().min(0).max(1_000_000).default(0),
              unit_price_minor: z.number().int().min(0).max(100_000_000_000),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict()
    .parse(input);
  return accountingPython('sales_promotions_commissions', { op: 'invoiceable_policy', ...d }, invoicingPolicyResultSchema);
}

// ---------------------------------------------------------------------------
// 6. CUSTOMER / PRODUCT SALES WARNINGS & BLOCKS (Odoo sale warning)
// ---------------------------------------------------------------------------
export async function listSalesWarnings(a: Access) {
  await requireServices(a, ['sales']);
  return {
    data: (await records(a, 'sales_warning_rule'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createSalesWarning(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      target_type: z.enum(['customer', 'product']),
      target_ref: z.string().trim().min(1).max(160),
      severity: z.enum(['warning', 'blocking']),
      message: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'sales.warning.create',
    key,
    d,
    () => requireServices(a, ['sales']),
    async () => {
      const saved = await insert(a, 'sales_warning_rule', d, { status: 'active' });
      await audit(a.org, a.actor, 'sales.warning_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function checkSalesWarnings(a: Access, input: unknown) {
  await requireServices(a, ['sales']);
  const d = z
    .object({
      customer_ref: z.string().trim().max(160).optional(),
      product_refs: z.array(z.string().trim().max(160)).max(200).default([]),
    })
    .strict()
    .parse(input);
  const all = (await records(a, 'sales_warning_rule')).filter((r) => r.status === 'active');
  const matched = all.filter(
    (r) =>
      (r.data.target_type === 'customer' && d.customer_ref && r.data.target_ref.toLowerCase() === d.customer_ref.toLowerCase()) ||
      (r.data.target_type === 'product' && d.product_refs.some((p) => p.toLowerCase() === r.data.target_ref.toLowerCase())),
  );
  const blocking = matched.some((m) => m.data.severity === 'blocking');
  return {
    blocked: blocking,
    warnings: matched.map((m) => ({
      id: m.id,
      target_type: m.data.target_type,
      target_ref: m.data.target_ref,
      severity: m.data.severity,
      message: m.data.message,
    })),
  };
}
