import { useState } from 'react';
import { invitableRoles, roleAppAccess } from '../../../src/platform/roles';

type Member = { id: string; email: string; role: string; display_name?: string };
type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at?: string;
  revoked?: number | string;
};
type Call = (path: string, method?: string, body?: unknown) => Promise<any>;

const roleLabels: Record<string, { label: string; summary: string }> = {
  owner: {
    label: 'Owner',
    summary: 'Full workspace ownership, billing, team administration, and all 26 apps.',
  },
  admin: {
    label: 'Administrator',
    summary: 'Team management, app/service installation, and access across all apps.',
  },
  finance: {
    label: 'Finance Manager',
    summary: 'Finance, Accounting, Subscriptions, Procurement bills, Property billing & Analytics.',
  },
  accountant: {
    label: 'Accountant',
    summary: 'Accounting books, Finance, Subscriptions billing, Analytics & Documents (no HR/People).',
  },
  hr: {
    label: 'HR & People Manager',
    summary: 'People, Recruitment, Leave, Attendance, Knowledge & Learning, Work & Calendar.',
  },
  sales: {
    label: 'Sales Representative',
    summary: 'CRM, Sales quotations & orders, POS shifts, Commerce storefront & Subscriptions.',
  },
  operations: {
    label: 'Operations Member',
    summary: 'Inventory, Procurement, Manufacturing, Field Ops, Logistics, Support & Work.',
  },
  inventory_manager: {
    label: 'Inventory & Supply Manager',
    summary: 'Inventory warehouses, Procurement, Manufacturing, Logistics & POS stock.',
  },
  support_agent: {
    label: 'Support Specialist',
    summary: 'Support tickets & SLA queue, Knowledge Base, CRM context & Field escalations.',
  },
  marketing_manager: {
    label: 'Marketing & Growth',
    summary: 'Marketing campaigns, Website builder, Commerce promotions, CRM leads & Analytics.',
  },
  viewer: {
    label: 'Read-Only Viewer',
    summary: 'Read-only access to Analytics, Finance reports, Calendar, Work & Documents.',
  },
};

function formatRoleName(role: string) {
  return roleLabels[role]?.label || role.replaceAll('_', ' ');
}

function formatRoleApps(role: string) {
  const apps = roleAppAccess[role];
  if (!apps) return 'Standard read access';
  if (apps === '*') return 'All workspace apps';
  return apps.map((id) => id.replaceAll('_', ' ')).join(', ');
}

