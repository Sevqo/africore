import { useEffect, useState } from 'react';
import { Field, Form, today, type API } from '../operations/UI';

type Props = {
  api: API;
  scope: string;
  configuration: any;
  employees: any[];
  departments: any[];
  onSaved: (message?: string) => void;
};
const startOfMonth = (value: string) => value.slice(0, 7) + '-01';
const endOfMonth = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

export function PeopleRecruitment({
  api,
  scope,
  configuration,
  employees,
  departments,
  onSaved,
}: Props) {
  const [positions, setPositions] = useState<any[]>([]),
    [skillsCatalogue, setSkillsCatalogue] = useState<any[]>([]),
    [openings, setOpenings] = useState<any[]>([]),
    [candidates, setCandidates] = useState<any[]>([]),
    [applications, setApplications] = useState<any[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    const requests = [
      api('/people/positions').then((r) => {
        if (live) setPositions(r.data);
      }),
      api('/people/recruitment/openings').then((r) => {
        if (live) setOpenings(r.data);
      }),
      api('/people/recruitment/candidates').then((r) => {
        if (live) setCandidates(r.data);
      }),
      api('/people/recruitment/applications').then((r) => {
        if (live) setApplications(r.data);
      }),
    ];
    if (configuration.access.hr_view) {
      requests.push(
        api('/people/skills').then((r) => {
          if (live) setSkillsCatalogue(r.data);
        }),
      );
    }
    void Promise.allSettled(requests).then((results) => {
      if (live) {
        const failed = results.find((r) => r.status === 'rejected') as
          | PromiseRejectedResult
          | undefined;
        if (failed)
          setError(failed.reason?.message || 'Some recruitment records could not be loaded.');
      }
    });
    return () => {
      live = false;
    };
  }, [scope, api, configuration.access.hr_view]);
  const canRecruit = configuration.access.recruitment_write && configuration.service_active,
    canHR = configuration.access.hr_write && configuration.service_active,
    ownRecruiter = configuration.employee_id;
  return (
    <div className="people-expansion-grid">
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <section className="panel">
        <header className="section-heading">
          <div>
            <h2>Job positions</h2>
            <p>Position descriptions are employer records, separate from employee identities.</p>
          </div>
        </header>
        {positions.map((position) => (
          <div className="people-expansion-card" key={position.id}>
            <div>
              <h3>{position.data.title}</h3>
              <p>
                {departments.find((d) => d.id === position.data.department_id)?.data.name ||
                  'No department'}{' '}
                · {position.data.employment_category || 'Category not specified'}
              </p>
              <p>
                {position.employee_count} current employees ·{' '}
                {position.data.responsibilities?.join(' · ') || 'Responsibilities not listed'}
              </p>
              {canHR && (
                <details>
                  <summary>Edit position</summary>
                  <Form
                    submit={async (d) => {
                      await api('/people/positions/' + position.id, 'PUT', {
                        ...position.data,
                        expected_version: position.version,
                        title: d.title,
                        description: d.description,
                        active: d.active === 'on',
                      });
                      onSaved('Position updated.');
                    }}
                  >
                    <Field label="Position title">
                      <input
                        name="title"
                        required
                        maxLength={160}
                        defaultValue={position.data.title}
                      />
                    </Field>
                    <Field label="Position description">
                      <textarea
                        name="description"
                        maxLength={4000}
                        defaultValue={position.data.description || ''}
                      />
                    </Field>
                    <label className="checkbox-field">
                      <input name="active" type="checkbox" defaultChecked={position.data.active} />
                      Position is active
                    </label>
                    <button className="secondary-button">Save position</button>
                  </Form>
                </details>
              )}
            </div>
            <span className={'status-badge ' + position.status}>{position.status}</span>
          </div>
        ))}
        {canHR && (
          <details className="people-expansion-form">
            <summary>Create job position</summary>
            <Form
              submit={async (d) => {
                await api('/people/positions', 'POST', {
                  expected_version: 0,
                  title: d.title,
                  department_id: d.department_id || null,
                  hiring_manager_id: configuration.employee_id || null,
                  description: d.description,
                  responsibilities: String(d.responsibilities || '')
                    .split('\n')
                    .map((value) => value.trim())
                    .filter(Boolean),
                  required_skill_ids: [],
                  employment_category: d.category || null,
                  planned_vacancies: 0,
                  active: true,
                });
                onSaved('Position created.');
              }}
            >
              <Field label="Position title">
                <input name="title" required maxLength={160} />
              </Field>
              <Field label="Department">
                <select name="department_id">
                  <option value="">No department</option>
                  {departments
                    .filter((d) => d.status === 'active')
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.data.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Employment category">
                <select name="category">
                  <option value="">Unspecified</option>
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="temporary">Temporary</option>
                  <option value="contractor">Contractor</option>
                </select>
              </Field>
              <Field label="Position description">
                <textarea name="description" maxLength={4000} />
              </Field>
              <Field label="Responsibilities · one per line">
                <textarea name="responsibilities" maxLength={4000} />
              </Field>
              <button className="button">Save position</button>
            </Form>
          </details>
        )}
        {canHR && (
          <details className="people-expansion-form">
            <summary>Skill catalogue · {skillsCatalogue.length}</summary>
            {skillsCatalogue.map((skill) => (
              <p key={skill.id}>
                {skill.data.name} · {skill.data.type} · {skill.status}
              </p>
            ))}
            <Form
              submit={async (d) => {
                await api('/people/skills', 'POST', {
                  expected_version: 0,
                  name: d.name,
                  type: d.type,
                  active: true,
                });
                onSaved('Skill added to the catalogue.');
              }}
            >
              <Field label="Skill name">
                <input name="name" required maxLength={160} />
              </Field>
              <Field label="Skill category">
                <select name="type">
                  <option value="technical">Technical</option>
                  <option value="language">Language</option>
                  <option value="soft">Soft skill</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <button className="secondary-button">Add skill</button>
            </Form>
          </details>
        )}
      </section>
      <section className="panel">
        <header>
          <h2>Openings</h2>
          <p>
            Recruiter: assigned employee profile. External publication and messages are not sent.
          </p>
        </header>
        {openings.map((opening) => (
          <div className="people-expansion-card" key={opening.id}>
            <div>
              <h3>{opening.position_title}</h3>
              <p>
                {opening.applicant_count} applicants · {opening.data.vacancies} vacancy
                {opening.data.vacancies === 1 ? '' : 'ies'}
              </p>
              <p>
                {opening.data.opening_on}
                {opening.data.deadline ? ' to ' + opening.data.deadline : ''} ·{' '}
                {opening.data.status}
              </p>
            </div>
            <span className={'status-badge ' + opening.data.status}>{opening.data.status}</span>
            {canRecruit && opening.data.status === 'open' && (
              <button
                className="quiet-button"
                onClick={async () => {
                  await api('/people/recruitment/openings/' + opening.id, 'PUT', {
                    ...opening.data,
                    expected_version: opening.version,
                    status: 'closed',
                  });
                  onSaved('Recruitment opening closed.');
                }}
              >
                Close opening
              </button>
            )}
          </div>
        ))}
        {canRecruit && (ownRecruiter || canHR) && positions.some((p) => p.status === 'active') && (
          <details className="people-expansion-form">
            <summary>Create opening</summary>
            <Form
              submit={async (d) => {
                await api('/people/recruitment/openings', 'POST', {
                  expected_version: 0,
                  position_id: d.position_id,
                  recruiter_id: canHR ? d.recruiter_id : ownRecruiter,
                  vacancies: Number(d.vacancies),
                  description: '',
                  opening_on: d.opening_on,
                  deadline: d.deadline || null,
                  status: 'open',
                });
                onSaved('Recruitment opening saved.');
              }}
            >
              <Field label="Position">
                <select name="position_id" required>
                  {positions
                    .filter((p) => p.status === 'active')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.data.title}
                      </option>
                    ))}
                </select>
              </Field>
              {canHR && (
                <Field label="Recruiter">
                  <select name="recruiter_id" defaultValue={ownRecruiter || ''} required>
                    <option value="">Choose recruiter</option>
                    {employees
                      .filter((e) => ['active', 'onboarding'].includes(e.status))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.data.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Field label="Vacancies">
                <input
                  name="vacancies"
                  type="number"
                  min="1"
                  max="1000"
                  defaultValue="1"
                  required
                />
              </Field>
              <Field label="Open from">
                <input name="opening_on" type="date" defaultValue={today()} required />
              </Field>
              <Field label="Application deadline">
                <input name="deadline" type="date" />
              </Field>
              <button className="button">Open position</button>
            </Form>
          </details>
        )}
      </section>
      <section className="panel">
        <header>
          <h2>Candidates</h2>
          <p>
            Candidate contact details and notes are visible only to authorized recruitment and HR
            members.
          </p>
        </header>
        {candidates.map((candidate) => (
          <div className="people-expansion-card" key={candidate.id}>
            <div>
              <h3>{candidate.data.name}</h3>
              <p>
                {candidate.data.email || candidate.data.phone} ·{' '}
                {candidate.data.source || 'Source not recorded'}
              </p>
            </div>
            <span className={'status-badge ' + candidate.status}>
              {candidate.data.employee_id ? 'Hired' : 'Candidate'}
            </span>
          </div>
        ))}
        {canRecruit && (
          <details className="people-expansion-form">
            <summary>Add candidate</summary>
            <Form
              submit={async (d) => {
                await api('/people/recruitment/candidates', 'POST', {
                  expected_version: 0,
                  name: d.name,
                  email: d.email,
                  phone: d.phone,
                  source: d.source,
                  private_notes: d.private_notes,
                });
                onSaved('Candidate added to the private recruitment pipeline.');
              }}
            >
              <Field label="Candidate name">
                <input name="name" required maxLength={160} />
              </Field>
              <Field label="Email">
                <input name="email" type="email" maxLength={200} />
              </Field>
              <Field label="Phone">
                <input name="phone" maxLength={80} />
              </Field>
              <Field label="Source">
                <input name="source" maxLength={160} />
              </Field>
              <Field label="Private recruiter notes">
                <textarea name="private_notes" maxLength={4000} />
              </Field>
              <button className="button">Save candidate</button>
            </Form>
          </details>
        )}
      </section>
      <section className="panel">
        <header>
          <h2>Applications</h2>
          <p>Move applications forward through screening, interview, assessment and offer.</p>
        </header>
        {applications.map((application) => (
          <div className="people-expansion-card people-application-card" key={application.id}>
            <div>
              <h3>{application.candidate.name}</h3>
              <p>
                {application.opening.position_title} · {application.stage}
              </p>
              <p>
                {application.data.interview_on
                  ? 'Interview: ' + application.data.interview_on
                  : 'No interview date'}
                {application.data.decision_reason ? ' · ' + application.data.decision_reason : ''}
              </p>
            </div>
            {canRecruit && application.stage !== 'hired' && application.stage !== 'rejected' && (
              <Form
                submit={async (d) => {
                  await api('/people/recruitment/applications/' + application.id, 'PUT', {
                    ...application.data,
                    expected_version: application.version,
                    stage: d.stage,
                    interview_on: d.interview_on || null,
                  });
                  onSaved('Application moved to ' + d.stage + '.');
                }}
              >
                <Field label="Next stage">
                  <select name="stage" defaultValue={application.stage}>
                    {(
                      {
                        new: ['new', 'screening', 'rejected'],
                        screening: ['screening', 'interview', 'assessment', 'rejected'],
                        interview: ['interview', 'assessment', 'offer', 'rejected'],
                        assessment: ['assessment', 'offer', 'rejected'],
                        offer: ['offer', 'rejected'],
                      } as Record<string, string[]>
                    )[application.stage]?.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Interview date">
                  <input
                    name="interview_on"
                    type="date"
                    defaultValue={application.data.interview_on || ''}
                  />
                </Field>
                <button className="secondary-button">Save stage</button>
              </Form>
            )}
            {canHR && application.stage === 'offer' && (
              <Form
                submit={async (d) => {
                  await api(
                    '/people/recruitment/applications/' + application.id + '/hire',
                    'POST',
                    {
                      expected_version: application.version,
                      employee_number: d.employee_number,
                      start_on: d.start_on,
                      manager_id: d.manager_id || null,
                      linked_user_id: null,
                    },
                  );
                  onSaved('Candidate hired into the canonical employee register.');
                }}
              >
                <Field label="Employee number">
                  <input name="employee_number" required maxLength={60} />
                </Field>
                <Field label="Start date">
                  <input name="start_on" type="date" defaultValue={today()} required />
                </Field>
                <Field label="Reporting manager">
                  <select name="manager_id">
                    <option value="">No manager</option>
                    {employees
                      .filter((e) => e.status === 'active')
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.data.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <button className="button">Create employee and hire</button>
              </Form>
            )}
          </div>
        ))}
        {!applications.length && (
          <p>
            No applications yet. Add a candidate and an opening before recording an application.
          </p>
        )}
        {canRecruit &&
          (ownRecruiter || canHR) &&
          !!candidates.length &&
          !!openings.filter((o) => o.data.status === 'open').length && (
            <details className="people-expansion-form">
              <summary>Start application</summary>
              <Form
                submit={async (d) => {
                  await api('/people/recruitment/applications', 'POST', {
                    expected_version: 0,
                    candidate_id: d.candidate_id,
                    opening_id: d.opening_id,
                    stage: 'new',
                    recruiter_id: canHR ? d.recruiter_id : ownRecruiter,
                    interview_on: null,
                    assessment_notes: '',
                    decision_reason: '',
                  });
                  onSaved('Application created.');
                }}
              >
                <Field label="Candidate">
                  <select name="candidate_id" required>
                    {candidates
                      .filter((c) => !c.data.employee_id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.data.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Opening">
                  <select name="opening_id" required>
                    {openings
                      .filter((o) => o.data.status === 'open')
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.position_title}
                        </option>
                      ))}
                  </select>
                </Field>
                {canHR && (
                  <Field label="Recruiter">
                    <select name="recruiter_id" defaultValue={ownRecruiter || ''} required>
                      <option value="">Choose recruiter</option>
                      {employees
                        .filter((e) => ['active', 'onboarding'].includes(e.status))
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.data.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <button className="button">Create application</button>
              </Form>
            </details>
          )}
      </section>
    </div>
  );
}

export function PeopleTimeOffCalendar({ api, scope }: { api: API; scope: string }) {
  const [period, setPeriod] = useState({ from: startOfMonth(today()), to: endOfMonth(today()) }),
    [calendar, setCalendar] = useState<any>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    setCalendar(null);
    api('/people/leave-calendar?' + new URLSearchParams(period))
      .then((r) => {
        if (live) setCalendar(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [scope, period, api]);
  return (
    <section className="o-flat-section">
      <header className="section-heading">
        <div>
          <h2>Time Off calendar</h2>
          <p>Calendar rows show private leave reasons only to the employee and authorized HR.</p>
        </div>
        <Form className="o-inline-filter-form" submit={async (d) => setPeriod({ from: d.from, to: d.to })}>
          <Field label="From">
            <input name="from" type="date" defaultValue={period.from} required />
          </Field>
          <Field label="To">
            <input name="to" type="date" defaultValue={period.to} required />
          </Field>
          <button className="secondary-button">Apply dates</button>
        </Form>
      </header>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {calendar && (
        <>
          <p>
            {calendar.period.from} – {calendar.period.to} · {calendar.timezone}
          </p>
          <div className="people-calendar-list">
            {calendar.holidays.map((holiday: any) => (
              <div className="people-calendar-row holiday" key={'holiday-' + holiday.date}>
                <strong>{holiday.date}</strong>
                <span>{holiday.name}</span>
                <span>Public holiday</span>
              </div>
            ))}
            {calendar.data.map((entry: any) => (
              <div className={'people-calendar-row ' + entry.status} key={entry.id}>
                <strong>
                  {entry.from}
                  {entry.to !== entry.from ? ' – ' + entry.to : ''}
                </strong>
                <span>
                  {entry.employee_name} · {entry.label}
                </span>
                <span>
                  {entry.status}
                  {entry.units_milli ? ' · ' + entry.units_milli / 1000 + ' configured days' : ''}
                </span>
              </div>
            ))}
          </div>
          {!calendar.data.length && !calendar.holidays.length && (
            <p>No visible leave or employer holidays in this period.</p>
          )}
          <p>{calendar.notice}</p>
        </>
      )}
    </section>
  );
}

export function PeopleOverview({
  api,
  scope,
  configuration,
}: {
  api: API;
  scope: string;
  configuration: any;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    period = { from: today().slice(0, 7) + '-01', to: today() };
  useEffect(() => {
    let live = true;
    if (configuration.access.hr_view) {
      const search = new URLSearchParams(period).toString();
      Promise.all([api('/people/report?' + search), api('/people/report/expansion?' + search)])
        .then(([workforce, expansion]) => {
          if (live) setData({ workforce, expansion });
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }
    return () => {
      live = false;
    };
  }, [scope, configuration.access.hr_view]);
  if (!configuration.access.hr_view)
    return (
      <section className="panel">
        <h2>People overview</h2>
        <p>
          Open your employee profile or view the reporting lines and records shared with your
          account.
        </p>
      </section>
    );
  return (
    <section className="o-flat-section">
      <header>
        <h2>People overview</h2>
        <p>
          Operational snapshot · {period.from} to {period.to}. Compensation is excluded.
        </p>
      </header>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {data ? (
        <>
          <div className="people-metric-row">
            <div>
              <strong>{data.expansion.workforce.total_employees}</strong>
              <span>Total employees</span>
            </div>
            <div>
              <strong>{data.expansion.workforce.active_employees}</strong>
              <span>Active employees</span>
            </div>
            <div>
              <strong>{data.expansion.workforce.onboarding_employees}</strong>
              <span>Onboarding</span>
            </div>
            <div>
              <strong>{data.expansion.positions.active}</strong>
              <span>Active positions</span>
            </div>
            <div>
              <strong>{data.expansion.recruitment.openings}</strong>
              <span>Openings</span>
            </div>
            <div>
              <strong>{data.expansion.recruitment.applicants}</strong>
              <span>Active applicants</span>
            </div>
            <div>
              <strong>{data.expansion.recruitment.hired_in_period}</strong>
              <span>Hires in period</span>
            </div>
            <div>
              <strong>{data.expansion.workforce.pending_leave_requests}</strong>
              <span>Pending leave requests</span>
            </div>
            <div>
              <strong>{data.expansion.workforce.employees_on_approved_leave_today}</strong>
              <span>On approved leave today</span>
            </div>
            <div>
              <strong>{data.expansion.workforce.open_attendance_sessions}</strong>
              <span>Open attendance sessions</span>
            </div>
            <div>
              <strong>{data.expansion.workforce.attendance_missing_checkout_reviews}</strong>
              <span>Missing-checkout reviews</span>
            </div>
            <div>
              <strong>{data.expansion.performance.pending_reviews}</strong>
              <span>Reviews to complete</span>
            </div>
            <div>
              <strong>{data.expansion.lifecycle.open_cases}</strong>
              <span>Open lifecycle cases</span>
            </div>
            <div>
              <strong>{data.expansion.certifications.expiring_next_90_days}</strong>
              <span>Certificates expiring next 90 days</span>
            </div>
          </div>
          <h3>Active employees by department</h3>
          {data.expansion.workforce.active_by_department.map((department: any) => (
            <p key={department.id}>
              {department.name}: {department.active_employees}
            </p>
          ))}
        </>
      ) : (
        <p role="status">Loading authorized workforce summary…</p>
      )}
      {data && (
        <>
          <p>{data.expansion.notice}</p>
          <p>{data.workforce.definitions}</p>
        </>
      )}
    </section>
  );
}

export function PeopleAttendanceAnalysis({ api, scope }: { api: API; scope: string }) {
  const [period, setPeriod] = useState({ from: today().slice(0, 7) + '-01', to: today() }),
    [data, setData] = useState<any>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    setData(null);
    api('/people/attendance/analysis?' + new URLSearchParams(period))
      .then((v) => {
        if (live) setData(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [scope, period, api]);
  return (
    <section className="o-flat-section">
      <header className="section-heading">
        <div>
          <h2>Attendance analysis</h2>
          <p>Recorded attendance is not payroll or proof of location.</p>
        </div>
        <Form className="o-inline-filter-form" submit={async (d) => setPeriod({ from: d.from, to: d.to })}>
          <Field label="From">
            <input name="from" type="date" defaultValue={period.from} required />
          </Field>
          <Field label="To">
            <input name="to" type="date" defaultValue={period.to} required />
          </Field>
          <button className="secondary-button">Apply dates</button>
        </Form>
      </header>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="people-metric-row">
            <strong>{data.summary.sessions} sessions</strong>
            <strong>{data.summary.open_sessions} open</strong>
            <strong>{data.summary.missing_checkout_reviews} check-outs for review</strong>
            <strong>{data.summary.schedule_reviews} schedule flags</strong>
            <strong>{(data.summary.recorded_seconds / 3600).toFixed(1)} recorded hours</strong>
          </div>
          <p>
            {data.schedules.configured
              ? 'Schedule configured · ' + data.schedules.timezone
              : data.schedules.notice}
          </p>
          <div className="people-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Duration</th>
                  <th>Schedule review</th>
                  <th>Review</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.employee_name}</td>
                    <td>
                      {new Date(r.check_in).toLocaleString(undefined, {
                        timeZone: data.schedules.timezone || 'Africa/Nairobi',
                      })}
                    </td>
                    <td>
                      {r.check_out
                        ? new Date(r.check_out).toLocaleString(undefined, {
                            timeZone: data.schedules.timezone || 'Africa/Nairobi',
                          })
                        : 'Open'}
                    </td>
                    <td>
                      {r.duration_seconds === null
                        ? '—'
                        : (r.duration_seconds / 3600).toFixed(2) + ' h'}
                    </td>
                    <td>
                      {r.schedule_review
                        ? [
                            r.schedule_review.outside_configured_workday
                              ? 'Outside configured workday'
                              : '',
                            r.schedule_review.late_arrival_minutes
                              ? `Late arrival ${r.schedule_review.late_arrival_minutes} min`
                              : '',
                            r.schedule_review.early_departure_minutes
                              ? `Early departure ${r.schedule_review.early_departure_minutes} min`
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : '—'}
                    </td>
                    <td>{r.exception || '—'}</td>
                    <td>{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.data.length && <p>No attendance records in this period.</p>}
          <p>{data.notice}</p>
        </>
      )}
    </section>
  );
}

export function PeoplePerformance({ api, scope, configuration, employees, onSaved }: Props) {
  const [goals, setGoals] = useState<any[]>([]),
    [appraisals, setAppraisals] = useState<any[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    void Promise.allSettled([
      api('/people/goals').then((r) => {
        if (live) setGoals(r.data);
      }),
      api('/people/appraisals').then((r) => {
        if (live) setAppraisals(r.data);
      }),
    ]).then((rs) => {
      if (live) {
        const failed = rs.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (failed) setError(failed.reason?.message || 'Performance data unavailable.');
      }
    });
    return () => {
      live = false;
    };
  }, [scope, api]);
  const canWrite = configuration.access.performance_write && configuration.service_active,
    own = configuration.employee_id;
  return (
    <div className="people-expansion-grid">
      <section className="panel">
        <h2>Goals</h2>
        <p>
          Goals record employee development and progress. Work links are checked against separate
          Work access.
        </p>
        {goals.map((goal) => (
          <div className="people-expansion-card" key={goal.id}>
            <div>
              <h3>{goal.data.title}</h3>
              <p>
                {employees.find((e) => e.id === goal.data.employee_id)?.data.name || 'Employee'} ·
                due {goal.data.deadline || 'not set'} · {goal.data.status}
              </p>
              <p>{goal.data.description}</p>
              {goal.data.employee_id === own && (
                <Form
                  submit={async (d) => {
                    await api('/people/goals/' + goal.id + '/progress', 'POST', {
                      expected_version: goal.version,
                      progress: Number(d.progress),
                    });
                    onSaved('Goal progress saved.');
                  }}
                >
                  <Field label="Progress">
                    <input
                      name="progress"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      defaultValue={goal.data.progress}
                    />
                  </Field>
                  <button className="secondary-button">Update my progress</button>
                </Form>
              )}
            </div>
            <strong>{goal.data.progress}%</strong>
          </div>
        ))}
        {!goals.length && <p>No authorized goals.</p>}
        {canWrite && (
          <details className="people-expansion-form">
            <summary>Create goal</summary>
            <Form
              submit={async (d) => {
                await api('/people/goals', 'POST', {
                  expected_version: 0,
                  employee_id: d.employee_id,
                  title: d.title,
                  description: d.description,
                  start_on: d.start_on,
                  deadline: d.deadline || null,
                  progress: 0,
                  status: 'active',
                  skill_ids: [],
                  work_task_id: null,
                });
                onSaved('Performance goal saved.');
              }}
            >
              <Field label="Employee">
                <select name="employee_id" required>
                  {employees
                    .filter((e) => ['active', 'onboarding'].includes(e.status))
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.data.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Goal">
                <input name="title" required maxLength={160} />
              </Field>
              <Field label="Description">
                <textarea name="description" maxLength={3000} />
              </Field>
              <div className="form-grid">
                <Field label="Start">
                  <input name="start_on" type="date" defaultValue={today()} required />
                </Field>
                <Field label="Deadline">
                  <input name="deadline" type="date" />
                </Field>
              </div>
              <button className="button">Save goal</button>
            </Form>
          </details>
        )}
      </section>
      <section className="panel">
        <h2>Appraisals</h2>
        <p>
          Self assessments are private to the employee and assigned reviewers; manager feedback
          follows the employer sharing policy.
        </p>
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        {appraisals.map((review) => (
          <div className="people-expansion-card" key={review.id}>
            <div>
              <h3>
                {employees.find((e) => e.id === review.data.employee_id)?.data.name || 'Employee'} ·{' '}
                {review.data.state}
              </h3>
              <p>
                {review.data.period_start} – {review.data.period_end}
                {review.data.review_on ? ' · Review ' + review.data.review_on : ''}
              </p>
              {review.data.self_assessment && (
                <p>
                  <strong>Self assessment:</strong> {review.data.self_assessment}
                </p>
              )}
              {review.data.manager_assessment && (
                <p>
                  <strong>Manager assessment:</strong> {review.data.manager_assessment}
                </p>
              )}
              {review.data.feedback && (
                <p>
                  <strong>Feedback:</strong> {review.data.feedback}
                </p>
              )}
            </div>
            {review.data.employee_id === own &&
              ['scheduled', 'in_progress'].includes(review.data.state) && (
                <Form
                  submit={async (d) => {
                    await api('/people/appraisals/' + review.id + '/self-assessment', 'POST', {
                      expected_version: review.version,
                      self_assessment: d.self_assessment,
                    });
                    onSaved('Self assessment submitted for manager review.');
                  }}
                >
                  <Field label="My self assessment">
                    <textarea
                      name="self_assessment"
                      maxLength={4000}
                      defaultValue={review.data.self_assessment || ''}
                    />
                  </Field>
                  <button className="secondary-button">Submit self assessment</button>
                </Form>
              )}
            {canWrite && review.data.state === 'pending_review' && (
              <Form
                submit={async (d) => {
                  await api('/people/appraisals/' + review.id, 'PUT', {
                    ...review.data,
                    expected_version: review.version,
                    state: 'completed',
                    manager_assessment: d.manager_assessment,
                    skills_development: d.skills_development,
                    feedback: d.feedback,
                    private_manager_notes: review.data.private_manager_notes || '',
                  });
                  onSaved('Appraisal completed and recorded.');
                }}
              >
                <Field label="Manager assessment">
                  <textarea name="manager_assessment" maxLength={4000} required />
                </Field>
                <Field label="Skills development">
                  <textarea name="skills_development" maxLength={3000} />
                </Field>
                <Field label="Feedback for employee">
                  <textarea name="feedback" maxLength={3000} />
                </Field>
                <button className="button">Complete appraisal</button>
              </Form>
            )}
          </div>
        ))}
        {!appraisals.length && <p>No authorized appraisal records.</p>}
        {canWrite && (
          <details className="people-expansion-form">
            <summary>Schedule appraisal</summary>
            <Form
              submit={async (d) => {
                await api('/people/appraisals', 'POST', {
                  expected_version: 0,
                  employee_id: d.employee_id,
                  reviewer_id: d.reviewer_id,
                  period_start: d.period_start,
                  period_end: d.period_end,
                  review_on: d.review_on || null,
                  state: 'scheduled',
                  self_assessment: '',
                  manager_assessment: '',
                  skills_development: '',
                  feedback: '',
                  private_manager_notes: '',
                  goal_ids: [],
                });
                onSaved('Appraisal scheduled.');
              }}
            >
              <Field label="Employee">
                <select name="employee_id" required>
                  {employees
                    .filter((e) => ['active', 'onboarding'].includes(e.status))
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.data.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Reviewer">
                <select name="reviewer_id" defaultValue={own || ''} required>
                  <option value="">Choose reviewer</option>
                  {employees
                    .filter((e) => e.status === 'active')
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.data.name}
                      </option>
                    ))}
                </select>
              </Field>
              <div className="form-grid">
                <Field label="Period from">
                  <input name="period_start" type="date" required />
                </Field>
                <Field label="Period to">
                  <input name="period_end" type="date" required />
                </Field>
              </div>
              <Field label="Review date">
                <input name="review_on" type="date" />
              </Field>
              <button className="button">Schedule review</button>
            </Form>
          </details>
        )}
      </section>
    </div>
  );
}

export function PeopleLifecycle({ api, scope, configuration, employees, onSaved }: Props) {
  const [plans, setPlans] = useState<any[]>([]),
    [cases, setCases] = useState<any[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    void Promise.allSettled([
      api('/people/lifecycle/plans').then((r) => {
        if (live) setPlans(r.data);
      }),
      api('/people/lifecycle/cases').then((r) => {
        if (live) setCases(r.data);
      }),
    ]).then((rs) => {
      if (live) {
        const fail = rs.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (fail) setError(fail.reason?.message || 'Lifecycle data unavailable.');
      }
    });
    return () => {
      live = false;
    };
  }, [scope, api]);
  if (!configuration.access.hr_view) return null;
  return (
    <section className="panel">
      <h2>Employee lifecycle</h2>
      <p>
        Reusable onboarding and offboarding checklists. Completing offboarding changes the employee
        status to inactive and retains historical records.
      </p>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <details>
        <summary>Lifecycle plans</summary>
        {plans.map((p) => (
          <div className="people-expansion-card" key={p.id}>
            <div>
              <h3>{p.data.name}</h3>
              <p>
                {p.data.direction} · {p.data.tasks.length} tasks · {p.status}
              </p>
            </div>
          </div>
        ))}
      </details>
      {configuration.access.hr_write && configuration.service_active && (
        <>
          <details className="people-expansion-form">
            <summary>Create lifecycle plan</summary>
            <Form
              submit={async (d) => {
                const tasks = String(d.tasks)
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((title) => ({ title, due_offset_days: 0 }));
                await api('/people/lifecycle/plans', 'POST', {
                  expected_version: 0,
                  name: d.name,
                  direction: d.direction,
                  department_id: null,
                  position_id: null,
                  tasks,
                  active: true,
                });
                onSaved('Lifecycle plan saved.');
              }}
            >
              <Field label="Plan name">
                <input name="name" required maxLength={160} />
              </Field>
              <Field label="Direction">
                <select name="direction">
                  <option value="onboarding">Onboarding</option>
                  <option value="offboarding">Offboarding</option>
                </select>
              </Field>
              <Field label="Checklist tasks · one per line">
                <textarea name="tasks" required maxLength={6000} />
              </Field>
              <button className="button">Save plan</button>
            </Form>
          </details>
          {plans.some((p) => p.status === 'active') && employees.length > 0 && (
            <details className="people-expansion-form">
              <summary>Start employee lifecycle</summary>
              <Form
                submit={async (d) => {
                  await api('/people/lifecycle/cases', 'POST', {
                    expected_version: 0,
                    employee_id: d.employee_id,
                    plan_id: d.plan_id,
                    effective_on: d.effective_on,
                    departure_reason: d.departure_reason,
                  });
                  onSaved('Lifecycle checklist started.');
                }}
              >
                <Field label="Employee">
                  <select name="employee_id" required>
                    {employees
                      .filter((e) => ['active', 'onboarding'].includes(e.status))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.data.name} · {e.status}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Plan">
                  <select name="plan_id" required>
                    {plans
                      .filter((p) => p.status === 'active')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.data.name} · {p.data.direction}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Effective date">
                  <input name="effective_on" type="date" defaultValue={today()} required />
                </Field>
                <Field label="Departure reason · HR only">
                  <textarea name="departure_reason" maxLength={2000} />
                </Field>
                <button className="button">Start checklist</button>
              </Form>
            </details>
          )}
        </>
      )}
      <h3>Open lifecycle cases</h3>
      {cases
        .filter((c) => c.status === 'open')
        .map((record) => (
          <div className="people-lifecycle-case" key={record.id}>
            <h4>
              {employees.find((e) => e.id === record.root_id)?.data.name || 'Employee'} ·{' '}
              {record.data.direction}
            </h4>
            <p>
              {record.data.plan_name} · effective {record.data.effective_on}
            </p>
            {record.data.tasks.map((task: any, index: number) => (
              <Form
                key={index}
                submit={async (d) => {
                  await api('/people/lifecycle/cases/' + record.id + '/tasks', 'PUT', {
                    expected_version: record.version,
                    task_index: index,
                    done: d.done === 'on',
                    note: d.note,
                  });
                  onSaved('Lifecycle task updated.');
                }}
              >
                <label className="checkbox-field">
                  <input type="checkbox" name="done" defaultChecked={task.done} />
                  {task.title} · due {task.due_on}
                </label>
                <input
                  name="note"
                  placeholder="Task note"
                  maxLength={1000}
                  defaultValue={task.note}
                />
                <button className="quiet-button">Save task</button>
              </Form>
            ))}
            {record.data.tasks.every((t: any) => t.done) && (
              <Form
                submit={async () => {
                  await api('/people/lifecycle/cases/' + record.id + '/complete', 'POST', {
                    expected_version: record.version,
                  });
                  onSaved(
                    record.data.direction === 'offboarding'
                      ? 'Offboarding complete; employee retained as inactive.'
                      : 'Onboarding complete; employee activated.',
                  );
                }}
              >
                <button className="button">Complete lifecycle</button>
              </Form>
            )}
          </div>
        ))}
    </section>
  );
}

export function PeopleProfileExpansion({
  api,
  scope,
  employee,
  access,
  onSaved,
}: {
  api: API;
  scope: string;
  employee: any;
  access: any;
  onSaved: (message?: string) => void;
}) {
  const [resume, setResume] = useState<any[]>([]),
    [skills, setSkills] = useState<any[]>([]),
    [certifications, setCertifications] = useState<any[]>([]),
    [catalogue, setCatalogue] = useState<any[]>([]),
    [privateProfile, setPrivateProfile] = useState<any>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const requests: [string, (v: any) => void][] = [
      ['/people/employees/' + employee.id + '/resume', (v) => setResume(v.data)],
      ['/people/employees/' + employee.id + '/skills', (v) => setSkills(v.data)],
      ['/people/employees/' + employee.id + '/certifications', (v) => setCertifications(v.data)],
    ];
    if (access.hr_view) {
      requests.push(['/people/employees/' + employee.id + '/private-profile', setPrivateProfile]);
      requests.push(['/people/skills', (v) => setCatalogue(v.data)]);
    }
    void Promise.allSettled(
      requests.map(async ([path, apply]) => {
        try {
          const value = await api(path);
          if (live) apply(value);
        } catch (e) {
          if (live) setError((e as Error).message);
        }
      }),
    );
    return () => {
      live = false;
    };
  }, [scope, employee.id, access.hr_view, api]);
  return (
    <section className="panel">
      <h3>Professional history and qualifications</h3>
      {error && (
        <p className="alert" role="status">
          Some profile sections are unavailable: {error}
        </p>
      )}
      <div className="people-profile-columns">
        <div>
          <h4>Resume</h4>
          {resume.map((r: any) => (
            <div className="people-expansion-card" key={r.id}>
              <div>
                <strong>{r.data.title}</strong>
                <p>
                  {r.data.organization} · {r.data.from_on || 'Date not recorded'}
                  {r.data.to_on ? ' – ' + r.data.to_on : ''}
                </p>
                {r.data.description && <p>{r.data.description}</p>}
              </div>
            </div>
          ))}
          {access.hr_write || (employee.access.self_service && employee.data.self_service) ? (
            <details>
              <summary>Add professional history</summary>
              <Form
                submit={async (d) => {
                  await api('/people/employees/' + employee.id + '/resume', 'POST', {
                    expected_version: 0,
                    title: d.title,
                    organization: d.organization,
                    description: d.description,
                    from_on: d.from_on || null,
                    to_on: d.to_on || null,
                  });
                  onSaved('Professional history saved.');
                }}
              >
                <Field label="Experience title">
                  <input name="title" required maxLength={160} />
                </Field>
                <Field label="Organization">
                  <input name="organization" maxLength={180} />
                </Field>
                <div className="form-grid">
                  <Field label="From">
                    <input name="from_on" type="date" />
                  </Field>
                  <Field label="To">
                    <input name="to_on" type="date" />
                  </Field>
                </div>
                <Field label="Description">
                  <textarea name="description" maxLength={3000} />
                </Field>
                <button className="button">Save experience</button>
              </Form>
            </details>
          ) : null}
        </div>
        <div>
          <h4>Skills</h4>
          {skills.map((s: any) => (
            <div className="people-expansion-card" key={s.id}>
              <div>
                <strong>{s.data.skill_name}</strong>
                <p>
                  {s.data.proficiency} · {s.data.years_experience} years{' '}
                  {s.data.verified ? '· HR verified' : ''}
                </p>
              </div>
            </div>
          ))}
          {access.hr_write && catalogue.length > 0 && (
            <details>
              <summary>Add skill</summary>
              <Form
                submit={async (d) => {
                  await api('/people/employees/' + employee.id + '/skills', 'POST', {
                    expected_version: 0,
                    skill_id: d.skill_id,
                    proficiency: d.proficiency,
                    years_experience: Number(d.years),
                    verified: d.verified === 'on',
                  });
                  onSaved('Employee skill recorded.');
                }}
              >
                <Field label="Skill">
                  <select name="skill_id" required>
                    {catalogue
                      .filter((s: any) => s.status === 'active')
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.data.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Proficiency">
                  <select name="proficiency">
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="expert">Expert</option>
                  </select>
                </Field>
                <Field label="Years of experience">
                  <input name="years" type="number" min="0" max="80" step="0.5" defaultValue="0" />
                </Field>
                <label className="checkbox-field">
                  <input name="verified" type="checkbox" /> HR verified
                </label>
                <button className="button">Record skill</button>
              </Form>
            </details>
          )}
        </div>
        <div>
          <h4>Certifications</h4>
          {certifications.map((c: any) => (
            <div className="people-expansion-card" key={c.id}>
              <div>
                <strong>{c.data.name}</strong>
                <p>
                  {c.data.issuer} ·{' '}
                  {c.data.expires_on ? 'Expires ' + c.data.expires_on : 'No expiry recorded'}
                </p>
              </div>
            </div>
          ))}
          {access.hr_write && (
            <details>
              <summary>Add certification</summary>
              <Form
                submit={async (d) => {
                  await api('/people/employees/' + employee.id + '/certifications', 'POST', {
                    expected_version: 0,
                    name: d.name,
                    issuer: d.issuer,
                    credential_reference: d.reference,
                    issued_on: d.issued_on || null,
                    expires_on: d.expires_on || null,
                    reminder_days: Number(d.reminder_days),
                  });
                  onSaved('Certification metadata saved.');
                }}
              >
                <Field label="Certification">
                  <input name="name" required maxLength={160} />
                </Field>
                <Field label="Issuer">
                  <input name="issuer" required maxLength={180} />
                </Field>
                <Field label="Credential reference">
                  <input name="reference" maxLength={160} />
                </Field>
                <div className="form-grid">
                  <Field label="Issued">
                    <input name="issued_on" type="date" />
                  </Field>
                  <Field label="Expires">
                    <input name="expires_on" type="date" />
                  </Field>
                </div>
                <Field label="Reminder days before expiry">
                  <input name="reminder_days" type="number" min="0" max="365" defaultValue="30" />
                </Field>
                <button className="button">Save certificate metadata</button>
              </Form>
            </details>
          )}
        </div>
      </div>
      {access.hr_view && (
        <div className="people-private-profile">
          <h4>Private employee information · HR only</h4>
          {privateProfile?.data && (
            <p>
              Legal name: {privateProfile.data.legal_name || 'Not recorded'} · Emergency contact:{' '}
              {privateProfile.data.emergency_contact_name || 'Not recorded'} · Work permit expiry:{' '}
              {privateProfile.data.work_permit_expiry || 'Not recorded'}
            </p>
          )}
          <details>
            <summary>
              {privateProfile?.data ? 'Edit private information' : 'Record private information'}
            </summary>
            <Form
              submit={async (d) => {
                await api('/people/employees/' + employee.id + '/private-profile', 'PUT', {
                  expected_version: privateProfile?.version || 0,
                  legal_name: d.legal_name,
                  private_email: d.private_email,
                  private_phone: d.private_phone,
                  birthday: d.birthday || null,
                  place_of_birth: d.place_of_birth,
                  gender: d.gender || null,
                  emergency_contact_name: d.emergency_contact_name,
                  emergency_contact_phone: d.emergency_contact_phone,
                  visa_reference: d.visa_reference,
                  work_permit_reference: d.work_permit_reference,
                  work_permit_expiry: d.work_permit_expiry || null,
                  private_notes: d.private_notes,
                });
                onSaved('Private profile saved.');
              }}
            >
              <div className="form-grid">
                <Field label="Legal name">
                  <input
                    name="legal_name"
                    maxLength={160}
                    defaultValue={privateProfile?.data?.legal_name || ''}
                  />
                </Field>
                <Field label="Private email">
                  <input
                    name="private_email"
                    type="email"
                    defaultValue={privateProfile?.data?.private_email || ''}
                  />
                </Field>
                <Field label="Private phone">
                  <input
                    name="private_phone"
                    maxLength={80}
                    defaultValue={privateProfile?.data?.private_phone || ''}
                  />
                </Field>
                <Field label="Birthday">
                  <input
                    name="birthday"
                    type="date"
                    defaultValue={privateProfile?.data?.birthday || ''}
                  />
                </Field>
                <Field label="Emergency contact">
                  <input
                    name="emergency_contact_name"
                    maxLength={160}
                    defaultValue={privateProfile?.data?.emergency_contact_name || ''}
                  />
                </Field>
                <Field label="Emergency contact phone">
                  <input
                    name="emergency_contact_phone"
                    maxLength={80}
                    defaultValue={privateProfile?.data?.emergency_contact_phone || ''}
                  />
                </Field>
                <Field label="Visa reference">
                  <input
                    name="visa_reference"
                    maxLength={120}
                    defaultValue={privateProfile?.data?.visa_reference || ''}
                  />
                </Field>
                <Field label="Work permit reference">
                  <input
                    name="work_permit_reference"
                    maxLength={120}
                    defaultValue={privateProfile?.data?.work_permit_reference || ''}
                  />
                </Field>
                <Field label="Work permit expiry">
                  <input
                    name="work_permit_expiry"
                    type="date"
                    defaultValue={privateProfile?.data?.work_permit_expiry || ''}
                  />
                </Field>
              </div>
              <Field label="Private HR notes">
                <textarea
                  name="private_notes"
                  maxLength={3000}
                  defaultValue={privateProfile?.data?.private_notes || ''}
                />
              </Field>
              <button className="button">Save HR private information</button>
            </Form>
          </details>
        </div>
      )}
    </section>
  );
}
