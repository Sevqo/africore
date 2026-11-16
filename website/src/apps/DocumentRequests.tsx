import { useEffect, useState } from 'react';
import { Field, Form, type API } from '../operations/UI';
import { Overlay } from '../components/Overlay';
import { DocumentFolderPicker, readDocumentFile } from './DocumentEditors';

const relatedSourceKinds = [
  ['customer', 'Customer'],
  ['invoice', 'Invoice'],
  ['sales_quotation', 'Sales quotation'],
  ['sales_order', 'Sales order'],
  ['expense', 'Expense'],
  ['purchase_order', 'Purchase order'],
  ['supplier_bill', 'Supplier bill'],
  ['employee', 'Employee'],
  ['work_task', 'Work task'],
  ['verification', 'Business identity review'],
] as const;

function eatDateTimeLocal(value: Date) {
  return new Date(value.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
function localDeadline() {
  return eatDateTimeLocal(new Date(Date.now() + 7 * 86400000));
}
function fromEatDateTimeLocal(value: string) {
  return new Date(value + ':00+03:00').toISOString();
}

function RequestRow({
  request: r,
  actorId,
  members,
  api,
  onChanged,
  onOpen,
  canSubmit,
}: {
  request: any;
  actorId: string;
  canSubmit: boolean;
  members: any[];
  api: API;
  onChanged: () => void;
  onOpen: (id: string) => void;
}) {
  const [file, setFile] = useState<File | undefined>(),
    [uploadPhase, setUploadPhase] = useState(''),
    [preparationProgress, setPreparationProgress] = useState<number | null>(null);
  const member = (id: string) =>
    members.find((m) => m.id === id)?.display_name ||
    members.find((m) => m.id === id)?.email ||
    'Current member';
  return (
    <article className="document-request-card">
      <div className="document-request-heading">
        <div>
          <h3>{r.data.title}</h3>
          <p>
            {r.effective_status.replaceAll('_', ' ')} · Requested by {member(r.owner_id)} · Assigned
            to {member(r.stage)}
          </p>
        </div>
        <span className={'document-status document-status-' + r.effective_status}>
          {r.effective_status.replaceAll('_', ' ')}
        </span>
      </div>
      <p>
        Due {new Date(r.data.expires_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
      </p>
      {r.folder_name && <p>Destination folder: {r.folder_name}</p>}
      {r.data.folder_id && !r.folder_name && (
        <p>The requested destination folder is no longer available.</p>
      )}
      {r.data.note && <p>{r.data.note}</p>}
      {r.data.source && <p>Related record: {r.data.source.source_kind.replaceAll('_', ' ')}</p>}
      {r.data.cancellation_reason && <p>Cancellation reason: {r.data.cancellation_reason}</p>}
      {r.data.document_id && (
        <button className="secondary-button" onClick={() => onOpen(r.data.document_id)}>
          Open submitted file and exact review
        </button>
      )}
      {canSubmit && r.effective_status === 'requested' && r.stage === actorId && (
        <Form
          className="document-request-submit"
          submit={async (d) => {
            if (!file) throw new Error('Choose the requested file.');
            try {
              setUploadPhase('Preparing selected file…');
              const content = await readDocumentFile(file, setPreparationProgress);
              setUploadPhase('Sending submission to private Documents storage…');
              await api('/document-requests/' + r.id + '/submit', 'POST', {
                expected_version: r.version,
                file: content,
                note: d.note,
              });
              onChanged();
            } finally {
              setUploadPhase('');
              setPreparationProgress(null);
            }
          }}
        >
          <p>
            Submission saves a private retained file and starts a separate exact-version review.
            Current source and personnel permissions are checked again. No broader role is granted.
          </p>
          <Field label="Requested file · PDF, PNG, JPEG or UTF-8 text · up to 2 MiB">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt"
              required
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </Field>
          <Field label="Submission note">
            <textarea name="note" maxLength={2000} />
          </Field>
          {uploadPhase && (
            <p role="status" aria-live="polite">
              {uploadPhase}
              {preparationProgress !== null ? ` ${preparationProgress}%` : ''}
              {preparationProgress !== null && <progress max={100} value={preparationProgress} />}
            </p>
          )}
          <button className="button">Submit requested document</button>
        </Form>
      )}
      {['requested', 'in_review'].includes(r.status) && (
        <details className="document-request-cancel">
          <summary>Cancel request</summary>
          <p>
            Cancellation closes the request and pending review. Retained file content remains in
            Documents.
          </p>
          <Form
            submit={async (d) => {
              await api('/document-requests/' + r.id + '/cancel', 'POST', {
                expected_version: r.version,
                reason: d.reason,
              });
              onChanged();
            }}
          >
            <Field label="Cancellation reason">
              <input name="reason" required minLength={8} maxLength={2000} />
            </Field>
            <button className="secondary-button">Cancel this request</button>
          </Form>
        </details>
      )}
    </article>
  );
}

export function DocumentRequests({
  api,
  scope,
  members,
  memberError = '',
  retryMembers,
  canCreate,
  createRequested = false,
  onCreateClosed,
  onOpen,
}: {
  api: API;
  scope: string;
  members: any[];
  memberError?: string;
  retryMembers?: () => void;
  canCreate: boolean;
  createRequested?: boolean;
  onCreateClosed?: () => void;
  onOpen: (id: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [offset, setOffset] = useState(0),
    [creating, setCreating] = useState(false),
    [folderId, setFolderId] = useState<string | null>(null),
    [assigneeId, setAssigneeId] = useState(''),
    [assigneeSearch, setAssigneeSearch] = useState(''),
    [assigneeOffset, setAssigneeOffset] = useState(0),
    [assigneeOptions, setAssigneeOptions] = useState<any>(null),
    [assigneeError, setAssigneeError] = useState(''),
    [assigneeRetry, setAssigneeRetry] = useState(0),
    [sourceKind, setSourceKind] = useState(''),
    [sourceId, setSourceId] = useState(''),
    [sourceSearch, setSourceSearch] = useState(''),
    [sourceOffset, setSourceOffset] = useState(0),
    [sourceOptions, setSourceOptions] = useState<any>(null),
    [sourceError, setSourceError] = useState(''),
    [sourceRetry, setSourceRetry] = useState(0),
    [deadline, setDeadline] = useState(localDeadline());
  useEffect(() => {
    if (createRequested) setCreating(true);
  }, [createRequested]);
  useEffect(() => {
    let current = true;
    setAssigneeOptions(null);
    setAssigneeError('');
    if (!creating)
      return () => {
        current = false;
      };
    const parameters = new URLSearchParams({
      q: assigneeSearch.trim(),
      offset: String(assigneeOffset),
    });
    if (sourceKind && sourceId) {
      parameters.set('source_kind', sourceKind);
      parameters.set('source_id', sourceId);
    }
    if (folderId) parameters.set('folder_id', folderId);
    const timer = setTimeout(() => {
      api('/document-request-assignees?' + parameters.toString())
        .then((result) => {
          if (current) setAssigneeOptions(result);
        })
        .catch((e) => {
          if (current) setAssigneeError(e.message || 'Eligible submitters could not be loaded.');
        });
    }, 160);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [
    api,
    creating,
    scope,
    sourceKind,
    sourceId,
    folderId,
    assigneeSearch,
    assigneeOffset,
    assigneeRetry,
  ]);
  useEffect(() => {
    let current = true;
    setSourceOptions(null);
    setSourceError('');
    if (!creating || !sourceKind)
      return () => {
        current = false;
      };
    const timer = setTimeout(() => {
      api(
        '/document-source-options?source_kind=' +
          encodeURIComponent(sourceKind) +
          '&q=' +
          encodeURIComponent(sourceSearch.trim()) +
          '&offset=' +
          sourceOffset,
      )
        .then((result) => {
          if (current) setSourceOptions(result);
        })
        .catch((e) => {
          if (current)
            setSourceError(e.message || 'Authorized source records could not be loaded.');
        });
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [api, creating, scope, sourceKind, sourceSearch, sourceOffset, sourceRetry]);
  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    api('/document-requests?offset=' + offset)
      .then((d) => {
        if (current) setData(d);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [api, scope, revision, offset]);
  const changed = () => setRevision((v) => v + 1);
  const closeCreate = () => {
    setCreating(false);
    setFolderId(null);
    setAssigneeId('');
    setAssigneeSearch('');
    setAssigneeOffset(0);
    setSourceKind('');
    setSourceId('');
    setSourceSearch('');
    setSourceOffset(0);
    onCreateClosed?.();
  };
  return (
    <section className="documents-requests">
      <div className="documents-section-title">
        <div>
          <h2>Document requests</h2>
          <p>Request, submit and review the exact retained file version.</p>
        </div>
        {canCreate && (
          <button className="button" onClick={() => setCreating(true)}>
            New Request
          </button>
        )}
      </div>
      <p className="documents-honesty-note">
        Submission requires existing operational membership and source authority. Notifications stay
        inside AfriCore; no email delivery is claimed.
      </p>
      {memberError && (
        <p role="status">
          Member names for existing requests could not be loaded. The submitter selector checks
          current membership and source access on the server. {memberError}{' '}
          {retryMembers && (
            <button className="quiet-button" onClick={retryMembers}>
              Retry members
            </button>
          )}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading participant-bound requests…</p>}
      {data?.data.map((r: any) => (
        <RequestRow
          key={r.id + ':' + r.version}
          request={r}
          canSubmit={data.can_submit}
          actorId={data.actor_id}
          members={members}
          api={api}
          onChanged={changed}
          onOpen={onOpen}
        />
      ))}
      {data?.data.length === 0 && (
        <p className="documents-empty">No requests are visible to you yet.</p>
      )}
      <p className="documents-coverage">{data?.notice}</p>
      <div className="form-actions">
        <button
          className="secondary-button"
          disabled={!offset}
          onClick={() => setOffset((v) => Math.max(0, v - 50))}
        >
          Previous
        </button>
        <button
          className="secondary-button"
          disabled={!data?.has_more}
          onClick={() => setOffset((v) => v + 50)}
        >
          More requests
        </button>
      </div>
      {data?.truncated && (
        <p role="status">This view covers the first 5,000 participant-bound requests.</p>
      )}
      {creating && (
        <Overlay onClose={closeCreate}>
          <section
            className="panel work-editor document-request-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-request-title"
          >
            <div className="documents-dialog-heading">
              <h2 id="document-request-title">Request a document</h2>
              <button
                className="quiet-button"
                type="button"
                onClick={closeCreate}
                aria-label="Close request dialog"
              >
                ×
              </button>
            </div>
            <Field label="Search eligible submitters">
              <input
                type="search"
                value={assigneeSearch}
                maxLength={100}
                placeholder="Search current workspace members"
                onChange={(event) => {
                  setAssigneeSearch(event.target.value);
                  setAssigneeOffset(0);
                  setAssigneeId('');
                }}
              />
            </Field>
            {assigneeError && (
              <p role="alert">
                {assigneeError}{' '}
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => setAssigneeRetry((value) => value + 1)}
                >
                  Retry submitter search
                </button>
              </p>
            )}
            {!assigneeOptions && !assigneeError && (
              <p role="status">Checking current eligible submitters…</p>
            )}
            {assigneeOptions?.data.length === 0 && !assigneeError && (
              <p role="status">
                No other current member can submit to the selected source and folder. Choose a
                different source or folder, or cancel this request.
              </p>
            )}
            <Form
              className="document-request-form"
              disabled={!assigneeOptions?.data.length || !!assigneeError}
              submit={async (d) => {
                if (!assigneeOptions.data.some((member: any) => member.id === assigneeId))
                  throw new Error('Choose a currently eligible submitter from the loaded results.');
                await api('/document-requests', 'POST', {
                  title: d.title,
                  note: d.note,
                  assignee: d.assignee,
                  expires_at: fromEatDateTimeLocal(d.expires_at),
                  folder_id: folderId,
                  ...(sourceKind && sourceId
                    ? { source: { source_kind: sourceKind, source_id: sourceId } }
                    : {}),
                });
                closeCreate();
                changed();
              }}
            >
              <Field label="Document name">
                <input name="title" required maxLength={160} />
              </Field>
              <Field label="Request to">
                <select
                  name="assignee"
                  required
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                >
                  <option value="" disabled>
                    Choose a current operational member
                  </option>
                  {assigneeOptions?.data.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.email}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Due date and time · East Africa time">
                <input
                  name="expires_at"
                  type="datetime-local"
                  required
                  min={eatDateTimeLocal(new Date(Date.now() + 2 * 60000))}
                  max={eatDateTimeLocal(new Date(Date.now() + 30 * 86400000 - 60000))}
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                />
              </Field>
              <Field label="Instructions">
                <textarea name="note" maxLength={3000} />
              </Field>
              <Field label="Related record (optional)">
                <select
                  value={sourceKind}
                  onChange={(event) => {
                    setSourceKind(event.target.value);
                    setSourceId('');
                    setFolderId(null);
                    setAssigneeId('');
                    setSourceSearch('');
                    setSourceOffset(0);
                    setAssigneeOffset(0);
                  }}
                >
                  <option value="">No related record</option>
                  {relatedSourceKinds.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {sourceKind && (
                <>
                  <Field label="Search current records you can access">
                    <input
                      type="search"
                      value={sourceSearch}
                      maxLength={100}
                      placeholder="Search related records"
                      onChange={(event) => {
                        setSourceSearch(event.target.value);
                        setSourceOffset(0);
                        setSourceId('');
                        setFolderId(null);
                        setAssigneeId('');
                      }}
                    />
                  </Field>
                  {sourceError && (
                    <p role="alert">
                      {sourceError}{' '}
                      <button
                        className="quiet-button"
                        type="button"
                        onClick={() => setSourceRetry((value) => value + 1)}
                      >
                        Retry record search
                      </button>
                    </p>
                  )}
                  {!sourceOptions && !sourceError && (
                    <p role="status">Loading authorized related records…</p>
                  )}
                  {sourceOptions && (
                    <>
                      <Field label="Related record">
                        <select
                          value={sourceId}
                          onChange={(event) => {
                            setSourceId(event.target.value);
                            setFolderId(null);
                            setAssigneeId('');
                            setAssigneeOffset(0);
                          }}
                        >
                          <option value="">No related record</option>
                          {sourceOptions.data.map((option: any) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <p className="documents-coverage">{sourceOptions.notice}</p>
                      {sourceOptions.truncated && (
                        <p role="status">Search is limited to the first 5,000 recent records.</p>
                      )}
                      <div className="form-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={!sourceOffset}
                          onClick={() => setSourceOffset((value) => Math.max(0, value - 50))}
                        >
                          Previous records
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={!sourceOptions.has_more}
                          onClick={() => setSourceOffset((value) => value + 50)}
                        >
                          More records
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              <DocumentFolderPicker
                api={api}
                value={folderId}
                onChange={(value) => {
                  setFolderId(value);
                  setAssigneeId('');
                  setAssigneeOffset(0);
                }}
                label="Destination folder"
                hidePersonnel={sourceKind !== 'employee' || !sourceId}
                employeeId={sourceKind === 'employee' && sourceId ? sourceId : undefined}
              />
              {assigneeOptions && (
                <>
                  <p className="documents-coverage">{assigneeOptions.notice}</p>
                  {assigneeOptions.truncated && (
                    <p role="status">Submitter search covers up to 5,000 current members.</p>
                  )}
                  <div className="form-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!assigneeOffset}
                      onClick={() => {
                        setAssigneeOffset((value) => Math.max(0, value - 50));
                        setAssigneeId('');
                      }}
                    >
                      Previous submitters
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!assigneeOptions.has_more}
                      onClick={() => {
                        setAssigneeOffset((value) => value + 50);
                        setAssigneeId('');
                      }}
                    >
                      More submitters
                    </button>
                  </div>
                </>
              )}
              <p className="documents-honesty-note">
                The requester and assigned submitter must both have current access to the selected
                folder. The server validates membership, folder access and expiry again on submit.
              </p>
              <div className="form-actions">
                <button className="button">Create Request</button>
                <button className="secondary-button" type="button" onClick={closeCreate}>
                  Cancel
                </button>
              </div>
            </Form>
          </section>
        </Overlay>
      )}
    </section>
  );
}

function approvalValue(value: any) {
  if (typeof value !== 'string') return value || {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function DocumentReviewQueue({
  api,
  scope,
  members,
  onOpen,
}: {
  api: API;
  scope: string;
  members: any[];
  onOpen: (id: string, versionId: string, version: number, file: any) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [offset, setOffset] = useState(0);
  const memberName = (id: string) => {
    const member = members.find((value) => value.id === id);
    return member?.display_name || member?.email || 'Current workspace member';
  };
  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    api('/business/approvals?offset=' + offset)
      .then((result) => {
        if (current) setData(result);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [api, scope, revision, offset]);
  const reviews = data?.data.filter((a: any) => a.action === 'document_review') || [];
  return (
    <section className="documents-requests">
      <div className="documents-section-title">
        <div>
          <h2>Document reviews</h2>
          <p>Review decisions apply to an exact retained document version.</p>
        </div>
      </div>
      <p className="documents-honesty-note">
        A review records a human decision. It does not establish that file content is safe,
        truthful, legally valid or independently verified.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading authorized review queue…</p>}
      {reviews.map((approval: any) => {
        const summary = approvalValue(approval.review_summary),
          parameters = approvalValue(approval.parameters),
          review = parameters.document_review || {},
          file = summary.file || {};
        return (
          <article className="document-request-card" key={approval.id}>
            <div className="document-request-heading">
              <div>
                <h3>{summary.name || 'Private document review'}</h3>
                <p>Version-bound review · {approval.status}</p>
              </div>
              <span className="document-status">{approval.status}</span>
            </div>
            <dl className="document-review-facts">
              <div>
                <dt>Requested by</dt>
                <dd>{memberName(approval.requester)}</dd>
              </div>
              <div>
                <dt>Reviewer</dt>
                <dd>{memberName(approval.approver)}</dd>
              </div>
              <div>
                <dt>Document revision</dt>
                <dd>{review.document_version || 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Requested</dt>
                <dd>
                  {new Date(approval.created_at).toLocaleString('en-KE', {
                    timeZone: 'Africa/Nairobi',
                  })}
                </dd>
              </div>
              {approval.decided_at && (
                <div>
                  <dt>Decision date</dt>
                  <dd>
                    {new Date(approval.decided_at).toLocaleString('en-KE', {
                      timeZone: 'Africa/Nairobi',
                    })}
                  </dd>
                </div>
              )}
            </dl>
            <p>
              {file.filename || 'File name unavailable'} · {formatReviewSize(file.size_bytes)} ·
              SHA-256 {file.sha256 || 'not available'}
            </p>
            {approval.source_changed && (
              <p role="status">
                The document changed after this review request. This approval cannot certify the
                current file.
              </p>
            )}
            {review.version_id && approval.resource_id && (
              <button
                className="secondary-button"
                onClick={() =>
                  onOpen(approval.resource_id, review.version_id, review.document_version, file)
                }
              >
                Preview the exact reviewed version
              </button>
            )}
            <p>
              The review records a human decision on this retained version; it is not independent
              verification.
            </p>
            {approval.can_decide && (
              <Form
                submit={async (value) => {
                  await api('/approvals/' + approval.id + '/decide', 'POST', value);
                  setRevision((v) => v + 1);
                }}
              >
                <Field label="Decision">
                  <select name="decision">
                    <option value="approved">Accept this retained version</option>
                    <option value="rejected">Reject this retained version</option>
                  </select>
                </Field>
                <Field label="Decision reason">
                  <textarea name="reason" required minLength={5} maxLength={1000} />
                </Field>
                <button className="button">Record review decision</button>
              </Form>
            )}
          </article>
        );
      })}
      {data && reviews.length === 0 && (
        <p className="documents-empty">
          No authorized document reviews are pending or recorded in this queue.
        </p>
      )}
      <div className="form-actions">
        <button
          className="secondary-button"
          disabled={!offset}
          onClick={() => setOffset((value) => Math.max(0, value - 100))}
        >
          Previous reviews
        </button>
        <button
          className="secondary-button"
          disabled={!data?.has_more}
          onClick={() => setOffset((value) => value + 100)}
        >
          More reviews
        </button>
      </div>
      {data?.truncated && (
        <p className="documents-coverage">
          Review paging covers the first 5,000 currently authorized approvals.
        </p>
      )}
    </section>
  );
}

function formatReviewSize(bytes = 0) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
    : Math.round(bytes / 1024) + ' KB';
}
