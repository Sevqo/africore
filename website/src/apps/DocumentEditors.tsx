import { readDocumentFile, safeDocumentFilename } from './document-files';
export { readDocumentFile } from './document-files';
import { useEffect, useState } from 'react';
import { Field, Form, type API } from '../operations/UI';
import { Overlay } from '../components/Overlay';
export const privateDocumentPolicy = {
  visibility: 'private',
  grants: [],
  folder_id: null,
  inherit_folder: false,
  employee_id: null,
};
function eatDateTimeLocal(value: string) {
  return new Date(Date.parse(value) + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
function fromEatDateTimeLocal(value: string) {
  return value ? new Date(value + ':00+03:00').toISOString() : null;
}
export function DocumentFolderPicker({
  api,
  value,
  onChange,
  label = 'Destination folder',
  allowNoFolder = true,
  excludeId,
  employeeId,
  hidePersonnel = false,
}: {
  api: API;
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  allowNoFolder?: boolean;
  excludeId?: string;
  employeeId?: string | null;
  hidePersonnel?: boolean;
}) {
  const [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0),
    [location, setLocation] = useState<{ id: string; name: string }[]>([]),
    [data, setData] = useState<any>(null),
    [selectedName, setSelectedName] = useState(''),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    const folderId = location.at(-1)?.id || 'root',
      scope = search.trim() ? '' : '&folder_id=' + encodeURIComponent(folderId);
    api(
      '/documents?view=recent&kind=folder&editable_only=true' +
        scope +
        '&hide_personnel=' +
        hidePersonnel +
        (employeeId ? '&employee_id=' + encodeURIComponent(employeeId) : '') +
        '&q=' +
        encodeURIComponent(search.trim()) +
        '&offset=' +
        offset,
    )
      .then((result) => {
        if (current) setData(result);
      })
      .catch((e) => {
        if (current) setError(e.message || 'Folders could not be loaded.');
      });
    return () => {
      current = false;
    };
  }, [api, search, location, offset, retry, hidePersonnel, employeeId]);
  useEffect(() => {
    let current = true;
    if (value) {
      api('/documents/' + value)
        .then((result) => {
          if (current) setSelectedName(result.data.name);
        })
        .catch(() => {
          if (current) setSelectedName('Current destination folder');
        });
    } else setSelectedName('');
    return () => {
      current = false;
    };
  }, [api, value]);
  const browse = (folder: any) => {
    setSearch('');
    setOffset(0);
    setLocation((previous) => [...previous, { id: folder.id, name: folder.data.name }]);
  };
  return (
    <div className="document-folder-picker">
      <Field label={label}>
        <div className="document-folder-current">
          <span>{value ? selectedName || 'Selected folder' : 'No folder selected'}</span>
          {value && (
            <button type="button" className="quiet-button" onClick={() => onChange(null)}>
              Clear
            </button>
          )}
        </div>
      </Field>
      <Field label="Search eligible folders">
        <input
          value={search}
          maxLength={100}
          placeholder="Search folders you can manage"
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
        />
      </Field>
      <div className="document-folder-breadcrumb" aria-label="Folder picker location">
        <button
          type="button"
          className="quiet-button"
          onClick={() => {
            setSearch('');
            setLocation([]);
            setOffset(0);
          }}
        >
          All folders
        </button>
        {location.map((folder, index) => (
          <span key={folder.id}>
            /{' '}
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                setSearch('');
                setLocation((current) => current.slice(0, index + 1));
                setOffset(0);
              }}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </div>
      {allowNoFolder && (
        <button type="button" className="secondary-button" onClick={() => onChange(null)}>
          Save at workspace root
        </button>
      )}
      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" className="quiet-button" onClick={() => setRetry((v) => v + 1)}>
            Retry folders
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Loading authorized folders…</p>}
      <ul className="document-folder-options">
        {data?.data
          .filter((folder: any) => folder.id !== excludeId)
          .map((folder: any) => (
            <li key={folder.id}>
              <button
                type="button"
                className="document-folder-choice"
                onClick={() => onChange(folder.id)}
              >
                <span aria-hidden="true">▱</span>
                <span>{folder.data.name}</span>
                {value === folder.id && <strong>Selected</strong>}
              </button>
              <button
                type="button"
                className="quiet-button"
                aria-label={'Open folder ' + folder.data.name}
                onClick={() => browse(folder)}
              >
                Open
              </button>
            </li>
          ))}
      </ul>
      {data?.data.length === 0 && <p>No eligible folders in this location.</p>}
      {data?.truncated && (
        <p role="status">Folder search covers the first 5,000 authorized records.</p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={!offset}
          onClick={() => setOffset((current) => Math.max(0, current - 50))}
        >
          Previous
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!data?.has_more}
          onClick={() => setOffset((current) => current + 50)}
        >
          More folders
        </button>
      </div>
      <small>
        Only folders where you currently have edit permission are selectable. The server checks the
        destination and inherited access again when you save.
      </small>
    </div>
  );
}
export function DocumentEditor({
  document: d,
  initialFile,
  initialFolderId = null,
  initialKind,
  source,
  api,
  onSaved,
  onClose,
}: {
  document?: any;
  initialFile?: File;
  initialFolderId?: string | null;
  initialKind?: 'file' | 'folder';
  source?: { source_kind: string; source_id: string };
  api: API;
  onSaved: (document?: any) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | undefined>(initialFile),
    [kind, setKind] = useState<'file' | 'folder'>(initialKind || 'file'),
    [folderId, setFolderId] = useState<string | null>(initialFolderId),
    [uploadPhase, setUploadPhase] = useState(''),
    [preparationProgress, setPreparationProgress] = useState<number | null>(null);
  return (
    <Overlay onClose={onClose}>
      <section
        className="panel work-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-editor-title"
      >
        <h2 id="document-editor-title">
          {d ? 'Edit file information' : 'Upload file or create folder'}
        </h2>
        <p>
          New files and folders start private. Review recipients and folder inheritance separately.
          Permitted files: PDF, PNG, JPEG and UTF-8 .txt, up to 2 MiB. Files are not
          malware-scanned.
        </p>
        <Form
          submit={async (data) => {
            try {
              const metadata = {
                name: data.name,
                description: data.description,
                tags: data.tags
                  .split(',')
                  .map((v: string) => v.trim())
                  .filter(Boolean),
              };
              if (d) {
                setUploadPhase('Saving document metadata…');
                const result = await api('/documents/' + d.id, 'PUT', {
                  expected_version: d.version,
                  metadata,
                });
                onSaved(result);
              } else {
                let uploadedFile;
                if (kind === 'file' && file) {
                  setUploadPhase('Preparing selected file…');
                  uploadedFile = await readDocumentFile(file, setPreparationProgress);
                  setUploadPhase('Sending file to private Documents storage…');
                } else setUploadPhase('Creating private folder…');
                const result = await api('/documents', 'POST', {
                  metadata,
                  kind,
                  policy:
                    source?.source_kind === 'employee'
                      ? {
                          ...privateDocumentPolicy,
                          employee_id: source.source_id,
                          folder_id: folderId,
                        }
                      : { ...privateDocumentPolicy, folder_id: folderId },
                  ...(source ? { source } : {}),
                  ...(uploadedFile ? { file: uploadedFile } : {}),
                });
                onSaved(result);
              }
            } finally {
              setUploadPhase('');
              setPreparationProgress(null);
            }
          }}
        >
          {!d && !initialKind && (
            <Field label="New document kind">
              <select value={kind} onChange={(e) => setKind(e.target.value as 'file' | 'folder')}>
                <option value="file">File upload</option>
                <option value="folder">Private folder</option>
              </select>
            </Field>
          )}
          <Field label="Document name">
            <input
              name="name"
              required
              maxLength={160}
              defaultValue={d?.data.name || initialFile?.name || ''}
            />
          </Field>
          <Field label="Document description">
            <textarea
              name="description"
              maxLength={3000}
              defaultValue={d?.data.description || ''}
            />
          </Field>
          <Field label="Tags separated by commas">
            <input name="tags" defaultValue={d?.data.tags.join(', ') || ''} />
          </Field>
          {!d && kind === 'file' && (
            <Field label="Select private file">
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                onChange={(e) => setFile(e.target.files?.[0])}
              />
            </Field>
          )}
          {!d && (
            <DocumentFolderPicker
              api={api}
              value={folderId}
              onChange={setFolderId}
              label={kind === 'folder' ? 'Parent folder' : 'Destination folder'}
              employeeId={source?.source_kind === 'employee' ? source.source_id : null}
              hidePersonnel={source?.source_kind !== 'employee'}
            />
          )}
          {file && (
            <p>
              {file.name} · {file.size} bytes · Stored filename:{' '}
              {(() => {
                try {
                  return safeDocumentFilename(file.name);
                } catch {
                  return 'Unsupported file extension';
                }
              })()}
            </p>
          )}
          {uploadPhase && (
            <p role="status" aria-live="polite">
              {uploadPhase}
              {preparationProgress !== null ? ` ${preparationProgress}%` : ''}
              {preparationProgress !== null && <progress max={100} value={preparationProgress} />}
            </p>
          )}
          <div className="form-actions">
            <button className="button" disabled={!d && kind === 'file' && !file}>
              {d ? 'Save file information' : 'Create private document'}
            </button>
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </Form>
      </section>
    </Overlay>
  );
}
export function DocumentPolicyEditor({
  document: d,
  members,
  memberError = '',
  retryMembers,
  api,
  onSaved,
  onClose,
  copy = false,
}: {
  document: any;
  members: any[];
  memberError?: string;
  retryMembers?: () => void;
  api: API;
  onSaved: (document?: any) => void;
  onClose: () => void;
  copy?: boolean;
}) {
  const [policy, setPolicy] = useState({
      ...d.data.policy,
      grants: copy ? [] : d.data.policy.grants,
      visibility: copy ? 'private' : d.data.policy.visibility,
      folder_id: copy ? null : d.data.policy.folder_id,
      inherit_folder: copy ? false : d.data.policy.inherit_folder,
    }),
    [reviewed, setReviewed] = useState(false),
    [memberSearch, setMemberSearch] = useState('');
  const change = (field: string, value: any) => {
    setReviewed(false);
    setPolicy((p: any) => ({ ...p, [field]: value }));
  };
  return (
    <Overlay onClose={onClose}>
      <section
        className="panel work-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-policy-title"
      >
        <h2 id="document-policy-title">
          {copy ? 'Copy retained file' : 'Review file access and location'}
        </h2>
        <p>
          Only the file owner changes sharing and location. Current workspace membership is required
          for every recipient. Personnel files retain their classification and require current
          People authority as well as a file grant. Sharing covers the retained versions of this
          file. Download restrictions cannot recall bytes already downloaded or copied.
        </p>
        <dl className="document-sharing-summary">
          <div>
            <dt>Current owner</dt>
            <dd>
              {members.find((member) => member.id === d.owner_id)?.display_name ||
                members.find((member) => member.id === d.owner_id)?.email ||
                'Current workspace member'}
            </dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{policy.folder_id ? 'Selected private folder' : 'Workspace root'}</dd>
          </div>
          <div>
            <dt>Folder access</dt>
            <dd>
              {policy.inherit_folder
                ? 'Inherits current folder access'
                : 'No inherited folder access'}
            </dd>
          </div>
        </dl>
        <Form
          submit={async (data) => {
            const saved = await api(
              '/documents/' + d.id + (copy ? '/copy' : '/policy'),
              copy ? 'POST' : 'PUT',
              copy
                ? {
                    expected_version: d.version,
                    metadata: {
                      name: data.name,
                      description: d.data.description,
                      tags: d.data.tags,
                    },
                    policy,
                  }
                : { expected_version: d.version, policy, acknowledge_access_change: true },
            );
            onSaved(saved);
          }}
        >
          {copy && (
            <Field label="Copy name">
              <input name="name" required maxLength={160} defaultValue={d.data.name + ' copy'} />
            </Field>
          )}
          <Field label="Visibility">
            <select
              value={policy.visibility}
              disabled={!!policy.employee_id}
              onChange={(e) => change('visibility', e.target.value)}
            >
              <option value="private">Owner and explicit recipients only</option>
              <option value="company">All current workspace members may view metadata</option>
            </select>
          </Field>
          <p>Company visibility alone does not grant download permission.</p>
          <DocumentFolderPicker
            api={api}
            value={policy.folder_id}
            onChange={(id) => change('folder_id', id)}
            label="Move into folder"
            allowNoFolder
            excludeId={d.id}
            employeeId={d.employee_id || null}
            hidePersonnel={!d.employee_id}
          />
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={policy.inherit_folder}
              onChange={(e) => change('inherit_folder', e.target.checked)}
            />
            Also inherit current access from the selected folder
          </label>
          <fieldset>
            <legend>Explicit recipients</legend>
            {policy.grants.map((g: any) => (
              <article className="app-price-review" key={g.user_id}>
                <strong>
                  {members.find((m) => m.id === g.user_id)?.display_name ||
                    members.find((m) => m.id === g.user_id)?.email ||
                    'Retained former recipient'}
                </strong>
                <Field label="File permission">
                  <select
                    value={g.permission}
                    onChange={(e) =>
                      change(
                        'grants',
                        policy.grants.map((v: any) =>
                          v.user_id === g.user_id ? { ...v, permission: e.target.value } : v,
                        ),
                      )
                    }
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor (current operational role also required)</option>
                  </select>
                </Field>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={g.download}
                    onChange={(e) =>
                      change(
                        'grants',
                        policy.grants.map((v: any) =>
                          v.user_id === g.user_id ? { ...v, download: e.target.checked } : v,
                        ),
                      )
                    }
                  />
                  May download content
                </label>
                <Field label="Sharing expiry · East Africa time">
                  <input
                    type="datetime-local"
                    value={g.expires_at ? eatDateTimeLocal(g.expires_at) : ''}
                    onChange={(e) =>
                      change(
                        'grants',
                        policy.grants.map((v: any) =>
                          v.user_id === g.user_id
                            ? {
                                ...v,
                                expires_at: fromEatDateTimeLocal(e.target.value),
                              }
                            : v,
                        ),
                      )
                    }
                  />
                </Field>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    change(
                      'grants',
                      policy.grants.filter((v: any) => v.user_id !== g.user_id),
                    )
                  }
                >
                  Remove recipient
                </button>
              </article>
            ))}
            {memberError && (
              <p role="alert">
                Current members could not be loaded: {memberError}{' '}
                {retryMembers && (
                  <button className="quiet-button" type="button" onClick={retryMembers}>
                    Retry members
                  </button>
                )}
              </p>
            )}
            <Field label="Search current members">
              <input
                value={memberSearch}
                maxLength={100}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search by name or email"
              />
            </Field>
            <Field label="Add current recipient">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value)
                    change('grants', [
                      ...policy.grants,
                      {
                        user_id: e.target.value,
                        permission: 'viewer',
                        download: false,
                        expires_at: null,
                      },
                    ]);
                }}
              >
                <option value="">Choose a current member</option>
                {members
                  .filter((m) => !policy.grants.some((g: any) => g.user_id === m.id))
                  .filter((m) =>
                    (m.display_name || m.email || '')
                      .toLowerCase()
                      .includes(memberSearch.toLowerCase()),
                  )
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.email}
                    </option>
                  ))}
              </select>
            </Field>
          </fieldset>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I reviewed the current recipients, destination and inherited access
          </label>
          <div className="form-actions">
            <button className="button" disabled={!reviewed}>
              Confirm reviewed {copy ? 'copy' : 'access and move'}
            </button>
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </Form>
      </section>
    </Overlay>
  );
}
