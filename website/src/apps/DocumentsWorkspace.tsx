import { DataTable } from '../components/DataTable';
import { DocumentRequests, DocumentReviewQueue } from './DocumentRequests';
import { DocumentReviews } from './DocumentReviews';
import { appNavigationEvent } from './AppNavigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Field, Form, type API } from '../operations/UI';
import { Overlay } from '../components/Overlay';
import { DocumentEditor, DocumentPolicyEditor, readDocumentFile } from './DocumentEditors';
import { useIdempotentAPI } from './useIdempotentAPI';

const views = [
  ['all', 'All documents', '▤'],
  ['company', 'Company', '▧'],
  ['mine', 'My Drive', '▱'],
  ['shared', 'Shared with me', '♧'],
  ['recent', 'Recent', '◷'],
  ['starred', 'Starred', '★'],
  ['requests', 'Requests', '↗'],
  ['reviews', 'Reviews', '✓'],
  ['trash', 'Trash', '▣'],
  ['settings', 'Configuration', '⚙'],
];
const labels: Record<string, string> = {
  all: 'All documents',
  recent: 'All documents',
  company: 'Company',
  mine: 'My Drive',
  shared: 'Shared with me',
  starred: 'Starred',
  trash: 'Trash',
};

function bytes(content: string, mime: string) {
  const raw = atob(content),
    buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}
function formatBytes(value = 0) {
  if (value < 1024) return value + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(0) + ' KB';
  return (value / 1024 / 1024).toFixed(1) + ' MB';
}
function fileType(document: any) {
  const type = document?.data?.file?.content_type || '';
  if (type === 'application/pdf') return 'PDF';
  if (type === 'image/png') return 'PNG image';
  if (type === 'image/jpeg') return 'JPEG image';
  if (type === 'text/plain') return 'Text file';
  return document?.kind === 'folder' ? 'Folder' : 'File';
}

