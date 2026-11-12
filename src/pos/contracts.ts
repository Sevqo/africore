import {z} from 'zod';
import {currencySchema} from '../platform/domain';

const amount=z.number().int().min(0).max(100_000_000_000);
const positiveAmount=amount.refine(value=>value>0,'Enter a positive amount');
const version=z.number().int().positive();
const timezone=z.string().max(80).default('Africa/Nairobi').refine(value=>{
  try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}
},'Choose a supported timezone');
const members=z.array(z.string().uuid()).max(100).refine(ids=>new Set(ids).size===ids.length,'Choose each member once');
export const reauthorizeRegisterInput=z.object({expected_version:version,acknowledge_current_register_policy:z.literal(true),acknowledge_automated_invoicing:z.literal(true),acknowledge_recorded_cash:z.literal(true)}).strict();

/** Configuring authority and member identities are resolved by the server.
 * This cannot assign a Neon role, create a shared PIN or enable live payment. */
export const registerInput=z.object({
  expected_version:z.number().int().min(0),
  name:z.string().trim().min(1).max(160),
  currency:currencySchema.default('KES'),
  tax_bps:z.number().int().min(0).max(10_000).default(0),
  timezone,
  warehouse_id:z.string().uuid().nullable().default(null),
  location_id:z.string().uuid().nullable().default(null),
  default_customer_id:z.string().uuid(),
  cashier_ids:members.default([]),
  manager_ids:members.default([]),
  cashier_discount_bps:z.number().int().min(0).max(10_000).default(0),
  manager_discount_bps:z.number().int().min(0).max(10_000).default(2_000),
  allow_cash:z.boolean().default(true),
  electronic_method:z.enum(['disabled','sandbox_simulator','daraja_sandbox']).default('disabled'),
  allow_pending_orders:z.boolean().default(false),
  active:z.boolean().default(true),
  acknowledge_automated_invoicing:z.literal(true),
  acknowledge_recorded_cash:z.literal(true),
}).strict().refine(value=>value.cashier_discount_bps<=value.manager_discount_bps,'Cashier discounts cannot exceed the manager ceiling')
 .refine(value=>!value.location_id||!!value.warehouse_id,'A stock location requires its warehouse')
 .refine(value=>value.allow_cash||value.electronic_method!=='disabled'||value.allow_pending_orders,'Enable at least one supported checkout intent');

export const openSessionInput=z.object({
  expected_register_version:version,
  opening_cash_minor:amount,
  note:z.string().max(1_000).default(''),
  acknowledge_count:z.literal(true),
}).strict();
export const closeSessionInput=z.object({
  expected_version:version,
  counted_cash_minor:amount,
  variance_reason:z.string().trim().max(1_000).default(''),
  acknowledge_close:z.literal(true),
}).strict();
export const cashAdjustmentInput=z.object({
  expected_session_version:version,
  direction:z.enum(['in','out']),
  amount_minor:positiveAmount,
  reason:z.string().trim().min(8).max(1_000),
  acknowledge_physical_cash:z.literal(true),
}).strict();

export const posItems=z.array(z.object({
  product_id:z.string().uuid(),
  quantity_milli:z.number().int().positive().max(100_000_000),
}).strict()).min(1).max(99).refine(items=>new Set(items.map(item=>item.product_id)).size===items.length,'Combine repeated product lines');

export const saleDraftInput=z.object({
  expected_session_version:version,
  customer_id:z.string().uuid().nullable().default(null),
  items:posItems,
  discount_minor:amount.default(0),
  notes:z.string().max(1_000).default(''),
}).strict();
export const editSaleDraftInput=saleDraftInput.extend({expected_version:version}).strict();
export const confirmSaleInput=z.object({
  expected_version:version,
  quote_hash:z.string().regex(/^[a-f0-9]{64}$/),
  payment_intent:z.enum(['cash','electronic','split','pending']),
  cash_amount_minor:amount.default(0),
  tendered_cash_minor:amount.default(0),
  handover_now:z.boolean().default(false),
  acknowledge_recorded_cash:z.boolean().default(false),
  acknowledge_sandbox_electronic:z.boolean().default(false),
  acknowledge_handover:z.boolean().default(false),
}).strict().refine(d=>d.tendered_cash_minor>=d.cash_amount_minor,'Tendered cash is below the applied amount')
  .refine(d=>!d.cash_amount_minor||d.acknowledge_recorded_cash,'Acknowledge the observed cash receipt')
  .refine(d=>!['electronic','split'].includes(d.payment_intent)||d.acknowledge_sandbox_electronic,'Acknowledge the sandbox electronic method')
  .refine(d=>!d.handover_now||d.acknowledge_handover,'Acknowledge the physical handover');

export const handoverInput=z.object({
  expected_sale_version:version,
  session_id:z.string().uuid(),
  expected_session_version:version,
  acknowledge_handover:z.literal(true),
}).strict();
export const cashReturnInput=z.object({
  expected_sale_version:version,
  return_session_id:z.string().uuid(),
  expected_session_version:version,
  original_receipt_id:z.string().uuid(),
  amount_minor:positiveAmount,
  reason:z.string().trim().min(8).max(1_000),
  acknowledge_physical_cash_return:z.literal(true),
}).strict();
export const stockReturnInput=z.object({
 expected_sale_version:version,
 receiving_session_id:z.string().uuid(),
 expected_session_version:version,
 original_dispatch_id:z.string().uuid(),
 quantity_milli:z.number().int().positive().max(100_000_000),
 reason:z.string().trim().min(8).max(1000),
 acknowledge_physical_return:z.literal(true),
}).strict();
