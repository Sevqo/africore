import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api-client';
import { navigate } from '../lib/navigation';
import { url } from './AccountUI';

type WorkspaceItem = {
  id: string;
  name: string;
  kind?: 'personal' | 'business' | 'developer' | string;
  role?: string;
};

const ROLE_NAMES: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  finance: 'Finance',
  accountant: 'Accountant',
  hr: 'HR',
  sales: 'Sales',
  operations: 'Operations',
  inventory_manager: 'Inventory',
  support_agent: 'Support',
  marketing_manager: 'Marketing',
  viewer: 'Viewer',
};

export function WorkspaceSwitcher({
  currentId,
  workspaces: providedWorkspaces,
  fallbackOrgs = [],
  demo = false,
  onSelectSameBusiness,
  onError,
}: {
  currentId: string;
  workspaces?: WorkspaceItem[];
  fallbackOrgs?: WorkspaceItem[];
  demo?: boolean;
  onSelectSameBusiness?: (id: string) => void;
  onError?: (msg: string) => void;
}) {
  const [fetched, setFetched] = useState<WorkspaceItem[] | null>(null);
  const switchVersion = useRef(0);

  useEffect(() => {
    if (demo || (providedWorkspaces && providedWorkspaces.length > 0)) return;
    let live = true;
    api('/api/auth/account')
      .then((res) => {
        if (live && Array.isArray(res?.workspaces)) setFetched(res.workspaces);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [demo, providedWorkspaces]);

  const all: WorkspaceItem[] = (() => {
    const base = providedWorkspaces?.length
      ? providedWorkspaces
      : fetched?.length
        ? fetched
        : fallbackOrgs.map((o) => ({ ...o, kind: o.kind || 'business' }));
    const seen = new Map<string, WorkspaceItem>();
    for (const w of base) {
      if (w?.id) seen.set(w.id, { ...w, kind: w.kind || 'business' });
    }
    for (const o of fallbackOrgs) {
      if (o?.id && !seen.has(o.id)) seen.set(o.id, { ...o, kind: o.kind || 'business' });
    }
    return [...seen.values()];
  })();

  const businessList = all.filter((w) => (w.kind || 'business') === 'business');
  const personalList = all.filter((w) => w.kind === 'personal');
  const developerList = all.filter((w) => w.kind === 'developer');

  async function handleChange(rawValue: string) {
    if (!rawValue || rawValue === currentId) return;
    if (rawValue === '__manage__') {
      navigate('/app/workspaces');
      return;
    }
    if (rawValue.startsWith('__create_:')) {
      const targetKind = rawValue.slice('__create_:'.length);
      navigate('/app/workspaces?create=' + encodeURIComponent(targetKind));
      return;
    }
    const chosen = all.find((w) => w.id === rawValue);
    if (!chosen) return;
    const version = ++switchVersion.current;
    try {
      if (!demo) {
        await api('/api/auth/account/workspace', 'POST', { workspace_id: chosen.id });
      }
      if (version !== switchVersion.current) return;
      if (demo && onSelectSameBusiness) {
        onSelectSameBusiness(chosen.id);
        return;
      }
      const targetUrl = url(chosen);
      if (location.pathname === targetUrl) {
        onSelectSameBusiness?.(chosen.id);
      } else {
        navigate(targetUrl);
      }
    } catch (err) {
      if (version === switchVersion.current) {
        onError?.((err as Error).message);
      }
    }
  }

  const formatOption = (w: WorkspaceItem) => {
    const roleText = w.role ? ` (${ROLE_NAMES[w.role] || w.role})` : '';
    return `${w.name}${roleText}`;
  };

  return (
    <select
      aria-label="Switch workspace"
      className="workspace-switcher-select"
      value={currentId || ''}
      onChange={(e) => {
        void handleChange(e.target.value);
      }}
    >
      {!currentId && (
        <option value="" disabled>
          Select a workspace…
        </option>
      )}
      {businessList.length > 0 && (
        <optgroup label="Business workspaces">
          {businessList.map((w) => (
            <option key={w.id} value={w.id}>
              {formatOption(w)}
            </option>
          ))}
        </optgroup>
      )}
      {personalList.length > 0 && (
        <optgroup label="Personal workspace">
          {personalList.map((w) => (
            <option key={w.id} value={w.id}>
              {formatOption(w)}
            </option>
          ))}
        </optgroup>
      )}
      {developerList.length > 0 && (
        <optgroup label="Developer console">
          {developerList.map((w) => (
            <option key={w.id} value={w.id}>
              {formatOption(w)}
            </option>
          ))}
        </optgroup>
      )}
      {!demo && (
        <optgroup label="Switch or add workspace">
          {!personalList.length && (
            <option value="__create_:personal">+ Set up Personal workspace</option>
          )}
          {!developerList.length && (
            <option value="__create_:developer">+ Set up Developer console</option>
          )}
          <option value="__create_:business">+ Create Business workspace</option>
          <option value="__manage__">All workspaces &amp; settings…</option>
        </optgroup>
      )}
    </select>
  );
}
