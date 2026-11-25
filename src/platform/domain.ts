import { basisPoints, sumMinor, exactNumber } from '../finance/money';
import { quantityMilli } from '../inventory/quantity';
import { z } from 'zod';
export const currencySchema = z.enum(['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF']);
export const quantitySchema = z
  .number()
  .min(0.001)
  .max(100000)
  .refine((n) => {
    try {
      quantityMilli(n);
      return true;
    } catch {
      return false;
    }
  }, 'Use at most three decimal places');
export const itemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: quantitySchema,
  unit_price_minor: z.number().int().min(0).max(10000000000),
  product_id: z.string().uuid().optional(),
  warehouse_id: z.string().uuid().optional(),
  location_id: z.string().uuid().optional(),
});
export const documentSchema = z.object({
  customer_id: z.string().uuid(),
  number: z.string().trim().min(1).max(80).optional(),
  order_id: z.string().uuid().optional(),
  currency: currencySchema.default('KES'),
  items: z.array(itemSchema).min(1).max(100),
  discount_minor: z.number().int().min(0).default(0),
  tax_bps: z.number().int().min(0).max(10000).default(0),
  due_date: z.string().date(),
  issue_date: z.string().date(),
  notes: z.string().max(3000).default(''),
  terms: z.string().max(3000).default(''),
  payment_instructions: z.string().max(3000).default(''),
});
export function totals(doc: z.infer<typeof documentSchema>) {
  const subtotal_minor = sumMinor(
    doc.items.map((i) =>
      exactNumber((BigInt(quantityMilli(i.quantity)) * BigInt(i.unit_price_minor) + 500n) / 1000n),
    ),
  );
  if (!Number.isSafeInteger(subtotal_minor) || doc.discount_minor > subtotal_minor)
    throw Object.assign(new Error('Invalid total or discount'), {
      status: 400,
    });
  const tax_minor = basisPoints(subtotal_minor - doc.discount_minor, doc.tax_bps);
  const total_minor = subtotal_minor - doc.discount_minor + tax_minor;
  if (!Number.isSafeInteger(total_minor) || total_minor <= 0 || total_minor > 100000000000)
    throw Object.assign(new Error('Invalid total'), { status: 400 });
  if (doc.due_date < doc.issue_date)
    throw Object.assign(new Error('Due date precedes issue date'), {
      status: 400,
    });
  return { subtotal_minor, tax_minor, total_minor };
}
export const roles = [
  'owner',
  'admin',
  'finance',
  'accountant',
  'hr',
  'sales',
  'operations',
  'inventory_manager',
  'support_agent',
  'marketing_manager',
  'viewer',
] as const;

export const invitableRoles = [
  'admin',
  'finance',
  'accountant',
  'hr',
  'sales',
  'operations',
  'inventory_manager',
  'support_agent',
  'marketing_manager',
  'viewer',
] as const;

export const roleAppAccess: Record<string, readonly string[] | '*'> = {
  owner: '*',
  admin: '*',
  finance: [
    'finance',
    'accounting',
    'analytics',
    'procurement',
    'subscriptions',
    'property_hospitality',
    'documents',
    'calendar',
    'work',
  ],
  accountant: [
    'accounting',
    'finance',
    'analytics',
    'subscriptions',
    'documents',
    'calendar',
    'work',
  ],
  hr: ['people', 'knowledge_learning', 'work', 'calendar', 'documents'],
  sales: ['crm', 'sales', 'pos', 'commerce', 'subscriptions', 'calendar', 'work', 'documents'],
  operations: [
    'inventory',
    'procurement',
    'pos',
    'sales',
    'crm',
    'work',
    'calendar',
    'documents',
    'manufacturing',
    'field_operations',
    'logistics',
    'property_hospitality',
    'knowledge_learning',
    'support',
  ],
  inventory_manager: [
    'inventory',
    'procurement',
    'manufacturing',
    'logistics',
    'field_operations',
    'pos',
    'work',
    'calendar',
    'documents',
  ],
  support_agent: [
    'support',
    'crm',
    'knowledge_learning',
    'field_operations',
    'work',
    'calendar',
    'documents',
  ],
  marketing_manager: [
    'marketing',
    'website',
    'commerce',
    'crm',
    'analytics',
    'calendar',
    'work',
    'documents',
  ],
  viewer: ['analytics', 'finance', 'work', 'calendar', 'documents', 'knowledge_learning'],
};

export function roleAllowsApp(role: string | undefined, appId: string, kind = 'business'): boolean {
  if (kind !== 'business') return true;
  if (!role || role === 'owner' || role === 'admin') return true;
  const allowed = roleAppAccess[role];
  if (!allowed) return false;
  if (allowed === '*') return true;
  return allowed.includes(appId);
}

export function permitted(role: string, capability: string) {
  if (role === 'owner' || role === 'admin') return true;
  if (capability === 'read') return roles.includes(role as any);
  if (capability === 'finance') return role === 'finance' || role === 'accountant';
  if (capability === 'hr') return role === 'hr';
  if (capability === 'sales') return role === 'sales' || role === 'operations';
  if (capability === 'support') return role === 'support_agent' || role === 'operations';
  if (capability === 'marketing') return role === 'marketing_manager' || role === 'operations';
  if (capability === 'operations')
    return [
      'operations',
      'finance',
      'accountant',
      'hr',
      'sales',
      'inventory_manager',
      'support_agent',
      'marketing_manager',
    ].includes(role);
  return false;
}
