import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrateAccounting} from '../erp/accounting-schema';

test('fresh PostgreSQL accounting migration creates journals before upgrading their version column',async()=>{
 let transactionAborted=false,journalsExist=false;
 const database={
  isPostgres:true,
  dbAll:async()=>[],
  dbGet:async()=>{if(transactionAborted)throw new Error('current transaction is aborted');return undefined;},
  dbExec:async(sql:string)=>{
   if(transactionAborted)throw new Error('current transaction is aborted');
   if(sql.startsWith('CREATE TABLE IF NOT EXISTS ac_accounting_journals'))journalsExist=true;
   if(sql.startsWith('ALTER TABLE ac_accounting_journals ADD COLUMN')&&!journalsExist){transactionAborted=true;throw new Error('relation does not exist');}
  },
  dbRun:async()=>({changes:1}),
  dbTransaction:async<T>(fn:()=>Promise<T>)=>fn(),
 };
 await migrateAccounting(database);
 assert.equal(journalsExist,true);
});
