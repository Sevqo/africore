import {encodeApprovalField,decodeApprovalField,privateApprovalActions} from '../erp/approval-privacy';
import { automationTemplates, automationSchema,workflowEditInput,workflowAction,selectedWorkflowAction } from './contracts';
import {movementInput} from '../inventory/contracts';
export { automationTemplates, automationSchema } from './contracts';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { dbAll, dbGet, dbRun, dbSavepoint } from '../db';
import { Access, audit, fail } from '../platform/auth';
import { permitted } from '../platform/domain';
import { now,hash } from '../platform/crypto';
import { all, atomic, change, create, day, addDays, get, legacy } from './store';
import { emit } from './events';
import {requireServices,checkLimits,recordUsage} from '../marketplace/engine';

export async function notify(
  a: Access,
  input: {
    category: string;
    title: string;
    body: string;
    resource_id?: string;
    key: string;
    user_id?: string;
    severity?:'informational'|'success'|'warning'|'action_required'|'approval_required'|'security';
    capability?:'read'|'operations'|'finance';
    action_data?:{app_id?:'finance'|'crm'|'inventory'|'sales'|'analytics'|'automations'|'documents'|'people'|'work'|'accounting'|'procurement'|'business_id';section?:string;record_id?:string;approval_id?:string};
  },
  at = new Date(),
) {
  const members = await dbAll(
    'SELECT user_id,role FROM ac_memberships WHERE org_id=?' +
      (input.user_id ? ' AND user_id=?' : ''),
    [a.org, ...(input.user_id ? [input.user_id] : [])],
  );
  const prefs = await all(a, 'notification_preferences');
  let inserted = 0;
  for (const member of members) {
    if(!permitted(member.role,input.capability||'read'))continue;
    const pref = prefs.find((p) => p.user_id === member.user_id);
    if (pref?.paused || pref?.muted_categories?.includes(input.category))
      continue;
    const cap = await dbGet(
      'SELECT COUNT(*) AS total FROM ac2_notifications WHERE org_id=? AND user_id=? AND created_at>=?',
      [a.org, member.user_id, new Date(day(at)+'T00:00:00+03:00').toISOString()],
    );
    if (Number(cap.total) >= 100) continue;
    const result = await dbRun(
      'INSERT INTO ac2_notifications(id,org_id,environment,user_id,category,title,body,resource_id,dedupe_key,created_at,severity,action_data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(org_id,environment,user_id,dedupe_key) DO NOTHING',
      [
        randomUUID(),
        a.org,
        a.environment,
        member.user_id,
        input.category,
        input.title,
        input.body,
        input.resource_id || null,
        input.key,
        at.toISOString(),
        input.severity||(input.category==='security'?'security':'informational'),
        JSON.stringify(input.action_data||{}),
      ],
    );
    inserted += result.changes;
  }
  return { inserted };
}
export async function createAutomation(a: Access, input: unknown) {
  const parsed = automationSchema.parse(input),d={...parsed,action:parsed.action||workflowAction(parsed.template)};
  if (a.api) fail(403, 'A member must own an automation');
  if(['customer_onboarding','crm_stage_follow_up','invoice_review_task'].includes(d.template))await requireServices(a,['crm']);if(d.template==='stock_replenishment')await requireServices(a,['inventory']);
  return atomic(a, async()=>{const w=await create(a,'automations',{...d,created_by:a.actor});await saveWorkflowVersion(a,w);return w;});
}
export async function setAutomation(a: Access, id: string, enabled: boolean) {
  return atomic(a, async () => {
    const w = await get(a, id, 'automations');
    const result = await change(a, w, { enabled });
    await saveWorkflowVersion(a,result);
    await audit(
      a.org,
      a.actor,
      enabled ? 'automation.resumed' : 'automation.paused',
      id,
    );
    return result;
  });
}
export async function notificationPreferences(a: Access, input: unknown) {
  if (a.api) fail(403, 'Member session required');
  const d = z
    .object({
      paused: z.boolean(),
      muted_categories: z
        .array(
          z.enum([
            'payments',
            'invoices',
            'cash_flow',
            'reconciliation',
            'integrations',
            'orders',
            'deliveries',
            'protected_payments',
            'automation_failures',
            'security',
            'team',
            'inventory',
            'crm',
            'sales',
          ]),
        )
        .max(16),
    })
    .strict()
    .parse(input);
  return atomic(a, async () => {
    const existing = (await all(a, 'notification_preferences')).find(
      (p) => p.user_id === a.actor,
    );
    return existing
      ? change(a, existing, d)
      : create(a, 'notification_preferences', { ...d, user_id: a.actor });
  });
}
async function candidates(a: Access, w: any, at: Date) {
  const template = automationTemplates.find((t) => t.id === w.template)!;
  if (template.trigger !== 'schedule')
    return (
      await dbAll(
        'SELECT e.* FROM ac2_events e WHERE e.org_id=? AND e.environment=? AND e.event_type=? AND e.occurred_at>=? AND NOT EXISTS (SELECT 1 FROM ac2_runs r WHERE r.org_id=e.org_id AND r.environment=e.environment AND r.workflow_id=? AND r.trigger_key=e.id) ORDER BY e.occurred_at,e.id LIMIT 100',
        [a.org, a.environment, template.trigger, w.created_at,w.id],
      )
    ).map((e) => ({
      key: e.id,
      resource_id: e.resource_id,
      payload: JSON.parse(e.payload),
    }));
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:w.schedule.timezone||'Africa/Nairobi'}).format(at),
    hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: w.schedule.timezone||'Africa/Nairobi',
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(at),
    );
  if (hour < w.schedule.hour) return [];
  const weekly =
    w.schedule.frequency === 'weekly' || w.template === 'weekly_cashflow';
  const key = weekly
    ? new Date(
        Date.parse(today + 'T00:00:00Z') -
          ((new Date(today).getUTCDay() + 6) % 7) * 86400000,
      )
        .toISOString()
        .slice(0, 10)
    : today;
  if (
    ['invoice_due_soon', 'invoice_overdue', 'customer_follow_up'].includes(
      w.template,
    )
  ) {
    const invoices = await legacy(a, 'invoices');
    return invoices
      .filter(
        (i) =>
          i.currency === w.conditions.currency &&
          !['draft', 'voided', 'paid','credited'].includes(i.status) &&
          i.total_minor - i.paid_minor-(i.credited_minor||0) >= w.conditions.minimum_minor &&
          (w.template === 'invoice_due_soon'
            ? i.due_date >= today &&
              i.due_date <=
                new Date(
                  Date.parse(today) + w.conditions.days_before_due * 86400000,
                )
                  .toISOString()
                  .slice(0, 10)
            : i.due_date < today),
      )
      .map((i) => ({
        key: key + ':' + i.id,
        resource_id: i.id,
        payload: {
          id: i.id,
          reference: i.reference,
          currency: i.currency,
          amount_minor: i.total_minor - i.paid_minor-(i.credited_minor||0),
        },
      }));
  }
  if(w.template==='obligation_due')return (await all(a,'obligations')).filter(o=>o.status==='active'&&o.currency===w.conditions.currency&&o.amount_minor>=w.conditions.minimum_minor&&o.next_due_date<=addDays(today,w.conditions.days_before_due)).map(o=>({key:key+':'+o.id,resource_id:o.id,payload:{id:o.id,currency:o.currency,amount_minor:o.amount_minor}}));
  if(w.template==='credential_expiry')return (await dbAll("SELECT id,valid_until FROM ac3_credentials WHERE org_id=? AND environment=? AND status='active' AND valid_until<=? AND valid_until>?",[a.org,a.environment,addDays(today,w.conditions.days_before_due)+'T23:59:59.999Z',at.toISOString()])).map(c=>({key:key+':'+c.id,resource_id:c.id,payload:{id:c.id}}));
  return [{ key, resource_id: undefined, payload: {} }];
}
export async function runAutomations(a: Access, at = new Date()) {
  return atomic(a, async () => {
    await requireServices(a,['automations']);
    await expireApprovals(a,at);
    const workflows = await all(a, 'automations');
    let queued = 0;
    for (const w of workflows.filter((w) => w.enabled)) {
      const member = await dbGet(
        'SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',
        [a.org, w.created_by],
      );
      if (!member || !permitted(member.role, 'finance')) {
        await change(a, w, {
          enabled: false,
          last_error: 'owner_permission_revoked',
        });
        await notify(a, {
          category: 'automation_failures',
          title: 'Automation paused',
          body: 'Its owner no longer has finance permissions.',
          resource_id: w.id,
          key: 'permission:' + w.id,
        });
        continue;
      }
      for (const trigger of await candidates(a, w, at)) {
        if (
          trigger.payload.currency &&
          trigger.payload.currency !== w.conditions.currency
        )
          continue;
        if (
          trigger.payload.amount_minor !== undefined &&
          trigger.payload.amount_minor < w.conditions.minimum_minor
        )
          continue;
        if (queued >= 50) break;
        await saveWorkflowVersion(a,w);
        const runId=randomUUID();
        const result = await dbRun(
          'INSERT INTO ac2_runs(id,org_id,environment,workflow_id,trigger_key,status,next_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(org_id,environment,workflow_id,trigger_key) DO NOTHING',
          [
            runId,
            a.org,
            a.environment,
            w.id,
            trigger.key,
            'pending',
            new Date(at.getTime()+(w.delay_minutes||0)*60000).toISOString(),
            at.toISOString(),
            at.toISOString(),
          ],
        );
        if(result.changes)await dbRun('INSERT INTO ac_workflow_run_versions(run_id,workflow_id,version) VALUES (?,?,?)',[runId,w.id,w.version]);
        queued += result.changes;
      }
    }
    const runs = await dbAll(
      "SELECT * FROM ac2_runs WHERE org_id=? AND environment=? AND status='pending' AND next_at<=? ORDER BY created_at LIMIT 50",
      [a.org, a.environment, at.toISOString()],
    );
    for (const run of runs) {
      const w = await get(a, run.workflow_id, 'automations');
      const binding=await dbGet('SELECT version FROM ac_workflow_run_versions WHERE run_id=?',[run.id]);
      const member=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,w.created_by]);
      const resourceId=run.trigger_key.split(':').at(-1);
      const invoice=['invoice_due_soon','invoice_overdue','customer_follow_up'].includes(w.template)?await dbGet("SELECT data FROM ac_records WHERE id=? AND org_id=? AND environment=? AND kind='invoices'",[resourceId,a.org,a.environment]):null;
      const currentInvoice=invoice?JSON.parse(invoice.data):null;
      if ((['invoice_due_soon','invoice_overdue','customer_follow_up'].includes(w.template)&&!currentInvoice)||!w.enabled||!member||!permitted(member.role,'finance')||(binding&&Number(binding.version)!==w.version)||(currentInvoice&&(['draft','voided','paid','credited'].includes(currentInvoice.status)||currentInvoice.currency!==w.conditions.currency||currentInvoice.total_minor-currentInvoice.paid_minor-(currentInvoice.credited_minor||0)<=0||currentInvoice.total_minor-currentInvoice.paid_minor-(currentInvoice.credited_minor||0)<w.conditions.minimum_minor))) {
        await dbRun(
          "UPDATE ac2_runs SET status='cancelled',updated_at=? WHERE id=?",
          [now(), run.id],
        );
        continue;
      }
      try {
       await dbSavepoint(async()=>{
        const sourceEvent=await dbGet('SELECT event_type,resource_id,payload FROM ac2_events WHERE id=? AND org_id=? AND environment=?',[run.trigger_key,a.org,a.environment]);let branchPayload:any=sourceEvent?JSON.parse(sourceEvent.payload):currentInvoice?{currency:currentInvoice.currency,amount_minor:currentInvoice.total_minor-currentInvoice.paid_minor-(currentInvoice.credited_minor||0)}:{};
        if(sourceEvent?.event_type==='crm.stage_changed'){const source=await dbGet('SELECT data,status FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?',[sourceEvent.resource_id,a.org,a.environment]);if(!source||['archived','cancelled'].includes(source.status)||JSON.parse(source.data).stage!==branchPayload.stage){await dbRun("UPDATE ac2_runs SET status='cancelled',result=?,updated_at=? WHERE id=?",[JSON.stringify({reason:'source_changed'}),now(),run.id]);return;}branchPayload={...branchPayload,...JSON.parse(source.data)};}
        if(sourceEvent?.event_type==='invoice.issued'){const invoice=await dbGet("SELECT data FROM ac_records WHERE id=? AND org_id=? AND environment=? AND kind='invoices'",[sourceEvent.resource_id,a.org,a.environment]);if(invoice){const value=JSON.parse(invoice.data);branchPayload={...branchPayload,currency:value.currency,amount_minor:value.total_minor};}}
        const selectedAction=selectedWorkflowAction(w,branchPayload);if(selectedAction==='skip'){await dbRun("UPDATE ac2_runs SET status='succeeded',attempts=attempts+1,result=?,updated_at=? WHERE id=?",[JSON.stringify({action:'skip',completed_units:0}),now(),run.id]);return;}
        await checkLimits(a,'automations',1);
        const template = automationTemplates.find((t) => t.id === w.template);
        if (!template) throw new Error('unsupported_template');
        const resource = run.trigger_key.split(':').at(-1);
        let body =
          'A business record needs your review. This is an in-app reminder; no customer message or financial action was sent.';
        if (['daily_summary', 'weekly_cashflow'].includes(w.template)) {
          const { financialSnapshot } = await import('./intelligence');
          const { day, addDays } = await import('./store');
          const end = day(at),
            start = addDays(end, w.template === 'weekly_cashflow' ? -6 : 0),
            summary = await financialSnapshot(
              a,
              { currency: w.conditions.currency, from: start, to: end },
              end,
            );
          body =
            'Recorded ' +
            start +
            ' to ' +
            end +
            ': confirmed collections ' +
            summary.totals.confirmed_inflows_minor +
            ' ' +
            w.conditions.currency +
            ' minor units; recorded outflows ' +
            summary.totals.recorded_outflows_minor +
            '; outstanding receivables ' +
            summary.totals.outstanding_minor +
            '. Coverage limits apply; this is not profit or a bank balance.';
        }
        let result:any,completedUnits=0;
        if(selectedAction==='in_app_notification'){
         const delivery=await notify(a,{category:template.category,title:template.name,body,resource_id:resource,key:'automation:'+run.id,user_id:w.created_by});
         completedUnits=delivery.inserted?1:0;result={action:'in_app_notification',external_messages_sent:0,notifications_created:delivery.inserted,delivery_status:delivery.inserted?'created':'suppressed_by_preferences_or_cap'};
        }else{
         const {executeBusinessWorkflow}=await import('./workflow-actions');result=await executeBusinessWorkflow({...a,actor:w.created_by,role:member.role,api:false},w,run,selectedAction);completedUnits=result.completed_units||0;
        }
        await dbRun("UPDATE ac2_runs SET status='succeeded',attempts=attempts+1,result=?,updated_at=? WHERE id=?",[JSON.stringify(result),now(),run.id]);
        await audit(a.org,w.created_by,'automation.succeeded',run.id);
        if(completedUnits)await recordUsage(a,'automations','workflow:'+run.id,1,'workflow_completed');
       });
      } catch (error) {
        const attempts = run.attempts + 1;
        await dbRun(
          'UPDATE ac2_runs SET status=?,attempts=?,result=?,next_at=?,updated_at=? WHERE id=?',
          [
            attempts >= (w.retry_policy?.max_attempts||3) ? 'dead_letter' : 'pending',
            attempts,
            JSON.stringify({ error: 'execution_failed' }),
            new Date(at.getTime() + 1000 * (w.retry_policy?.base_delay_seconds||2) * 2 ** (attempts-1)).toISOString(),
            now(),
            run.id,
          ],
        );
        if (attempts >= (w.retry_policy?.max_attempts||3)) {
          await emit(a, 'automation.run_failed', {
            id: run.id,
            workflow_id: w.id,
          });
          await notify(a, {
            category: 'automation_failures',
            title: 'Automation needs attention',
            body: 'The run exhausted its retry policy.',
            resource_id: w.id,
            key: 'failure:' + run.id,
          });
        }
      }
    }
    return { queued, processed: runs.length };
  });
}
async function approvalResource(a:Access,id:string){
 const object=await dbGet('SELECT id,kind,data,version,updated_at FROM ac2_objects WHERE id=? AND org_id=? AND environment=?',[id,a.org,a.environment])||await dbGet('SELECT id,kind,data,updated_at FROM ac_records WHERE id=? AND org_id=? AND environment=?',[id,a.org,a.environment])||await dbGet("SELECT id,'products' AS kind,data,version,updated_at FROM ac_products WHERE id=? AND org_id=? AND environment=?",[id,a.org,a.environment])||await dbGet("SELECT id,'quotations' AS kind,data,version,updated_at FROM ac_sales_quotes WHERE id=? AND org_id=? AND environment=?",[id,a.org,a.environment]);
 if(object)return object;
 if(await dbGet("SELECT id FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind='work_project'",[id,a.org,a.environment]))return (await import('../erp/work-reviews')).workReviewResource(a,id);
 if(await dbGet("SELECT id FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind='document'",[id,a.org,a.environment]))return (await import('../erp/document-reviews')).documentReviewResource(a,id);
 if(await dbGet("SELECT id FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind='leave_request'",[id,a.org,a.environment]))return (await import('../erp/people-leave')).leaveApprovalResource(a,id);
 if(!await dbGet('SELECT id FROM ac_accounting_entries WHERE id=? AND org_id=? AND environment=?',[id,a.org,a.environment]))fail(404,'Approval resource not found');
 const {accountingReviewResource}=await import('../erp/accounting');return accountingReviewResource(a,id);
}
async function approvalResourceHash(a:Access,id:string){
 const object=await approvalResource(a,id);
 return hash(JSON.stringify([a.org,a.environment,object.id,object.kind,object.data,object.version??null,object.updated_at]));
}
async function approvalBinding(a:Access,approval:any,parameters?:unknown){
 const binding=await dbGet('SELECT * FROM ac_approval_bindings WHERE approval_id=? AND org_id=? AND environment=?',[approval.id,a.org,a.environment]);
 if(!binding||binding.consumed_at||binding.resource_hash!==await approvalResourceHash(a,approval.resource_id))fail(409,'Approval is stale or already consumed; request a new review');
 binding.parameters=decodeApprovalField(a,approval.id,approval.action,'parameters',binding.parameters);
 if(parameters!==undefined&&binding.parameters!==JSON.stringify(parameters))fail(409,'Execution parameters differ from the reviewed decision');
 return binding;
}
export async function requestApproval(a: Access, input: unknown) {
  if (a.api) fail(403, 'A human member must request approval');
  const d = z
    .object({
      approver: z.string().uuid(),
      action: z.enum([
        'protected_release',
        'protected_refund',
        'dispute_resolution',
        'sensitive_integration_change',
        'invoice_adjustment',
        'manual_reconciliation',
        'stock_adjustment',
        'sales_discount',
        'journal_posting',
        'leave_approval',
        'document_review',
        'work_project_review',
      ]),
      resource_id: z.string().uuid(),
      parameters:z.object({work_project_review:z.object({project_version:z.number().int().positive()}).strict().optional(),document_review:z.object({document_version:z.number().int().positive(),version_id:z.string().uuid()}).strict().optional(),leave_approval:z.object({request_version:z.number().int().positive(),units_milli:z.number().int().positive()}).strict().optional(),journal_posting:z.object({entry_version:z.number().int().positive()}).strict().optional(),decision:z.enum(['release','refund']).optional(),movement:movementInput.omit({approval_id:true}).optional(),sales_discount:z.object({quote_version:z.number().int().positive(),discount_minor:z.number().int().min(0).max(1e11)}).strict().optional(),credit_note:z.object({amount_minor:z.number().int().positive().max(1e11),reason:z.string().trim().min(5).max(1000),issued_on:z.string().date()}).strict().optional()}).strict().default({}),
    })
    .strict()
    .parse(input);
  if (d.approver === a.actor) fail(400, 'Choose a different approver');
  if(d.action==='work_project_review')await (await import('../erp/work-reviews')).validateWorkReviewRequest(a,d.resource_id,d.parameters.work_project_review);
  if(d.parameters.work_project_review&&d.action!=='work_project_review')fail(400,'Project review parameters require the matching action');
  if(d.action==='document_review')await (await import('../erp/document-reviews')).validateDocumentReviewRequest(a,d.resource_id,d.parameters.document_review);
  if(d.parameters.document_review&&d.action!=='document_review')fail(400,'Document review parameters require the matching action');
  if(d.action==='leave_approval')await (await import('../erp/people-leave')).validateLeaveReviewRequest(a,d.resource_id,d.parameters.leave_approval);
  if(d.parameters.leave_approval&&d.action!=='leave_approval')fail(400,'Leave parameters require the matching action');
  if(d.action==='journal_posting'){const value=await approvalResource(a,d.resource_id);if(value.kind!=='accounting_entry'||JSON.parse(value.data).status!=='draft')fail(409,'Review an accounting draft before posting');if(!d.parameters.journal_posting||d.parameters.journal_posting.entry_version!==Number(value.version))fail(400,'Review the exact journal entry version');}
  if(d.action==='stock_adjustment'&&(!d.parameters.movement||d.parameters.movement.product_id!==d.resource_id||d.parameters.movement.kind!=='adjustment'||d.parameters.movement.quantity_milli>=0))fail(400,'Review the exact negative stock adjustment');
  if(d.action==='sales_discount'&&!d.parameters.sales_discount)fail(400,'Review the exact quotation discount and version');
  if(d.parameters.journal_posting&&d.action!=='journal_posting')fail(400,'Journal posting parameters require the matching action');
  if(d.parameters.movement&&d.action!=='stock_adjustment'||d.parameters.sales_discount&&d.action!=='sales_discount'||d.parameters.credit_note&&d.action!=='invoice_adjustment'||d.parameters.decision&&d.action!=='dispute_resolution')fail(400,'Parameters do not match the approved operation');
  if(d.action==='dispute_resolution'&&!d.parameters.decision)fail(400,'Choose the exact dispute outcome before requesting review');
  const m = await dbGet(
    'SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',
    [a.org, d.approver],
  );
  if(d.action==='work_project_review')await (await import('../erp/work-reviews')).canApproveProjectReview({...a,actor:d.approver},d.resource_id);
  else if(d.action==='document_review')await (await import('../erp/document-reviews')).canReviewDocument({...a,actor:d.approver},d.resource_id);
  else if(d.action==='leave_approval')await (await import('../erp/people-leave')).canApproveLeave({...a,actor:d.approver},d.resource_id);
  else if (!m || !['owner', 'admin'].includes(m.role))fail(400, 'Approver must be an owner or admin');
  const kind =
    d.action === 'dispute_resolution'
      ? 'disputes'
      : d.action.startsWith('protected_')
        ? 'protected_sales'
        : d.action === 'sensitive_integration_change'
          ? 'connectors'
          : undefined;
  if (kind) await get(a, d.resource_id, kind);
  else {
    const object = await dbGet(
      d.action==='work_project_review'?"SELECT id FROM ac_erp_objects WHERE kind='work_project' AND id=? AND org_id=? AND environment=?":d.action==='document_review'?"SELECT id FROM ac_erp_objects WHERE kind='document' AND id=? AND org_id=? AND environment=?":d.action==='leave_approval'?"SELECT id FROM ac_erp_objects WHERE kind='leave_request' AND id=? AND org_id=? AND environment=?":d.action==='journal_posting'?'SELECT id FROM ac_accounting_entries WHERE id=? AND org_id=? AND environment=?':d.action==='stock_adjustment'?'SELECT id FROM ac_products WHERE id=? AND org_id=? AND environment=?':d.action==='sales_discount'?'SELECT id FROM ac_sales_quotes WHERE id=? AND org_id=? AND environment=?':'SELECT id FROM ac_records WHERE id=? AND org_id=? AND environment=?',
      [d.resource_id, a.org, a.environment],
    );
    if (!object) fail(404, 'Resource not found');
  }
  if(d.action==='work_project_review')await checkLimits(a,'work',1);
  const id = randomUUID();
  const resourceHash=await approvalResourceHash(a,d.resource_id);
  const resourceRow=await approvalResource(a,d.resource_id);
  const source=JSON.parse(resourceRow.data),summary=Object.fromEntries(['amount_minor','currency','buyer_name','recipient_org','state','status','description','name','sku','unit','reference','discount_minor','total_minor'].filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
  if(d.action==='work_project_review'){summary.private_workflows=source.private_workflows;summary.template_enabled=source.template_enabled;summary.task_summary=source.task_summary;summary.assurance='Exact private project snapshot review; no financial or personnel authority is granted';}
  if(d.action==='document_review'){summary.name=source.name;summary.file=source.file;summary.assurance='Human file-content review only; not independent verification or financial approval';}
  if(d.action==='leave_approval')for(const key of ['employee_name','leave_type_name','from','to','units_milli','reason'])summary[key]=source[key];
  if(d.action==='journal_posting'){summary.journal_lines=source.lines;summary.entry_on=source.entry_on;summary.source_type=source.source_type;summary.source_id=source.source_id;}
  if(d.parameters.movement){const m=d.parameters.movement,w=await dbGet('SELECT name FROM ac_warehouses WHERE id=? AND org_id=? AND environment=?',[m.warehouse_id,a.org,a.environment]);if(!w)fail(404,'Warehouse not found');summary.warehouse_name=w.name;if(m.location_id){const location=await dbGet('SELECT name FROM ac_stock_locations WHERE id=? AND warehouse_id=? AND org_id=? AND environment=?',[m.location_id,m.warehouse_id,a.org,a.environment]);if(!location)fail(404,'Warehouse location not found');summary.location_name=location.name;}}
  await dbRun(
    'INSERT INTO ac2_approvals(id,org_id,environment,requester,approver,action,resource_id,status,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [
      id,
      a.org,
      a.environment,
      a.actor,
      d.approver,
      d.action,
      d.resource_id,
      'pending',
      new Date(Date.now() + 86400000).toISOString(),
      now(),
    ],
  );
  await dbRun('INSERT INTO ac_approval_bindings(approval_id,org_id,environment,resource_hash,parameters,review_summary) VALUES (?,?,?,?,?,?)',[id,a.org,a.environment,resourceHash,encodeApprovalField(a,id,d.action,'parameters',JSON.stringify(d.parameters)),encodeApprovalField(a,id,d.action,'review_summary',JSON.stringify(summary))]);
  if(d.action==='work_project_review')await recordUsage(a,'work','work-review-request:'+id,1,'private_project_review_requested');
  await audit(a.org, a.actor, 'approval.requested', id);
  if(!privateApprovalActions.has(d.action))await emit(a, 'approval.requested', { id, resource_id: d.resource_id });
  await notify(a, {
    category: 'security',
    title: 'Approval requested',
    severity:'approval_required',
    action_data:d.action==='work_project_review'?{app_id:'work',section:'work_task',record_id:d.resource_id,approval_id:id}:d.action==='document_review'?{app_id:'documents',section:'document_review',record_id:d.resource_id,approval_id:id}:d.action==='leave_approval'?{app_id:'people',section:'people_leave',record_id:d.resource_id,approval_id:id}:{app_id:'automations',section:'Approvals',approval_id:id},
    body: 'Review the request before deciding. Self-approval is not permitted.',
    resource_id: id,
    key: id,
    user_id: d.approver,
  });
  return { id, ...d, status: 'pending' };
}
export async function decideApproval(a: Access, id: string, input: unknown) {
  if (a.api) fail(403, 'Human session required');
  const d = z
    .object({
      decision: z.enum(['approved', 'rejected']),
      reason: z.string().trim().min(5).max(1000),
    })
    .strict()
    .parse(input);
  return atomic(a, async () => {
    const approval = await dbGet(
      'SELECT * FROM ac2_approvals WHERE id=? AND org_id=? AND environment=?',
      [id, a.org, a.environment],
    );
    if (!approval) fail(404, 'Approval not found');
    if (approval.approver !== a.actor || approval.requester === a.actor)
      fail(403, 'Assigned non-requesting approver required');
    if(approval.action==='journal_posting')await (await import('../erp/accounting')).accountingAccess(a,true);
    const currentRole=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,a.actor]);
    if(approval.action==='work_project_review')await (await import('../erp/work-reviews')).canApproveProjectReview(a,approval.resource_id);
    else if(approval.action==='document_review')await (await import('../erp/document-reviews')).canReviewDocument(a,approval.resource_id,true);
    else if(approval.action==='leave_approval')await (await import('../erp/people-leave')).canApproveLeave(a,approval.resource_id);
    else if(!currentRole||!['owner','admin'].includes(currentRole.role))fail(403,'Approver authority revoked');
    if (approval.status !== 'pending' || approval.expires_at < now())
      fail(409, 'Approval is closed or expired');
    if(d.decision==='approved'||['document_review','work_project_review'].includes(approval.action))await approvalBinding(a,approval);
    await dbRun(
      'UPDATE ac2_approvals SET status=?,reason=?,decided_at=? WHERE id=?',
      [d.decision, encodeApprovalField(a,id,approval.action,'reason',d.reason), now(), id],
    );
    await audit(a.org, a.actor, 'approval.' + d.decision, id);
    if(approval.action==='work_project_review')await (await import('../erp/work-reviews')).applyProjectDecision(a,approval,d.decision);
    if(approval.action==='document_review')await (await import('../erp/document-reviews')).applyDocumentDecision(a,approval,d.decision);
    if(approval.action==='leave_approval')await (await import('../erp/people-leave')).applyLeaveDecision(a,approval,d.decision);
    if(!privateApprovalActions.has(approval.action))await emit(a, 'approval.decided', { id, status: d.decision });
    return { id, status: d.decision, executed: ['leave_approval','document_review','work_project_review'].includes(approval.action) };
  });
}
export async function requireApproval(
  a: Access,
  id: string | undefined,
  action: string,
  resource: string,
  parameters:unknown={},
) {
  if (!id) fail(409, 'An approved request is required');
  const approval = await dbGet(
    "SELECT * FROM ac2_approvals WHERE id=? AND org_id=? AND environment=? AND action=? AND resource_id=? AND status='approved' AND expires_at>?",
    [id, a.org, a.environment, action, resource, now()],
  );
  if (!approval || approval.requester !== a.actor)
    fail(
      403,
      'An unexpired approval for this requester and resource is required',
    );
  const approver = await dbGet(
    'SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',
    [a.org, approval.approver],
  );
  if(action==='work_project_review')await (await import('../erp/work-reviews')).canApproveProjectReview({...a,actor:approval.approver},resource);
  else if(action==='document_review')await (await import('../erp/document-reviews')).canReviewDocument({...a,actor:approval.approver},resource,true);
  else if(action==='leave_approval')await (await import('../erp/people-leave')).canApproveLeave({...a,actor:approval.approver},resource);
  else if (!approver || !['owner', 'admin'].includes(approver.role))
    fail(403, 'Approver authority revoked');
  await approvalBinding(a,approval,parameters);
  const consumed=await dbRun('UPDATE ac_approval_bindings SET consumed_at=? WHERE approval_id=? AND consumed_at IS NULL',[now(),approval.id]);
  if(!consumed.changes)fail(409,'Approval already consumed');
  await audit(a.org,a.actor,'approval.consumed',approval.id);
  return approval;
}

