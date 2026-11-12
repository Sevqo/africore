import {Router} from 'express';
import {z} from 'zod';
import {access,route,fail} from '../platform/auth';
import {registers,saveRegister,reauthorizeRegister} from './registers';
import {registerOverview,posProducts,posSales,posReceipt} from './queries';
import {drawer,openSession,adjustDrawer,closeSession} from './sessions';
import {posSale,savePOSDraft,currentSaleQuote} from './quotes';
import {confirmPOSSale,handoverPOSSale} from './sales';
import {returnPOSCash} from './returns';
import {returnPOSStock} from './stock';

export const pos=Router();
pos.use('/organizations/:org/pos',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
const id=(req:any)=>z.string().uuid().parse(req.params.id);
const key=(req:any)=>z.string().min(8).max(200).parse(req.headers['idempotency-key']);
// The shared route requires membership/read capability. Each domain operation
// then enforces current human register assignment; API keys cannot be cashiers.
pos.get('/organizations/:org/pos/registers',route(async(req,res)=>res.json(await registers(await access(req)))));
pos.post('/organizations/:org/pos/registers',route(async(req,res)=>res.status(201).json(await saveRegister(await access(req),null,req.body,key(req)))));
pos.put('/organizations/:org/pos/registers/:id',route(async(req,res)=>res.json(await saveRegister(await access(req),id(req),req.body,key(req)))));
pos.post('/organizations/:org/pos/registers/:id/authorize',route(async(req,res)=>res.json(await reauthorizeRegister(await access(req),id(req),req.body,key(req)))));
pos.get('/organizations/:org/pos/registers/:id',route(async(req,res)=>res.json(await registerOverview(await access(req),id(req),req.query))));
pos.get('/organizations/:org/pos/registers/:id/products',route(async(req,res)=>res.json(await posProducts(await access(req),id(req),req.query))));
pos.get('/organizations/:org/pos/registers/:id/sales',route(async(req,res)=>res.json(await posSales(await access(req),id(req),req.query))));
pos.post('/organizations/:org/pos/registers/:id/sessions',route(async(req,res)=>res.status(201).json(await openSession(await access(req),id(req),req.body,key(req)))));
pos.get('/organizations/:org/pos/sessions/:id',route(async(req,res)=>res.json(await drawer(await access(req),id(req)))));
pos.post('/organizations/:org/pos/sessions/:id/adjustments',route(async(req,res)=>res.json(await adjustDrawer(await access(req),id(req),req.body,key(req)))));
pos.post('/organizations/:org/pos/sessions/:id/close',route(async(req,res)=>res.json(await closeSession(await access(req),id(req),req.body,key(req)))));
pos.post('/organizations/:org/pos/sessions/:id/drafts',route(async(req,res)=>res.status(201).json(await savePOSDraft(await access(req),id(req),null,req.body,key(req)))));
pos.get('/organizations/:org/pos/sales/:id/draft',route(async(req,res)=>{
 const sale=await posSale(await access(req),id(req));if(sale.status!=='draft')fail(409,'This sale is confirmed; open its receipt');
 res.json({id:sale.id,version:sale.version,session_id:sale.parent_id,register_id:sale.root_id,draft:sale.data.draft,quote:sale.data.quote});
}));
pos.put('/organizations/:org/pos/sales/:id/draft',route(async(req,res)=>{const a=await access(req),sale=await posSale(a,id(req),true);res.json(await savePOSDraft(a,sale.parent_id!,sale.id,req.body,key(req)));}));
pos.get('/organizations/:org/pos/sales/:id/quote',route(async(req,res)=>res.json(await currentSaleQuote(await access(req),id(req)))));
pos.get('/organizations/:org/pos/sales/:id/receipt',route(async(req,res)=>res.json(await posReceipt(await access(req),id(req)))));
pos.post('/organizations/:org/pos/sales/:id/confirm',route(async(req,res)=>{const a=await access(req);await confirmPOSSale(a,id(req),req.body,key(req));res.json(await posReceipt(a,id(req)));}));
pos.post('/organizations/:org/pos/sales/:id/handover',route(async(req,res)=>{const a=await access(req);await handoverPOSSale(a,id(req),req.body,key(req));res.json(await posReceipt(a,id(req)));}));
pos.post('/organizations/:org/pos/sales/:id/cash-return',route(async(req,res)=>{const a=await access(req);await returnPOSCash(a,id(req),req.body,key(req));res.json(await posReceipt(a,id(req)));}));
pos.post('/organizations/:org/pos/sales/:id/stock-return',route(async(req,res)=>{const a=await access(req);await returnPOSStock(a,id(req),req.body,key(req));res.json(await posReceipt(a,id(req)));}));
