import {z} from 'zod';
import {fail} from '../platform/auth';
import {currencySchema} from '../platform/domain';
const id=z.string().uuid(),text=z.string().trim().min(2).max(500),minor=z.number().int().min(0).max(100000000000);
export const purchaseLine=z.object({id,product_id:id,quantity_milli:z.number().int().positive().max(100000000),unit_price_minor:minor,warehouse_id:id.nullable().default(null)}).strict();
export const purchaseLines=z.array(purchaseLine).min(1).max(100).refine(lines=>new Set(lines.map(l=>l.id)).size===lines.length,'Line identifiers must be unique');
export const purchaseRecord=z.discriminatedUnion('type',[
 z.object({type:z.literal('supplier'),contact_id:id,terms:z.string().max(1000).default(''),lead_days:z.number().int().min(0).max(3650).default(0),active:z.boolean().default(true)}).strict(),
 z.object({type:z.literal('request'),title:text,reason:z.string().trim().min(8).max(2000),currency:currencySchema,budget_minor:minor,needed_on:z.string().date(),lines:purchaseLines,suggestion_id:id.nullable().default(null)}).strict(),
 z.object({type:z.literal('rfq'),request_id:id,supplier_id:id,reference:text,currency:currencySchema,delivery_on:z.string().date(),terms:z.string().max(2000).default(''),tax_minor:minor,lines:purchaseLines}).strict(),
 z.object({type:z.literal('order'),rfq_id:id,reference:text}).strict(),
 z.object({type:z.literal('bill'),order_id:id,reference:text,issued_on:z.string().date(),due_on:z.string().date(),tax_minor:minor,lines:purchaseLines,variance_reason:z.string().max(1000).default('')}).strict(),
 z.object({type:z.literal('credit'),bill_id:id,reference:text,issued_on:z.string().date(),amount_minor:minor.refine(n=>n>0),reason:z.string().trim().min(8).max(1000)}).strict()
]);
export const purchaseSave=z.object({expected_version:z.number().int().min(0),record:purchaseRecord}).strict();
export const purchaseAction=z.object({expected_version:z.number().int().positive(),action:z.enum(['approve','reject','accept','issue','confirm','cancel']),reason:z.string().trim().min(8).max(1000)}).strict();
export const purchaseReceipt=z.object({expected_version:z.number().int().positive(),reference:text,received_on:z.string().date(),inspection:z.string().trim().min(8).max(2000),lines:z.array(z.object({line_id:id,accepted_milli:z.number().int().min(0).max(100000000),rejected_milli:z.number().int().min(0).max(100000000)}).strict().refine(l=>l.accepted_milli+l.rejected_milli>0)).min(1).max(100).refine(l=>new Set(l.map(v=>v.line_id)).size===l.length)}).strict();
export const purchasePayment=z.object({expected_version:z.number().int().positive(),reference:text,paid_on:z.string().date(),amount_minor:minor.refine(n=>n>0),note:z.string().trim().min(8).max(1000)}).strict();
export function lineAmount(line:{quantity_milli:number;unit_price_minor:number}){const n=Number((BigInt(line.quantity_milli)*BigInt(line.unit_price_minor)+500n)/1000n);if(!Number.isSafeInteger(n)||n>100000000000)fail(400,'Purchase line exceeds supported precision');return n;}

export const purchaseAmend=z.object({expected_version:z.number().int().positive(),lines:purchaseLines,tax_minor:z.number().int().min(0).max(100000000000),delivery_on:z.string().date(),reason:z.string().trim().min(8).max(1000)}).strict();