export function DocumentsWorkspace({
  api: provided,
  scope,
  section = 'all',
}: {
  api: API;
  scope: string;
  section?: string;
  embedded?: boolean;
}) {
  const api = useIdempotentAPI(provided, scope),
    [view, setView] = useState(views.some((v) => v[0] === section) ? section : 'all'),
    [query, setQuery] = useState(''),
    [tag, setTag] = useState(''),
    [sort, setSort] = useState('recent'),
    [offset, setOffset] = useState(0),
    [listing, setListing] = useState<any>(null),
    [directoryError, setDirectoryError] = useState(''),
    [directoryRetry, setDirectoryRetry] = useState(0),
    [sidebarFolders, setSidebarFolders] = useState<any[]>([]),
    [sidebarError, setSidebarError] = useState(''),
    [sidebarMore, setSidebarMore] = useState(false),
    [sidebarOffset, setSidebarOffset] = useState(0),
    [members, setMembers] = useState<any[]>([]),
    [memberError, setMemberError] = useState(''),
    [memberRetry, setMemberRetry] = useState(0),
    [folderPath, setFolderPath] = useState<any[]>([]),
    [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<any>(null),
    [detailError, setDetailError] = useState(''),
    [versions, setVersions] = useState<any>(null),
    [versionOffset, setVersionOffset] = useState(0),
    [versionsLoading, setVersionsLoading] = useState(false),
    [editing, setEditing] = useState(false),
    [accessEditing, setAccessEditing] = useState(false),
    [copying, setCopying] = useState(false),
    [creating, setCreating] = useState(false),
    [createKind, setCreateKind] = useState<'file' | 'folder'>('file'),
    [initialFile, setInitialFile] = useState<File | undefined>(),
    [file, setFile] = useState<File | undefined>(),
    [versionUploadPhase, setVersionUploadPhase] = useState(''),
    [versionPreparationProgress, setVersionPreparationProgress] = useState<number | null>(null),
    [previewOpen, setPreviewOpen] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [previewVersion, setPreviewVersion] = useState<any>(null),
    [previewScale, setPreviewScale] = useState(100),
    [previewActionsOpen, setPreviewActionsOpen] = useState(false),
    [previewLoading, setPreviewLoading] = useState(false),
    [previewError, setPreviewError] = useState(''),
    [requestCreating, setRequestCreating] = useState(false),
    [newMenu, setNewMenu] = useState(false),
    [layout, setLayout] = useState<'grid' | 'list'>('grid'),
    [showFilters, setShowFilters] = useState(false),
    [showDetails, setShowDetails] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [chosen, setChosen] = useState<string[]>([]),
    [draggingFile, setDraggingFile] = useState(false);
  const requestGeneration = useRef(0),
    contentGeneration = useRef(0);
  const currentFolderId = folderPath.at(-1)?.id || 'root';
  const canCreateHere = !!listing?.can_create && view !== 'trash';
  const apiView = ['all', 'reviews', 'settings', 'requests'].includes(view) ? 'recent' : view;
  const sidebarView = ['mine', 'company'].includes(view) ? view : 'recent';
  const folderScope = useMemo(
    () =>
      folderPath.length
        ? '&folder_id=' + encodeURIComponent(currentFolderId)
        : ['all', 'mine', 'company'].includes(view)
          ? '&folder_id=root'
          : '',
    [folderPath, currentFolderId, view],
  );
  const ownerName = (id: string) =>
    members.find((member) => member.id === id)?.display_name ||
    members.find((member) => member.id === id)?.email ||
    'Workspace member';

  const refresh = (message = '') => {
    setCreating(false);
    setEditing(false);
    setAccessEditing(false);
    setCopying(false);
    setInitialFile(undefined);
    setFile(undefined);
    setRevision((value) => value + 1);
    if (message) setNotice(message);
  };
  const changeView = (next: string) => {
    setView(next);
    setFolderPath([]);
    setOffset(0);
    setSidebarOffset(0);
    setChosen([]);
    setSelected('');
    setDetail(null);
    setPreviewOpen(false);
    setPreview(null);
    setError('');
    setNotice('');
  };
  useEffect(() => {
    if (views.some((item) => item[0] === section)) changeView(section);
    // This effect intentionally follows navigation input from the app shell.
  }, [section]);
  useEffect(() => {
    setListing(null);
    setSelected('');
    setDetail(null);
    setChosen([]);
    setCreating(false);
    setPreviewOpen(false);
    setPreview(null);
    setQuery('');
    setTag('');
    setOffset(0);
    setFolderPath([]);
  }, [scope]);
  useEffect(() => {
    const read = () => {
      const id = new URLSearchParams(location.search).get('document');
      if (id && /^[0-9a-f-]{36}$/i.test(id)) {
        setSelected(id);
        setShowDetails(true);
      }
    };
    read();
    window.addEventListener(appNavigationEvent, read);
    return () => window.removeEventListener(appNavigationEvent, read);
  }, [scope]);
  useEffect(() => {
    let current = true;
    setListing(null);
    setDirectoryError('');
    const params =
      '/documents?view=' +
      apiView +
      '&q=' +
      encodeURIComponent(query.trim()) +
      '&tag=' +
      encodeURIComponent(tag.trim()) +
      '&sort=' +
      sort +
      (view === 'requests' || view === 'reviews' || view === 'settings' ? '' : folderScope) +
      '&offset=' +
      offset;
    api(params)
      .then((result) => {
        if (current) {
          setListing(result);
          setChosen((items) => items.filter((id) => result.data.some((row: any) => row.id === id)));
        }
      })
      .catch((e) => {
        if (current) setDirectoryError(e.message || 'Documents could not be loaded.');
      });
    return () => {
      current = false;
    };
  }, [api, scope, apiView, view, query, tag, sort, folderScope, offset, revision, directoryRetry]);
  useEffect(() => {
    let current = true;
    setSidebarError('');
    api(
      '/documents?view=' +
        sidebarView +
        '&kind=folder&folder_id=root&sort=name&offset=' +
        sidebarOffset,
    )
      .then((result) => {
        if (current) {
          setSidebarFolders(result.data);
          setSidebarMore(result.has_more);
        }
      })
      .catch((e) => {
        if (current) setSidebarError(e.message || 'Folder navigation could not be loaded.');
      });
    return () => {
      current = false;
    };
  }, [api, scope, sidebarView, sidebarOffset, revision]);
  useEffect(() => {
    let current = true;
    setMemberError('');
    api('/team')
      .then((result) => {
        if (current) setMembers(result.data);
      })
      .catch((e) => {
        if (current) setMemberError(e.message || 'Current workspace members could not be loaded.');
      });
    return () => {
      current = false;
    };
  }, [api, scope, revision, memberRetry]);
  useEffect(() => {
    let current = true;
    requestGeneration.current++;
    setDetail(null);
    setDetailError('');
    setVersions(null);
    setVersionsLoading(false);
    setPreview(null);
    setPreviewError('');
    if (selected)
      api('/documents/' + selected)
        .then((result) => {
          if (current) setDetail(result);
        })
        .catch((e) => {
          if (current)
            setDetailError(e.message || 'Current document access could not be confirmed.');
        });
    return () => {
      current = false;
    };
  }, [api, scope, selected, revision]);
  useEffect(
    () => () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  async function content(d: any, download: boolean, version?: string) {
    const generation = ++contentGeneration.current;
    setError('');
    setPreviewError('');
    if (!download) setPreviewLoading(true);
    try {
      const result = await api(
        '/documents/' +
          d.id +
          '/content' +
          (version ? '?version_id=' + encodeURIComponent(version) : ''),
      );
      if (generation !== contentGeneration.current) return;
      if (download) {
        const url = URL.createObjectURL(bytes(result.content_base64, result.content_type));
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('Authorized content download prepared.');
      } else if (result.content_type === 'text/plain') {
        const text = await bytes(result.content_base64, result.content_type).text();
        if (generation === contentGeneration.current)
          setPreview({ text, name: result.filename, type: result.content_type });
      } else if (result.content_type.startsWith('image/')) {
        setPreview({
          url: URL.createObjectURL(bytes(result.content_base64, result.content_type)),
          name: result.filename,
          type: result.content_type,
        });
      } else if (result.content_type === 'application/pdf') {
        setPreview({
          url: URL.createObjectURL(bytes(result.content_base64, result.content_type)),
          name: result.filename,
          type: result.content_type,
        });
      } else {
        setPreviewError(
          'This file type has no safe inline preview. Download it through the authorized action.',
        );
      }
    } catch (e) {
      if (generation === contentGeneration.current)
        setPreviewError((e as Error).message || 'The file could not be previewed.');
    } finally {
      if (generation === contentGeneration.current) setPreviewLoading(false);
    }
  }
  useEffect(() => {
    if (!previewOpen || !detail || detail.kind !== 'file') return;
    if (!detail.permissions.download) {
      setPreviewError(
        'This file is visible as metadata, but current access does not permit content preview.',
      );
      return;
    }
    void content(detail, false, previewVersion?.id);
    return () => {
      contentGeneration.current++;
    };
    // Re-fetch content whenever the selected record or exact document revision changes.
  }, [
    previewOpen,
    selected,
    detail?.version,
    detail?.data?.current_version_id,
    previewVersion?.id,
  ]);
  async function history(page = 0) {
    if (!detail) return;
    const generation = requestGeneration.current;
    setVersionsLoading(true);
    try {
      const result = await api('/documents/' + detail.id + '/versions?offset=' + page);
      if (generation === requestGeneration.current) {
        setVersions(result);
        setVersionOffset(page);
      }
    } catch (e) {
      if (generation === requestGeneration.current) setError((e as Error).message);
    } finally {
      if (generation === requestGeneration.current) setVersionsLoading(false);
    }
  }
  async function star(id: string, value: boolean) {
    try {
      await api('/documents/' + id + '/star', 'PUT', { starred: value });
      if (selected === id && detail) setDetail({ ...detail, starred: value });
      setRevision((current) => current + 1);
      setNotice(value ? 'Star saved.' : 'Star removed.');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function openFolder(folder: any) {
    setFolderPath((path) => [...path, { id: folder.id, name: folder.data.name }]);
    setOffset(0);
    setChosen([]);
    setSelected('');
    setShowDetails(false);
  }
  function openFile(document: any, preview = true) {
    setSelected(document.id);
    setShowDetails(true);
    setPreviewOpen(preview);
    setPreview(null);
    setPreviewVersion(null);
    setPreviewScale(100);
    setPreviewActionsOpen(false);
    setVersions(null);
  }
  function openReviewVersion(id: string, versionId: string, documentRevision: number, file: any) {
    changeView('recent');
    setSelected(id);
    setShowDetails(true);
    setPreviewOpen(true);
    setPreview(null);
    setPreviewError('');
    setPreviewVersion({ id: versionId, documentRevision, file });
    setPreviewScale(100);
    setPreviewActionsOpen(false);
  }
  function itemMenu(document: any) {
    setSelected(document.id);
    setShowDetails(true);
    setPreviewOpen(false);
  }
  function dropFile(fileList: FileList | null) {
    if (!canCreateHere || !fileList?.length) return;
    if (fileList.length !== 1) {
      setError('Drop one file at a time so its name, type, size and destination can be reviewed.');
      return;
    }
    setCreateKind('file');
    setInitialFile(fileList[0]);
    setCreating(true);
  }
  const rows = listing?.data || [];
  const locationTitle = folderPath.at(-1)?.name || labels[view] || 'All documents';
  const ownerNameMap = useMemo(
    () => new Map(members.map((member) => [member.id, member.display_name || member.email])),
    [members],
  );

  return (
    <div className="apps-workspace documents-workspace">
      <header className="documents-toolbar">
        <div className="documents-toolbar-title">
          <div className="documents-new-menu">
            <button
              className="button"
              disabled={!canCreateHere}
              onClick={() => setNewMenu((value) => !value)}
            >
              New <span aria-hidden="true">⌄</span>
            </button>
            {newMenu && (
              <div className="documents-new-popover" role="menu" aria-label="Create document">
                <button
                  role="menuitem"
                  onClick={() => {
                    setCreateKind('file');
                    setCreating(true);
                    setInitialFile(undefined);
                    setNewMenu(false);
                  }}
                >
                  ↑ <span>Upload file</span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setCreateKind('folder');
                    setCreating(true);
                    setInitialFile(undefined);
                    setNewMenu(false);
                  }}
                >
                  ▱ <span>New folder</span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    changeView('requests');
                    setRequestCreating(true);
                    setNewMenu(false);
                  }}
                >
                  ↗ <span>Request document</span>
                </button>
              </div>
            )}
          </div>
          <div>
            <span className="documents-app-crumb">Documents</span>
            <h1>{locationTitle}</h1>
          </div>
          {folderPath.length > 0 && (
            <button
              className="quiet-button"
              aria-label="Folder actions"
              onClick={() => itemMenu(folderPath.at(-1))}
            >
              ⚙
            </button>
          )}
        </div>
        <div className="documents-toolbar-search">
          <label aria-label="Search documents">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              maxLength={100}
              placeholder="Search documents…"
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
            />
            <button
              className="quiet-button"
              aria-label="Toggle document filters"
              onClick={() => setShowFilters((value) => !value)}
            >
              ▾
            </button>
          </label>
        </div>
        <div className="documents-toolbar-actions">
          <span className="documents-pagination-count">
            {listing
              ? `${offset + (rows.length ? 1 : 0)}–${offset + rows.length} / ${listing.matching_covered}${listing.truncated ? '+' : ''}`
              : 'Loading'}
          </span>
          <button
            className="secondary-button"
            disabled={!offset}
            onClick={() => setOffset((value) => Math.max(0, value - 50))}
            aria-label="Previous page"
          >
            ‹
          </button>
          <button
            className="secondary-button"
            disabled={!listing?.has_more}
            onClick={() => setOffset((value) => value + 50)}
            aria-label="Next page"
          >
            ›
          </button>
          <div className="documents-view-switch" role="group" aria-label="Document view">
            <button
              className={layout === 'grid' ? 'is-active' : ''}
              aria-pressed={layout === 'grid'}
              onClick={() => setLayout('grid')}
              title="Grid view"
            >
              ▦
            </button>
            <button
              className={layout === 'list' ? 'is-active' : ''}
              aria-pressed={layout === 'list'}
              onClick={() => setLayout('list')}
              title="List view"
            >
              ☷
            </button>
          </div>
          <button
            className="secondary-button documents-details-toggle"
            aria-pressed={showDetails}
            onClick={() => setShowDetails((value) => !value)}
            title="Details panel"
          >
            ⓘ
          </button>
        </div>
      </header>
      {showFilters && !['requests', 'reviews', 'settings'].includes(view) && (
        <div className="documents-filter-row">
          <Field label="Filter by exact tag">
            <input
              value={tag}
              maxLength={60}
              placeholder="Tag name"
              onChange={(event) => {
                setTag(event.target.value);
                setOffset(0);
              }}
            />
          </Field>
          <Field label="Sort">
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setOffset(0);
              }}
            >
              <option value="recent">Recently updated</option>
              <option value="name">Name within covered records</option>
            </select>
          </Field>
          <button
            className="quiet-button"
            onClick={() => {
              setTag('');
              setSort('recent');
              setOffset(0);
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {(error || notice) && (
        <div className="documents-alerts">
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
        </div>
      )}
      <div className="documents-layout">
        <aside className="documents-sidebar" aria-label="Document folders and workspaces">
          <nav className="documents-sidebar-nav">
            {views.slice(0, 6).map(([id, label, icon], index) => (
              <button
                key={index}
                className={view === id && folderPath.length === 0 ? 'is-active' : ''}
                aria-current={view === id && folderPath.length === 0 ? 'page' : undefined}
                onClick={() => changeView(id)}
              >
                <span aria-hidden="true">{icon}</span>
                {label}
              </button>
            ))}
          </nav>
          <div className="documents-sidebar-divider" />
          <div className="documents-sidebar-heading">
            <strong>Folders</strong>
            <button
              className="quiet-button"
              disabled={!canCreateHere}
              onClick={() => {
                setCreateKind('folder');
                setCreating(true);
              }}
            >
              ＋
            </button>
          </div>
          {folderPath.map((folder, index) => (
            <button
              className="documents-sidebar-folder"
              key={folder.id}
              style={{ paddingLeft: 12 + index * 12 }}
              onClick={() => {
                setFolderPath((path) => path.slice(0, index + 1));
                setOffset(0);
              }}
            >
              <span aria-hidden="true">▱</span>
              {folder.name}
            </button>
          ))}
          {sidebarError && (
            <p role="alert" className="documents-sidebar-error">
              {sidebarError}
              <button className="quiet-button" onClick={() => setRevision((value) => value + 1)}>
                Retry
              </button>
            </p>
          )}
          {!sidebarError &&
            sidebarFolders
              .filter((folder) => !folderPath.some((current) => current.id === folder.id))
              .map((folder) => (
                <button
                  className="documents-sidebar-folder"
                  key={folder.id}
                  onClick={() => openFolder(folder)}
                >
                  <span aria-hidden="true">▱</span>
                  {folder.data.name}
                </button>
              ))}
          {sidebarMore && (
            <button
              className="quiet-button documents-sidebar-more"
              onClick={() => setSidebarOffset((value) => value + 50)}
            >
              More folders
            </button>
          )}
          <div className="documents-sidebar-divider" />
          <nav className="documents-sidebar-nav">
            {views.slice(6).map(([id, label, icon]) => (
              <button
                key={id}
                className={view === id ? 'is-active' : ''}
                aria-current={view === id ? 'page' : undefined}
                onClick={() => changeView(id)}
              >
                <span aria-hidden="true">{icon}</span>
                {label}
              </button>
            ))}
          </nav>
          {memberError && (
            <p className="documents-sidebar-error" role="status">
              Member data unavailable{' '}
              <button className="quiet-button" onClick={() => setMemberRetry((value) => value + 1)}>
                Retry
              </button>
            </p>
          )}
        </aside>
        {view === 'requests' ? (
          <main className="documents-main documents-special-view">
            <DocumentRequests
              api={api}
              scope={scope}
              members={members}
              memberError={memberError}
              retryMembers={() => setMemberRetry((value) => value + 1)}
              canCreate={!!listing?.can_create}
              createRequested={requestCreating}
              onCreateClosed={() => setRequestCreating(false)}
              onOpen={(id) => {
                changeView('recent');
                setSelected(id);
                setShowDetails(true);
                setPreviewOpen(true);
                setPreviewVersion(null);
              }}
            />
          </main>
        ) : view === 'reviews' ? (
          <main className="documents-main documents-special-view">
            <DocumentReviewQueue
              api={api}
              scope={scope}
              members={members}
              onOpen={openReviewVersion}
            />
          </main>
        ) : view === 'settings' ? (
          <main className="documents-main documents-settings">
            <h2>Configuration</h2>
            <p>Private document custody, grants and current operational limits.</p>
            <div className="documents-settings-grid">
              <nav aria-label="Document configuration sections">
                {[
                  'Storage limits',
                  'Allowed file types',
                  'Sharing rules',
                  'Version retention',
                  'Trash behavior',
                  'Cross-app links',
                  'Requests and reviews',
                ].map((name) => (
                  <a key={name} href={'#documents-' + name.toLowerCase().replaceAll(' ', '-')}>
                    {name}
                  </a>
                ))}
              </nav>
              <div className="documents-settings-content">
                <section id="documents-storage-limits">
                  <h3>Storage limits</h3>
                  <p>
                    Retained content uses encrypted workspace storage. Trash and historical versions
                    continue to count toward the quota.
                  </p>
                  <div className="documents-quota">
                    <strong>{formatBytes(listing?.storage?.used_bytes || 0)}</strong>
                    <span>
                      {' '}
                      of {formatBytes(listing?.storage?.limit_bytes || 50 * 1024 * 1024)} used
                    </span>
                    <progress
                      max={listing?.storage?.limit_bytes || 50 * 1024 * 1024}
                      value={listing?.storage?.used_bytes || 0}
                    />
                  </div>
                  <p>
                    Maximum file size:{' '}
                    {formatBytes(listing?.storage?.per_file_limit_bytes || 2 * 1024 * 1024)}. Usage
                    is calculated from retained blob records; trashed files remain included.
                  </p>
                </section>
                <section id="documents-allowed-file-types">
                  <h3>Allowed file types</h3>
                  <p>
                    PDF, PNG, JPEG and UTF-8 plain text. Images must pass bounded dimensions and
                    signature checks. File signatures do not establish safety.
                  </p>
                  <p>
                    Files are not malware-scanned. Do not upload content that requires an external
                    malware scan before handling.
                  </p>
                </section>
                <section id="documents-sharing-rules">
                  <h3>Sharing and folder policies</h3>
                  <p>
                    New content starts private. Owners can grant current workspace members Viewer or
                    Editor rights, a separate download right, and an expiry. Company visibility
                    exposes permitted metadata; it does not grant file download.
                  </p>
                  <p>
                    Folder access is inherited only when explicitly selected. Every file and
                    destination is checked again by the service at use time.
                  </p>
                </section>
                <section id="documents-version-retention">
                  <h3>Version retention</h3>
                  <p>
                    New versions append immutable encrypted content and keep the original versions.
                    Each new version uses the file-size and workspace storage limits.
                  </p>
                </section>
                <section id="documents-trash-behavior">
                  <h3>Trash behavior</h3>
                  <p>
                    Trash is recoverable. This interface has no permanent-delete lifecycle or
                    automatic deletion delay, so it never claims physical erasure.
                  </p>
                </section>
                <section id="documents-cross-app-links">
                  <h3>Cross-application links</h3>
                  <p>
                    Supported source relationships are handled by each source application and the
                    Documents service. Linking does not inherit the source record’s audience.
                    Current People and financial source permissions remain separate checks.
                  </p>
                  <p>Automatic filing and file centralization are not configured or claimed.</p>
                </section>
                <section id="documents-requests-and-reviews">
                  <h3>Requests and reviews</h3>
                  <p>
                    Requests use in-app notifications to current eligible members. Reviews are
                    version-bound and do not constitute independent verification. External email
                    delivery is unavailable here.
                  </p>
                </section>
              </div>
            </div>
          </main>
        ) : (
          <main
            className={
              'documents-main ' +
              (showDetails && detail ? 'has-details' : '') +
              (draggingFile ? ' is-drop-target' : '')
            }
            aria-label="Authorized document browser"
            onDragEnter={(event) => {
              if (canCreateHere && event.dataTransfer.types.includes('Files'))
                setDraggingFile(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setDraggingFile(false);
            }}
            onDragOver={(event) => {
              if (canCreateHere) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDraggingFile(false);
              dropFile(event.dataTransfer.files);
            }}
          >
            <div className="documents-browser-heading">
              <div className="documents-breadcrumbs">
                <button
                  onClick={() => {
                    setFolderPath([]);
                    setOffset(0);
                  }}
                >
                  {labels[view] || 'All documents'}
                </button>
                {folderPath.map((folder, index) => (
                  <span key={folder.id}>
                    {' '}
                    /{' '}
                    <button
                      onClick={() => {
                        setFolderPath((path) => path.slice(0, index + 1));
                        setOffset(0);
                      }}
                    >
                      {folder.name}
                    </button>
                  </span>
                ))}
              </div>
              <div className="documents-browser-controls">
                {chosen.length > 0 && (
                  <button
                    className="secondary-button"
                    onClick={async () => {
                      let done = 0;
                      try {
                        for (const id of chosen) {
                          await api('/documents/' + id + '/star', 'PUT', {
                            starred: view !== 'starred',
                          });
                          done++;
                        }
                        setNotice(`${done} selected star${done === 1 ? '' : 's'} updated.`);
                        setChosen([]);
                        setRevision((value) => value + 1);
                      } catch (e) {
                        setError(
                          `${done} changes saved; remaining updates stopped: ${(e as Error).message}`,
                        );
                        setRevision((value) => value + 1);
                      }
                    }}
                  >
                    {view === 'starred' ? 'Remove selected stars' : 'Star selected'}
                  </button>
                )}
                {canCreateHere && (
                  <span className="documents-drop-label">Drop one file here to upload</span>
                )}
              </div>
            </div>
            {directoryError && (
              <div className="documents-load-error" role="alert">
                {directoryError}
                <button
                  className="secondary-button"
                  onClick={() => setDirectoryRetry((value) => value + 1)}
                >
                  Retry
                </button>
              </div>
            )}
            {!listing && !directoryError && (
              <p role="status" className="documents-loading">
                Loading authorized documents…
              </p>
            )}
            {listing && rows.length === 0 && !directoryError && (
              <div className="documents-empty">
                <span aria-hidden="true">▱</span>
                <h2>{query || tag ? 'No matching documents' : 'This folder is empty'}</h2>
                <p>
                  {view === 'trash'
                    ? 'Trash is recoverable; moved files and their retained versions are kept until a deletion lifecycle is configured.'
                    : query || tag
                      ? 'Try another search or remove a filter.'
                      : 'Upload a private file or create a folder to organize this workspace.'}
                </p>
                {canCreateHere && (
                  <div className="form-actions">
                    <button
                      className="button"
                      onClick={() => {
                        setCreateKind('file');
                        setCreating(true);
                      }}
                    >
                      Upload file
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setCreateKind('folder');
                        setCreating(true);
                      }}
                    >
                      New folder
                    </button>
                  </div>
                )}
              </div>
            )}
            {layout === 'grid' && rows.length > 0 && (
              <div className="documents-grid" role="list">
                {rows.map((document: any) => (
                  <article
                    key={document.id}
                    className={
                      'document-card ' + (chosen.includes(document.id) ? 'is-selected' : '')
                    }
                    role="listitem"
                  >
                    <div className="document-card-top">
                      <label
                        className="document-select"
                        aria-label={'Select ' + document.data.name}
                      >
                        <input
                          type="checkbox"
                          checked={chosen.includes(document.id)}
                          onChange={(event) =>
                            setChosen((items) =>
                              event.target.checked
                                ? [...items, document.id]
                                : items.filter((id) => id !== document.id),
                            )
                          }
                        />
                        <span className="sr-only">Select {document.data.name}</span>
                      </label>
                      <button
                        className="document-card-star"
                        aria-label={document.is_starred ? 'Remove star' : 'Add star'}
                        aria-pressed={!!document.is_starred}
                        disabled={view === 'trash'}
                        onClick={() => void star(document.id, !document.is_starred)}
                      >
                        {document.is_starred ? '★' : '☆'}
                      </button>
                      <button
                        className="document-card-menu"
                        aria-label={'Show details and actions for ' + document.data.name}
                        onClick={() => itemMenu(document)}
                      >
                        •••
                      </button>
                    </div>
                    <button
                      className="document-card-preview"
                      onClick={() =>
                        document.doc_kind === 'folder' ? openFolder(document) : openFile(document)
                      }
                      aria-label={
                        (document.doc_kind === 'folder' ? 'Open folder ' : 'Preview ') +
                        document.data.name
                      }
                    >
                      <span
                        className={
                          'document-file-glyph document-file-' +
                          (document.doc_kind === 'folder'
                            ? 'folder'
                            : fileType(document).toLowerCase().replaceAll(' ', '-'))
                        }
                        aria-hidden="true"
                      >
                        {document.doc_kind === 'folder'
                          ? '▱'
                          : fileType(document) === 'PDF'
                            ? 'PDF'
                            : fileType(document).slice(0, 1)}
                      </span>
                    </button>
                    <div className="document-card-meta">
                      <button
                        className="document-card-name"
                        onClick={() =>
                          document.doc_kind === 'folder' ? openFolder(document) : openFile(document)
                        }
                      >
                        {document.data.name}
                      </button>
                      <span>
                        {document.doc_kind === 'folder'
                          ? 'Folder'
                          : fileType(document) +
                            ' · ' +
                            formatBytes(document.data.file?.size_bytes)}
                      </span>
                      <span>
                        {ownerNameMap.get(document.owner_id) || ownerName(document.owner_id)}
                      </span>
                      <span>
                        {new Date(document.updated_at).toLocaleDateString('en-KE', {
                          timeZone: 'Africa/Nairobi',
                        })}
                      </span>
                      {!!document.data.tags?.length && (
                        <div className="document-tags">
                          {document.data.tags.slice(0, 3).map((value: string) => (
                            <span key={value}>{value}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {layout === 'list' && rows.length > 0 && (
              <div className="documents-list-wrap">
                <DataTable className="documents-list">
                  <thead>
                    <tr>
                      <th>
                        <span className="sr-only">Select</span>
                      </th>
                      <th>Name</th>
                      <th>Folder</th>
                      <th>Type</th>
                      <th>Owner</th>
                      <th>Size</th>
                      <th>Last Updated</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((document: any) => (
                      <tr key={document.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={'Select ' + document.data.name}
                            checked={chosen.includes(document.id)}
                            onChange={(event) =>
                              setChosen((items) =>
                                event.target.checked
                                  ? [...items, document.id]
                                  : items.filter((id) => id !== document.id),
                              )
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="document-table-name"
                            onClick={() =>
                              document.doc_kind === 'folder'
                                ? openFolder(document)
                                : openFile(document)
                            }
                          >
                            <span aria-hidden="true">
                              {document.doc_kind === 'folder' ? '▱' : '▤'}
                            </span>
                            {document.data.name}
                          </button>
                        </td>
                        <td>{folderPath.at(-1)?.name || '—'}</td>
                        <td>{fileType(document)}</td>
                        <td>
                          {ownerNameMap.get(document.owner_id) || ownerName(document.owner_id)}
                        </td>
                        <td>
                          {document.doc_kind === 'file'
                            ? formatBytes(document.data.file?.size_bytes)
                            : '—'}
                        </td>
                        <td>
                          {new Date(document.updated_at).toLocaleString('en-KE', {
                            timeZone: 'Africa/Nairobi',
                          })}
                        </td>
                        <td>
                          <span className={'document-status document-status-' + document.status}>
                            {document.status}
                          </span>
                        </td>
                        <td>
                          <button className="quiet-button" onClick={() => itemMenu(document)}>
                            Details
                          </button>
                          <button
                            className="quiet-button"
                            disabled={view === 'trash'}
                            onClick={() => void star(document.id, !document.is_starred)}
                            aria-label={document.is_starred ? 'Remove star' : 'Add star'}
                          >
                            {document.is_starred ? '★' : '☆'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            )}
            {listing?.truncated && (
              <p className="documents-coverage" role="status">
                {listing.notice}
              </p>
            )}
            {showDetails && selected && (
              <aside className="documents-detail-panel" aria-label="Selected document details">
                <div className="documents-detail-heading">
                  <h2>{detail?.data?.name || 'Document details'}</h2>
                  <button
                    className="quiet-button"
                    aria-label="Close details"
                    onClick={() => {
                      setShowDetails(false);
                      setSelected('');
                      setPreviewOpen(false);
                    }}
                  >
                    ×
                  </button>
                </div>
                {detailError && (
                  <p role="alert">
                    {detailError}
                    <button
                      className="quiet-button"
                      onClick={() => setRevision((value) => value + 1)}
                    >
                      Reload
                    </button>
                  </p>
                )}
                {!detail && !detailError && (
                  <p role="status">Checking current document permissions…</p>
                )}
                {detail && (
                  <>
                    <div className="documents-detail-facts">
                      <p>
                        <span>Type</span>
                        {fileType(detail)}
                      </p>
                      <p>
                        <span>Owner</span>
                        {ownerName(detail.owner_id)}
                      </p>
                      <p>
                        <span>Updated</span>
                        {new Date(detail.updated_at).toLocaleString('en-KE', {
                          timeZone: 'Africa/Nairobi',
                        })}
                      </p>
                      <p>
                        <span>Status</span>
                        {detail.status}
                      </p>
                      {detail.data.file && (
                        <>
                          <p>
                            <span>File</span>
                            {detail.data.file.filename}
                          </p>
                          <p>
                            <span>Size</span>
                            {formatBytes(detail.data.file.size_bytes)}
                          </p>
                          <p>
                            <span>Security</span>Not malware-scanned
                          </p>
                        </>
                      )}
                      <p>
                        <span>Visibility</span>
                        {detail.data.policy?.visibility === 'company'
                          ? 'Company metadata'
                          : 'Private'}
                      </p>
                      {detail.folder_id && (
                        <p>
                          <span>Folder</span>
                          {folderPath.find((folder) => folder.id === detail.folder_id)?.name ||
                            'Nested folder'}
                        </p>
                      )}
                      {detail.data.tags?.length > 0 && (
                        <p>
                          <span>Tags</span>
                          <span className="document-tags">
                            {detail.data.tags.map((value: string) => (
                              <span key={value}>{value}</span>
                            ))}
                          </span>
                        </p>
                      )}
                    </div>
                    {detail.data.description && (
                      <p className="documents-detail-description">{detail.data.description}</p>
                    )}
                    {detail.data.review && (
                      <p className="documents-honesty-note">
                        Latest review: {detail.data.review.decision} ·{' '}
                        {new Date(detail.data.review.at).toLocaleString()} · version-bound. This is
                        a human review, not independent verification.
                      </p>
                    )}
                    <div className="documents-detail-actions">
                      {detail.kind === 'file' && detail.status === 'active' && (
                        <button
                          className="button"
                          disabled={!detail.permissions.download}
                          onClick={() => setPreviewOpen(true)}
                        >
                          Preview
                        </button>
                      )}
                      {detail.kind === 'file' && detail.status === 'active' && (
                        <button
                          className="secondary-button"
                          disabled={!detail.permissions.download}
                          onClick={() => void content(detail, true)}
                        >
                          Download
                        </button>
                      )}
                      {detail.permissions.edit && detail.status === 'active' && (
                        <button className="secondary-button" onClick={() => setEditing(true)}>
                          Rename and edit tags
                        </button>
                      )}
                      {detail.permissions.manage && detail.status === 'active' && (
                        <button className="secondary-button" onClick={() => setAccessEditing(true)}>
                          Share and move
                        </button>
                      )}
                      {detail.permissions.download &&
                        detail.permissions.edit &&
                        detail.kind === 'file' &&
                        detail.status === 'active' && (
                          <button className="secondary-button" onClick={() => setCopying(true)}>
                            Duplicate
                          </button>
                        )}
                      {detail.kind === 'file' && detail.status === 'active' && (
                        <button
                          className="secondary-button"
                          disabled={versionsLoading}
                          onClick={() => void history(0)}
                        >
                          {versionsLoading ? 'Loading versions…' : 'Manage versions'}
                        </button>
                      )}
                      {detail.status === 'active' && (
                        <button
                          className="quiet-button"
                          onClick={() => void star(detail.id, !detail.starred)}
                        >
                          {detail.starred ? 'Remove star' : 'Add star'}
                        </button>
                      )}
                    </div>
                    {detail.permissions.manage && (
                      <Form
                        className="document-state-form"
                        submit={async (value) => {
                          await api('/documents/' + detail.id + '/state', 'PUT', {
                            expected_version: detail.version,
                            state: detail.status === 'trashed' ? 'active' : 'trashed',
                            reason: value.reason,
                          });
                          refresh(
                            detail.status === 'trashed'
                              ? 'Document restored.'
                              : 'Document moved to recoverable trash.',
                          );
                        }}
                      >
                        <Field
                          label={
                            detail.status === 'trashed' ? 'Restore reason' : 'Move to trash reason'
                          }
                        >
                          <input name="reason" required minLength={8} maxLength={2000} />
                        </Field>
                        <button
                          className={detail.status === 'trashed' ? 'button' : 'secondary-button'}
                        >
                          {detail.status === 'trashed' ? 'Restore document' : 'Move to trash'}
                        </button>
                      </Form>
                    )}
                    {detail.kind === 'file' &&
                      detail.permissions.edit &&
                      detail.status === 'active' && (
                        <details className="document-version-upload">
                          <summary>Upload a new version</summary>
                          <Form
                            submit={async (value) => {
                              if (!file) throw new Error('Select a replacement file.');
                              try {
                                setVersionUploadPhase('Preparing selected file…');
                                const payload = await readDocumentFile(
                                  file,
                                  setVersionPreparationProgress,
                                );
                                setVersionUploadPhase(
                                  'Sending new version to private Documents storage…',
                                );
                                await api('/documents/' + detail.id + '/versions', 'POST', {
                                  expected_version: detail.version,
                                  file: payload,
                                  reason: value.reason,
                                });
                                setFile(undefined);
                                refresh('New file version retained.');
                              } finally {
                                setVersionUploadPhase('');
                                setVersionPreparationProgress(null);
                              }
                            }}
                          >
                            <Field label="New file · maximum 2 MiB">
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.txt"
                                required
                                onChange={(event) => setFile(event.target.files?.[0])}
                              />
                            </Field>
                            <Field label="Change reason">
                              <textarea name="reason" required minLength={8} maxLength={2000} />
                            </Field>
                            {versionUploadPhase && (
                              <p role="status" aria-live="polite">
                                {versionUploadPhase}
                                {versionPreparationProgress !== null
                                  ? ` ${versionPreparationProgress}%`
                                  : ''}
                                {versionPreparationProgress !== null && (
                                  <progress max={100} value={versionPreparationProgress} />
                                )}
                              </p>
                            )}
                            <button className="button">Upload version</button>
                          </Form>
                        </details>
                      )}
                    {detail.kind === 'file' && detail.status === 'active' && (
                      <DocumentReviews
                        document={detail}
                        members={members}
                        actorId={listing?.actor_id || ''}
                        api={api}
                        onChanged={() => refresh('File review updated.')}
                      />
                    )}
                    {versions && (
                      <section className="documents-version-list">
                        <h3>Version history</h3>
                        {versions.data.map((version: any) => (
                          <article key={version.id}>
                            <div>
                              <strong>{version.data.filename}</strong>
                              <p>
                                {formatBytes(version.data.size_bytes)} · {version.data.reason}
                              </p>
                              <small>
                                {new Date(version.created_at).toLocaleString('en-KE', {
                                  timeZone: 'Africa/Nairobi',
                                })}
                                {version.id === detail.data.current_version_id
                                  ? ' · Current version'
                                  : ''}
                              </small>
                            </div>
                            <button
                              className="secondary-button"
                              disabled={!detail.permissions.download}
                              onClick={() => void content(detail, true, version.id)}
                            >
                              Download
                            </button>
                          </article>
                        ))}
                        <div className="form-actions">
                          <button
                            className="secondary-button"
                            disabled={!versionOffset}
                            onClick={() => void history(Math.max(0, versionOffset - 50))}
                          >
                            Previous versions
                          </button>
                          <button
                            className="secondary-button"
                            disabled={!versions.has_more}
                            onClick={() => void history(versionOffset + 50)}
                          >
                            More versions
                          </button>
                        </div>
                      </section>
                    )}
                    <section className="documents-activity">
                      <h3>Activity</h3>
                      <p>
                        Created{' '}
                        {new Date(detail.created_at).toLocaleString('en-KE', {
                          timeZone: 'Africa/Nairobi',
                        })}{' '}
                        by {ownerName(detail.owner_id)}.
                      </p>
                      <p>
                        Access and content changes are retained by the Documents service. A
                        conversational chatter feed is not available in this workspace.
                      </p>
                    </section>
                  </>
                )}
              </aside>
            )}
          </main>
        )}
      </div>
      {creating && (
        <DocumentEditor
          initialFile={initialFile}
          initialFolderId={currentFolderId === 'root' ? null : currentFolderId}
          initialKind={createKind}
          api={api}
          onSaved={(savedDocument) => {
            setCreating(false);
            setInitialFile(undefined);
            setRevision((value) => value + 1);
            if (savedDocument?.id) {
              setSelected(savedDocument.id);
              setShowDetails(true);
              if (savedDocument.kind === 'file') setPreviewOpen(true);
            }
            setNotice(createKind === 'folder' ? 'Folder created.' : 'Private document uploaded.');
          }}
          onClose={() => {
            setCreating(false);
            setInitialFile(undefined);
          }}
        />
      )}
      {editing && detail && (
        <DocumentEditor
          document={detail}
          api={api}
          onSaved={() => refresh('Document details saved.')}
          onClose={() => setEditing(false)}
        />
      )}
      {(accessEditing || copying) && detail && (
        <DocumentPolicyEditor
          document={detail}
          members={members}
          memberError={memberError}
          retryMembers={() => setMemberRetry((value) => value + 1)}
          api={api}
          copy={copying}
          onSaved={(savedDocument) => {
            refresh(
              copying
                ? 'Authorized copy created with separate access.'
                : 'Sharing and folder policy saved.',
            );
            if (copying && savedDocument?.id) {
              setSelected(savedDocument.id);
              setShowDetails(true);
            }
          }}
          onClose={() => {
            setAccessEditing(false);
            setCopying(false);
          }}
        />
      )}
      {previewOpen && detail && (
        <Overlay
          onClose={() => {
            setPreviewOpen(false);
            setPreview(null);
            setPreviewVersion(null);
            setPreviewActionsOpen(false);
          }}
        >
          <section
            className="documents-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="documents-preview-title"
          >
            <header className="documents-preview-toolbar">
              <div>
                <h2 id="documents-preview-title">{detail.data.name}</h2>
                {previewVersion && (
                  <p>
                    Exact reviewed document revision {previewVersion.documentRevision} ·{' '}
                    {previewVersion.file?.filename}
                  </p>
                )}
              </div>
              <div className="documents-preview-actions">
                <button
                  className="secondary-button"
                  aria-expanded={previewActionsOpen}
                  onClick={() => setPreviewActionsOpen((open) => !open)}
                >
                  Actions⌄
                </button>
                {previewActionsOpen && (
                  <div
                    className="documents-preview-action-menu"
                    role="menu"
                    aria-label="Permitted document actions"
                  >
                    {detail.permissions.edit && detail.status === 'active' && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setPreviewOpen(false);
                          setEditing(true);
                        }}
                      >
                        Rename and edit tags
                      </button>
                    )}
                    {detail.permissions.manage && detail.status === 'active' && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setPreviewOpen(false);
                          setAccessEditing(true);
                        }}
                      >
                        Share and move
                      </button>
                    )}
                    {detail.permissions.download &&
                      detail.permissions.edit &&
                      detail.status === 'active' && (
                        <button
                          role="menuitem"
                          onClick={() => {
                            setPreviewOpen(false);
                            setCopying(true);
                          }}
                        >
                          Duplicate
                        </button>
                      )}
                    {detail.kind === 'file' && detail.status === 'active' && (
                      <button role="menuitem" onClick={() => void history(0)}>
                        Manage versions
                      </button>
                    )}
                    {detail.status === 'active' && (
                      <button role="menuitem" onClick={() => void star(detail.id, !detail.starred)}>
                        {detail.starred ? 'Remove star' : 'Add star'}
                      </button>
                    )}
                  </div>
                )}
                <button
                  className="secondary-button"
                  disabled={!detail.permissions.download}
                  onClick={() => void content(detail, true, previewVersion?.id)}
                >
                  {previewVersion ? 'Download reviewed version' : 'Download'}
                </button>
                <button
                  className="quiet-button"
                  onClick={() => {
                    setPreviewOpen(false);
                    setPreview(null);
                    setPreviewVersion(null);
                    setPreviewActionsOpen(false);
                  }}
                  aria-label="Close preview"
                >
                  ×
                </button>
              </div>
            </header>
            <div className="documents-preview-layout">
              <div className="documents-preview-content">
                {previewLoading && <p role="status">Loading authorized preview…</p>}
                {previewError && (
                  <div role="alert">
                    <p>{previewError}</p>
                    {detail.permissions.download && (
                      <button
                        className="secondary-button"
                        onClick={() => void content(detail, true, previewVersion?.id)}
                      >
                        Download file
                      </button>
                    )}
                  </div>
                )}
                {preview?.type === 'application/pdf' && (
                  <iframe
                    src={preview.url}
                    title={'Preview ' + preview.name}
                    sandbox=""
                    referrerPolicy="no-referrer"
                  />
                )}
                {preview?.type?.startsWith('image/') && (
                  <img
                    style={{ transform: `scale(${previewScale / 100})` }}
                    src={preview.url}
                    alt={'Authorized preview of ' + preview.name}
                  />
                )}
                {preview?.type === 'text/plain' && (
                  <pre
                    style={{
                      transform: `scale(${previewScale / 100})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    {preview.text}
                  </pre>
                )}
              </div>
              <aside className="documents-preview-details">
                <h3>Details</h3>
                <p>
                  {previewVersion?.file?.content_type || fileType(detail)} ·{' '}
                  {formatBytes(previewVersion?.file?.size_bytes ?? detail.data.file?.size_bytes)}
                </p>
                {previewVersion && <p>Reviewed revision · {previewVersion.documentRevision}</p>}
                <p>Owner · {ownerName(detail.owner_id)}</p>
                <p>
                  Updated ·{' '}
                  {new Date(detail.updated_at).toLocaleString('en-KE', {
                    timeZone: 'Africa/Nairobi',
                  })}
                </p>
                <p>{detail.data.description || 'No description'}</p>
                <div className="document-tags">
                  {detail.data.tags?.map((value: string) => (
                    <span key={value}>{value}</span>
                  ))}
                </div>
                {preview?.type !== 'application/pdf' && (
                  <div className="documents-preview-zoom" aria-label="Preview zoom controls">
                    <button
                      className="secondary-button"
                      onClick={() => setPreviewScale((value) => Math.max(50, value - 10))}
                      aria-label="Zoom out"
                    >
                      −
                    </button>
                    <span>{previewScale}%</span>
                    <button
                      className="secondary-button"
                      onClick={() => setPreviewScale((value) => Math.min(200, value + 10))}
                      aria-label="Zoom in"
                    >
                      ＋
                    </button>
                    <button className="quiet-button" onClick={() => setPreviewScale(100)}>
                      Reset
                    </button>
                  </div>
                )}
                <button
                  className="secondary-button"
                  onClick={() => {
                    setPreviewOpen(false);
                    setShowDetails(true);
                  }}
                >
                  More details
                </button>
              </aside>
            </div>
          </section>
        </Overlay>
      )}
    </div>
  );
}
