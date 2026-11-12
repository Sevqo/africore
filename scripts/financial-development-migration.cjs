/* Guarded HTTPS maintenance for the approved development branch. No ordinary tests. */
const fs=require('node:fs'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
const {neon}=require('../.tmp/security/neon-runtime/node_modules/@neondatabase/serverless');
let stage='configuration';const deadline=setTimeout(()=>{console.error(JSON.stringify({maintenanceFailed:true,stage,timeout:true,privateDetailsSuppressed:true}));process.exit(1)},90000);
(async()=>{
 const e=parseEnv(fs.readFileSync('.env.neon.development','utf8')),url=new URL(e.DIRECT_URL);
 if(e.NEON_PROJECT_ID!=='autumn-water-21744826'||e.NEON_BRANCH_ID!=='br-jolly-lake-b4ff04st'||url.hostname!=='ep-square-mountain-b4ht9gb5.c-6.us-east-2.aws.neon.tech'||url.pathname!=='/neondb'||!e.AFRICORE_ENCRYPTION_KEY)throw Error('Guard');
 const sql=neon(url.href);stage='read_only_snapshot';
 const tables=await sql.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
 const rows=await sql.transaction(tables.map(t=>sql.query('SELECT * FROM public."'+t.tablename.replaceAll('"','""')+'"')),{isolationLevel:'RepeatableRead',readOnly:true});
 const snapshot={branch:e.NEON_BRANCH_ID,at:new Date().toISOString(),tables:tables.map((t,i)=>({name:t.tablename,rows:rows[i]}))};
 stage='encrypted_backup';const plain=Buffer.from(JSON.stringify(snapshot)),digest=crypto.createHash('sha256').update(plain).digest('hex'),key=crypto.createHash('sha256').update('africore-development-backup-v1:'+e.AFRICORE_ENCRYPTION_KEY).digest(),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(snapshot.branch));const body=Buffer.concat([c.update(plain),c.final()]);
 fs.mkdirSync('.tmp/security',{recursive:true});const file='.tmp/security/development-https-backup-'+Date.now()+'.enc';fs.writeFileSync(file,JSON.stringify({version:1,branch:snapshot.branch,iv:iv.toString('hex'),tag:c.getAuthTag().toString('hex'),digest,body:body.toString('base64')}),{flag:'wx',mode:0o600});
 const saved=JSON.parse(fs.readFileSync(file,'utf8')),d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(saved.iv,'hex'));d.setAAD(Buffer.from(saved.branch));d.setAuthTag(Buffer.from(saved.tag,'hex'));const recovered=Buffer.concat([d.update(Buffer.from(saved.body,'base64')),d.final()]);if(crypto.createHash('sha256').update(recovered).digest('hex')!==digest)throw Error('Backup readback');
 const wave3=process.argv.includes('--wave3'),erp=process.argv.includes('--erp'),apps=process.argv.includes('--apps'),connected=process.argv.includes('--connected'),migration=wave3?'019-point-of-sale':erp?'016-procurement':apps?'011-connected-business-operations':connected?'009-connected-platform':'008-financial-operations';const versions=await sql.query('SELECT version FROM platform_migrations');if(!versions.some(v=>v.version===(wave3?'016-procurement':erp?'011-connected-business-operations':apps?'009-connected-platform':connected?'008-financial-operations':'007-service-marketplace')))throw Error('Foundation missing');
 if(process.argv.includes('--apply')&&!versions.some(v=>v.version===migration)){
  stage='additive_migration';
  if(apps||erp||wave3){
   const commands=[],known=new Set(versions.map(v=>v.version));
   const database={isPostgres:true,dbTransaction:fn=>fn(),dbGet:async(_statement,params)=>known.has(params[0])?{version:params[0]}:undefined,dbAll:async()=>[],dbExec:async statement=>{commands.push({sql:statement,params:[]});},dbRun:async(statement,params=[])=>{commands.push({sql:statement,params});return {changes:1};}};
   if(wave3){
    process.env.DATABASE_URL='postgresql://maintenance_plan@127.0.0.1:1/never_connect';
    commands.push(...await require('./wave3-migration-plan.cjs').wave3MigrationPlan([...known]));
   }else if(erp){
    for(const [module,name] of [['schema','migrateERP'],['accounting-schema','migrateAccounting'],['people-schema','migratePeople'],['documents-schema','migrateDocuments'],['procurement-schema','migrateProcurement']])await require('../dist/erp/'+module)[name](database);
   }else{
    await require('../dist/apps/schema').migrateApps(database);
    await require('../dist/operations/business-schema').migrateBusinessOperations(database);
   }
   await sql.transaction(commands.map(c=>{let n=0;return sql.query(c.sql.replace(/\?/g,()=>'$'+(++n)),c.params);}));
  }else if(connected){
   const commands=[];const {migrateConnected}=require('../dist/operations/connected-schema');
   await migrateConnected({isPostgres:true,dbTransaction:fn=>fn(),dbGet:async()=>undefined,dbAll:async()=>[],dbExec:async statement=>{commands.push({sql:statement,params:[]});},dbRun:async(statement,params=[])=>{commands.push({sql:statement,params});return {changes:1};}});
   await sql.transaction(commands.map(c=>{let n=0;return sql.query(c.sql.replace(/\?/g,()=>'$'+(++n)),c.params);}));
  }else{const {financeStatements,financeTables}=require('../dist/finance/schema');const statements=financeStatements.map(s=>s.replace('CREATE VIEW IF NOT EXISTS','CREATE OR REPLACE VIEW'));
  for(const t of financeTables)statements.push('ALTER TABLE '+t+' ENABLE ROW LEVEL SECURITY','REVOKE ALL ON '+t+' FROM PUBLIC');for(const v of ['ac_effective_allocations','ac_financial_events'])statements.push('REVOKE ALL ON '+v+' FROM PUBLIC');
  await sql.transaction([...statements.map(s=>sql.query(s)),sql.query('INSERT INTO platform_migrations(version,applied_at) VALUES ($1,$2)',[migration,new Date().toISOString()])]);
  }
 }
 stage='verification';const applied=(await sql.query('SELECT version FROM platform_migrations WHERE version=$1',[migration])).length===1;
 if(apps||erp||wave3){
  const required=wave3?['017-commerce-foundation','018-public-media','019-point-of-sale']:erp?['012-erp-foundation','013-accounting-ledger','014-people-operations','015-private-documents','016-procurement']:['010-business-apps','011-connected-business-operations'];
  const checked=await sql.query('SELECT version FROM platform_migrations');
  if(process.argv.includes('--apply')&&!required.every(version=>checked.some(v=>v.version===version)))throw Error('Apps schema verification');
  for(const table of ['ac_users','ac_organizations','ac_workspaces','ac_memberships','ac_records','ac_journal']){
   const original=snapshot.tables.find(t=>t.name===table);if(!original)continue;
   const after=await sql.query('SELECT COUNT(*)::int AS n FROM public."'+table+'"');
   if(Number(after[0].n)<original.rows.length)throw Error('Historical row count decreased');
  }
  if(erp||wave3){
   // Compare every original public row using its original columns. Additive
   // columns, new rows and the classified allocation view do not erase history.
   for(const original of snapshot.tables){
    if(!original.rows.length)continue;
    const columns=Object.keys(original.rows[0]).sort();
    const fingerprint=row=>crypto.createHash('sha256').update(JSON.stringify(columns.map(k=>row[k]))).digest('hex');
    const after=await sql.query('SELECT '+columns.map(k=>'"'+k.replaceAll('"','""')+'"').join(',')+' FROM public."'+original.name.replaceAll('"','""')+'"');
    const retained=new Set(after.map(fingerprint));
    if(original.rows.some(row=>!retained.has(fingerprint(row))))throw Error('Original row readback changed');
   }
  }
 }
 if(wave3&&applied){
  process.env.DATABASE_URL='postgresql://maintenance_plan@127.0.0.1:1/never_connect';
  await require('../dist/deployment-database').prepareDatabase('verify',{isPostgres:true,dbAll:statement=>sql.query(statement),migrate:()=>{throw Error('Hosted migration mode must remain verify-only');}});
 }
 const result={branch:e.NEON_BRANCH_ID,backup:file.split('/').pop(),encryptedReadbackVerified:true,originalPublicRowsRetained:erp||wave3?true:undefined,inventory:{tables:tables.length,rows:rows.reduce((n,r)=>n+r.length,0)},migration,migrationApplied:applied,fullRestoreTested:false};fs.writeFileSync(wave3?'.tmp/security/wave3-migration-result.json':erp?'.tmp/security/erp-migration-result.json':apps?'.tmp/security/apps-migration-result.json':connected?'.tmp/security/connected-migration-result.json':'.tmp/security/financial-migration-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(()=>{console.error(JSON.stringify({maintenanceFailed:true,stage,privateDetailsSuppressed:true}));process.exitCode=1}).finally(()=>clearTimeout(deadline));
