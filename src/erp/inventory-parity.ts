import { z } from 'zod';
import { dbAll } from '../db/adapter';
import { type Access } from '../platform/auth';
import { requireServices } from '../marketplace/engine';
import { accountingPython } from './bank-python';
import { decode, insert, operation, type ERPKind } from './store';

const text = (max: number) => z.string().trim().min(1).max(max);
const scope = (a: Access) => [a.org, a.environment];

async function records(a: Access, kind: ERPKind) {
  return (
    await dbAll(
      'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ORDER BY created_at,id',
      [...scope(a), kind],
    )
  ).map((row) => decode(a, row));
}

const replenishSchema = z.object({
  suggestion_count: z.number().int(),
  total_order_qty: z.number().int(),
  suggestions: z.array(
    z.object({
      product_id: z.string(),
      warehouse: z.string(),
      forecast_qty: z.number().int(),
      min_qty: z.number().int(),
      max_qty: z.number().int(),
      order_qty: z.number().int(),
      lead_days: z.number().int(),
      trigger: z.string(),
    }),
  ),
});

const putawaySchema = z.object({
  matched: z.boolean(),
  rule_id: z.string().nullable(),
  location_out: z.string(),
  storage_category: z.string(),
});

const waveSchema = z.object({
  wave_count: z.number().int(),
  waves: z.array(
    z.object({
      wave_number: z.string(),
      zone: z.string(),
      carrier: z.string(),
      picking_ids: z.array(z.string()),
      picking_count: z.number().int(),
      total_weight_grams: z.number().int(),
    }),
  ),
});

const backorderSchema = z.object({
  needs_backorder: z.boolean(),
  fulfilled_lines: z.array(z.object({ product_id: z.string(), qty: z.number().int() })),
  backorder_lines: z.array(z.object({ product_id: z.string(), qty: z.number().int() })),
});

