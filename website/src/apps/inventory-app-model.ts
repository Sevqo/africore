export const inventorySections = [
  {label: 'Overview', section: 'dashboard'},
  {label: 'Operations', section: 'operations'},
  {label: 'Products', section: 'products'},
  {label: 'Reporting', section: 'reporting'},
  {label: 'Configuration', section: 'configuration'},
] as const;

export const inventoryViews = [
  'overview',
  'receipts',
  'deliveries',
  'transfers',
  'counts',
  'replenishment',
  'stock',
  'movements',
  'detailed',
  'reservations',
  'incoming',
  'warehouses',
  'locations',
  'settings',
] as const;

export type InventoryView = (typeof inventoryViews)[number];

export const defaultViewForSection: Record<string, InventoryView> = {
  dashboard: 'overview',
  operations: 'receipts',
  products: 'stock',
  reporting: 'stock',
  configuration: 'warehouses',
};

export const viewsForSection: Record<string, InventoryView[]> = {
  dashboard: ['overview'],
  operations: ['receipts', 'deliveries', 'transfers', 'counts', 'replenishment'],
  products: ['stock'],
  reporting: ['stock', 'movements', 'detailed', 'reservations', 'incoming'],
  configuration: ['warehouses', 'locations', 'settings'],
};

export const sectionForView: Record<InventoryView, string> = {
  overview: 'dashboard',
  receipts: 'operations',
  deliveries: 'operations',
  transfers: 'operations',
  counts: 'operations',
  replenishment: 'operations',
  stock: 'reporting',
  movements: 'reporting',
  detailed: 'reporting',
  reservations: 'reporting',
  incoming: 'reporting',
  warehouses: 'configuration',
  locations: 'configuration',
  settings: 'configuration',
};

export const shipmentNext: Record<string, string[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['ready_for_dispatch', 'cancelled'],
  ready_for_dispatch: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivery_exception', 'returned'],
  out_for_delivery: ['delivered', 'delivery_exception', 'returned'],
  delivery_exception: ['out_for_delivery', 'returned'],
  delivered: ['returned'],
  returned: [],
  cancelled: [],
};

export const shipmentLabels: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  ready_for_dispatch: 'Ready for dispatch',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delivery_exception: 'Delivery exception',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

export const movementLabels: Record<string, string> = {
  receipt: 'Receipt',
  adjustment: 'Adjustment',
  return: 'Return',
  transfer: 'Internal transfer',
  dispatch: 'Dispatch',
};

export function shipmentIsOpen(status: string) {
  return !['delivered', 'returned', 'cancelled'].includes(status);
}

export function shipmentIsLate(shipment: {estimated_delivery?: string; status: string}, today: string) {
  return shipmentIsOpen(shipment.status) && !!shipment.estimated_delivery && shipment.estimated_delivery < today;
}

export function incomingIsOverdue(incoming: {due_on?: string; status: string}, today: string) {
  return incoming.status === 'planned' && !!incoming.due_on && incoming.due_on < today;
}

export function filterProducts(
  products: any[],
  filter: string,
  query: string,
  warehouse?: string,
) {
  const text = query.trim().toLowerCase();
  return products.filter((p) => {
    if (warehouse && p.warehouse_id && p.warehouse_id !== warehouse) return false;
    if (filter === 'low' && !p.low_stock) return false;
    if (filter === 'out' && !(p.track_inventory && p.available_milli === 0)) return false;
    if (filter === 'in' && !(p.track_inventory && p.available_milli > 0)) return false;
    if (filter === 'tracked' && !p.track_inventory) return false;
    if (!text) return true;
    return [p.name, p.sku, p.category, p.barcode, p.variant]
      .filter(Boolean)
      .some((value: string) => String(value).toLowerCase().includes(text));
  });
}

export function pageSlice<T>(rows: T[], page: number, size = 25) {
  return rows.slice(page * size, page * size + size);
}

export function pageCount(total: number, size = 25) {
  return Math.max(1, Math.ceil(total / size));
}

export function transferDestination(movements: any[]) {
  const out = movements.filter((m) => m.kind === 'transfer' && m.quantity_milli < 0);
  const bySource = new Map<string, any>();
  for (const m of movements) {
    if (m.kind === 'receipt' && m.source_id) bySource.set(m.source_id, m);
  }
  return out.map((m) => ({...m, destination_warehouse_id: bySource.get(m.id)?.warehouse_id || null}));
}

export function shipmentQuantity(items: any[]) {
  return items.reduce((sum, item) => {
    const n = Number(String(item.quantity).replace(',', '.'));
    return sum + (Number.isFinite(n) ? Math.round(n * 1000) : 0);
  }, 0);
}
