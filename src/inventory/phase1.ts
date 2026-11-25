import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { type Access, audit, fail } from '../platform/auth';
import { currencySchema } from '../platform/domain';
import { requireServices } from '../marketplace/engine';
import { accountingPython } from '../erp/bank-python';
import { decode, insert, operation, update, type ERPKind } from '../erp/store';
import { postMovement, product, products, warehouse } from './service';

const day = z.iso.date();
const uuid = z.uuid();
const scope = (a: Access) => [a.org, a.environment];

const lotKind: ERPKind = 'inventory_lot';
const scrapKind: ERPKind = 'inventory_scrap';
const landedCostKind: ERPKind = 'inventory_landed_cost';
const policyKind: ERPKind = 'inventory_costing_policy';

export const lotCreateInput = z
  .object({
    product_id: uuid,
    warehouse_id: uuid,
    location_id: uuid.nullable().default(null),
    lot_number: z.string().trim().min(1).max(80),
    tracking_type: z.enum(['lot', 'serial']).default('lot'),
    quantity_milli: z.number().int().min(0).max(1e12).default(0),
    manufactured_on: day.nullable().default(null),
    expiry_on: day.nullable().default(null),
    best_before_on: day.nullable().default(null),
    removal_on: day.nullable().default(null),
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();

export const lotPatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['active', 'quarantined', 'expired', 'depleted']).optional(),
    quantity_milli: z.number().int().min(0).max(1e12).optional(),
    expiry_on: day.nullable().optional(),
    best_before_on: day.nullable().optional(),
    removal_on: day.nullable().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const scrapInput = z
  .object({
    product_id: uuid,
    warehouse_id: uuid,
    location_id: uuid.nullable().default(null),
    lot_id: uuid.nullable().default(null),
    quantity_milli: z.number().int().positive().max(1e12),
    reason: z.string().trim().min(8).max(980),
    approval_id: uuid.optional(),
  })
  .strict();

export const costingPolicyInput = z
  .object({
    default_method: z.enum(['standard', 'average', 'fifo']),
    product_methods: z.record(uuid, z.enum(['standard', 'average', 'fifo'])).default({}),
  })
  .strict();

export const landedCostInput = z
  .object({
    reference: z.string().trim().min(2).max(120),
    date_on: day,
    currency: currencySchema.default('KES'),
    split_method: z.enum(['equal', 'by_quantity', 'by_current_cost']).default('equal'),
    total_cost_minor: z.number().int().positive().max(100_000_000_000),
    description: z.string().trim().min(3).max(1000),
    movement_ids: z.array(uuid).min(1).max(200),
  })
  .strict();

const valuationResultSchema = z
  .object({
    method: z.enum(['standard', 'average', 'fifo']),
    on_hand_milli: z.number().int(),
    total_value_minor: z.number().int(),
    unit_cost_minor: z.number().int(),
    total_cogs_minor: z.number().int(),
    layers: z.array(
      z
        .object({
          ref: z.string(),
          quantity_milli: z.number().int(),
          value_minor: z.number().int(),
          unit_cost_minor: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

const landedCostAllocationSchema = z
  .object({
    split_method: z.enum(['equal', 'by_quantity', 'by_current_cost']),
    total_cost_minor: z.number().int().positive(),
    lines: z.array(
      z
        .object({
          id: z.string(),
          quantity_milli: z.number().int().positive(),
          former_cost_minor: z.number().int().min(0),
          additional_cost_minor: z.number().int().min(0),
          new_cost_minor: z.number().int().min(0),
          new_unit_cost_minor: z.number().int().min(0),
        })
        .strict(),
    ),
  })
  .strict();

async function records(a: Access, kind: ERPKind) {
  return (
    await dbAll(
      'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ORDER BY created_at,id',
      [...scope(a), kind],
    )
  ).map((row) => decode(a, row));
}

function todayNairobi() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
}

function expiryState(expiryOn: string | null, today: string) {
  if (!expiryOn) return 'none';
  if (expiryOn < today) return 'expired';
  const d1 = new Date(today + 'T00:00:00Z').getTime();
  const d2 = new Date(expiryOn + 'T00:00:00Z').getTime();
  if ((d2 - d1) / 86400000 <= 30) return 'expiring_soon';
  return 'ok';
}

export async function listLots(a: Access, query: { product_id?: string; warehouse_id?: string }) {
  await requireServices(a, ['inventory']);
  const today = todayNairobi();
  const allProducts = await products(a, '', 500, 0);
  const byProd = new Map(allProducts.map((p) => [p.id, p]));
  const items = (await records(a, lotKind))
    .filter(
      (lot) =>
        (!query.product_id || lot.data.product_id === query.product_id) &&
        (!query.warehouse_id || lot.data.warehouse_id === query.warehouse_id),
    )
    .map((lot) => {
      const prod = byProd.get(lot.data.product_id);
      const state = expiryState(lot.data.expiry_on ?? null, today);
      return {
        id: lot.id,
        version: lot.version,
        status: lot.status,
        created_at: lot.created_at,
        updated_at: lot.updated_at,
        ...lot.data,
        product_sku: prod?.sku ?? '',
        product_name: prod?.name ?? '',
        unit: prod?.unit ?? 'unit',
        expiry_state: state,
      };
    })
    .sort((x, y) => {
      const aExp = x.expiry_on || '9999-12-31';
      const bExp = y.expiry_on || '9999-12-31';
      return aExp.localeCompare(bExp) || x.lot_number.localeCompare(y.lot_number);
    });
  return {
    today,
    summary: {
      total: items.length,
      active: items.filter((i) => i.status === 'active').length,
      quarantined: items.filter((i) => i.status === 'quarantined').length,
      expired: items.filter((i) => i.expiry_state === 'expired' || i.status === 'expired').length,
      expiring_soon: items.filter((i) => i.expiry_state === 'expiring_soon').length,
    },
    data: items,
  };
}

export async function createLot(a: Access, input: unknown, key: string) {
  const d = lotCreateInput.parse(input);
  return operation(
    a,
    'inventory.lot.create',
    key,
    d,
    () => requireServices(a, ['inventory']),
    async () => {
      const prod = await product(a, d.product_id);
      if (!prod.track_inventory) fail(400, 'Lot/serial tracking requires an inventory-tracked product');
      await warehouse(a, d.warehouse_id);
      if (d.tracking_type === 'serial' && d.quantity_milli > 1000)
        fail(400, 'Serial-tracked items cannot exceed quantity 1.000 per serial number');
      const existing = await records(a, lotKind);
      if (
        existing.some(
          (l) =>
            l.data.product_id === d.product_id &&
            String(l.data.lot_number).toLowerCase() === d.lot_number.toLowerCase(),
        )
      )
        fail(409, 'Lot or serial number already exists for this product');
      const saved = await insert(a, lotKind, d, {
        parent: d.product_id,
        status: d.quantity_milli === 0 ? 'depleted' : 'active',
        due: d.expiry_on ?? undefined,
      });
      await audit(a.org, a.actor, 'inventory.lot_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function updateLot(a: Access, lotId: string, input: unknown, key: string) {
  const id = uuid.parse(lotId);
  const d = lotPatchInput.parse(input);
  return operation(
    a,
    'inventory.lot.update:' + id,
    key,
    d,
    () => requireServices(a, ['inventory']),
    async () => {
      const row = await dbGet(
        'SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?',
        [id, ...scope(a), lotKind],
      );
      if (!row) fail(404, 'Lot not found');
      const old = decode(a, row);
      if (old.version !== d.expected_version) fail(409, 'Lot changed; reload before editing');
      const nextQty = d.quantity_milli ?? old.data.quantity_milli;
      if (old.data.tracking_type === 'serial' && nextQty > 1000)
        fail(400, 'Serial-tracked items cannot exceed quantity 1.000');
      const nextData = {
        ...old.data,
        quantity_milli: nextQty,
        expiry_on: d.expiry_on !== undefined ? d.expiry_on : old.data.expiry_on,
        best_before_on:
          d.best_before_on !== undefined ? d.best_before_on : old.data.best_before_on,
        removal_on: d.removal_on !== undefined ? d.removal_on : old.data.removal_on,
        notes: d.notes !== undefined ? d.notes : old.data.notes,
      };
      const nextStatus = d.status ?? (nextQty === 0 ? 'depleted' : old.status);
      const saved = await update(
        a,
        old,
        nextData,
        { status: nextStatus, due_on: nextData.expiry_on ?? null },
        'lot_updated',
      );
      await audit(a.org, a.actor, 'inventory.lot_updated', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function listScraps(a: Access) {
  await requireServices(a, ['inventory']);
  const allProducts = await products(a, '', 500, 0);
  const byProd = new Map(allProducts.map((p) => [p.id, p]));
  const items = (await records(a, scrapKind))
    .map((s) => ({
      id: s.id,
      version: s.version,
      status: s.status,
      created_at: s.created_at,
      ...s.data,
      product_sku: byProd.get(s.data.product_id)?.sku ?? '',
      product_name: byProd.get(s.data.product_id)?.name ?? '',
    }))
    .reverse();
  return { data: items };
}

export async function createScrap(a: Access, input: unknown, key: string) {
  const d = scrapInput.parse(input);
  await requireServices(a, ['inventory']);
  let lotRecord: any = null;
  if (d.lot_id) {
    const row = await dbGet(
      'SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?',
      [d.lot_id, ...scope(a), lotKind],
    );
    if (!row) fail(404, 'Lot not found');
    lotRecord = decode(a, row);
    if (lotRecord.data.product_id !== d.product_id)
      fail(400, 'Selected lot does not belong to this product');
    if (lotRecord.data.quantity_milli < d.quantity_milli)
      fail(409, 'Scrap quantity exceeds available lot quantity');
  }
  const movement = await postMovement(
    a,
    {
      product_id: d.product_id,
      warehouse_id: d.warehouse_id,
      location_id: d.location_id,
      kind: 'adjustment',
      quantity_milli: -d.quantity_milli,
      reason: 'Scrap: ' + d.reason,
      ...(d.approval_id ? { approval_id: d.approval_id } : {}),
    },
    key + ':move',
  );
  return operation(
    a,
    'inventory.scrap.create',
    key,
    d,
    () => requireServices(a, ['inventory']),
    async () => {
      if (lotRecord) {
        const nextQty = Math.max(0, Number(lotRecord.data.quantity_milli) - d.quantity_milli);
        await update(
          a,
          lotRecord,
          { ...lotRecord.data, quantity_milli: nextQty },
          { status: nextQty === 0 ? 'depleted' : lotRecord.status },
          'scrap_deducted',
        );
      }
      const saved = await insert(
        a,
        scrapKind,
        {
          ...d,
          movement_id: movement.id,
          lot_number: lotRecord?.data.lot_number ?? null,
          scrapped_by: a.actor,
        },
        { parent: d.product_id, status: 'done' },
      );
      await audit(a.org, a.actor, 'inventory.scrap_posted', saved.id);
      return { id: saved.id, status: saved.status, movement_id: movement.id, ...saved.data };
    },
  );
}

async function getPolicy(a: Access) {
  const row = (await records(a, policyKind))[0];
  return {
    record: row ?? null,
    default_method: (row?.data.default_method ?? 'average') as 'standard' | 'average' | 'fifo',
    product_methods: (row?.data.product_methods ?? {}) as Record<
      string,
      'standard' | 'average' | 'fifo'
    >,
  };
}

export async function saveCostingPolicy(a: Access, input: unknown, key: string) {
  const d = costingPolicyInput.parse(input);
  return operation(
    a,
    'inventory.valuation.policy',
    key,
    d,
    () => requireServices(a, ['inventory']),
    async () => {
      const current = await getPolicy(a);
      const saved = current.record
        ? await update(a, current.record, d, {}, 'costing_policy_updated')
        : await insert(a, policyKind, d);
      await audit(a.org, a.actor, 'inventory.costing_policy_updated', saved.id);
      return { version: saved.version, ...saved.data };
    },
  );
}

export async function stockValuationReport(a: Access, productId?: string) {
  await requireServices(a, ['inventory']);
  const policy = await getPolicy(a);
  const allProducts = (await products(a, '', 500, 0)).filter(
    (p) => p.track_inventory && (!productId || p.id === productId),
  );
  const movements = await dbAll(
    'SELECT id,product_id,kind,quantity_milli,created_at FROM ac_stock_movements WHERE org_id=? AND environment=? ORDER BY created_at ASC, id ASC',
    scope(a),
  );
  const landedCosts = await records(a, landedCostKind);
  const landedByProduct = new Map<string, Array<{ created_at: string; id: string; additional_cost_minor: number }>>();
  for (const lc of landedCosts) {
    for (const line of lc.data.allocations || []) {
      const list = landedByProduct.get(line.product_id) ?? [];
      list.push({
        created_at: lc.created_at,
        id: lc.id,
        additional_cost_minor: line.additional_cost_minor,
      });
      landedByProduct.set(line.product_id, list);
    }
  }
  const rows = [];
  const totalsByCurrency: Record<string, { value_minor: number; cogs_minor: number }> = {};
  for (const p of allProducts) {
    const method = policy.product_methods[p.id] ?? policy.default_method;
    const pMoves = movements
      .filter((m) => m.product_id === p.id && m.kind !== 'transfer')
      .map((m) => ({
        created_at: m.created_at,
        id: m.id,
        kind: m.kind,
        quantity_milli: Number(m.quantity_milli),
        unit_cost_minor: Number(p.purchase_cost_minor || 0),
      }));
    const pLanded = (landedByProduct.get(p.id) ?? []).map((l) => ({
      created_at: l.created_at,
      id: l.id,
      kind: 'landed_cost',
      additional_cost_minor: l.additional_cost_minor,
    }));
    const events = [...pMoves, ...pLanded].sort((x, y) =>
      String(x.created_at).localeCompare(String(y.created_at)),
    );
    const val = await accountingPython(
      'inventory_valuation',
      {
        op: 'valuation',
        method,
        standard_cost_minor: Number(p.purchase_cost_minor || 0),
        events,
      },
      valuationResultSchema,
    );
    rows.push({
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      currency: p.currency,
      standard_cost_minor: Number(p.purchase_cost_minor || 0),
      ...val,
    });
    const cur = totalsByCurrency[p.currency] ?? { value_minor: 0, cogs_minor: 0 };
    cur.value_minor += val.total_value_minor;
    cur.cogs_minor += val.total_cogs_minor;
    totalsByCurrency[p.currency] = cur;
  }
  return {
    policy: {
      default_method: policy.default_method,
      product_methods: policy.product_methods,
    },
    totals_by_currency: totalsByCurrency,
    data: rows,
  };
}

async function resolveLandedLines(a: Access, d: z.infer<typeof landedCostInput>) {
  const uniqueIds = [...new Set(d.movement_ids)];
  const lines = [];
  for (const moveId of uniqueIds) {
    const move = await dbGet(
      'SELECT id,product_id,warehouse_id,kind,quantity_milli,created_at FROM ac_stock_movements WHERE id=? AND org_id=? AND environment=?',
      [moveId, ...scope(a)],
    );
    if (!move || move.kind !== 'receipt' || Number(move.quantity_milli) <= 0)
      fail(400, 'Landed costs can only target posted positive stock receipts: ' + moveId);
    const p = await product(a, move.product_id);
    if (p.currency !== d.currency)
      fail(400, 'Receipt product currency must match landed cost currency');
    const qty = Number(move.quantity_milli);
    const former = Math.round((qty * Number(p.purchase_cost_minor || 0)) / 1000);
    lines.push({
      id: move.id,
      product_id: p.id,
      product_sku: p.sku,
      product_name: p.name,
      quantity_milli: qty,
      former_cost_minor: former,
    });
  }
  const allocation = await accountingPython(
    'inventory_valuation',
    {
      op: 'landed_cost',
      total_cost_minor: d.total_cost_minor,
      split_method: d.split_method,
      lines: lines.map(({ id, quantity_milli, former_cost_minor }) => ({
        id,
        quantity_milli,
        former_cost_minor,
      })),
    },
    landedCostAllocationSchema,
  );
  const byId = new Map(lines.map((l) => [l.id, l]));
  return {
    ...allocation,
    allocations: allocation.lines.map((al) => ({
      ...al,
      product_id: byId.get(al.id)!.product_id,
      product_sku: byId.get(al.id)!.product_sku,
      product_name: byId.get(al.id)!.product_name,
    })),
  };
}

export async function previewLandedCost(a: Access, input: unknown) {
  await requireServices(a, ['inventory']);
  const d = landedCostInput.parse(input);
  return resolveLandedLines(a, d);
}

export async function listLandedCosts(a: Access) {
  await requireServices(a, ['inventory']);
  const items = (await records(a, landedCostKind))
    .map((lc) => ({
      id: lc.id,
      version: lc.version,
      status: lc.status,
      created_at: lc.created_at,
      ...lc.data,
    }))
    .reverse();
  return { data: items };
}

export async function createLandedCost(a: Access, input: unknown, key: string) {
  const d = landedCostInput.parse(input);
  return operation(
    a,
    'inventory.landed_cost.create',
    key,
    d,
    () => requireServices(a, ['inventory']),
    async () => {
      const computed = await resolveLandedLines(a, d);
      const saved = await insert(
        a,
        landedCostKind,
        {
          reference: d.reference,
          date_on: d.date_on,
          currency: d.currency,
          split_method: d.split_method,
          total_cost_minor: d.total_cost_minor,
          description: d.description,
          movement_ids: d.movement_ids,
          allocations: computed.allocations,
          posted_by: a.actor,
        },
        { status: 'posted', due: d.date_on },
      );
      await audit(a.org, a.actor, 'inventory.landed_cost_posted', saved.id);
      return { id: saved.id, status: saved.status, ...saved.data };
    },
  );
}