export function TeamDirectory({
  data,
  call,
  action,
  role,
  actor,
}: {
  data?: { data?: Member[]; invitations?: Invitation[] };
  call: Call;
  action: (fn: () => Promise<any>) => Promise<any>;
  role: string;
  actor: string;
}) {
  const [search, setSearch] = useState(''),
    [selectedInviteRole, setSelectedInviteRole] = useState<string>('accountant'),
    [token, setToken] = useState(''),
    [pending, setPending] = useState(false);
  const admin = ['owner', 'admin'].includes(role),
    roles = [...invitableRoles];
  async function run(fn: () => Promise<any>) {
    setPending(true);
    setToken('');
    try {
      const result = await action(fn);
      if (result?.token) setToken(result.token);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="team-directory">
      <section className="panel">
        <h2>Members</h2>
        <label className="field">
          <span>Find a member</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or email"
          />
        </label>
        {(data?.data || [])
          .filter((m) =>
            (m.email + ' ' + (m.display_name || '')).toLowerCase().includes(search.toLowerCase()),
          )
          .map((m) => (
            <article className="account-record team-member" key={m.id}>
              <span className="member-initials" aria-hidden="true">
                {(m.display_name || m.email).slice(0, 2).toUpperCase()}
              </span>
              <div>
                <strong>{m.display_name || m.email}</strong>
                {m.display_name && <p>{m.email}</p>}
                <small>
                  {formatRoleName(m.role)} · Active{m.id === actor ? ' · You' : ''}
                </small>
                <small style={{ display: 'block', color: '#6b7280', marginTop: 2 }}>
                  Apps: {formatRoleApps(m.role)}
                </small>
              </div>
              {admin && (
                <div className="row-actions">
                  <label className="field">
                    <span>Role for {m.email}</span>
                    <select
                      aria-label={'Role for ' + m.email}
                      value={m.role}
                      disabled={
                        pending || m.id === actor || (m.role === 'owner' && role !== 'owner')
                      }
                      onChange={(e) =>
                        run(() => call('/team/' + m.id, 'PATCH', { role: e.target.value }))
                      }
                    >
                      {['owner', ...roles].map((r) => (
                        <option key={r} value={r} disabled={r === 'owner' && role !== 'owner'}>
                          {formatRoleName(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={pending || (m.role === 'owner' && role !== 'owner')}
                    onClick={() => {
                      if (
                        confirm(
                          'Remove ' +
                            m.email +
                            ' from this workspace? Their account and records will remain.',
                        )
                      )
                        void run(() => call('/team/' + m.id, 'DELETE'));
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </article>
          ))}
        {!data?.data?.length && <p>No members are available for this workspace.</p>}
        <small>Join dates and last activity are not recorded; they are not estimated.</small>
      </section>
      <section className="panel">
        <h2>Invitations</h2>
        {admin && (
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const values = Object.fromEntries(new FormData(form));
              void run(() => call('/invitations', 'POST', values));
            }}
          >
            <label className="field">
              <span>Email address</span>
              <input required name="email" type="email" autoComplete="email" />
            </label>
            <label className="field">
              <span>Role</span>
              <select
                name="role"
                value={selectedInviteRole}
                onChange={(e) => setSelectedInviteRole(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {formatRoleName(r)}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="panel"
              style={{
                gridColumn: '1 / -1',
                padding: '10px 12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
              }}
            >
              <strong style={{ fontSize: 13 }}>{formatRoleName(selectedInviteRole)} access</strong>
              <p style={{ margin: '4px 0', fontSize: 12.5, color: '#475569' }}>
                {roleLabels[selectedInviteRole]?.summary}
              </p>
              <small style={{ color: '#0f766e', fontWeight: 500 }}>
                Permitted apps: {formatRoleApps(selectedInviteRole)}
              </small>
            </div>
            <button className="button" disabled={pending}>
              {pending ? 'Saving…' : 'Invite member'}
            </button>
            <small>
              No invitation email service is connected. Share the one-time token with the intended
              colleague.
            </small>
          </form>
        )}
        {token && (
          <div className="alert one-time" role="status">
            <p>Share this invitation token with its intended recipient. It is shown once.</p>
            <code>{token}</code>
            <button className="quiet-button" onClick={() => setToken('')}>
              Dismiss
            </button>
          </div>
        )}
        {(data?.invitations || []).map((i) => {
          const status = i.accepted_at
            ? 'Accepted'
            : Number(i.revoked) > 0
              ? 'Revoked'
              : Date.parse(i.expires_at) < Date.now()
                ? 'Expired'
                : 'Pending';
          return (
            <article className="account-record" key={i.id}>
              <div>
                <strong>{i.email}</strong>
                <p>
                  {i.role} · {status}
                </p>
                <small>
                  Expires{' '}
                  {new Date(i.expires_at).toLocaleDateString('en-KE', {
                    timeZone: 'Africa/Nairobi',
                  })}
                </small>
              </div>
              {admin && !i.accepted_at && status !== 'Revoked' && (
                <div className="row-actions">
                  <button
                    disabled={pending}
                    onClick={() => run(() => call('/invitations/' + i.id, 'PATCH'))}
                  >
                    Renew token
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (confirm('Revoke this invitation?'))
                        void run(() => call('/invitations/' + i.id, 'DELETE'));
                    }}
                  >
                    Revoke
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!data?.invitations?.length && (
          <p>No invitations yet. Invite a colleague when you need shared access.</p>
        )}
      </section>
      <details className="panel">
        <summary>Roles &amp; permissions</summary>
        <p>
          Owners manage ownership. Administrators manage the team. Finance members manage financial
          records; operations members manage operational tasks. Viewers can read permitted records.
          Every request is checked by the backend.
        </p>
        <p>
          The last owner cannot be removed. Access changes are recorded in the workspace audit
          history.
        </p>
      </details>
    </div>
  );
}
