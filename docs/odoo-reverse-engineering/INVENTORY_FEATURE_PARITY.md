# Odoo 20 Inventory — Feature Parity Audit & Implementation Plan

> Audited against official Odoo 20 Inventory documentation (`odoo.com/app/inventory-features`, `odoo.com/documentation/20.0/applications/inventory_and_mrp/inventory.html`) and pinned `odoo-reference/addons/stock*` modules (8 modules).

## Feature Parity Matrix

| Odoo 20 Inventory Feature | Reference Module / Doc | AfriCore Status | Implementation |
| --- | --- | --- | --- |
| Warehouses, Locations & Double-Entry Stock Moves | `stock` | Shipped | `src/erp/inventory.ts` |
| Receipts, Deliveries, Transfers, Scrap, Adjustments | `stock` | Shipped | `src/erp/inventory.ts` |
| Lots, Serial Numbers & Expiry Tracking | `stock` | Shipped | `src/erp/inventory.ts` |
| Real-Time FIFO/AVCO Valuation & Landed Costs | `stock_account`, `stock_landed_costs` | Shipped | `python/.../inventory_valuation.py` |
| **Min/Max Reordering Rules & Replenishment Scheduler** | `stock` (`stock.warehouse.orderpoint`) | **Added in App #4** | `python/.../inventory_parity.py` (`replenishment_plan`) + `/inventory/reordering-rules`, `/inventory/replenishment/run` |
| **Putaway Rules** | `stock` (`stock.putaway.rule`) | **Added in App #4** | `python/.../inventory_parity.py` (`resolve_putaway`) + `/inventory/putaway-rules`, `/inventory/putaway/resolve` |
| **Batch & Wave Picking Optimization** | `stock_picking_batch` | **Added in App #4** | `python/.../inventory_parity.py` (`plan_waves`) + `/inventory/waves`, `/inventory/waves/plan` |
| **Package Management & Gross Weight** | `stock` (`stock.quant.package`) | **Added in App #4** | `/inventory/packages` |
| **Barcode Scan Action Processor** | `stock_barcode` | **Added in App #4** | `/inventory/barcode/scan` |
| **Backorder Split Evaluator** | `stock` backorder wizard | **Added in App #4** | `python/.../inventory_parity.py` (`split_backorder`) + `/inventory/backorders/split` |
