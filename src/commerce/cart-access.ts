import {dbGet} from '../db/adapter';
import {fail,type Access} from '../platform/auth';
import {hash,seal,unseal,now} from '../platform/crypto';
import {publicSlug} from './contracts';
import {z} from 'zod';

export const CART_LIFETIME_MS=14*86400000;
export function cartCookieName(environment:string,slug:string){z.enum(['sandbox','production']).parse(environment);publicSlug.parse(slug);return 'africore_cart_'+hash(environment+'/'+slug).slice(0,24);}
export function cartTokenFromCookie(cookie:string|undefined,environment:string,slug:string){const name=cartCookieName(environment,slug);for(const pair of (cookie||'').split(';')){const split=pair.indexOf('=');if(split<0||pair.slice(0,split).trim()!==name)continue;const token=pair.slice(split+1).trim();return /^[a-f0-9]{64}$/.test(token)?token:null;}return null;}
export function cartCookieOptions(environment:string,slug:string){cartCookieName(environment,slug);return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,maxAge:CART_LIFETIME_MS,path:'/api/v1/storefronts/'+environment+'/'+slug};}
export function cartAccess(row:any):Access{return {org:row.org_id,environment:row.environment,actor:'guest-cart:'+row.id,role:'system',api:false};}
const context=(row:any)=>JSON.stringify(['commerce-cart',row.org_id,row.environment,row.store_id,row.id]);
export const sealCart=(row:any,data:unknown)=>seal(JSON.stringify(data),context(row),'2');
export const decodeCart=(row:any)=>({...row,version:Number(row.version),data:JSON.parse(unseal(row.data,context(row)))});
/** A cart cookie is an expiring scoped capability, never a merchant identity. */
export async function cartSession(environment:string,slug:string,token:string){
 cartCookieName(environment,slug);if(!/^[a-f0-9]{64}$/.test(token))fail(404,'Cart not found');
 const row=await dbGet("SELECT c.* FROM ac_commerce_carts c JOIN ac_publications p ON p.source_id=c.store_id AND p.org_id=c.org_id AND p.environment=c.environment JOIN ac_workspaces w ON w.id=c.org_id WHERE c.token_hash=? AND c.environment=? AND p.slug=? AND p.source_kind='commerce' AND w.kind='business' AND w.status='active'",[hash(token),environment,slug]);
 if(!row)fail(404,'Cart not found');if(row.expires_at<=now())fail(410,'This cart has expired. Start a new cart.');return decodeCart(row);
}
