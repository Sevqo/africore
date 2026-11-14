/** App-level merchant navigation. The independent Commerce service keeps its own store editor. */
export const commerceMerchantSections = [
  { section: 'dashboard', label: 'Overview' },
  { section: 'catalog', label: 'Catalogue' },
  { section: 'orders', label: 'Orders' },
  { section: 'storefront', label: 'Storefront' },
  { section: 'inventory', label: 'Inventory' },
  { section: 'payments', label: 'Payments' },
  { section: 'reports', label: 'Reports' },
  { section: 'settings', label: 'Settings' },
] as const;

export const commerceMerchantSectionIds = commerceMerchantSections.map(
  (item) => item.section,
);
