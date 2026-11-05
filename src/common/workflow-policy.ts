export function workflowAction(template:string){return ['customer_onboarding','crm_stage_follow_up','invoice_review_task'].includes(template)?'create_crm_follow_up':template==='stock_replenishment'?'replenishment_suggestion':'in_app_notification';}
export function workflowActions(template:string){return [...new Set(['in_app_notification',workflowAction(template),'skip'])];}
export function workflowBranchFields(template:string):string[]{
 if(template==='crm_stage_follow_up')return ['stage','kind','currency','amount_minor'];
 if(['invoice_review_task','invoice_due_soon','invoice_overdue','customer_follow_up','obligation_due','payment_confirmation','payment_failed'].includes(template))return ['currency','amount_minor'];
 return [];
}
export function selectedWorkflowAction(w:any,payload:any){for(const branch of w.branches||[]){if(branch.conditions.every((c:any)=>c.operator==='eq'?payload[c.field]===c.value:typeof payload[c.field]==='number'&&typeof c.value==='number'&&(c.operator==='gte'?payload[c.field]>=c.value:payload[c.field]<=c.value)))return branch.action;}return w.fallback_action||workflowAction(w.template);}
