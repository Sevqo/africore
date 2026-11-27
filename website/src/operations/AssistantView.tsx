import { AgentWorkspace } from '../agent/AgentWorkspace';
import type { AgentDestination } from '../agent/computer-use';
import type { API } from './UI';

export function AssistantView({
  api,
  currency,
  workspaceId,
  workspaceKind = 'business',
  onOpenDestination,
}: {
  api: API;
  currency: string;
  workspaceId?: string;
  workspaceKind?: 'business' | 'personal' | 'developer';
  onOpenDestination?: (dest: AgentDestination) => void;
}) {
  return (
    <AgentWorkspace
      api={api}
      currency={currency}
      workspaceId={workspaceId}
      workspaceKind={workspaceKind}
      onOpenDestination={onOpenDestination}
    />
  );
}