// 1. Min/Max Reordering Rules & Replenishment
export async function listReorderingRules(a: Access) {
  await requireServices(a, ['inventory']);
  const rows = await records(a, 'stock_reordering_rule');
  return { rules: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createReorderingRule(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      product_id: text(80),
      warehouse: text(80).default('WH-MAIN'),
      min_qty: z.number().int().min(0).max(1_000_000),
      max_qty: z.number().int().min(1).max(1_000_000),
      qty_multiple: z.number().int().min(1).max(100_000).default(1),
      lead_days: z.number().int().min(0).max(365).default(3),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'inventory.reordering_rule.create',
    key,
    d,
    () => requireServices(a, ['inventory']),
    async () => {
      const rec = await insert(a, 'stock_reordering_rule', d, { status: 'active' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function runReplenishment(a: Access, input: unknown) {
  const d = z
    .object({
      positions: z
        .array(
          z
            .object({
              product_id: text(80),
              warehouse: text(80).default('WH-MAIN'),
              on_hand_qty: z.number().int().min(-1_000_000).max(1_000_000),
              incoming_qty: z.number().int().min(0).max(1_000_000).default(0),
              outgoing_qty: z.number().int().min(0).max(1_000_000).default(0),
            })
            .strict(),
        )
        .max(500)
        .default([]),
    })
    .strict()
    .parse(input || {});
  await requireServices(a, ['inventory']);
  const posMap = new Map(d.positions.map((p) => [`${p.warehouse}:${p.product_id}`, p]));
  const rules = (await records(a, 'stock_reordering_rule'))
    .filter((r) => r.status === 'active')
    .map((r) => {
      const p = posMap.get(`${r.data.warehouse}:${r.data.product_id}`);
      return {
        ...r.data,
        on_hand_qty: p?.on_hand_qty ?? 0,
        incoming_qty: p?.incoming_qty ?? 0,
        outgoing_qty: p?.outgoing_qty ?? 0,
      };
    });
  return accountingPython('warehouse_replenishment_waves', { op: 'replenishment_plan', rules }, replenishSchema);
}

// 2. Putaway Rules
export async function listPutawayRules(a: Access) {
  await requireServices(a, ['inventory']);
  const rows = await records(a, 'stock_putaway_rule');
  return { rules: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createPutawayRule(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      location_in: text(100),
      location_out: text(100),
      product_id: text(80).optional(),
      category: text(80).optional(),
      storage_category: text(80).default('standard'),
      priority: z.number().int().min(1).max(1000).default(100),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'inventory.putaway_rule.create',
    key,
    d,
    () => requireServices(a, ['inventory']),
    async () => {
      const rec = await insert(a, 'stock_putaway_rule', d, { status: 'active' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function resolvePutawayLocation(a: Access, input: unknown) {
  const d = z
    .object({
      product_id: text(80),
      category: text(80).optional(),
      location_in: text(100),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['inventory']);
  const rules = (await records(a, 'stock_putaway_rule'))
    .filter((r) => r.status === 'active')
    .map((r) => ({ id: r.id, ...r.data }));
  return accountingPython(
    'warehouse_replenishment_waves',
    { op: 'resolve_putaway', ...d, rules },
    putawaySchema,
  );
}

// 3. Wave & Batch Picking
export async function planPickingWaves(a: Access, input: unknown) {
  const d = z
    .object({
      max_weight_grams: z.number().int().min(1).max(10_000_000).default(50_000),
      max_pickings_per_wave: z.number().int().min(1).max(200).default(10),
      pickings: z
        .array(
          z
            .object({
              picking_id: text(80),
              zone: text(60).default('DEFAULT'),
              carrier: text(60).default('STANDARD'),
              weight_grams: z.number().int().min(0).max(10_000_000).default(1000),
            })
            .strict(),
        )
        .min(1)
        .max(500),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['inventory']);
  return accountingPython('warehouse_replenishment_waves', { op: 'plan_waves', ...d }, waveSchema);
}

// 4. Packages
export async function listStockPackages(a: Access) {
  await requireServices(a, ['inventory']);
  const rows = await records(a, 'stock_package');
  return { packages: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createStockPackage(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      barcode: text(80),
      package_type: z.enum(['box', 'pallet', 'crate', 'envelope']).default('box'),
      location: text(100).default('WH/Packing'),
      tare_weight_grams: z.number().int().min(0).max(1_000_000).default(200),
      net_weight_grams: z.number().int().min(0).max(10_000_000).default(0),
      items: z
        .array(z.object({ product_id: text(80), qty: z.number().int().min(1) }).strict())
        .default([]),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'inventory.package.create',
    key,
    d,
    () => requireServices(a, ['inventory']),
    async () => {
      const rec = await insert(
        a,
        'stock_package',
        {
          ...d,
          gross_weight_grams: d.tare_weight_grams + d.net_weight_grams,
        },
        { status: 'packed' },
      );
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

// 5. Barcode Scan Processor
export async function processBarcodeScan(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      barcode: text(120),
      action: z.enum(['receive', 'pick', 'pack', 'cycle_count']),
      location: text(100).default('WH/Stock'),
      qty: z.number().int().min(1).max(1_000_000).default(1),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'inventory.barcode.scan',
    key,
    d,
    () => requireServices(a, ['inventory']),
    async () => {
      const packages = await records(a, 'stock_package');
      const matchedPkg = packages.find((p) => p.data.barcode === d.barcode);
      const rec = await insert(
        a,
        'stock_barcode_scan',
        {
          ...d,
          matched_kind: matchedPkg ? 'package' : 'product_or_lot',
          matched_id: matchedPkg?.id || null,
          scanned_at: new Date().toISOString(),
        },
        { status: 'recorded' },
      );
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

// 6. Backorder Split Evaluator
export async function evaluateBackorderSplit(a: Access, input: unknown) {
  const d = z
    .object({
      lines: z
        .array(
          z
            .object({
              product_id: text(80),
              ordered_qty: z.number().int().min(1).max(1_000_000),
              done_qty: z.number().int().min(0).max(1_000_000),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['inventory']);
  return accountingPython('warehouse_replenishment_waves', { op: 'split_backorder', lines: d.lines }, backorderSchema);
}
