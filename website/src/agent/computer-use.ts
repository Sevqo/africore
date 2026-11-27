export interface ComputerUseStep {
  step_index: number;
  phase: 'observe' | 'navigate' | 'input' | 'execute' | 'verify' | 'awaiting_approval';
  label: string;
  detail: string;
  target_tab: string;
  target_app?: string;
  target_element: string;
  cursor_hint: { x_pct: number; y_pct: number };
  preview_fields?: Record<string, string | number | boolean>;
  status: 'completed' | 'pending_approval' | 'failed';
  duration_ms: number;
}

export interface AgentDestination {
  tab: string;
  app?: string;
  section?: string;
  workspace_id?: string;
  workspace_kind?: 'business' | 'personal' | 'developer';
}

export interface SandboxEditableField {
  key: string;
  label: string;
  type: 'text' | 'number';
  value: string | number;
}

export interface SandboxCloneBlueprint {
  clone_kind:
    | 'calendar'
    | 'work'
    | 'crm'
    | 'invoices'
    | 'expenses'
    | 'customers'
    | 'notifications'
    | 'developer'
    | 'intelligence';
  page_title: string;
  section_label: string;
  primary_cta: string;
  tool_id: string;
  target_tab: string;
  target_app?: string;
  currency: string;
  staged_params: Record<string, any>;
  editable_fields: SandboxEditableField[];
  chained_actions?: {
    tool_id: string;
    tool_name: string;
    target_tab: string;
    params: Record<string, any>;
  }[];
  live_context?: Record<string, any>;
}

export interface AgentComputerUseEventDetail {
  action: 'navigate' | 'banner' | 'clear';
  workspaceId: string;
  tab?: string;
  app?: string;
  section?: string;
  label?: string;
  detail?: string;
}

const EVENT_NAME = 'africore:agent-computer-use';
const REFRESH_EVENT_NAME = 'africore:agent-workspace-committed';

export function dispatchAgentComputerUse(detail: AgentComputerUseEventDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AgentComputerUseEventDetail>(EVENT_NAME, { detail }));
}

export function subscribeAgentComputerUse(
  handler: (detail: AgentComputerUseEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const custom = event as CustomEvent<AgentComputerUseEventDetail>;
    if (custom.detail) handler(custom.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

export function dispatchAgentWorkspaceCommitted(detail: {
  workspaceId: string;
  destination?: AgentDestination;
  recordId?: string | null;
}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT_NAME, { detail }));
}

export function subscribeAgentWorkspaceCommitted(
  handler: (detail: { workspaceId: string; destination?: AgentDestination; recordId?: string | null }) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const custom = event as CustomEvent;
    if (custom.detail) handler(custom.detail);
  };
  window.addEventListener(REFRESH_EVENT_NAME, listener);
  return () => window.removeEventListener(REFRESH_EVENT_NAME, listener);
}

export function formatAgentMoney(minor: number, currency = 'KES') {
  const divisor = ['UGX', 'RWF'].includes(currency) ? 1 : 100;
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    minimumFractionDigits: divisor === 1 ? 0 : 2,
    maximumFractionDigits: divisor === 1 ? 0 : 2,
  }).format(minor / divisor);
}
