import { BarChart } from '../charts/BarChart';
import { Overlay } from '../components/Overlay';
import { DataTable } from '../components/DataTable';
import { WorkAutomationDirectory } from './WorkAutomation';
import { appNavigationEvent } from './AppNavigation';
import { useIdempotentAPI } from './useIdempotentAPI';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApprovalView } from '../operations/WorkflowViews';
import { RunControl } from '../operations/WorkflowDetail';
import {
  WorkflowBranchFields,
  workflowBranchValues,
} from '../operations/WorkflowBranchFields';
import { workflowAction, workflowActions, workflowBranchFields as workflowBranchFieldsFor } from '../../../src/common/workflow-policy';
import { parseMoney } from '../../../src/finance/money';
import { Empty, Field, type API, type Action } from '../operations/UI';

type Template = {
  id: string;
  name: string;
  trigger: string;
  category: string;
  group: 'Business Events' | 'Scheduled Conditions';
  source_services: string[];
  required_services: string[];
  unavailable_services: string[];
  default_action_unavailable_services: string[];
  available: boolean;
};
type AutomationService = { id: string; name: string; status: string };
const actionServiceRequirements: Record<string, string[]> = {
  in_app_notification: [],
  create_crm_follow_up: ['crm'],
  replenishment_suggestion: ['inventory'],
  skip: [],
};
const automationCurrencies = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'];

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceLabel(template?: Template) {
  const labels: Record<string, string> = {
    crm: 'CRM', customers: 'Customers', orders: 'Sales', inventory: 'Inventory',
    cash_flow: 'Cash Flow', security: 'Credentials', integrations: 'Integrations',
    invoices: 'Invoicing', payments: 'Payments', reconciliation: 'Reconciliation',
    deliveries: 'Deliveries',
  };
  return template ? labels[template.category] || titleCase(template.category) : 'Business records';
}

function conditionSummary(templateId: string, conditions: any, branches: any[] = [], minimumInput?: string, daysInput?: number) {
  const currency = conditions?.currency || 'KES';
  const factor = ['UGX', 'RWF'].includes(currency) ? 1 : 100;
  let threshold = Number(conditions?.minimum_minor || 0);
  try { if (minimumInput !== undefined) threshold = parseMoney(minimumInput || '0', currency); }
  catch { return 'Enter a valid minimum amount to review the eligibility conditions.'; }
  const amountText = threshold
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(threshold / factor)
    : 'no minimum amount';
  const days = Number(daysInput ?? conditions?.days_before_due ?? 3);
  if (branches.length) return `Evaluate up to ${branches.length} ordered condition branch${branches.length === 1 ? '' : 'es'}; the first matching branch selects its supported action, otherwise use the fallback action.`;
  if (['invoice_due_soon'].includes(templateId)) return `Only outstanding ${currency} invoices with at least ${amountText} unpaid and a due date within ${days} day${days === 1 ? '' : 's'} are eligible.`;
  if (['invoice_overdue', 'customer_follow_up'].includes(templateId)) return `Only outstanding ${currency} invoices with at least ${amountText} unpaid and a due date before today are eligible.`;
  if (templateId === 'obligation_due') return `Only active ${currency} obligations of at least ${amountText} due within ${days} day${days === 1 ? '' : 's'} are eligible.`;
  if (templateId === 'credential_expiry') return `Only active credentials expiring within ${days} day${days === 1 ? '' : 's'} are eligible.`;
  if (['payment_confirmation', 'payment_failed', 'invoice_review_task'].includes(templateId)) return `The source event must match ${currency}${threshold ? ` and meet the ${amountText} amount threshold` : ''}; the worker rechecks current source state before acting.`;
  if (templateId === 'crm_stage_follow_up') return 'A CRM stage-change event is rechecked against the current, non-archived opportunity before an action runs.';
  if (templateId === 'stock_replenishment') return 'The source product must still be active and inventory-tracked, with available stock at or below its reorder point.';
  if (templateId === 'integration_failed') return 'Only a recorded integration failure event is eligible; no external retry or delivery is performed.';
  return 'The selected supported business event or scheduled review is the eligibility condition.';
}

function minorToMajor(minor: number, currency: string) {
  return String(Number(minor || 0) / (['UGX', 'RWF'].includes(currency) ? 1 : 100));
}

function localTime(value?: string, timezone = 'UTC') {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date);
}

function automationUrl(rule: string | null, template?: string) {
  const url = new URL(location.href);
  url.searchParams.set('app', 'automations');
  if (rule) url.searchParams.set('automationRule', rule);
  else url.searchParams.delete('automationRule');
  if (template) url.searchParams.set('automationTemplate', template);
  else url.searchParams.delete('automationTemplate');
  history.pushState(null, '', url.pathname + url.search + url.hash);
  dispatchEvent(new Event(appNavigationEvent));
}

