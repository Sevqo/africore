import { OrganizationChart, PeopleReports } from './PeopleReports';
import {
  PeopleOnboarding,
  DepartmentManagement,
  LeaveTypeManagement,
  AttendanceCorrection,
} from './PeopleManagement';
import { DocumentAttachments } from './DocumentAttachments';
import { PeopleRecordActions } from './PeopleRecordActions';
import {
  PeopleAttendanceAnalysis,
  PeopleLifecycle,
  PeopleOverview,
  PeoplePerformance,
  PeopleProfileExpansion,
  PeopleRecruitment,
  PeopleTimeOffCalendar,
} from './PeopleExpansion';
import { useEffect, useState } from 'react';
import { Field, Form, money, type API } from '../operations/UI';
import { ApprovalDetails } from '../operations/ApprovalDetails';
import { EmployeeEditor, PeoplePolicyEditor } from './PeopleEditors';
import { useIdempotentAPI } from './useIdempotentAPI';

export function PeopleWorkspace({
  api: provided,
  scope,
  section = 'dashboard',
}: {
  api: API;
  scope: string;
  section?: string;
}) {
  const api = useIdempotentAPI(provided, scope),
    [config, setConfig] = useState<any>(null),
    [directory, setDirectory] = useState<any>(null),
    [members, setMembers] = useState<any[]>([]),
    [departments, setDepartments] = useState<any[]>([]),
    [positions, setPositions] = useState<any[]>([]),
    [types, setTypes] = useState<any[]>([]),
    [requests, setRequests] = useState<any>(null),
    [attendance, setAttendance] = useState<any>(null),
    [reviews, setReviews] = useState<any[]>([]),
    [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<any>(null),
    [balances, setBalances] = useState<any>(null),
    [compensation, setCompensation] = useState<any>(null),
    [editing, setEditing] = useState<any>(null),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(''),
    [loadErrors, setLoadErrors] = useState<Record<string, string>>({}),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [query, setQuery] = useState(''),
    [offset, setOffset] = useState(0),
    [directoryView, setDirectoryView] = useState<'cards' | 'list'>('cards'),
    [directoryFilters, setDirectoryFilters] = useState({ status: '', department_id: '' }),
    [syncingTeam, setSyncingTeam] = useState(false),
    [autoSyncedScope, setAutoSyncedScope] = useState(''),
    [removingEmployee, setRemovingEmployee] = useState(false),
    [removeMembership, setRemoveMembership] = useState(false),
    [removeReason, setRemoveReason] = useState('');
  const saved = (message = 'Saved.') => {
    setRevision((v) => v + 1);
    setNotice(message);
    setEditing(null);
    setPreview(null);
    setRemovingEmployee(false);
    setRemoveMembership(false);
    setRemoveReason('');
  };
  async function syncTeamMembers(silent = false) {
    if (syncingTeam) return;
    setSyncingTeam(true);
    setError('');
    try {
      const res = await api('/people/employees/sync-team', 'POST', {});
      setRevision((v) => v + 1);
      if (!silent || res?.synced > 0) {
        setNotice(
          res?.synced > 0
            ? `Synced ${res.synced} workspace member${res.synced === 1 ? '' : 's'} into the People directory.`
            : 'All current workspace members are already linked in People.',
        );
      }
    } catch (e) {
      if (!silent) setError((e as Error).message);
    } finally {
      setSyncingTeam(false);
    }
  }
  useEffect(() => {
    setConfig(null);
    setSelected('');
    setDetail(null);
    setEditing(null);
    setOffset(0);
    setQuery('');
    setDirectoryFilters({ status: '', department_id: '' });
  }, [scope]);
  useEffect(() => {
    let active = true;
    setError('');
    const sources: [string, string, (value: any) => void][] = [
      ['policy', '/people/configuration', (value) => setConfig(value)],
      [
        'employees',
        '/people/employees?' +
          new URLSearchParams({
            q: query,
            offset: String(offset),
            ...(directoryFilters.status ? { status: directoryFilters.status } : {}),
            ...(directoryFilters.department_id
              ? { department_id: directoryFilters.department_id }
              : {}),
          }).toString(),
        (value) => setDirectory(value),
      ],
      ['team', '/team', (value: any) => setMembers(value.data)],
      ['departments', '/people/departments', (value: any) => setDepartments(value.data)],
      ['job positions', '/people/positions', (value: any) => setPositions(value.data)],
      ['leave types', '/people/leave-types', (value: any) => setTypes(value.data)],
      ['leave requests', '/people/leave', (value) => setRequests(value)],
      ['attendance', '/people/attendance', (value) => setAttendance(value)],
      [
        'approvals',
        '/business/approvals',
        (value: any) => setReviews(value.data.filter((v: any) => v.action === 'leave_approval')),
      ],
    ];
    setLoadErrors({});
    void Promise.allSettled(
      sources.map(async ([label, path, apply]) => {
        try {
          const value = await api(path);
          if (active) apply(value);
        } catch (e) {
          if (active) setLoadErrors((previous) => ({ ...previous, [label]: (e as Error).message }));
        }
      }),
    );
    return () => {
      active = false;
    };
  }, [scope, revision, query, offset, directoryFilters]);
  useEffect(() => {
    let active = true;
    setDetail(null);
    setBalances(null);
    setCompensation(null);
    setPreview(null);
    if (selected) {
      const employeeKey = 'employee record';
      void api('/people/employees/' + selected)
        .then((employee) => {
          if (!active) return;
          setDetail(employee);
          const reads: [string, string, (value: any) => void][] = [];
          const own = selected === config?.employee_id;
          if (config?.access.hr_view || own)
            reads.push([
              'leave balances',
              '/people/employees/' + selected + '/leave-balances',
              setBalances,
            ]);
          if (employee.access.compensation)
            reads.push([
              'compensation',
              '/people/employees/' + selected + '/compensation',
              setCompensation,
            ]);
          void Promise.allSettled(
            reads.map(async ([label, path, apply]) => {
              try {
                const value = await api(path);
                if (active) apply(value);
              } catch (e) {
                if (active)
                  setLoadErrors((previous) => ({
                    ...previous,
                    [label]: (e as Error).message,
                  }));
              }
            }),
          );
        })
        .catch((e) => {
          if (active)
            setLoadErrors((previous) => ({
              ...previous,
              [employeeKey]: (e as Error).message,
            }));
        });
    }
    return () => {
      active = false;
    };
  }, [scope, selected, revision, config?.employee_id]);
  const unlinkedMembersCount = members.filter(
    (m) => !(directory?.data || []).some((e: any) => e.data?.linked_user_id === m.id),
  ).length;
  useEffect(() => {
    if (
      config?.access?.hr_write &&
      config?.service_active &&
      directory &&
      directory.total === 0 &&
      members.length > 0 &&
      !query &&
      !directoryFilters.status &&
      !directoryFilters.department_id &&
      autoSyncedScope !== scope &&
      !syncingTeam
    ) {
      setAutoSyncedScope(scope);
      void syncTeamMembers(true);
    }
  }, [
    config?.access?.hr_write,
    config?.service_active,
    directory?.total,
    members.length,
    query,
    directoryFilters.status,
    directoryFilters.department_id,
    scope,
    autoSyncedScope,
    syncingTeam,
  ]);
  if (!config)
    return (
      <div>
        {loadErrors.policy ? (
          <p role="alert" className="alert error">
            People policy unavailable: {loadErrors.policy}{' '}
            <button className="quiet-button" onClick={() => setRevision((v) => v + 1)}>
              Retry People data
            </button>
          </p>
        ) : (
          <p role="status">Loading authorized People records…</p>
        )}
        {Object.entries(loadErrors)
          .filter(([source]) => source !== 'policy')
          .map(([source, message]) => (
            <p className="alert" role="status" key={source}>
              {source} unavailable: {message}{' '}
              <button className="quiet-button" onClick={() => setRevision((v) => v + 1)}>
                Retry People data
              </button>
            </p>
          ))}
      </div>
    );
  const access = config.access,
    show = (name: string) => (section === 'dashboard' && name === 'employees') || section === name;
  return (
    <div className="apps-workspace people-workspace">
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {Object.entries(loadErrors).map(([source, message]) => (
        <p className="alert" role="status" key={source}>
          {source} unavailable: {message}{' '}
          <button className="quiet-button" onClick={() => setRevision((v) => v + 1)}>
            Retry People data
          </button>
        </p>
      ))}
      <section className="panel">
        <h2>People operations</h2>
        <p>
          Private employment records, configured leave and recorded attendance. Payroll and
          statutory deductions are not calculated. Attendance does not establish location or
          biometric proof.
        </p>
        {!config.service_active && (
          <p role="status">
            People is inactive. Authorized history remains readable; new operations require
            activation.
          </p>
        )}
        {!config.configured && access.hr_write && (
          <p role="status">
            Default employer policy will be initialized automatically when you sync workspace
            members or add an employee. You can customize working days and schedules anytime in
            Settings.
          </p>
        )}
        {access.hr_write && config.service_active && unlinkedMembersCount > 0 && (
          <div className="form-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="button"
              disabled={syncingTeam}
              onClick={() => void syncTeamMembers(false)}
            >
              {syncingTeam
                ? 'Syncing workspace members…'
                : `Sync ${unlinkedMembersCount} workspace member${unlinkedMembersCount === 1 ? '' : 's'} into People`}
            </button>
          </div>
        )}
        {config.employee_id && (
          <button className="secondary-button" onClick={() => setSelected(config.employee_id)}>
            Open my employee record
          </button>
        )}
      </section>
      {section === 'dashboard' && (
        <PeopleOverview api={api} scope={scope + ':' + revision} configuration={config} />
      )}
      {section === 'recruitment' && (access.recruitment_view || access.hr_view) && (
        <PeopleRecruitment
          api={api}
          scope={scope + ':' + revision}
          configuration={config}
          employees={directory?.data || []}
          departments={departments}
          onSaved={saved}
        />
      )}
      {section === 'performance' && (access.performance_view || config.employee_id) && (
        <PeoplePerformance
          api={api}
          scope={scope + ':' + revision}
          configuration={config}
          employees={directory?.data || []}
          departments={departments}
          onSaved={saved}
        />
      )}
      {section === 'settings' && access.can_configure && (
        <PeoplePolicyEditor
          key={scope + ':' + config.version}
          configuration={config}
          members={members}
          api={api}
          onSaved={() => saved('Employer policy saved.')}
        />
      )}
      {(show('employees') || show('departments')) && (
        <section className="panel">
          <div className="section-heading">
            <h2>Authorized employee directory</h2>
            {access.hr_write && (
              <div className="form-actions">
                {members.length > 0 && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={syncingTeam || !config.service_active}
                    onClick={() => void syncTeamMembers(false)}
                  >
                    {syncingTeam ? 'Syncing…' : 'Sync workspace team'}
                  </button>
                )}
                <button
                  className="button"
                  disabled={!config.service_active}
                  onClick={() => setEditing({ new: true })}
                >
                  Add employee
                </button>
              </div>
            )}
          </div>
          <Field label="Search visible work profiles">
            <input
              value={query}
              maxLength={100}
              onChange={(e) => {
                setQuery(e.target.value);
                setOffset(0);
              }}
            />
          </Field>
          <div className="form-grid">
            <Field label="Employment status">
              <select
                value={directoryFilters.status}
                onChange={(e) => {
                  setDirectoryFilters((previous) => ({ ...previous, status: e.target.value }));
                  setOffset(0);
                }}
              >
                <option value="">All permitted statuses</option>
                <option value="active">Active</option>
                <option value="onboarding">Onboarding</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field label="Department">
              <select
                value={directoryFilters.department_id}
                onChange={(e) => {
                  setDirectoryFilters((previous) => ({
                    ...previous,
                    department_id: e.target.value,
                  }));
                  setOffset(0);
                }}
              >
                <option value="">All visible departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.data.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p>{directory?.coverage}</p>
          <div className="people-directory-toolbar" aria-label="Employee view">
            <button
              className="secondary-button"
              type="button"
              aria-pressed={directoryView === 'cards'}
              onClick={() => setDirectoryView('cards')}
            >
              Cards
            </button>
            <button
              className="secondary-button"
              type="button"
              aria-pressed={directoryView === 'list'}
              onClick={() => setDirectoryView('list')}
            >
              List
            </button>
            <span>
              {directory?.total ?? 0} employees · page {Math.floor(offset / 50) + 1}
            </span>
          </div>
          <div className={'people-employee-directory people-employee-directory-' + directoryView}>
            {directory?.data.map((e: any) => (
              <article className="people-employee-card" key={e.id}>
                <span className="people-employee-avatar" aria-hidden="true">
                  {String(e.data.name || '?')
                    .trim()
                    .slice(0, 1)
                    .toLocaleUpperCase()}
                </span>
                <div className="people-employee-card-copy">
                  <strong>{e.data.name}</strong>
                  <span>{e.data.job_title || 'Role not recorded'}</span>
                  <small>
                    {departments.find((d) => d.id === e.data.department_id)?.data.name ||
                      'No department'}{' '}
                    · {e.status}
                  </small>
                </div>
                <button className="secondary-button" onClick={() => setSelected(e.id)}>
                  Open employee
                </button>
              </article>
            ))}
          </div>
          {directory?.data.length === 0 && <p>No authorized employee profiles match.</p>}
          <div className="form-actions">
            <button
              className="secondary-button"
              disabled={!offset}
              onClick={() => setOffset((v) => Math.max(0, v - 50))}
            >
              Previous employees
            </button>
            <button
              className="secondary-button"
              disabled={!directory?.has_more}
              onClick={() => setOffset((v) => v + 50)}
            >
              More employees
            </button>
          </div>
          {directory?.truncated && (
            <p role="status">Search covers at most 5000 authorized records.</p>
          )}
        </section>
      )}
      {section === 'employees' && access.hr_view && (
        <PeopleLifecycle
          key={scope + ':' + revision}
          api={api}
          scope={scope + ':' + revision}
          configuration={config}
          employees={directory?.data || []}
          departments={departments}
          onSaved={saved}
        />
      )}
      {section === 'org-chart' && (
        <OrganizationChart api={api} scope={scope} onSelect={setSelected} />
      )}
      {section === 'reports' && <PeopleReports api={api} scope={scope} />}
      {show('departments') && (
        <section className="panel">
          <h2>Departments</h2>
          {departments.map((d) => (
            <article key={d.id}>
              <p>
                {d.data.name} · {d.status}
              </p>
              {access.hr_write && (
                <DepartmentManagement
                  record={d}
                  employees={directory?.data || []}
                  departments={departments}
                  api={api}
                  onSaved={() => saved('Department revision saved.')}
                />
              )}
            </article>
          ))}
          {access.hr_write && (
            <Form
              submit={async (d) => {
                await api('/people/departments', 'POST', {
                  expected_version: 0,
                  name: d.name,
                  parent_id: d.parent || null,
                });
                saved('Department created.');
              }}
            >
              <Field label="Department name">
                <input name="name" required maxLength={160} />
              </Field>
              <Field label="Parent department">
                <select name="parent">
                  <option value="">Top-level department</option>
                  {departments
                    .filter((d: any) => d.status === 'active')
                    .map((d: any) => (
                      <option value={d.id} key={d.id}>
                        {d.data.name}
                      </option>
                    ))}
                </select>
              </Field>
              <button className="button">Create department</button>
            </Form>
          )}
        </section>
      )}
      {detail &&
        (show('employees') || show('leave') || show('attendance') || show('org-chart')) && (
          <section className="panel">
            <div className="section-heading">
              <h2>{detail.data.name}</h2>
              {access.hr_write && (
                <div className="form-actions">
                  <button className="secondary-button" onClick={() => setEditing(detail)}>
                    Edit employee
                  </button>
                  {access.hr_manage && detail.status !== 'inactive' && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setRemovingEmployee((v) => !v)}
                    >
                      {removingEmployee ? 'Cancel removal' : 'Remove / archive employee'}
                    </button>
                  )}
                  {access.hr_manage && detail.status === 'inactive' && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={async () => {
                        setError('');
                        try {
                          await api('/people/employees/' + detail.id, 'PUT', {
                            ...detail.data,
                            expected_version: detail.version,
                            status: 'active',
                          });
                          saved('Employee reactivated.');
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Reactivate employee
                    </button>
                  )}
                </div>
              )}
            </div>
            {removingEmployee && access.hr_manage && (
              <div className="panel" style={{ margin: '12px 0', borderColor: '#d1d5db' }}>
                <h3>Archive / remove {detail.data.name}</h3>
                <p>
                  Archiving sets the employee status to <strong>inactive</strong> while keeping
                  their employment history intact.
                </p>
                <Field label="Reason (optional)">
                  <input
                    value={removeReason}
                    maxLength={1000}
                    placeholder="Role ended, resigned, offboarded…"
                    onChange={(e) => setRemoveReason(e.target.value)}
                  />
                </Field>
                {detail.workspace?.linked_member && detail.data.linked_user_id !== config.actor_id && (
                  <label className="checkbox-field" style={{ margin: '10px 0' }}>
                    <input
                      type="checkbox"
                      checked={removeMembership}
                      onChange={(e) => setRemoveMembership(e.target.checked)}
                    />
                    Also remove this person&apos;s workspace access (Team membership)
                  </label>
                )}
                <div className="form-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={async () => {
                      setError('');
                      try {
                        const res = await api('/people/employees/' + detail.id + '/remove', 'POST', {
                          expected_version: detail.version,
                          remove_membership: removeMembership,
                          reason: removeReason,
                        });
                        saved(
                          res?.membership_removed
                            ? 'Employee archived and workspace access removed.'
                            : 'Employee archived (set to inactive).',
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Confirm remove / archive
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setRemovingEmployee(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <p>
              {detail.data.employee_number} · {detail.data.job_title} · {detail.status}
            </p>
            <p>
              Started {detail.data.start_on} · {detail.data.work_email} · {detail.data.work_phone}
            </p>
            <PeopleProfileExpansion
              key={scope + ':' + detail.id + ':' + revision}
              api={api}
              scope={scope + ':' + revision}
              employee={detail}
              access={access}
              onSaved={saved}
            />
            {detail.data.hr_notes && <p>Private HR notes: {detail.data.hr_notes}</p>}
            {access.hr_write && detail.status !== 'inactive' && (
              <PeopleOnboarding
                employee={detail}
                api={api}
                onSaved={() =>
                  saved('Private onboarding project prepared without copying personnel data.')
                }
              />
            )}
            {balances && (
              <>
                <h3>Configured leave balances</h3>
                {balances.data.map((b: any) => (
                  <p key={b.leave_type_id}>
                    {b.name}: {b.available_milli / 1000} days available · {b.used_milli / 1000} used
                  </p>
                ))}
                <p>{balances.notice}</p>
              </>
            )}
            {(access.hr_write || detail.id === config.employee_id) &&
              config.service_active &&
              types.some((t) => t.status === 'active') && (
                <>
                  <h3>Request leave</h3>
                  <Form
                    key={detail.id + ':' + revision}
                    submit={async (d) => {
                      await api('/people/employees/' + detail.id + '/leave', 'POST', {
                        ...d,
                        half_day: d.half_day === 'on',
                      });
                      saved('Leave submitted for a separate review.');
                    }}
                  >
                    <Field label="Leave type">
                      <select name="leave_type_id" required>
                        {types
                          .filter((t) => t.status === 'active')
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.data.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <div className="form-grid">
                      <Field label="From">
                        <input name="from" type="date" required />
                      </Field>
                      <Field label="To">
                        <input name="to" type="date" required />
                      </Field>
                    </div>
                    <label className="checkbox-field">
                      <input name="half_day" type="checkbox" />
                      Single half day
                    </label>
                    <Field label="Private reason">
                      <textarea name="reason" maxLength={3000} />
                    </Field>
                    <Field label="Separate reviewer">
                      <select name="approver" required>
                        <option value="">Choose an authorized current reviewer</option>
                        {members
                          .filter((m) => m.id !== config.actor_id)
                          .map((m) => (
                            <option value={m.id} key={m.id}>
                              {m.display_name || m.email}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <p>
                      Submission checks current HR or configured reporting-manager authority.
                      Selecting a member does not grant them authority.
                    </p>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={async (e) => {
                        const form = e.currentTarget.closest('form')!;
                        const d = Object.fromEntries(new FormData(form));
                        try {
                          setPreview(
                            await api('/people/employees/' + detail.id + '/leave-preview', 'POST', {
                              leave_type_id: d.leave_type_id,
                              from: d.from,
                              to: d.to,
                              half_day: d.half_day === 'on',
                            }),
                          );
                        } catch (error) {
                          setError((error as Error).message);
                        }
                      }}
                    >
                      Preview working days
                    </button>
                    <button className="button">Submit leave for review</button>
                    {preview && (
                      <p role="status">
                        {preview.units_milli / 1000} configured working days ·{' '}
                        {preview.balance.available_milli / 1000} currently available. No decision or
                        deduction was performed.
                      </p>
                    )}
                  </Form>
                </>
              )}
            {config.service_active &&
              detail.id === config.employee_id &&
              detail.data.self_service && (
                <Form
                  submit={async (d) => {
                    await api('/people/employees/' + detail.id + '/' + d.action, 'POST', {
                      confirm: true,
                    });
                    saved('Attendance timestamp recorded.');
                  }}
                >
                  <Field label="Record my attendance">
                    <select name="action">
                      <option value="check-in">Check in now</option>
                      <option value="check-out">Check out now</option>
                    </select>
                  </Field>
                  <button className="button">Record current server time</button>
                </Form>
              )}
            <DocumentAttachments
              api={api}
              sourceKind="employee"
              sourceId={detail.id}
              writable={access.hr_write || detail.id === config.employee_id}
            />
            <PeopleRecordActions
              employee={detail}
              configuration={config}
              types={types}
              api={api}
              onSaved={() => saved('Retained employee record saved.')}
            />
            {compensation && (
              <>
                <h3>Restricted compensation terms</h3>
                {compensation.data.map((c: any) => (
                  <article key={c.id}>
                    <p>
                      {money(c.data.amount_minor, c.data.currency)} per {c.data.period} ·{' '}
                      {c.data.effective_from} to {c.data.effective_to || 'open-ended'}
                    </p>
                    <p>{c.data.notes}</p>
                  </article>
                ))}
                <p>{compensation.notice}</p>
              </>
            )}
          </section>
        )}
      {show('leave') && (
        <section className="panel">
          <PeopleTimeOffCalendar api={api} scope={scope + ':' + revision} />
          <h2>Leave requests</h2>
          {requests?.data.map((r: any) => (
            <article key={r.id} className="app-price-review">
              <h3>{r.data.employee_name}</h3>
              <p>
                {r.data.leave_type_name} · {r.data.from} to {r.data.to} · {r.status}
              </p>
              {r.data.reason && <p>{r.data.reason}</p>}
              {['pending', 'approved'].includes(r.status) &&
                (access.hr_manage || r.data.employee_id === config.employee_id) && (
                  <Form
                    submit={async (d) => {
                      await api('/people/leave/' + r.id + '/cancel', 'POST', {
                        expected_version: r.version,
                        reason: d.reason,
                      });
                      saved('Leave cancellation recorded.');
                    }}
                  >
                    <Field label="Cancellation reason">
                      <input name="reason" required minLength={8} maxLength={2000} />
                    </Field>
                    <button className="secondary-button">Cancel leave with reason</button>
                  </Form>
                )}
            </article>
          ))}
          {!requests?.data.length && <p>No visible leave requests.</p>}
          {requests?.has_more && (
            <p>Showing the latest 50 requests. Additional history remains retained.</p>
          )}
          <h3>Assigned leave reviews</h3>
          {reviews.map((r) => (
            <article className="app-price-review" key={r.id}>
              <h4>{r.status}</h4>
              <ApprovalDetails approval={r} />
              {r.can_decide && (
                <Form
                  submit={async (d) => {
                    await api('/approvals/' + r.id + '/decide', 'POST', d);
                    saved('Leave review recorded.');
                  }}
                >
                  <Field label="Decision">
                    <select name="decision">
                      <option value="approved">Approve configured leave</option>
                      <option value="rejected">Reject leave</option>
                    </select>
                  </Field>
                  <Field label="Private review reason">
                    <textarea name="reason" required minLength={5} maxLength={1000} />
                  </Field>
                  <button className="button">Record separate leave decision</button>
                </Form>
              )}
            </article>
          ))}
        </section>
      )}
      {show('attendance') && access.hr_view && (
        <PeopleAttendanceAnalysis api={api} scope={scope + ':' + revision} />
      )}
      {show('attendance') && (
        <section className="panel">
          <h2>Recorded attendance</h2>
          {attendance?.data.map((r: any) => (
            <article key={r.id}>
              <p>
                {directory?.data.find((e: any) => e.id === r.data.employee_id)?.data.name ||
                  'Authorized employee'}{' '}
                · {new Date(r.data.check_in).toLocaleString()} to{' '}
                {r.data.check_out ? new Date(r.data.check_out).toLocaleString() : 'Open'} ·{' '}
                {r.data.source.replaceAll('_', ' ')}
              </p>
              {access.hr_manage && !r.superseded_by && (
                <AttendanceCorrection
                  record={r}
                  api={api}
                  onSaved={() =>
                    saved('Attendance correction recorded with original history retained.')
                  }
                />
              )}
            </article>
          ))}
          <p>{attendance?.notice}</p>
          {attendance?.has_more && <p>Showing the latest 50 visible records.</p>}
        </section>
      )}
      {(show('leave-types') || section === 'leave') && access.hr_manage && (
        <section className="panel">
          <h2>Employer leave types</h2>
          {types.map((t) => (
            <article key={t.id}>
              <p>
                {t.data.name} · {t.data.annual_allowance_milli / 1000} days · {t.data.accrual} ·{' '}
                {t.status}
              </p>
              <LeaveTypeManagement
                record={t}
                api={api}
                onSaved={() => saved('Leave policy revision saved.')}
              />
            </article>
          ))}
          <Form
            submit={async (d) => {
              await api('/people/leave-types', 'POST', {
                expected_version: 0,
                name: d.name,
                annual_allowance_milli: Math.round(Number(d.days) * 1000),
                accrual: d.accrual,
                prorate_start_year: d.prorate === 'on',
                paid: d.paid === 'on',
              });
              saved('Configured leave type created.');
            }}
          >
            <Field label="Leave type name">
              <input name="name" required maxLength={160} />
            </Field>
            <Field label="Configured annual days">
              <input name="days" type="number" min="0" max="366" step="0.5" required />
            </Field>
            <Field label="Accrual policy">
              <select name="accrual">
                <option value="annual">Annual configured grant</option>
                <option value="monthly">Completed eligible months</option>
              </select>
            </Field>
            <label className="checkbox-field">
              <input name="prorate" type="checkbox" />
              Prorate the starting year
            </label>
            <label className="checkbox-field">
              <input name="paid" type="checkbox" />
              Employer marks this leave as paid (no payroll calculation)
            </label>
            <button className="button">Create configured leave type</button>
          </Form>
        </section>
      )}
      {editing && (
        <EmployeeEditor
          employee={editing.new ? undefined : editing}
          members={members}
          employees={directory?.data || []}
          departments={departments}
          positions={positions}
          api={api}
          onSaved={() => saved('Employee saved.')}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
