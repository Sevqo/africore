import { basisPoints, sumMinor, exactNumber } from '../finance/money';
import { quantityMilli } from '../inventory/quantity';
import { z } from 'zod';
import { roles, invitableRoles, roleAppAccess, roleAllowsApp } from './roles';
export { roles, invitableRoles, roleAppAccess, roleAllowsApp };
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