function WorkflowDiagram({ template, action, branches, onOpen }: { template?: Template; action: string; branches: any[]; onOpen: (id: string) => void }) {
  const nodes = [
    { id: 'automation-trigger-fields', title: 'Trigger', value: template?.name || 'Select a supported trigger' },
    { id: 'automation-condition-fields', title: 'Conditions', value: branches.length ? `${branches.length} ordered branch${branches.length === 1 ? '' : 'es'}` : 'Source eligibility rules' },
    { id: 'automation-action-fields', title: branches.length ? 'First matching branch' : 'Action', value: branches.length ? 'Then fallback action' : titleCase(action) },
  ];
  return <div className="automation-workflow-diagram" aria-label="Workflow overview">
    <svg viewBox="0 0 960 118" role="img" aria-labelledby="automation-diagram-title automation-diagram-desc">
      <title id="automation-diagram-title">Automation workflow sequence</title>
      <desc id="automation-diagram-desc">The supported trigger flows through its real conditions to the selected action.</desc>
      <path d="M286 58 H354 M606 58 H674" className="automation-diagram-connector" />
      {nodes.map((node, index) => {
        const x = 24 + index * 330;
        return <g key={node.id} role="button" tabIndex={0} aria-label={`${node.title}: ${node.value}. Open configuration.`} onClick={() => onOpen(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(node.id); } }} className="automation-diagram-node">
          <rect x={x} y="18" width="252" height="80" rx="3" />
          <text x={x + 14} y="45" className="automation-diagram-title">{node.title}</text>
          <text x={x + 14} y="72" className="automation-diagram-value">{node.value.length > 27 ? node.value.slice(0, 26) + '…' : node.value}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function RuleEditor({
  workflow,
  templates,
  currency,
  timezone,
  api,
  action,
  services,
  servicesError,
  crmStages,
  onCancel,
  onRuns,
  onSaved,
}: {
  workflow?: any;
  templates: Template[];
  currency: string;
  timezone: string;
  api: API;
  action: Action;
  services: AutomationService[];
  servicesError: string;
  crmStages: { id: string; name: string }[];
  onCancel: () => void;
  onRuns: () => void;
  onSaved: (workflow: any) => void;
}) {
  const initialTemplate =
    workflow?.template ||
    new URLSearchParams(location.search).get('automationTemplate') ||
    templates[0]?.id ||
    'customer_onboarding';
  const sameTemplate = workflow?.template === initialTemplate,
    [template, setTemplate] = useState(initialTemplate),
    [tab, setTab] = useState<'actions' | 'notes'>('actions'),
    [selectedAction, setSelectedAction] = useState(
      (sameTemplate && workflow?.fallback_action) || workflowAction(initialTemplate),
    ),
    [conditionCurrency, setConditionCurrency] = useState(sameTemplate ? workflow?.conditions?.currency || currency : currency),
    [minimumAmount, setMinimumAmount] = useState(minorToMajor(sameTemplate ? workflow?.conditions?.minimum_minor || 0 : 0, sameTemplate ? workflow?.conditions?.currency || currency : currency)),
    [reminderDays, setReminderDays] = useState(String(sameTemplate ? workflow?.conditions?.days_before_due ?? 3 : 3)),
    [scheduleFrequency, setScheduleFrequency] = useState(template === 'weekly_cashflow' ? 'weekly' : sameTemplate ? workflow?.schedule?.frequency || 'daily' : 'daily'),
    [scheduleHour, setScheduleHour] = useState(String(sameTemplate ? workflow?.schedule?.hour ?? 9 : 9)),
    [scheduleTimezone, setScheduleTimezone] = useState(sameTemplate ? workflow?.schedule?.timezone || timezone : timezone),
    [notes, setNotes] = useState(workflow?.notes || ''),
    [showActionPicker, setShowActionPicker] = useState(false),
    [actionName, setActionName] = useState(workflow?.action_name || ''),
    [pendingAction, setPendingAction] = useState((sameTemplate && workflow?.fallback_action) || workflowAction(initialTemplate)),
    [pendingActionName, setPendingActionName] = useState(workflow?.action_name || ''),
    [branchActions, setBranchActions] = useState<string[]>(sameTemplate ? workflow?.branches?.map((branch: any) => branch.action) || [] : []),
    [workflowBranches, setWorkflowBranches] = useState<any[]>(sameTemplate ? workflow?.branches || [] : []),
    [versions, setVersions] = useState<any[]>([]),
    [versionsError, setVersionsError] = useState(''),
    [versionsLoading, setVersionsLoading] = useState(false),
    [showVersions, setShowVersions] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(''),
    [manualRunMessage, setManualRunMessage] = useState(''),
    [manualRunBusy, setManualRunBusy] = useState(false),
    [busy, setBusy] = useState(false);
  const currentTemplate = templates.find((item) => item.id === template),
    isScheduled = currentTemplate?.trigger === 'schedule',
    actions = workflowActions(template),
    needsAmount = workflowBranchFieldsFor(template).includes('amount_minor') || ['invoice_review_task', 'invoice_due_soon', 'invoice_overdue', 'customer_follow_up'].includes(template),
    needsDueOffset = ['invoice_due_soon', 'invoice_overdue', 'customer_follow_up', 'obligation_due', 'credential_expiry'].includes(template),
    initial = workflow?.template === template ? workflow : {
      name: workflow?.name || '',
      notes,
      template,
      enabled: false,
      delay_minutes: 0,
      conditions: { currency, minimum_minor: 0, days_before_due: 3 },
      schedule: { frequency: template === 'weekly_cashflow' ? 'weekly' : 'daily', hour: 9, timezone },
      branches: [],
      retry_policy: { max_attempts: 3, base_delay_seconds: 2 },
    };
  const serviceStates = new Map(services.map((item) => [item.id, item.status])),
    servicesReady = !servicesError && services.length > 0,
    requiredActions = [selectedAction, ...branchActions],
    actionServices = [...new Set(requiredActions.flatMap((item) => actionServiceRequirements[item] || []))],
    unavailableActionServices = actionServices.filter((service) => serviceStates.get(service) !== 'active'),
    blockingServices = [
      ...(currentTemplate?.unavailable_services || []),
      ...unavailableActionServices,
      ...(!servicesReady ? ['service status'] : []),
      ...(workflow?.owner_permission_revoked ? ['owner authority'] : []),
    ].filter((value, index, list) => list.indexOf(value) === index);

  useEffect(() => {
    const action = workflow?.template === template
      ? workflow.fallback_action || workflowAction(template)
      : workflowAction(template);
    setSelectedAction(action);
    setPendingAction(action);
    setConditionCurrency(workflow?.template === template ? workflow.conditions.currency || currency : currency);
    setMinimumAmount(minorToMajor(workflow?.template === template ? workflow.conditions.minimum_minor || 0 : 0, workflow?.template === template ? workflow.conditions.currency || currency : currency));
    setReminderDays(String(workflow?.template === template ? workflow.conditions.days_before_due ?? 3 : 3));
    setScheduleFrequency(template === 'weekly_cashflow' ? 'weekly' : workflow?.template === template ? workflow.schedule?.frequency || 'daily' : 'daily');
    setScheduleHour(String(workflow?.template === template ? workflow.schedule?.hour ?? 9 : 9));
    setScheduleTimezone(workflow?.template === template ? workflow.schedule?.timezone || timezone : timezone);
    setBranchActions(workflow?.template === template ? workflow.branches?.map((branch: any) => branch.action) || [] : []);
    setWorkflowBranches(workflow?.template === template ? workflow.branches || [] : []);
    if (workflow?.template !== template) { setActionName(''); setPendingActionName(''); }
    setPreview(null);
  }, [template, workflow?.id, workflow?.version]);

  async function loadVersions() {
    if (!workflow?.id) return;
    setVersionsLoading(true);
    setVersionsError('');
    try {
      const result = await api('/automations/' + workflow.id + '/versions');
      setVersions(result.data || []);
      setShowVersions(true);
    } catch (caught) {
      setVersionsError((caught as Error).message || 'Version history could not be loaded.');
    } finally {
      setVersionsLoading(false);
    }
  }

  async function changeStatus() {
    if (!workflow?.id) return;
    setError('');
    try {
      await action(() => api('/automations/' + workflow.id, 'PATCH', { enabled: !workflow.enabled }), workflow.enabled ? 'Rule paused.' : 'Rule enabled.');
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function runManually() {
    if (!workflow?.id || !isScheduled || !workflow.enabled) return;
    setManualRunBusy(true);
    setManualRunMessage('');
    setError('');
    try {
      const result = await action(
        () => api('/automations/' + workflow.id + '/process', 'POST', {}),
        'The selected scheduled action was evaluated by the existing worker.',
      );
      setManualRunMessage(
        `Manual evaluation complete: ${result.queued ?? 0} new run(s) queued; ${result.processed ?? 0} pending run(s) processed.`,
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setManualRunBusy(false);
    }
  }

  async function takeOwnership() {
    if (!workflow?.id) return;
    setError('');
    try {
      const saved = await action(() => api('/automations/' + workflow.id + '/take-ownership', 'POST', {}), 'Ownership transferred to you. Review and enable the rule when ready.');
      onSaved(saved);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    try {
      const values = Object.fromEntries(new FormData(form));
      const config = {
        ...workflowBranchValues(values),
        name: String(values.name || ''),
        action_name: actionName.trim(),
        notes: String(values.notes ?? notes),
        template,
        enabled: values.enabled === 'on',
        delay_minutes: Number(values.delay ?? 0),
        conditions: {
          currency: conditionCurrency,
          minimum_minor: needsAmount ? parseMoney(minimumAmount || '0', conditionCurrency) : 0,
          days_before_due: needsDueOffset ? Number(reminderDays || 0) : 3,
        },
        schedule: {
          frequency: template === 'weekly_cashflow' ? 'weekly' : String(values.frequency || 'daily'),
          hour: isScheduled ? Number(values.hour ?? 9) : 9,
          timezone: isScheduled ? String(values.timezone || timezone) : timezone,
        },
        fallback_action: selectedAction,
      };
      const saved = await action(
        () =>
          workflow
            ? api('/automations/' + workflow.id + '/configuration', 'PUT', {
                expected_version: workflow.version,
                configuration: config,
              })
            : api('/automations', 'POST', config),
        workflow ? 'Automation rule version saved.' : 'Automation rule created.',
      );
      onSaved(saved);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function testWithoutExecuting() {
    if (!workflow?.id) return;
    setError('');
    try {
      setPreview(await api('/business/workflows/' + workflow.id + '/test', 'POST', { confirm: true }));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  const focusSection = (id: string) => {
    if (id === 'automation-action-fields') setTab('actions');
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  return (
    <section className="automation-record-page" aria-label={workflow ? 'Automation rule details' : 'New automation rule'}>
      <div className="automation-record-toolbar">
        <div>
          <button type="button" className="automation-back" onClick={onCancel}>‹ Automation Rules</button>
          <p className="automation-breadcrumb">Automation Rules</p>
          <p className="automation-record-name">{workflow?.name || 'New'}</p>
        </div>
        <div className="automation-record-toolbar-actions">
          <button type="submit" form="automation-rule-form" className="button" disabled={busy || blockingServices.length > 0}>{busy ? 'Saving…' : workflow ? 'Save New Version' : 'Create Rule'}</button>
          <button type="button" className="secondary-button" onClick={onCancel}>Discard</button>
          {workflow?.owner_permission_revoked && <button type="button" className="secondary-button" onClick={takeOwnership}>Take Ownership &amp; Review</button>}
          {workflow && isScheduled && <button type="button" className="button" onClick={runManually} disabled={manualRunBusy || !workflow.enabled || blockingServices.length > 0} title={!workflow.enabled ? 'Enable this scheduled action before running it manually.' : blockingServices.length ? 'Resolve the listed service or owner issue before running.' : undefined}>{manualRunBusy ? 'Running…' : 'Run Manually'}</button>}
          {workflow && <button type="button" className="secondary-button" onClick={onRuns}>Run History</button>}
          {workflow && <button type="button" className="secondary-button" onClick={loadVersions} disabled={versionsLoading}>{versionsLoading ? 'Loading versions…' : 'Version History'}</button>}
          {workflow && <button type="button" className="secondary-button" onClick={testWithoutExecuting}>Test Without Executing</button>}
          {workflow && <button type="button" className="secondary-button" disabled={blockingServices.length > 0 || workflow.owner_permission_revoked} onClick={changeStatus}>{workflow.enabled ? 'Pause Rule' : 'Enable Rule'}</button>}
          <button type="button" className="quiet-button" onClick={onCancel}>Close</button>
        </div>
      </div>
      {manualRunMessage && <p className="automation-inline-success" role="status">{manualRunMessage}</p>}
      {showVersions && <section className="automation-version-history" aria-label="Automation configuration versions"><div className="automation-section-heading"><h2>Configuration Versions</h2><button type="button" className="quiet-button" onClick={() => setShowVersions(false)}>Close</button></div>{versionsError && <p className="alert error" role="alert">{versionsError}<button className="quiet-button" onClick={loadVersions}>Retry</button></p>}{versions.length ? <ol>{versions.map((item) => <li key={item.version}><strong>Version {item.version} · {item.configuration.name}</strong><span>{titleCase(item.configuration.template)} · {item.configuration.enabled ? 'Enabled' : 'Paused'} · {item.configuration.action_name || titleCase(item.configuration.fallback_action || workflowAction(item.configuration.template))}</span><small>{localTime(item.created_at, timezone)} · Updated by {item.actor_name || 'Workspace member'}</small></li>)}</ol> : <p>No saved versions are available.</p>}</section>}
      <form id="automation-rule-form" className="automation-record-form" onSubmit={submit}>
        <header className="automation-record-heading">
          <h1>{workflow?.name || 'Set an explicit name'}</h1>
          {workflow && <span className={'automation-state ' + (workflow.enabled ? 'is-enabled' : 'is-paused')}>{workflow.enabled ? 'Enabled' : 'Paused'}</span>}
        </header>
        <div className="automation-record-fields">
          <div className="automation-fields-main">
            <Field label="Name"><input name="name" required maxLength={100} defaultValue={initial.name} placeholder="Set an explicit name" /></Field>
          {isScheduled && <h2 className="automation-record-section-label">TECHNICAL SETTINGS</h2>}
          <Field label="Business Source"><span className="automation-value">{sourceLabel(currentTemplate)}</span></Field>
            <Field label="Trigger">
              <select aria-label="Trigger" value={template} onChange={(event) => setTemplate(event.target.value)}>
                {(['Business Events', 'Scheduled Conditions'] as const).map((group) => (
                  <optgroup key={group} label={group === 'Scheduled Conditions' ? 'Scheduled Checks' : group}>
                    {templates.filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            {isScheduled ? (
              <>
                <h2 className="automation-record-section-label">ACTION DETAILS</h2>
                <Field label="Execute Every">
                  <select name="frequency" value={scheduleFrequency} onChange={(event) => setScheduleFrequency(event.target.value)} disabled={template === 'weekly_cashflow'}>
                    <option value="daily">Day(s)</option><option value="weekly">Week(s)</option>
                  </select>
                </Field>
                <Field label="Target Hour"><input name="hour" type="number" min={0} max={23} value={scheduleHour} onChange={(event) => setScheduleHour(event.target.value)} /></Field>
                <Field label="Timezone"><input name="timezone" required maxLength={100} value={scheduleTimezone} onChange={(event) => setScheduleTimezone(event.target.value)} /></Field>
              </>
            ) : null}
            <h2 className="automation-subsection-title" id="automation-condition-fields">Conditions</h2>
            {needsDueOffset && <Field label="Reminder Window"><div className="automation-inline-field"><input name="days" type="number" min={0} max={30} value={reminderDays} onChange={(event) => setReminderDays(event.target.value)} /><span>Days before due</span></div></Field>}
            {(needsAmount || workflowBranchFieldsFor(template).includes('currency')) && <Field label="Currency"><select value={conditionCurrency} onChange={(event) => setConditionCurrency(event.target.value)}>{automationCurrencies.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>}
            {needsAmount && <Field label="Minimum Amount"><div className="automation-inline-field"><input name="minimum" type="number" min={0} step={['UGX', 'RWF'].includes(conditionCurrency) ? 1 : 0.01} value={minimumAmount} onChange={(event) => setMinimumAmount(event.target.value)} /><span>{conditionCurrency}</span></div></Field>}
            {!isScheduled && <Field label="Delay"><div className="automation-inline-field"><input name="delay" type="number" min={0} max={10080} defaultValue={initial.delay_minutes ?? 0} /><span>Minutes after the event</span></div></Field>}
            <Field label="Eligibility"><div className="automation-condition-summary">{conditionSummary(template, { ...initial.conditions, currency: conditionCurrency }, workflowBranches, minimumAmount, Number(reminderDays))}</div></Field>
            <label className="automation-toggle"><input name="enabled" type="checkbox" defaultChecked={!!initial.enabled} /><span>Active</span></label>
          </div>
          <aside className="automation-record-aside">
            <h2 id="automation-trigger-fields">Trigger details</h2>
            <p>{currentTemplate?.name}</p>
            <dl>
              <div><dt>Business source</dt><dd>{sourceLabel(currentTemplate)}</dd></div>
              <div><dt>Trigger</dt><dd>{currentTemplate?.trigger === 'schedule' ? 'Scheduled check' : titleCase(currentTemplate?.trigger || '')}</dd></div>
              <div><dt>Required services</dt><dd>{currentTemplate?.required_services?.map(titleCase).join(', ')}</dd></div>
              <div><dt>Runtime</dt><dd>Existing durable worker</dd></div>
            </dl>
            {blockingServices.length > 0 && <p className="alert warning">{servicesError ? 'Service readiness could not be verified. Retry before saving.' : 'Required services must be active before this rule can be saved or enabled: ' + blockingServices.map(titleCase).join(', ') + '.'}</p>}
            <p className="automation-runtime-note">Rules are checked by the existing worker every 15 seconds while it is awake. Free hosting can sleep, so scheduled delivery is not guaranteed.</p>
            {workflow && <div className="automation-record-audit"><span>Created {localTime(workflow.created_at, timezone)}</span><span>Last updated {localTime(workflow.updated_at, timezone)}</span><span>Owner: {workflow.owner_name || 'Former workspace member'}</span><span>Last run: {workflow.last_run_status ? titleCase(workflow.last_run_status) + ' · ' + localTime(workflow.last_run_at, timezone) : 'No run recorded'}</span><span>{workflow.run_count || 0} executions · version {workflow.version}</span></div>}
          </aside>
        </div>
        <WorkflowDiagram template={currentTemplate} action={selectedAction} branches={workflowBranches} onOpen={focusSection} />
        <div className="automation-tabs" role="tablist" aria-label={isScheduled ? 'Scheduled action sections' : 'Rule sections'}>
          <button type="button" role="tab" aria-selected={tab === 'actions'} onClick={() => setTab('actions')}>{isScheduled ? 'Execution Plan' : 'Actions To Do'}</button>
          <button type="button" role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>{isScheduled ? 'Help' : 'Notes'}</button>
        </div>
        {isScheduled && <section className="automation-action-editor" role="tabpanel" hidden={tab !== 'actions'}>
          <dl className="automation-facts"><div><dt>Trigger</dt><dd>{currentTemplate?.name} · {titleCase(scheduleFrequency)} at {String(scheduleHour).padStart(2, '0')}:00 {scheduleTimezone}</dd></div><div><dt>Conditions</dt><dd>{conditionSummary(template, { ...initial.conditions, currency: conditionCurrency }, workflowBranches, minimumAmount, Number(reminderDays))}</dd></div><div><dt>Action</dt><dd>{actionName.trim() || titleCase(selectedAction)}</dd></div><div><dt>Authority</dt><dd>Finance-authorized rule owner; services are rechecked at execution.</dd></div></dl>
        </section>}
        {!isScheduled && <section className="automation-action-editor" id="automation-action-fields" role="tabpanel" hidden={tab !== 'actions'}>
            {!workflow && <p className="automation-filter-note">Action choices are held in this draft and persisted with the rule when you select Create Rule.</p>}
            {tab === 'actions' && <><input type="hidden" name="notes" value={notes} readOnly /><input type="hidden" name="action_name" value={actionName} readOnly /></>}
            <div className="automation-action-row"><span className="automation-action-index">1</span><div><strong>{actionName.trim() || titleCase(selectedAction)}</strong><p>{selectedAction === 'create_crm_follow_up' ? 'Create an assigned internal follow-up in AfriCore CRM.' : selectedAction === 'replenishment_suggestion' ? 'Prepare a stock replenishment suggestion for human review; no purchase order is placed.' : selectedAction === 'skip' ? 'Record the matching run without performing a business action.' : 'Create an internal AfriCore notification; no customer message is sent.'}</p></div><button type="button" className="quiet-button" onClick={() => setShowActionPicker(true)}>Change Action</button></div>
            <WorkflowBranchFields key={template} template={template} workflow={workflow?.template === template ? workflow : undefined} currency={conditionCurrency} fallbackAction={selectedAction} onFallbackChange={setSelectedAction} stages={crmStages} onBranchActionsChange={setBranchActions} onBranchesChange={setWorkflowBranches} disabledActions={actions.filter((item) => (actionServiceRequirements[item] || []).some((service) => serviceStates.get(service) !== 'active'))} />
            <button className="secondary-button" type="button" onClick={() => { setPendingAction(selectedAction); setPendingActionName(actionName); setShowActionPicker(true); }}>Add an action</button>
        </section>}
        <section className="automation-notes" role="tabpanel" hidden={tab !== 'notes'}>{isScheduled ? <><h2>Scheduling Help</h2><p>Manual runs evaluate this one enabled rule immediately. Automatic evaluation uses its local timezone and configured hour, and the existing worker polls every 15 seconds while awake. A sleeping process can delay or miss a target time.</p><p>Each source candidate is deduplicated for its daily or weekly period. Paused rules and rules with unavailable required services cannot run.</p></> : <><label htmlFor="automation-notes-input">Internal notes</label>{tab === 'notes' && <textarea id="automation-notes-input" name="notes" maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add notes about this rule…" />}</>}</section>
        {preview && <div className="automation-preview" role="status"><strong>Read-only execution plan · version {preview.version}</strong><p>{preview.candidate_count} matching records · {preview.delay_minutes} minute delay · {preview.action.replaceAll('_', ' ')}</p><p>{preview.notice}</p></div>}
        {error && <p className="alert error" role="alert">{error}</p>}
        {workflow && <p className="automation-form-version-note">Version {workflow.version} · Changes create an immutable configuration version.</p>}
      </form>
      {showActionPicker && <Overlay onClose={() => setShowActionPicker(false)}><section className="automation-action-modal" role="dialog" aria-modal="true" aria-labelledby="automation-action-title"><header><div><span>{workflow?.name || 'New automation rule'}</span><h2 id="automation-action-title">Create Actions</h2></div><button type="button" aria-label="Close action picker" onClick={() => setShowActionPicker(false)}>×</button></header><div className="automation-action-modal-body"><label className="field"><span>Set an explicit name</span><input value={pendingActionName} onChange={(event) => setPendingActionName(event.target.value)} placeholder="Action name (optional)" maxLength={100} /></label><h3>Type</h3><div className="automation-action-types">{actions.map((actionType) => { const missing = (actionServiceRequirements[actionType] || []).filter((service) => serviceStates.get(service) !== 'active'); return <button key={actionType} type="button" className={pendingAction === actionType ? 'selected' : ''} disabled={missing.length > 0 || !!servicesError} title={missing.length ? 'Activate ' + missing.map(titleCase).join(', ') + ' to use this action' : undefined} onClick={() => setPendingAction(actionType)}>{titleCase(actionType)}</button>; })}</div><div className="automation-action-description"><strong>{titleCase(pendingAction)}</strong><p>{pendingAction === 'create_crm_follow_up' ? 'Creates an assigned internal CRM follow-up linked to the canonical customer from the source record. The current workflow owner is the assignee; no email is sent.' : pendingAction === 'replenishment_suggestion' ? 'Creates a reviewable suggestion for the current tracked product and stock position. It does not create a purchase order.' : pendingAction === 'skip' ? 'Records a matching run without a side effect.' : 'Creates an internal notification only for eligible workspace members, subject to their preferences, deduplication and daily cap.'}</p><dl><div><dt>Source</dt><dd>{sourceLabel(currentTemplate)}</dd></div><div><dt>Trigger</dt><dd>{currentTemplate?.trigger === 'schedule' ? 'Scheduled check' : titleCase(currentTemplate?.trigger || '')}</dd></div><div><dt>Action type</dt><dd>{titleCase(pendingAction)}</dd></div><div><dt>Target</dt><dd>{pendingAction === 'create_crm_follow_up' ? 'Source customer · workflow owner' : pendingAction === 'replenishment_suggestion' ? 'Current source product' : pendingAction === 'skip' ? 'No record' : 'Eligible internal recipients'}</dd></div><div><dt>Conditions</dt><dd>{conditionSummary(template, initial.conditions, workflow?.template === template ? workflow.branches || [] : [])}</dd></div><div><dt>Required service</dt><dd>{(currentTemplate?.required_services || []).concat(actionServiceRequirements[pendingAction] || []).filter((value, index, list) => list.indexOf(value) === index).map(titleCase).join(', ') || 'AfriCore Automations'}</dd></div></dl></div><p>External email, SMS, WhatsApp, public webhooks, arbitrary code, supplier orders and financial posting are not available automation actions.</p></div><footer><button type="button" className="button" disabled={!!servicesError || (actionServiceRequirements[pendingAction] || []).some((service) => serviceStates.get(service) !== 'active')} onClick={() => { setSelectedAction(pendingAction); setActionName(pendingActionName.trim()); setShowActionPicker(false); }}>Save &amp; Close</button><button type="button" className="secondary-button" onClick={() => setShowActionPicker(false)}>Discard</button></footer></section></Overlay>}
    </section>
  );
}

function RuleTable({ rows, templates, openRule, toggleRule, openRuns, services, schedule = false }: any) {
  if (!rows.length) return <Empty text={schedule ? 'No recurring rules are configured yet.' : 'No automation rules match these filters.'} />;
  return (
    <div className="automation-table-scroll"><DataTable className="automation-table">
      <thead><tr>{schedule ? <><th>Action Name</th><th>Trigger Template</th><th>Frequency</th><th>Local Hour</th><th>Timezone</th><th>Owner</th><th>Last Execution</th><th>Run Status</th><th>Enabled</th><th>Actions</th></> : <><th>Rule Name</th><th>Business Source</th><th>Trigger</th><th>Action</th><th>Owner</th><th>Last Run</th><th>Runs</th><th>Active</th><th>Last Updated</th><th>Actions</th></>}</tr></thead>
      <tbody>{rows.map((rule: any) => {
        const template = templates.find((item: Template) => item.id === rule.template),
          action = rule.branches?.length ? 'Conditional actions' : titleCase(rule.fallback_action || workflowAction(rule.template)),
          serviceStates = new Map((services || []).map((item: AutomationService) => [item.id, item.status])),
          missing = [...new Set([...(template?.unavailable_services || []), ...(actionServiceRequirements[rule.fallback_action || workflowAction(rule.template)] || []), ...(rule.branches || []).flatMap((branch: any) => actionServiceRequirements[branch.action] || [])].filter((id) => serviceStates.get(id) !== 'active'))],
          runState = rule.owner_permission_revoked ? 'Permission revoked' : missing.length ? 'Service unavailable' : rule.last_run_status === 'dead_letter' ? 'Needs review' : rule.last_run_status ? titleCase(rule.last_run_status) : rule.enabled ? 'Waiting for trigger' : 'No execution yet';
        return <tr key={rule.id}>
          {schedule ? <><td><button className="automation-table-link" onClick={() => openRule(rule.id)}>{rule.name}</button><small>v{rule.version}</small></td><td><span className="automation-trigger-chip">{template?.name || rule.template}</span></td><td>{template?.id === 'weekly_cashflow' ? 'Weekly' : titleCase(rule.schedule?.frequency || 'daily')}</td><td>{String(rule.schedule?.hour ?? 9).padStart(2, '0')}:00</td><td>{rule.schedule?.timezone || 'Africa/Nairobi'}</td><td>{rule.owner_name || 'Former workspace member'}</td><td>{localTime(rule.last_run_at, rule.schedule?.timezone)}</td><td><span className={'automation-state ' + (rule.last_run_status === 'dead_letter' ? 'is-failed' : rule.last_run_status === 'succeeded' ? 'is-enabled' : 'is-paused')}>{runState}</span></td><td><button className={'automation-state-button ' + (rule.enabled ? 'is-enabled' : 'is-paused')} disabled={rule.owner_permission_revoked || missing.length > 0} title={rule.owner_permission_revoked ? 'The rule owner no longer has the required permission.' : missing.length ? 'Required service unavailable: ' + missing.map(titleCase).join(', ') : undefined} onClick={() => toggleRule(rule)}>{rule.enabled ? 'Enabled' : 'Paused'}</button></td><td><button className="quiet-button" onClick={() => openRuns(rule.id)}>Inspect Runs</button></td></> : <><td><button className="automation-table-link" onClick={() => openRule(rule.id)}>{rule.name}</button><small>v{rule.version} · {rule.id.slice(0, 8)}</small></td><td>{sourceLabel(template)}</td><td><span className="automation-trigger-chip">{template?.name || rule.template}</span></td><td>{action}</td><td>{rule.owner_name || 'Former workspace member'}</td><td>{localTime(rule.last_run_at)}</td><td>{rule.run_count || 0}</td><td><button className={'automation-state-button ' + (rule.enabled ? 'is-enabled' : 'is-paused')} disabled={rule.owner_permission_revoked || missing.length > 0} title={rule.owner_permission_revoked ? 'The rule owner no longer has the required permission.' : missing.length ? 'Required service unavailable: ' + missing.map(titleCase).join(', ') : undefined} onClick={() => toggleRule(rule)}>{rule.enabled ? 'Enabled' : 'Paused'}</button><small>{runState}</small></td><td>{localTime(rule.updated_at)}</td><td><button className="quiet-button" onClick={() => openRuns(rule.id)}>Inspect Runs</button></td></>}
        </tr>;
      })}</tbody>
    </DataTable></div>
  );
}

export function AutomationsWorkspace({
  api: providedApi,
  scope,
  navigate,
  section = 'dashboard',
  role,
}: {
  role?: string;
  section?: string;
  api: API;
  scope: string;
  navigate: (tab: string) => void;
}) {
  const api = useIdempotentAPI(providedApi, scope),
    authorized = ['owner', 'admin', 'finance'].includes(role || '');
  const [rules, setRules] = useState<any>(null),
    [templates, setTemplates] = useState<Template[]>([]),
    [runtime, setRuntime] = useState<any>({}),
    [profile, setProfile] = useState<any>({ currency: 'KES', timezone: 'Africa/Nairobi' }),
    [services, setServices] = useState<AutomationService[]>([]),
    [crmStages, setCrmStages] = useState<{ id: string; name: string }[]>([]),
    [runs, setRuns] = useState<any>(null),
    [approvals, setApprovals] = useState<any>(null),
    [team, setTeam] = useState<any[]>([]),
    [selectedRule, setSelectedRule] = useState(() => new URLSearchParams(location.search).get('automationRule')),
    [ruleDetail, setRuleDetail] = useState<any>(null),
    [selectedRun, setSelectedRun] = useState<any>(null),
    [search, setSearch] = useState(''),
    [stateFilter, setStateFilter] = useState(''),
    [sourceFilter, setSourceFilter] = useState(''),
    [templateFilter, setTemplateFilter] = useState(''),
    [frequencyFilter, setFrequencyFilter] = useState(''),
    [ownerFilter, setOwnerFilter] = useState(''),
    [sort, setSort] = useState('updated'),
    [runFilter, setRunFilter] = useState(''),
    [runSearch, setRunSearch] = useState(''),
    [runFrom, setRunFrom] = useState(''),
    [runTo, setRunTo] = useState(''),
    [runWorkflowId, setRunWorkflowId] = useState(''),
    [runOffset, setRunOffset] = useState(0),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(''),
    [ruleError, setRuleError] = useState(''),
    [templateError, setTemplateError] = useState(''),
    [serviceError, setServiceError] = useState(''),
    [runSummaryError, setRunSummaryError] = useState(''),
    [loadingRules, setLoadingRules] = useState(false),
    [loadingTemplates, setLoadingTemplates] = useState(false),
    [loadingServices, setLoadingServices] = useState(false),
    [loadingRunSummary, setLoadingRunSummary] = useState(false),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0);

  useEffect(() => {
    const sync = () => {
      setSelectedRule(new URLSearchParams(location.search).get('automationRule'));
      setOffset(0);
    };
    addEventListener('popstate', sync);
    addEventListener(appNavigationEvent, sync);
    return () => { removeEventListener('popstate', sync); removeEventListener(appNavigationEvent, sync); };
  }, []);

  useEffect(() => {
    const sectionHasRules = ['dashboard', 'rules', 'Automations', 'scheduled', 'runs'].includes(section);
    if (!authorized || section === 'private-work' || !sectionHasRules) {
      setRules(null);
      setLoadingRules(false);
      return;
    }
    let current = true;
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    if (search.trim()) params.set('search', search.trim());
    if (stateFilter) params.set('state', stateFilter);
    if (section === 'scheduled') params.set('trigger', 'schedule');
    if (sourceFilter) params.set('source', sourceFilter);
    if (templateFilter) params.set('template', templateFilter);
    if (ownerFilter) params.set('owner', ownerFilter);
    if (section === 'scheduled' && frequencyFilter) params.set('frequency', frequencyFilter);
    params.set('sort', sort);
    setRules(null);
    setRuleError('');
    setLoadingRules(true);
    api('/automations?' + params.toString())
      .then((value) => { if (current) setRules(value); })
      .catch((caught: Error) => { if (current) setRuleError(caught.message || 'Automation rules could not be loaded.'); })
      .finally(() => { if (current) setLoadingRules(false); });
    return () => { current = false; };
  }, [scope, revision, authorized, section, search, stateFilter, sourceFilter, templateFilter, frequencyFilter, ownerFilter, sort, offset]);

  useEffect(() => {
    if (!authorized || section === 'private-work') return;
    let current = true;
    setTemplates([]);
    setTemplateError('');
    setLoadingTemplates(true);
    api('/automations/templates')
      .then((value) => {
        if (!current) return;
        setTemplates(value.data || []);
        setRuntime(value.execution || {});
        setProfile(value.profile || { currency: 'KES', timezone: 'Africa/Nairobi' });
        setCrmStages(value.crm_stages || []);
      })
      .catch((caught: Error) => { if (current) setTemplateError(caught.message || 'Automation templates could not be loaded.'); })
      .finally(() => { if (current) setLoadingTemplates(false); });
    return () => { current = false; };
  }, [scope, revision, authorized, section === 'private-work']);

  useEffect(() => {
    if (!authorized || section === 'private-work') return;
    let current = true;
    setServices([]);
    setServiceError('');
    setLoadingServices(true);
    api('/services')
      .then((value) => { if (current) setServices(value.services || []); })
      .catch((caught: Error) => { if (current) setServiceError(caught.message || 'Service readiness could not be loaded.'); })
      .finally(() => { if (current) setLoadingServices(false); });
    return () => { current = false; };
  }, [scope, revision, authorized, section === 'private-work']);

  useEffect(() => {
    if (!authorized || section !== 'dashboard') {
      setRuns(null);
      setLoadingRunSummary(false);
      return;
    }
    let current = true;
    setRuns(null);
    setRunSummaryError('');
    setLoadingRunSummary(true);
    api('/automation-runs?limit=10&offset=0')
      .then((value) => { if (current) setRuns(value); })
      .catch((caught: Error) => { if (current) setRunSummaryError(caught.message || 'Execution summary could not be loaded.'); })
      .finally(() => { if (current) setLoadingRunSummary(false); });
    return () => { current = false; };
  }, [scope, revision, authorized, section]);

  useEffect(() => {
    if (!authorized || section === 'private-work') return;
    let current = true;
    api('/team').then((value) => { if (current) setTeam(value.data || []); }).catch(() => { if (current) setTeam([]); });
    return () => { current = false; };
  }, [scope, revision, authorized, section === 'private-work']);

  useEffect(() => {
    if (!authorized || section !== 'Approvals') return;
    let current = true;
    api('/approvals').then((value) => {
      if (!current) return;
      setApprovals(value);
    }).catch(() => { if (current) setApprovals({ data: [] }); });
    return () => { current = false; };
  }, [scope, revision, authorized, section]);

  const action: Action = async (fn, message) => {
    const result = await fn();
    setNotice(message || 'Automation updated.');
    setRevision((value) => value + 1);
    return result;
  };
  const rulesForSection = useMemo(() => (rules?.data || []).filter((rule: any) => {
    const item = templates.find((candidate) => candidate.id === rule.template);
    return section !== 'scheduled' || item?.trigger === 'schedule';
  }), [rules, templates, section]);
  const selectedRuleData = rules?.data?.find((rule: any) => rule.id === selectedRule);
  useEffect(() => {
    if (!selectedRule || selectedRule === 'new') { setRuleDetail(null); return; }
    let current = true;
    if (selectedRuleData) {
      setRuleDetail(selectedRuleData);
      return () => { current = false; };
    }
    api('/automations/' + selectedRule)
      .then((value) => { if (current) setRuleDetail(value); })
      .catch((caught: Error) => { if (current) setError(caught.message); });
    return () => { current = false; };
  }, [scope, selectedRule, selectedRuleData?.version, revision]);
  const openRule = (id: string | null, template?: string) => {
    setSelectedRule(id);
    automationUrl(id, template);
  };
  const openSection = (target: string) => {
    const url = new URL(location.href);
    url.searchParams.set('app', 'automations');
    url.searchParams.set('section', target);
    url.searchParams.delete('automationRule');
    url.searchParams.delete('automationTemplate');
    history.pushState(null, '', url.pathname + url.search + url.hash);
    setSelectedRule(null);
    dispatchEvent(new Event(appNavigationEvent));
    navigate('Apps');
  };
  const openRun = async (id: string) => {
    try { setSelectedRun(await api('/automation-runs/' + id)); }
    catch (caught) { setError((caught as Error).message); }
  };
  const openRuns = (workflowId = '') => {
    setRunWorkflowId(workflowId);
    setRunOffset(0);
    openSection('runs');
  };
  const toggleRule = async (rule: any) => {
    try { await action(() => api('/automations/' + rule.id, 'PATCH', { enabled: !rule.enabled }), rule.enabled ? 'Rule paused.' : 'Rule enabled.'); }
    catch (caught) { setError((caught as Error).message); }
  };
  const pageTitle = section === 'scheduled' ? 'Scheduled Actions' : section === 'runs' ? 'Execution History' : section === 'templates' ? 'Automation Templates' : section === 'configuration' ? 'Automation Configuration' : section === 'dashboard' ? 'Automation Dashboard' : 'Automation Rules';

  if (section === 'private-work') return <WorkAutomationDirectory key={scope} api={api} scope={scope} />;
  if (!authorized) return <section className="panel"><h3>Automation rule access</h3><p>Your current role cannot inspect or change automation rules. Assigned reviews remain available.</p><button className="secondary-button" onClick={() => navigate('Approvals')}>Open Approvals</button></section>;

  if (selectedRule && templates.length === 0)
    return <div className="apps-workspace automations-workspace">{templateError ? <p className="alert error" role="alert">{templateError} <button className="quiet-button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p> : <p role="status">{loadingTemplates ? 'Loading automation templates…' : 'No automation templates are available.'}</p>}</div>;
  if (selectedRule === 'new' || selectedRuleData || ruleDetail) {
    return <div className="apps-workspace automations-workspace" data-automation-section={section}>
      <RuleEditor key={selectedRule + ':' + ((selectedRuleData || ruleDetail)?.version || 'new')} workflow={selectedRule === 'new' ? undefined : selectedRuleData || ruleDetail} templates={templates} currency={profile.currency} timezone={profile.timezone} api={api} action={action} services={services} servicesError={serviceError || (loadingServices ? 'Service readiness is loading.' : '')} crmStages={crmStages} onCancel={() => openRule(null)} onRuns={() => openRuns(selectedRule || '')} onSaved={(saved) => openRule(saved.id)} />
      {error && <p className="alert error" role="alert">{error}</p>}
    </div>;
  }
  if (selectedRule && selectedRule !== 'new' && !ruleDetail)
    return <div className="apps-workspace automations-workspace"><p role="status">Loading automation rule…</p>{error && <p className="alert error" role="alert">{error}</p>}</div>;

  return (
    <div className="apps-workspace automations-workspace o-app-sheet" data-automation-section={section}>
      <header className="o-flat-cp" aria-label="Automations control bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="button" onClick={() => openRule('new')}>
            + New Rule
          </button>
          {section === 'scheduled' && (
            <button
              className="secondary-button"
              onClick={async () => {
                try {
                  const result = await action(
                    () => api('/automations/process', 'POST', {}),
                    'Due rules processed by the existing worker.',
                  );
                  setNotice('Due rules checked: ' + (result.queued ?? 0) + ' new run(s) queued or processed.');
                } catch (caught) {
                  setError((caught as Error).message);
                }
              }}
            >
              Process Due Runs
            </button>
          )}
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>{pageTitle}</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <label className="ac-faceted-search" style={{ width: 170, flex: '0 1 170px' }} aria-label="Search automation rules">
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setOffset(0);
                setSearch(event.target.value);
              }}
              placeholder="Search rules…"
            />
          </label>
          <select
            className="o-cp-inline-select"
            value={stateFilter}
            onChange={(event) => {
              setOffset(0);
              setStateFilter(event.target.value);
            }}
            aria-label="Filter rule status"
          >
            <option value="">All statuses</option>
            <option value="enabled">Enabled</option>
            <option value="paused">Paused</option>
          </select>
          {['dashboard', 'rules', 'Automations', 'scheduled'].includes(section) && (
            <details className="ac-filter-popover">
              <summary className="secondary-button">Filters ▾</summary>
              <div className="ac-filter-popover-panel">
                <Field label="Source">
                  <select
                    value={sourceFilter}
                    onChange={(event) => {
                      setOffset(0);
                      setSourceFilter(event.target.value);
                    }}
                  >
                    <option value="">All sources</option>
                    {[...new Set(templates.map((item) => item.category))].map((source) => (
                      <option key={source} value={source}>
                        {sourceLabel(templates.find((item) => item.category === source))}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Template">
                  <select
                    value={templateFilter}
                    onChange={(event) => {
                      setOffset(0);
                      setTemplateFilter(event.target.value);
                    }}
                  >
                    <option value="">All templates</option>
                    {templates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Owner">
                  <select
                    value={ownerFilter}
                    onChange={(event) => {
                      setOffset(0);
                      setOwnerFilter(event.target.value);
                    }}
                  >
                    <option value="">All owners</option>
                    {team.map((member: any) => (
                      <option key={member.id} value={member.id}>
                        {member.display_name || member.email}
                      </option>
                    ))}
                  </select>
                </Field>
                {section === 'scheduled' && (
                  <Field label="Frequency">
                    <select
                      value={frequencyFilter}
                      onChange={(event) => {
                        setOffset(0);
                        setFrequencyFilter(event.target.value);
                      }}
                    >
                      <option value="">All frequencies</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </Field>
                )}
                <Field label="Sort">
                  <select
                    value={sort}
                    onChange={(event) => {
                      setOffset(0);
                      setSort(event.target.value);
                    }}
                  >
                    <option value="updated">Recently updated</option>
                    <option value="name">Name</option>
                    <option value="runs">Most runs</option>
                  </select>
                </Field>
              </div>
            </details>
          )}
        </div>
      </header>
      {notice && <p className="automation-notice" role="status">{notice}</p>}
      {error && <p className="alert error" role="alert">{error}</p>}

      {section === 'dashboard' && rules && <>
        <div className="o-kpi-row" aria-label="Automation metrics">
          {[
            ['Automation Rules', rules.summary?.total ?? rules.total ?? 0, 'Configured in this workspace'],
            ['Active', rules.summary?.enabled ?? 0, 'Rules currently enabled'],
            ['Pending Runs', runs?.summary?.pending ?? '—', runSummaryError ? 'Execution summary unavailable' : 'Waiting for existing worker'],
            ['Needs Review', runs?.summary?.dead_letter ?? '—', runSummaryError ? 'Execution summary unavailable' : 'Dead-letter runs'],
          ].map(([label, value, hint]) => (
            <div className="o-kpi-cell" key={String(label)}>
              <span>{String(label)}</span>
              <strong>{String(value)}</strong>
              <small>{String(hint)}</small>
            </div>
          ))}
        </div>
        <section className="ac-split-grid">
          <article className="automation-panel">
            <h3 style={{ margin: '0 0 8px', fontSize: 14.5 }}>Execution overview</h3>
            {runSummaryError ? (
              <p className="alert error" role="alert">
                {runSummaryError}{' '}
                <button className="quiet-button" onClick={() => setRevision((value) => value + 1)}>
                  Retry
                </button>
              </p>
            ) : runs ? (
              <BarChart
                title="Automation runs by state"
                multiColor
                rows={Object.entries(runs.summary || {}).map(([status, value]) => ({
                  key: status,
                  label: titleCase(status),
                  value: Number(value),
                }))}
              />
            ) : (
              <p role="status">
                {loadingRunSummary ? 'Loading execution summary…' : 'Execution summary unavailable.'}
              </p>
            )}
          </article>
          <article className="automation-panel">
            <h3 style={{ margin: '0 0 8px', fontSize: 14.5 }}>Runtime &amp; safeguards</h3>
            <dl className="automation-facts">
              <div><dt>Worker</dt><dd>Existing application worker</dd></div>
              <div><dt>Poll interval</dt><dd>{runtime.worker_poll_seconds || 15} seconds while awake</dd></div>
              <div><dt>Per-pass limit</dt><dd>{runtime.maximum_candidates_per_pass || 50} candidates</dd></div>
              <div><dt>Delivery</dt><dd>Internal actions only</dd></div>
            </dl>
            <p className="o-flat-note">{runtime.timing_notice}</p>
            <button className="secondary-button" onClick={() => openSection('rules')}>View Rules</button>
          </article>
        </section>
        <section className="automation-panel"><div className="automation-section-heading"><h3 style={{ margin: 0, fontSize: 14.5 }}>Recent Execution History</h3><button className="quiet-button" onClick={() => openRuns()}>Open All Runs</button></div>{runs ? <RunTable runs={runs} openRun={openRun} /> : runSummaryError ? <Empty text="Execution history is unavailable; retry the summary above." /> : <p role="status">Loading recent executions…</p>}</section>
        <section className="automation-panel"><div className="automation-section-heading"><h3 style={{ margin: 0, fontSize: 14.5 }}>Attention in This Result</h3><button className="quiet-button" onClick={() => openSection('rules')}>Open Rules</button></div>{rules.data?.filter((rule: any) => rule.owner_permission_revoked || rule.last_run_status === 'dead_letter' || !rule.enabled).length ? <ul className="automation-attention-list">{rules.data.filter((rule: any) => rule.owner_permission_revoked || rule.last_run_status === 'dead_letter' || !rule.enabled).slice(0, 8).map((rule: any) => <li key={rule.id}><button className="automation-table-link" onClick={() => openRule(rule.id)}>{rule.name}</button><span>{rule.owner_permission_revoked ? 'Owner permission revoked' : rule.last_run_status === 'dead_letter' ? 'Latest run needs review' : 'Paused'}</span></li>)}</ul> : <Empty text="No rules in this filtered result require attention." />}</section>
      </>}

      {(section === 'rules' || section === 'Automations') && rules && <>
        <div className="automation-list-meta"><span>{rules.total ? `${rules.offset + 1}-${Math.min(rules.offset + rules.limit, rules.total)} / ${rules.total}` : '0 rules'}</span><div><button className="secondary-button" disabled={rules.offset <= 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><button className="secondary-button" disabled={rules.offset + rules.limit >= rules.total} onClick={() => setOffset(offset + 50)}>Next</button></div></div>
        <RuleTable rows={rulesForSection} templates={templates} openRule={(id: string) => openRule(id)} toggleRule={toggleRule} openRuns={openRuns} services={services} />
      </>}

      {section === 'scheduled' && rules && <>
        <p className="automation-disclosure">Recurring rules are evaluated by the durable worker at the configured local hour. The worker polls every {runtime.worker_poll_seconds || 15} seconds while awake; the target time is not a delivery guarantee.</p>
        <div className="automation-list-meta"><span>{rules.total ? `${rules.offset + 1}-${Math.min(rules.offset + rules.limit, rules.total)} / ${rules.total} scheduled rules` : '0 scheduled rules'}</span><button className="secondary-button" onClick={async () => { try { const result = await action(() => api('/automations/process', 'POST', {}), 'The scheduler checked due rules.'); setNotice(`${result.queued ?? 0} run(s) queued or processed.`); } catch (caught) { setError((caught as Error).message); } }}>Process Due Runs</button></div>
        <RuleTable rows={rulesForSection} templates={templates} openRule={(id: string) => openRule(id)} toggleRule={toggleRule} openRuns={openRuns} services={services} schedule />
      </>}

      {section === 'templates' && (
        <div className="ac-record-list">
          {templates.map((template) => (
            <div className="ac-record-row" key={template.id}>
              <div className="ac-record-main">
                <span className="ac-record-title">
                  {template.name}{' '}
                  <span className="badge" style={{ marginInlineStart: 6 }}>
                    {template.trigger === 'schedule' ? 'Scheduled check' : titleCase(template.trigger)}
                  </span>
                </span>
                <span className="ac-record-meta">
                  Source: {sourceLabel(template)} · Action: {titleCase(workflowAction(template.id))} · Services:{' '}
                  {template.source_services.map(titleCase).join(', ')}
                  {template.unavailable_services.length > 0
                    ? ` · Unavailable: ${template.unavailable_services.map(titleCase).join(', ')}`
                    : ''}
                </span>
              </div>
              <button
                className="secondary-button"
                disabled={!template.available}
                onClick={() => openRule('new', template.id)}
              >
                Use Template
              </button>
            </div>
          ))}
        </div>
      )}

      {section === 'runs' && <ExecutionHistory api={api} filter={runFilter} setFilter={setRunFilter} runs={runs} openRun={openRun} search={runSearch} setSearch={setRunSearch} from={runFrom} setFrom={setRunFrom} to={runTo} setTo={setRunTo} workflowId={runWorkflowId} setWorkflowId={setRunWorkflowId} offset={runOffset} setOffset={setRunOffset} workflows={rules?.data || []} />}

      {section === 'configuration' && <section className="automation-panel automation-configuration"><h2>Services &amp; Execution</h2><p>Automation rules use the existing durable event journal and worker. The scheduler polls every {runtime.worker_poll_seconds || 15} seconds while the process is awake and processes up to {runtime.maximum_candidates_per_pass || 50} candidates per pass.</p><p className="automation-disclosure">Free hosting may sleep. Do not rely on this worker for time-critical delivery. Scheduled evaluations are best-effort and are not guaranteed to run at the target time.</p><h3>Service dependencies</h3><DataTable className="automation-table"><thead><tr><th>Service</th><th>Status</th><th>Used by</th></tr></thead><tbody>{services.filter((service) => new Set(templates.flatMap((item) => item.required_services)).has(service.id) || service.id === 'automations').map((service) => <tr key={service.id}><td>{service.name || titleCase(service.id)}</td><td><span className={'automation-service-status ' + (service.status === 'active' ? 'is-enabled' : '')}>{titleCase(service.status || 'available')}</span></td><td>{templates.filter((item) => item.required_services.includes(service.id)).map((item) => item.name).join(', ') || 'Rule processing'}</td></tr>)}</tbody></DataTable><h3>Approved actions</h3><ul className="automation-action-list"><li>In-app notification, subject to recipient preferences and caps.</li><li>CRM follow-up, when the CRM service is active.</li><li>Inventory replenishment suggestion for human review, when Inventory is active.</li><li>Skip a matching run without a side effect.</li></ul><p>External email, SMS, WhatsApp, arbitrary code, public webhooks, supplier orders, payment collection and financial posting are not configured automation actions.</p></section>}

      {section === 'Approvals' && <ApprovalView data={approvals} secondary={{ team, runs: [] }} api={api} action={action} admin={['owner', 'admin'].includes(role || '')} finance={['owner', 'admin', 'finance'].includes(role || '')} />}

      {ruleError && <p className="alert error" role="alert">{ruleError} <button className="quiet-button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
      {templateError && <p className="alert error" role="alert">{templateError} <button className="quiet-button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
      {serviceError && <p className="alert warning" role="alert">{serviceError} Saving and enabling rules remains blocked until service readiness can be verified. <button className="quiet-button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
      {section === 'dashboard' && !rules && <p role="status">{loadingRules ? 'Loading automation records…' : 'Automation records unavailable.'}</p>}
      {section === 'runs' && rules === null && !ruleError && <p role="status">Loading run filter options…</p>}
      {section === 'rules' && !rules && <p role="status">{loadingRules ? 'Loading automation rules…' : 'Automation rules unavailable.'}</p>}
      {section === 'scheduled' && !rules && <p role="status">{loadingRules ? 'Loading scheduled actions…' : 'Scheduled actions unavailable.'}</p>}
      {section === 'Approvals' && !approvals && <p role="status">Loading assigned and requested reviews…</p>}
      {selectedRun && <Overlay onClose={() => setSelectedRun(null)}><section className="automation-run-modal" role="dialog" aria-modal="true" aria-labelledby="automation-run-title"><header><div><span>Execution History</span><h2 id="automation-run-title">Run {selectedRun.short_id}</h2></div><button type="button" aria-label="Close run details" onClick={() => setSelectedRun(null)}>×</button></header><dl className="automation-facts"><div><dt>Rule</dt><dd><button className="automation-table-link" onClick={() => { setSelectedRun(null); openRule(selectedRun.workflow_id); }}>{selectedRun.workflow_name}</button></dd></div><div><dt>Trigger</dt><dd>{titleCase(selectedRun.trigger_label || selectedRun.template || 'Scheduled review')}</dd></div><div><dt>Action</dt><dd>{titleCase(selectedRun.action_name || 'Supported action')}</dd></div><div><dt>Status</dt><dd>{titleCase(selectedRun.status)}</dd></div><div><dt>Version</dt><dd>{selectedRun.version || 'Legacy run'}</dd></div><div><dt>Attempts</dt><dd>{selectedRun.attempts}</dd></div><div><dt>Created</dt><dd>{localTime(selectedRun.created_at, profile.timezone)}</dd></div><div><dt>Completed</dt><dd>{localTime(selectedRun.completed_at, profile.timezone)}</dd></div><div><dt>Next eligible retry</dt><dd>{selectedRun.retry_waiting ? localTime(selectedRun.next_at, profile.timezone) : 'None'}</dd></div></dl>{selectedRun.result && <pre>{JSON.stringify(selectedRun.result, null, 2)}</pre>}<RunControl run={selectedRun} api={api} action={action} /></section></Overlay>}
    </div>
  );
}

function RunTable({ runs, openRun }: { runs: any; openRun: (id: string) => Promise<void> }) {
  return runs?.data?.length ? <div className="automation-table-scroll"><DataTable className="automation-table"><thead><tr><th>Execution</th><th>Automation Rule</th><th>Trigger</th><th>Action</th><th>Status</th><th>Attempts</th><th>Created</th><th>Last Updated</th></tr></thead><tbody>{runs.data.map((run: any) => <tr key={run.id}><td><button className="automation-table-link" onClick={() => openRun(run.id)}>#{run.short_id}</button></td><td>{run.workflow_name}</td><td>{titleCase(run.trigger_label || run.template || 'Scheduled review')}</td><td>{titleCase(run.action_name || 'Supported action')}</td><td><span className={'automation-state ' + (run.status === 'succeeded' ? 'is-enabled' : run.status === 'dead_letter' ? 'is-failed' : 'is-paused')}>{titleCase(run.status)}{run.retry_waiting ? ' · retry waiting' : ''}</span></td><td>{run.attempts}</td><td>{localTime(run.created_at)}</td><td>{localTime(run.updated_at)}</td></tr>)}</tbody></DataTable></div> : <Empty text="No execution records match these filters." />;
}

function ExecutionHistory({ api, filter, setFilter, runs: initialRuns, openRun, search, setSearch, from, setFrom, to, setTo, workflowId, setWorkflowId, offset, setOffset, workflows }: { api: API; filter: string; setFilter: (value: string) => void; runs: any; openRun: (id: string) => Promise<void>; search: string; setSearch: (value: string) => void; from: string; setFrom: (value: string) => void; to: string; setTo: (value: string) => void; workflowId: string; setWorkflowId: (value: string) => void; offset: number; setOffset: (value: number) => void; workflows: any[] }) {
  const [runs, setRuns] = useState(initialRuns), [error, setError] = useState(''), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    if (filter) params.set('status', filter);
    if (search.trim()) params.set('search', search.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (workflowId) params.set('workflow_id', workflowId);
    setRuns(null); setError(''); setLoading(true);
    api('/automation-runs?' + params.toString()).then((value) => { if (current) setRuns(value); }).catch((caught: Error) => { if (current) setError(caught.message || 'Execution history could not be loaded.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [api, offset, filter, search, from, to, workflowId, refresh]);
  return <section className="automation-panel"><div className="automation-section-heading"><h2>Execution History</h2><button className="secondary-button" onClick={() => setRefresh((value) => value + 1)}>Refresh</button></div><div className="automation-run-filters"><label><span>Search rule name</span><input type="search" value={search} onChange={(event) => { setOffset(0); setSearch(event.target.value); }} placeholder="Search…" /></label><label><span>Status</span><select value={filter} onChange={(event) => { setOffset(0); setFilter(event.target.value); }}><option value="">All statuses</option><option value="pending">Pending</option><option value="succeeded">Succeeded</option><option value="dead_letter">Needs review</option><option value="cancelled">Cancelled</option></select></label><label><span>From (UTC)</span><input type="date" value={from} onChange={(event) => { setOffset(0); setFrom(event.target.value); }} /></label><label><span>To (UTC)</span><input type="date" value={to} onChange={(event) => { setOffset(0); setTo(event.target.value); }} /></label><label><span>Automation Rule</span><select value={workflowId} onChange={(event) => { setOffset(0); setWorkflowId(event.target.value); }}><option value="">All rules</option>{workflowId && !workflows.some((item) => item.id === workflowId) && <option value={workflowId}>Selected rule</option>}{workflows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>{error && <p className="alert error" role="alert">{error} <button className="quiet-button" onClick={() => setRefresh((value) => value + 1)}>Retry</button></p>}{loading && <p role="status">Loading executions…</p>}<RunTable runs={runs} openRun={openRun} /><div className="automation-list-meta"><span>{runs?.total ? `${offset + 1}-${Math.min(offset + 50, runs.total)} / ${runs.total}` : '0 runs'}</span><div><button className="secondary-button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><button className="secondary-button" disabled={!runs || offset + 50 >= runs.total || loading} onClick={() => setOffset(offset + 50)}>Next</button></div></div></section>;
}
