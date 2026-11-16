import { appNavigationEvent } from './AppNavigation';
import { useEffect, useState, type MouseEvent } from 'react';
import { Field, Form, type API } from '../operations/UI';
import { DocumentEditor } from './DocumentEditors';
import { useIdempotentAPI } from './useIdempotentAPI';

export function DocumentAttachments({
  api: provided,
  sourceKind,
  sourceId,
  writable = false,
  allowUpload = true,
}: {
  api: API;
  sourceKind: string;
  sourceId: string;
  writable?: boolean;
  allowUpload?: boolean;
}) {
  const scope = sourceKind + ':' + sourceId,
    api = useIdempotentAPI(provided, scope),
    [data, setData] = useState<any>(null),
    [available, setAvailable] = useState<any>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [availableError, setAvailableError] = useState(''),
    [upload, setUpload] = useState(false),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    api(
      '/document-attachments?source_kind=' +
        encodeURIComponent(sourceKind) +
        '&source_id=' +
        encodeURIComponent(sourceId),
    )
      .then((result) => {
        if (current) setData(result);
      })
      .catch((e) => {
        if (current) setError('Attachments: ' + e.message);
      });
    return () => {
      current = false;
    };
  }, [api, sourceKind, sourceId, revision]);
  useEffect(() => {
    if (!writable || !data || error) {
      setAvailable(null);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      setAvailable(null);
      setAvailableError('');
      const personnel =
        sourceKind === 'employee'
          ? '&employee_id=' + encodeURIComponent(sourceId)
          : '&hide_personnel=true';
      api(
        '/documents?view=recent&kind=file&editable_only=true' +
          personnel +
          '&q=' +
          encodeURIComponent(search.trim()) +
          '&offset=' +
          offset,
      )
        .then((result) => {
          if (current) setAvailable(result);
        })
        .catch((e) => {
          if (current) setAvailableError(e.message || 'Eligible documents could not be loaded.');
        });
    }, 220);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [api, sourceKind, sourceId, writable, search, offset, revision, data, error]);
  function href(id: string) {
    const url = new URL(location.href);
    url.searchParams.set('app', 'documents');
    url.searchParams.set('section', 'recent');
    url.searchParams.set('document', id);
    url.hash = 'Apps';
    return url.pathname + url.search + url.hash;
  }
  const open = (id: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null, '', href(id));
    dispatchEvent(new Event('popstate'));
    dispatchEvent(new Event(appNavigationEvent));
  };
  return (
    <section className="app-price-review document-attachments">
      <h3>Documents</h3>
      <p>
        Linked files keep their own current grants. Work, People or financial source access does not
        automatically grant file access.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading authorized attachments…</p>}
      {data?.data.map((document: any) => (
        <p key={document.id}>
          <a href={href(document.id)} onClick={(event) => open(document.id, event)}>
            {document.data.name}
          </a>
          {' · '}
          {document.data.kind}
        </p>
      ))}
      {data?.data.length === 0 && <p>No authorized documents are linked to this record.</p>}
      {data?.has_more && (
        <p className="documents-coverage">Showing the latest 50 authorized attachments.</p>
      )}
      {writable && data && !error && available && !available.can_create && (
        <p role="status">
          Current Documents service permission does not allow linking or uploading an attachment
          here.
        </p>
      )}
      {writable && data && !error && available?.can_create && (
        <div className="document-attachment-picker">
          <h4>Link an existing private file</h4>
          <p>
            Search covers a bounded window of files you can edit. The Documents service rechecks
            source and file permissions when linking.
          </p>
          <Field label="Search eligible files">
            <input
              type="search"
              value={search}
              maxLength={100}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
              placeholder="Search file names, descriptions or tags"
            />
          </Field>
          {availableError && (
            <p role="alert">
              {availableError}{' '}
              <button className="quiet-button" onClick={() => setRevision((value) => value + 1)}>
                Retry file search
              </button>
            </p>
          )}
          {!available && !availableError && <p role="status">Loading editable private files…</p>}
          {available && (
            <>
              <Form
                submit={async (form) => {
                  await api('/documents/' + form.document_id + '/links', 'POST', {
                    source_kind: sourceKind,
                    source_id: sourceId,
                  });
                  setOffset(0);
                  setSearch('');
                  setRevision((value) => value + 1);
                }}
              >
                <Field label="Choose a current file you can edit">
                  <select name="document_id" required defaultValue="">
                    <option value="" disabled>
                      Select a file
                    </option>
                    {available.data.map((document: any) => (
                      <option key={document.id} value={document.id}>
                        {document.data.name} · {document.data.file?.filename || 'file'}
                      </option>
                    ))}
                  </select>
                </Field>
                <button className="secondary-button" disabled={!available.data.length}>
                  Link existing file
                </button>
              </Form>
              {available.data.length === 0 && <p>No editable files match this search.</p>}
              {available.truncated && (
                <p className="documents-coverage">
                  Search covers no more than 5,000 currently authorized records.
                </p>
              )}
              <div className="form-actions">
                <button
                  className="secondary-button"
                  disabled={!offset}
                  onClick={() => setOffset((value) => Math.max(0, value - 50))}
                >
                  Previous files
                </button>
                <button
                  className="secondary-button"
                  disabled={!available.has_more}
                  onClick={() => setOffset((value) => value + 50)}
                >
                  More files
                </button>
              </div>
            </>
          )}
          {allowUpload && (
            <button className="secondary-button" onClick={() => setUpload(true)}>
              Upload a private source attachment
            </button>
          )}
        </div>
      )}
      {upload && (
        <DocumentEditor
          source={{ source_kind: sourceKind, source_id: sourceId }}
          api={api}
          onSaved={() => {
            setUpload(false);
            setRevision((value) => value + 1);
          }}
          onClose={() => setUpload(false)}
        />
      )}
    </section>
  );
}
