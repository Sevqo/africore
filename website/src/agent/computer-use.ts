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

export function formatAgentMoney(minor: number, currency = 'KES') {
  const divisor = ['UGX', 'RWF'].includes(currency) ? 1 : 100;
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    minimumFractionDigits: divisor === 1 ? 0 : 2,
    maximumFractionDigits: divisor === 1 ? 0 : 2,
  }).format(minor / divisor);
}