export async function saveWorkflowVersion(a:Access,w:any){await dbRun('INSERT INTO ac_workflow_versions(workflow_id,version,org_id,environment,actor,configuration,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(workflow_id,version) DO NOTHING',[w.id,w.version,a.org,a.environment,a.actor,JSON.stringify(w),now()]);}
export async function editAutomation(a:Access,id:string,input:unknown){const d=workflowEditInput.parse(input);if(a.api)fail(403,'A human member must own a workflow change');return atomic(a,async()=>{const w=await get(a,id,'automations');if(w.version!==d.expected_version)fail(409,'Workflow changed; reload before editing');await saveWorkflowVersion(a,w);if(['customer_onboarding','crm_stage_follow_up','invoice_review_task'].includes(d.configuration.template))await requireServices(a,['crm']);if(d.configuration.template==='stock_replenishment')await requireServices(a,['inventory']);const result=await change(a,w,{...d.configuration,action:workflowAction(d.configuration.template)});await saveWorkflowVersion(a,result);await audit(a.org,a.actor,'automation.version_updated',id);return result;});}

/** Read-only execution plan: never queues or performs the supported action. */
export async function previewAutomation(a:Access,id:string){
 if(a.api)fail(403,'Human member required');await requireServices(a,['automations']);const w=await get(a,id,'automations'),member=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,w.created_by]);if(!member||!permitted(member.role,'finance'))fail(409,'Workflow owner no longer has the required authority');
 const owner={...a,actor:w.created_by,role:member.role,api:false};if(['customer_onboarding','crm_stage_follow_up','invoice_review_task'].includes(w.template))await requireServices(owner,['crm']);if(w.template==='stock_replenishment')await requireServices(owner,['inventory']);const template=automationTemplates.find(t=>t.id===w.template);if(!template)fail(409,'Unsupported workflow template');const matches=(await candidates(owner,w,new Date())).filter(t=>(!t.payload.currency||t.payload.currency===w.conditions.currency)&&(t.payload.amount_minor===undefined||t.payload.amount_minor>=w.conditions.minimum_minor));
 return {workflow_id:w.id,version:w.version,enabled:w.enabled,trigger:template!.trigger,action:w.branches?.length?'conditional_branches':workflowAction(w.template),branches:w.branches||[],fallback_action:w.fallback_action||workflowAction(w.template),candidate_count:matches.length,candidate_limit:100,delay_minutes:w.delay_minutes||0,side_effects_performed:0,notice:'Plan only. No run, task, suggestion, notification, supplier order or payment was created. Execution rechecks the current configuration, source, permissions, limits and preferences.'};
}

export async function expireApprovals(a:Access,at=new Date()){return atomic(a,async()=>{const rows=await dbAll("SELECT id FROM ac2_approvals WHERE org_id=? AND environment=? AND status='pending' AND action NOT IN ('journal_posting','leave_approval','document_review','work_project_review') AND expires_at<=? ORDER BY expires_at,id LIMIT 100",[a.org,a.environment,at.toISOString()]);let expired=0;for(const row of rows){const changed=await dbRun("UPDATE ac2_approvals SET status='expired' WHERE id=? AND org_id=? AND environment=? AND status='pending'",[row.id,a.org,a.environment]);if(!changed.changes)continue;expired++;await emit(a,'approval.expired',{id:row.id,automatic:true},{key:'approval.expired:'+row.id});await audit(a.org,a.actor,'approval.expired_automatically',row.id);}return {expired};});}
