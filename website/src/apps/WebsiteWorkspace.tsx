import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Overlay } from '../components/Overlay';
import { Field, type API } from '../operations/UI';
import { appNavigationEvent } from './AppNavigation';
import './phase3-apps.css';
const templates: any = {
  'Blank Page': [],
  About: [
    { type: 'hero', title: 'About our business', body: 'A clear introduction to your work.' },
    { type: 'text', title: 'Our story', body: 'Tell visitors what you do and why it matters.' },
  ],
  'Landing Page': [
    {
      type: 'hero',
      title: 'A better way to work',
      body: 'Introduce your offer and invite visitors to take the next step.',
      button_label: 'Contact us',
      button_url: '/contact',
    },
    { type: 'features', title: 'What we offer', body: 'Add your key services and benefits.' },
    { type: 'cta', title: 'Ready to get started?', body: 'Talk with our team.' },
  ],
  Services: [
    { type: 'hero', title: 'Our services', body: 'Practical services for your business.' },
    { type: 'columns', title: 'How we help', body: 'Describe your core capabilities.' },
    { type: 'contact', title: 'Get in touch', body: 'Contact our team.' },
  ],
  Contact: [
    { type: 'hero', title: 'Contact us', body: 'We would be happy to hear from you.' },
    {
      type: 'contact_form',
      title: 'Send an inquiry',
      body: 'Share your question and we will follow up.',
    },
  ],
  Portfolio: [
    { type: 'hero', title: 'Selected work', body: 'A selection of recent projects.' },
    { type: 'gallery', title: 'Project gallery', body: 'Add reviewed public images.' },
  ],
  Pricing: [
    { type: 'hero', title: 'Simple pricing', body: 'Choose the service that suits you.' },
    { type: 'pricing', title: 'Plans', body: 'Describe scope and pricing clearly.' },
  ],
};
const blank = (title: string, slug: string, sections: any[] = []) => ({
  title,
  slug,
  sections,
  meta_title: title,
  meta_description: '',
  noindex: true,
  theme: { primary: '#087e78', width: 'standard' },
  menus: [{ label: 'Home', url: '/' }],
});
function renderDraftMenus(menus: any[], onNavigate: () => void, parent: number | null = null): any {
  const items = menus.flatMap((item, index) =>
    (item.parent_index ?? null) === parent
      ? [
          <li key={`${index}-${item.label}`}>
            <a href="#" onClick={(event) => { event.preventDefault(); onNavigate(); }}>{item.label}</a>
            {renderDraftMenus(menus, onNavigate, index)}
          </li>,
        ]
      : [],
  );
  return items.length ? <ul>{items}</ul> : null;
}
function reorderMenu(items: any[], from: number, to: number) {
  const reordered = [...items];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
  const oldToNew = new Map(items.map((_: any, index: number) => [index, index === from ? to : index === to ? from : index]));
  const updated = reordered.map((item, newIndex) => {
    const oldParent = items.indexOf(item);
    const parent = items[oldParent]?.parent_index;
    const parent_index = parent === null || parent === undefined ? null : oldToNew.get(parent)!;
    return { ...item, parent_index: parent_index !== null && parent_index < newIndex ? parent_index : null };
  });
  return updated;
}
function DraftBlockContent({
  block,
  onTitle,
  onBody,
  editable,
}: {
  block: any;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  editable: boolean;
}) {
  const title = (
    <h2
      contentEditable={editable}
      suppressContentEditableWarning
      onBlur={(e) => onTitle(e.currentTarget.textContent || '')}
    >
      {block.title || block.type}
    </h2>
  );
  const body = (
    <p
      contentEditable={editable}
      suppressContentEditableWarning
      onBlur={(e) => onBody(e.currentTarget.textContent || '')}
    >
      {block.body}
    </p>
  );
  const lines = String(block.body || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (['features', 'columns'].includes(block.type))
    return (
      <>
        {title}
        <div
          className={block.type === 'features' ? 'website-feature-grid' : 'website-columns-grid'}
        >
          {lines.map((line, i) => {
            const [heading, ...description] = line.split('::').map((part) => part.trim());
            return (
              <article key={i}>
                <h3>{heading}</h3>
                {description.length > 0 && <p>{description.join('::')}</p>}
              </article>
            );
          })}
        </div>
        {editable && (
          <Field label="Cards (one per line: title :: description)">
            <textarea value={block.body} onChange={(e) => onBody(e.target.value)} rows={5} />
          </Field>
        )}
      </>
    );
  if (block.type === 'faq')
    return (
      <>
        {title}
        {lines.map((line, i) => {
          const [question, ...answer] = line.split('::').map((part) => part.trim());
          return (
            <details key={i}>
              <summary>{question}</summary>
              <p>{answer.join('::')}</p>
            </details>
          );
        })}
        {editable && (
          <Field label="Questions (one per line: question :: answer)">
            <textarea value={block.body} onChange={(e) => onBody(e.target.value)} rows={5} />
          </Field>
        )}
      </>
    );
  if (block.type === 'pricing')
    return (
      <>
        {title}
        <div className="website-pricing-grid">
          {lines.map((line, i) => {
            const [name, price, ...description] = line.split('|').map((part) => part.trim());
            return (
              <article key={i}>
                <h3>{name}</h3>
                {price && <strong>{price}</strong>}
                {description.length > 0 && <p>{description.join('|')}</p>}
              </article>
            );
          })}
        </div>
        {editable && (
          <Field label="Plans (one per line: name | price | description)">
            <textarea value={block.body} onChange={(e) => onBody(e.target.value)} rows={5} />
          </Field>
        )}
      </>
    );
  if (block.type === 'heading') return title;
  if (block.type === 'testimonial')
    return (
      <>
        {title}
        <blockquote
          contentEditable={editable}
          suppressContentEditableWarning
          onBlur={(e) => onBody(e.currentTarget.textContent || '')}
        >
          {block.body}
        </blockquote>
      </>
    );
  return (
    <>
      {title}
      {body}
    </>
  );
}
export function WebsiteWorkspace({
  api,
  scope,
  section = 'overview',
}: {
  api: API;
  scope: string;
  section?: string;
}) {
  const [pages, setPages] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [showTemplates, setShowTemplates] = useState(false),
    [preview, setPreview] = useState(false),
    [query, setQuery] = useState(''),
    [media, setMedia] = useState<any[]>([]),
    [mediaPreviews, setMediaPreviews] = useState<Record<string, string>>({}),
    [mediaLabel, setMediaLabel] = useState(''),
    [mediaAlt, setMediaAlt] = useState(''),
    [mediaBase64, setMediaBase64] = useState(''),
    [ackPublicUse, setAckPublicUse] = useState(false),
    [ackRights, setAckRights] = useState(false),
    [formSubmissions, setFormSubmissions] = useState<any[]>([]),
    [identity, setIdentity] = useState<any>(null),
    [publicationHistory, setPublicationHistory] = useState<any>(null),
    [, setEditorHistoryRevision] = useState(0);
  const editorHistory = useRef<{ pageId: string | null; version: number | null; entries: string[]; cursor: number }>({
    pageId: null,
    version: null,
    entries: [],
    cursor: -1,
  });
  const restoringEditorHistory = useRef(false);
  useEffect(() => {
    const pageId = selected?.id || null;
    const version = selected?.version ?? null;
    const serialized = selected?.data ? JSON.stringify(selected.data) : '';
    const current = editorHistory.current;
    if (!pageId || !serialized || current.pageId !== pageId || current.version !== version) {
      editorHistory.current = { pageId, version, entries: serialized ? [serialized] : [], cursor: serialized ? 0 : -1 };
      setEditorHistoryRevision((n) => n + 1);
      return;
    }
    if (restoringEditorHistory.current) {
      restoringEditorHistory.current = false;
      setEditorHistoryRevision((n) => n + 1);
      return;
    }
    if (current.entries[current.cursor] !== serialized) {
      const entries = current.entries.slice(0, current.cursor + 1);
      entries.push(serialized);
      if (entries.length > 100) entries.shift();
      editorHistory.current = { ...current, entries, cursor: entries.length - 1 };
      setEditorHistoryRevision((n) => n + 1);
    }
  }, [selected?.id, selected?.version, selected?.data]);
  function restoreEditorHistory(cursor: number) {
    const history = editorHistory.current;
    const snapshot = history.entries[cursor];
    if (!selected || !snapshot || cursor < 0 || cursor >= history.entries.length) return;
    try {
      const data = JSON.parse(snapshot);
      history.cursor = cursor;
      restoringEditorHistory.current = true;
      setSelected({ ...selected, data });
      setEditorHistoryRevision((n) => n + 1);
      setError('');
      setNotice('Draft change restored. Save the draft to keep this version.');
    } catch {
      setError('The editor could not restore that draft change.');
    }
  }
  const undoEditor = () => restoreEditorHistory(editorHistory.current.cursor - 1);
  const redoEditor = () => restoreEditorHistory(editorHistory.current.cursor + 1);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (section !== 'editor' || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoEditor();
      } else if (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) {
        event.preventDefault();
        redoEditor();
      }
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  }, [section, selected]);
  async function load() {
    try {
      setError('');
      const r = await api('/website/pages');
      setPages(r.data || []);
      if (selected) {
        const latest = (r.data || []).find((x: any) => x.id === selected.id);
        if (latest) setSelected(latest);
      } else {
        const requestedPage = new URLSearchParams(location.search).get('page');
        const match = (r.data || []).find((x: any) => x.id === requestedPage);
        if (match) setSelected(match);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    void loadIdentity();
  }, [scope]);
  useEffect(() => {
    const restorePage = () => {
      const id = new URLSearchParams(location.search).get('page');
      setSelected(id ? pages.find((page) => page.id === id) || null : null);
    };
    addEventListener('popstate', restorePage);
    return () => removeEventListener('popstate', restorePage);
  }, [pages]);
  function selectPage(page: any) {
    const url = new URL(location.href);
    if (page?.id) url.searchParams.set('page', page.id);
    else url.searchParams.delete('page');
    history.pushState(null, '', url.pathname + url.search + url.hash);
    setSelected(page);
  }
  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      const { published_version, public_url, published_at, ...draft } = selected.data;
      const body = { ...draft, expected_version: selected.version };
      const r = await api(`/website/pages/${selected.id}`, 'PUT', body, {
        'Idempotency-Key': crypto.randomUUID(),
      });
      setSelected(r);
      setNotice('Draft saved. Public visitors still see the last published version.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(template: string) {
    setBusy(true);
    try {
      const slug =
        template === 'Blank Page' ? 'new-page' : template.toLowerCase().replaceAll(' ', '-');
      const r = await api(
        '/website/pages',
        'POST',
        blank(template === 'Blank Page' ? 'New Page' : template, slug, templates[template]),
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setShowTemplates(false);
      setNotice('Draft page created.');
      await load();
      // Refreshing the register while the old page is still selected would
      // overwrite the just-created page from the component's stale closure.
      selectPage(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function duplicatePage(page: any) {
    setBusy(true);
    try {
      const { published_version, published_at, public_url, ...source } = page.data;
      const slug = `${source.slug}-copy-${crypto.randomUUID().slice(0, 8)}`.slice(0, 100);
      const copy = await api('/website/pages', 'POST', {
        ...source,
        title: `${source.title} (copy)`.slice(0, 180),
        slug,
        meta_title: '',
      }, { 'Idempotency-Key': crypto.randomUUID() });
      await load();
      selectPage(copy);
      setNotice('Draft copy created. It is unpublished until you publish it.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await api(
        `/website/pages/${selected.id}/publish`,
        'POST',
        { expected_version: selected.version },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setNotice(
        r.url
          ? `Published snapshot ${r.version}. ${r.url} is available on the production environment.`
          : `Published snapshot ${r.version} in this sandbox. It has no public production URL.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function unpublish() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(
        `/website/pages/${selected.id}/unpublish`,
        'POST',
        { expected_version: selected.version },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setNotice('The public snapshot is now withdrawn.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadMedia() {
    try {
      const response = await api('/commerce/assets');
      setMedia(response.data || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadFormSubmissions() {
    try {
      const response = await api('/website/forms');
      setFormSubmissions(response.data || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadIdentity() {
    try {
      const response = await api('/website/settings');
      setIdentity(response);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveIdentity() {
    if (!identity?.data) return;
    setBusy(true);
    try {
      const response = await api(
        '/website/settings',
        'PUT',
        {
          ...identity.data,
          expected_version: identity.version || undefined,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setIdentity({ configured: true, version: response.version, data: response.data });
      setNotice(
        response.data.public_enabled
          ? 'Website identity saved. Publish pages to apply these public settings.'
          : 'Website identity saved. Public pages have been withdrawn until public access is enabled.',
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadPublicationHistory() {
    if (!selected) return;
    try {
      setPublicationHistory(await api(`/website/pages/${selected.id}/publication-history`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restorePublication(version: number) {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await api(
        `/website/pages/${selected.id}/publication-history/${version}/restore`,
        'POST',
        {},
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setNotice(`Restored publication ${version} as new version ${response.version}.`);
      await loadPublicationHistory();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function previewMedia(id: string) {
    if (mediaPreviews[id]) return mediaPreviews[id];
    const response = await api(`/commerce/assets/${id}/preview`);
    setMediaPreviews((current) => ({ ...current, [id]: response.data_url }));
    return response.data_url as string;
  }
  function attachMedia(asset: any, previewUrl?: string) {
    if (!selected || selected.editingSection === undefined) {
      setError('Select a page block before attaching this image.');
      return;
    }
    const index = Number(selected.editingSection);
    const current = selected.data.sections[index];
    if (!current || !['image', 'gallery', 'hero'].includes(current.type)) {
      setError('Choose an image, gallery or hero block before attaching media.');
      return;
    }
    setSelected({
      ...selected,
      data: {
        ...selected.data,
        sections: selected.data.sections.map((item: any, i: number) =>
          i === index ? { ...item, image_id: asset.id, image_url: '', alt: asset.alt } : item,
        ),
      },
    });
    if (previewUrl) setMediaPreviews((current) => ({ ...current, [asset.id]: previewUrl }));
    setError('');
    setNotice(`Image attached to ${current.type} block. Save the page draft to keep the change.`);
  }
  async function uploadMedia() {
    if (!mediaBase64 || !mediaLabel.trim() || !mediaAlt.trim() || !ackPublicUse || !ackRights)
      return;
    setBusy(true);
    try {
      const response = await api(
        '/commerce/assets',
        'POST',
        {
          label: mediaLabel,
          alt: mediaAlt,
          image_base64: mediaBase64,
          acknowledge_public_use: true,
          acknowledge_rights: true,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setMedia((current) => [response, ...current.filter((item) => item.id !== response.id)]);
      setMediaBase64('');
      setMediaLabel('');
      setMediaAlt('');
      setAckPublicUse(false);
      setAckRights(false);
      const previewUrl = await previewMedia(response.id);
      setNotice('Reviewed public image uploaded. Select it to attach to this draft.');
      if (selected?.editingSection !== undefined) attachMedia(response, previewUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function withdrawMedia(asset: any) {
    if (asset.status !== 'active') return;
    setBusy(true);
    try {
      const result = await api(
        `/commerce/assets/${asset.id}/withdraw`,
        'POST',
        { expected_version: asset.version, acknowledge_withdrawal: true },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setMedia((current) =>
        current.map((item) => (item.id === asset.id ? { ...item, ...result } : item)),
      );
      setMediaPreviews((current) => {
        const next = { ...current };
        delete next[asset.id];
        return next;
      });
      setNotice('Public media withdrawn. The retained image can no longer be attached or delivered.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function readMediaFile(file?: File) {
    if (!file) return;
    if (file.size > 512 * 1024) {
      setError('Choose a JPEG, PNG or WebP image no larger than 512 KiB.');
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      setMediaBase64(btoa(binary));
      setMediaLabel(file.name.replace(/\.[^.]+$/, '').slice(0, 160));
      setMediaAlt('');
      setError('');
    } catch {
      setError('The image file could not be read.');
    }
  }
  function choosePanel(label: string) {
    if (label === 'Pages') {
      setSelected(null);
      const url = new URL(location.href);
      url.searchParams.delete('page');
      url.searchParams.set('section', 'pages');
      history.pushState(null, '', url.pathname + url.search + url.hash);
      dispatchEvent(new Event(appNavigationEvent));
      return;
    }
    if (label === 'Templates') {
      const url = new URL(location.href);
      url.searchParams.set('section', 'templates');
      history.pushState(null, '', url.pathname + url.search + url.hash);
      dispatchEvent(new Event(appNavigationEvent));
      setShowTemplates(true);
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('section', label.toLowerCase().replaceAll(' ', '-'));
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
  }
  const data = selected?.data,
    filtered = pages.filter((p) =>
      (p.data.title + ' ' + p.data.slug).toLowerCase().includes(query.toLowerCase()),
    ),
    selectedMediaIds = (data?.sections || [])
      .map((item: any) => item.image_id)
      .filter(Boolean)
      .join(',');
  function updateSelectedBlock(key: string, value: string) {
    if (!selected || selected.editingSection === undefined) return;
    const index = Number(selected.editingSection);
    setSelected({
      ...selected,
      data: {
        ...selected.data,
        sections: selected.data.sections.map((item: any, i: number) =>
          i === index ? { ...item, [key]: value } : item,
        ),
      },
    });
  }
  useEffect(() => {
    if (section === 'media' || section === 'settings') void loadMedia();
    if (section === 'forms') void loadFormSubmissions();
    if (section === 'publication' && selected) void loadPublicationHistory();
  }, [section, scope, selected?.id]);
  useEffect(() => {
    let active = true;
    const ids = selectedMediaIds ? selectedMediaIds.split(',') : [];
    void Promise.all(
      ids.map(async (id: string) => {
        try {
          const response = await api(`/commerce/assets/${id}/preview`);
          if (active) setMediaPreviews((current) => ({ ...current, [id]: response.data_url }));
        } catch (e) {
          if (active) setError((e as Error).message);
        }
      }),
    );
    return () => {
      active = false;
    };
  }, [selectedMediaIds, scope, api]);
  return (
    <main className="phase3-workspace website-workspace">
      <header className="phase3-toolbar">
        <div>
          <h2>{section === 'editor' ? data?.title || 'Website Editor' : 'Website'}</h2>
          <p>Pages and public content · Commerce owns products, cart, checkout and orders</p>
        </div>
        <div className="phase3-actions">
          <button className="secondary-button" onClick={() => setShowTemplates(true)}>
            New Page
          </button>
          <button
            className="secondary-button"
            disabled={!selected}
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? 'Edit draft' : 'Preview'}
          </button>
          {section === 'editor' && (
            <>
              <button className="secondary-button" aria-label="Undo draft change" title="Undo (Ctrl+Z)" disabled={editorHistory.current.cursor <= 0} onClick={undoEditor}>↶ Undo</button>
              <button className="secondary-button" aria-label="Redo draft change" title="Redo (Ctrl+Y)" disabled={editorHistory.current.cursor >= editorHistory.current.entries.length - 1} onClick={redoEditor}>↷ Redo</button>
            </>
          )}
          <button className="button" disabled={!selected || busy} onClick={() => void publish()}>
            Publish
          </button>
          {data?.published_version && (
            <button className="secondary-button" disabled={busy} onClick={() => void unpublish()}>
              Unpublish
            </button>
          )}
          {data?.public_url && (
            <a className="secondary-button" href={data.public_url} target="_blank" rel="noreferrer">
              View Website ↗
            </a>
          )}
        </div>
      </header>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}
      {selected ? (
        <>
          <nav className="phase3-tabs" aria-label="Website sections">
            {[
              'Overview',
              'Pages',
              'Website Editor',
              'Templates',
              'Menus',
              'Theme',
              'Media',
              'Forms',
              'SEO',
              'Publication',
              'Settings',
            ].map((x) => (
              <button
                key={x}
                aria-current={section === x.toLowerCase().replaceAll(' ', '-') ? 'page' : undefined}
                onClick={() => choosePanel(x)}
              >
                {x}
              </button>
            ))}
          </nav>
          {section === 'menus' && (
            <section className="panel website-management-panel">
              <header>
                <h2>Edit draft menu</h2>
                <button className="button" onClick={() => void save()} disabled={busy}>
                  Save menu
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    const latest = pages.find((p: any) => p.id === selected.id);
                    if (latest) setSelected(latest);
                  }}
                >
                  Discard edits
                </button>
              </header>
              <p>Menu changes stay in this page draft until a new publication is published.</p>
              {(data.menus || []).map((item: any, index: number) => (
                <div className="website-menu-row" key={index} style={{ marginInlineStart: item.parent_index == null ? 0 : '1.5rem' }}>
                  <span aria-hidden="true">⠿</span>
                  <Field label="Label">
                    <input
                      value={item.label}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          data: {
                            ...data,
                            menus: data.menus.map((m: any, i: number) =>
                              i === index ? { ...m, label: e.target.value } : m,
                            ),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Link">
                    <input
                      value={item.url}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          data: {
                            ...data,
                            menus: data.menus.map((m: any, i: number) =>
                              i === index ? { ...m, url: e.target.value } : m,
                            ),
                          },
                        })
                      }
                    />
                  </Field>
                  <button
                    className="quiet-button"
                    disabled={!index || data.menus[index].parent_index !== data.menus[index - 1]?.parent_index}
                    onClick={() => {
                      if (index > 0 && data.menus[index].parent_index === data.menus[index - 1].parent_index) {
                        const next = reorderMenu(data.menus, index, index - 1);
                        setSelected({ ...selected, data: { ...data, menus: next } });
                      }
                    }}
                  >
                    ↑
                  </button>
                  <button
                    className="quiet-button"
                    disabled={index === data.menus.length - 1 || data.menus[index].parent_index !== data.menus[index + 1]?.parent_index}
                    onClick={() => {
                      if (index < data.menus.length - 1 && data.menus[index].parent_index === data.menus[index + 1].parent_index) {
                        const next = reorderMenu(data.menus, index, index + 1);
                        setSelected({ ...selected, data: { ...data, menus: next } });
                      }
                    }}
                  >
                    ↓
                  </button>
                  <button className="quiet-button" disabled={index === 0 || item.parent_index != null || data.menus[index - 1]?.parent_index != null} onClick={() => setSelected({ ...selected, data: { ...data, menus: data.menus.map((m: any, i: number) => i === index ? { ...m, parent_index: index - 1 } : m) } })}>
                    Nest under previous
                  </button>
                  {item.parent_index != null && <button className="quiet-button" onClick={() => setSelected({ ...selected, data: { ...data, menus: data.menus.map((m: any, i: number) => i === index ? { ...m, parent_index: null } : m) } })}>
                    Outdent
                  </button>}
                  <button
                    className="quiet-button"
                    onClick={() =>
                      setSelected({
                        ...selected,
                        data: {
                          ...data,
                          menus: data.menus.filter((_: any, i: number) => i !== index).map((m: any) => ({
                            ...m,
                            parent_index: m.parent_index === index ? null : m.parent_index > index ? m.parent_index - 1 : m.parent_index,
                          })),
                        },
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="secondary-button"
                onClick={() =>
                  setSelected({
                    ...selected,
                    data: {
                      ...data,
                      menus: [...(data.menus || []), { label: 'New item', url: '/', parent_index: null }],
                    },
                  })
                }
              >
                Add menu item
              </button>
            </section>
          )}
          {section === 'theme' && (
            <section className="panel website-management-panel">
              <h2>Draft theme</h2>
              <p>Theme changes are included in a public snapshot only after you publish.</p>
              <Field label="Primary brand color">
                <input
                  type="color"
                  value={data.theme?.primary || '#087e78'}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      data: { ...data, theme: { ...(data.theme || {}), primary: e.target.value } },
                    })
                  }
                />
              </Field>
              <Field label="Layout width">
                <select
                  value={data.theme?.width || 'standard'}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      data: { ...data, theme: { ...(data.theme || {}), width: e.target.value } },
                    })
                  }
                >
                  <option value="standard">Standard</option>
                  <option value="wide">Wide</option>
                </select>
              </Field>
              <button className="button" onClick={() => void save()} disabled={busy}>
                Save theme draft
              </button>
            </section>
          )}
          {section === 'seo' && (
            <section className="panel website-management-panel">
              <h2>Search and sharing details</h2>
              <Field label="Page title">
                <input
                  value={data.meta_title || ''}
                  onChange={(e) =>
                    setSelected({ ...selected, data: { ...data, meta_title: e.target.value } })
                  }
                />
              </Field>
              <Field label="Meta description">
                <textarea
                  maxLength={320}
                  value={data.meta_description || ''}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      data: { ...data, meta_description: e.target.value },
                    })
                  }
                />
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={!!data.noindex}
                  onChange={(e) =>
                    setSelected({ ...selected, data: { ...data, noindex: e.target.checked } })
                  }
                />
                Ask search engines not to index this page
              </label>
              <button className="button" onClick={() => void save()} disabled={busy}>
                Save SEO draft
              </button>
            </section>
          )}
          {section === 'media' && (
            <section className="panel website-management-panel">
              <h2>Media</h2>
              <p>
                Only explicitly public, rights-acknowledged images appear on published pages.
                Private Documents are not selectable.
              </p>
              <Field label="Upload JPEG, PNG or WebP (512 KiB max)">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void readMediaFile(e.target.files?.[0])}
                />
              </Field>
              <Field label="Media label">
                <input value={mediaLabel} onChange={(e) => setMediaLabel(e.target.value)} />
              </Field>
              <Field label="Alternative text">
                <input
                  maxLength={300}
                  value={mediaAlt}
                  onChange={(e) => setMediaAlt(e.target.value)}
                />
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={ackPublicUse}
                  onChange={(e) => setAckPublicUse(e.target.checked)}
                />
                I authorize this image for public website use.
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={ackRights}
                  onChange={(e) => setAckRights(e.target.checked)}
                />
                I have the rights needed to publish this image.
              </label>
              <div className="phase3-actions">
                <button
                  className="button"
                  disabled={
                    busy ||
                    !mediaBase64 ||
                    !mediaLabel.trim() ||
                    !mediaAlt.trim() ||
                    !ackPublicUse ||
                    !ackRights
                  }
                  onClick={() => void uploadMedia()}
                >
                  Upload public image
                </button>
                <button className="secondary-button" onClick={() => void loadMedia()}>
                  Refresh media library
                </button>
              </div>
              <div className="website-media-library">
                {media.map((asset: any) => (
                  <article className="website-media-card" key={asset.id}>
                    {mediaPreviews[asset.id] && (
                      <img src={mediaPreviews[asset.id]} alt={asset.alt} />
                    )}
                    <strong>{asset.label}</strong>
                    <span>
                      {asset.width} × {asset.height} · {asset.status}
                    </span>
                    <small>{asset.alt}</small>
                    <button
                      className="secondary-button"
                      disabled={asset.status !== 'active'}
                      onClick={() =>
                        void previewMedia(asset.id).then((url) => attachMedia(asset, url))
                      }
                    >
                      Use in selected block
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          {section === 'forms' && (
            <section className="panel website-management-panel">
              <h2>Forms</h2>
              <p>
                Submissions are encrypted and administrator-only. Their content expires after 90
                days and is cleared the next time this inbox is opened.
              </p>
              <button className="secondary-button" onClick={() => void loadFormSubmissions()}>
                Refresh submissions
              </button>
              {formSubmissions.length ? (
                <div className="phase3-table-wrap">
                  <table className="phase3-table">
                    <thead>
                      <tr>
                        <th>Received</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Company</th>
                        <th>Message</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formSubmissions.map((entry: any) => (
                        <tr key={entry.id}>
                          <td>{new Date(entry.created_at).toLocaleString()}</td>
                          <td>{entry.name || 'Expired'}</td>
                          <td>{entry.email || ''}</td>
                          <td>{entry.company || ''}</td>
                          <td>{entry.message || ''}</td>
                          <td>{entry.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No website inquiries received yet.</p>
              )}
            </section>
          )}
          {section === 'publication' && (
            <section className="panel website-management-panel">
              <header>
                <div>
                  <h2>Publication history</h2>
                  <p>
                    Restoring a publication creates a new version and keeps this page draft
                    unchanged.
                  </p>
                </div>
                <button className="secondary-button" onClick={() => void loadPublicationHistory()}>
                  Refresh history
                </button>
              </header>
              {publicationHistory?.data?.length ? (
                <div className="phase3-table-wrap">
                  <table className="phase3-table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Published by</th>
                        <th>Date</th>
                        <th>State</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {publicationHistory.data.map((entry: any) => (
                        <tr key={entry.version}>
                          <td>{entry.version}</td>
                          <td>{entry.actor}</td>
                          <td>{new Date(entry.created_at).toLocaleString()}</td>
                          <td>
                            {entry.version === publicationHistory.current_version &&
                            publicationHistory.active
                              ? 'Current'
                              : 'Historical'}
                          </td>
                          <td>
                            <button
                              className="secondary-button"
                              disabled={
                                busy || entry.version === publicationHistory.current_version
                              }
                              onClick={() => void restorePublication(entry.version)}
                            >
                              Restore as new version
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No publication history exists for this page yet.</p>
              )}
            </section>
          )}
          {section === 'settings' && (
            <section className="panel website-management-panel">
              <h2>Website settings</h2>
              <p>
                Workspace owners and administrators manage this canonical site identity. Public
                settings apply to newly published snapshots.
              </p>
              {identity?.data && (
                <>
                  <Field label="Website name">
                    <input
                      value={identity.data.name}
                      maxLength={120}
                      onChange={(e) =>
                        setIdentity({
                          ...identity,
                          data: { ...identity.data, name: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      value={identity.data.description || ''}
                      maxLength={1000}
                      onChange={(e) =>
                        setIdentity({
                          ...identity,
                          data: { ...identity.data, description: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field label="Brand color">
                    <input
                      type="color"
                      value={identity.data.brand_color}
                      onChange={(e) =>
                        setIdentity({
                          ...identity,
                          data: { ...identity.data, brand_color: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field label="Content width">
                    <select
                      value={identity.data.content_width}
                      onChange={(e) =>
                        setIdentity({
                          ...identity,
                          data: { ...identity.data, content_width: e.target.value },
                        })
                      }
                    >
                      <option value="standard">Standard</option>
                      <option value="wide">Wide</option>
                    </select>
                  </Field>
                  <Field label="Default page">
                    <select
                      value={identity.data.default_page_id || ''}
                      onChange={(e) =>
                        setIdentity({
                          ...identity,
                          data: { ...identity.data, default_page_id: e.target.value || null },
                        })
                      }
                    >
                      <option value="">None selected</option>
                      {pages
                        .filter((page: any) => page.status === 'active')
                        .map((page: any) => (
                          <option key={page.id} value={page.id}>
                            {page.data.title}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Public logo">
                    <select
                      value={identity.data.logo_media_id || ''}
                      onChange={(e) =>
                        setIdentity({
                          ...identity,
                          data: { ...identity.data, logo_media_id: e.target.value || null },
                        })
                      }
                    >
                      <option value="">No logo</option>
                      {media
                        .filter((asset: any) => asset.status === 'active')
                        .map((asset: any) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.label}
                          </option>
                        ))}
                    </select>
                    <small>Only reviewed active Website media can be selected.</small>
                  </Field>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={!!identity.data.public_enabled}
                      onChange={(e) =>
                        setIdentity({
                          ...identity,
                          data: { ...identity.data, public_enabled: e.target.checked },
                        })
                      }
                    />
                    Allow published pages on the public production route
                  </label>
                  <p>
                    Public paths use the AfriCore <code>/sites/&lt;page-slug&gt;</code> route.
                    Custom domains and arbitrary hosts are not enabled.
                  </p>
                  <button
                    className="button"
                    disabled={busy || !identity.data.name.trim()}
                    onClick={() => void saveIdentity()}
                  >
                    Save website identity
                  </button>
                </>
              )}
            </section>
          )}
          <div className="website-editor-layout">
            <section
              className={'website-canvas' + (preview ? ' website-preview' : '')}
              style={
                {
                  '--website-primary': data.theme?.primary || '#087e78',
                  '--website-content-width': data.theme?.width === 'wide' ? '1120px' : '900px',
                } as CSSProperties
              }
            >
              <header className="website-preview-header">
                <strong>{identity?.data?.name || 'AfriCore Website'}</strong>
                <nav aria-label="Draft website navigation">
                  {renderDraftMenus(data.menus || [], () => setNotice('Draft navigation preview. Links become active when published.'))}
                </nav>
              </header>
              {data.sections.map((s: any, i: number) => (
                <article
                  key={i}
                  className={'website-section website-block-' + s.type}
                  style={{ background: s.background || '#fff' }}
                  onClick={() => setSelected({ ...selected, editingSection: i })}
                >
                  <div>
                    {s.image_id && mediaPreviews[s.image_id] ? (
                      <img
                        className="website-draft-image"
                        src={mediaPreviews[s.image_id]}
                        alt={s.alt || ''}
                      />
                    ) : s.type === 'image' || s.type === 'gallery' ? (
                      <div className="website-image-placeholder">
                        {s.alt || 'Select reviewed public media'}
                      </div>
                    ) : null}
                    <DraftBlockContent
                      block={s}
                      editable={!preview}
                      onTitle={(title) =>
                        setSelected({
                          ...selected,
                          data: {
                            ...data,
                            sections: data.sections.map((x: any, j: number) =>
                              i === j ? { ...x, title } : x,
                            ),
                          },
                        })
                      }
                      onBody={(body) =>
                        setSelected({
                          ...selected,
                          data: {
                            ...data,
                            sections: data.sections.map((x: any, j: number) =>
                              i === j ? { ...x, body } : x,
                            ),
                          },
                        })
                      }
                    />
                    {s.button_label && <button className="button">{s.button_label}</button>}
                  </div>
                  {!preview && (
                    <div className="website-block-actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({
                            ...selected,
                            data: { ...data, sections: data.sections.toSpliced(i, 0, { ...s }) },
                          });
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        disabled={i === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = [...data.sections];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          setSelected({ ...selected, data: { ...data, sections: next } });
                        }}
                      >
                        ↑
                      </button>
                      <button
                        disabled={i === data.sections.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = [...data.sections];
                          [next[i + 1], next[i]] = [next[i], next[i + 1]];
                          setSelected({ ...selected, data: { ...data, sections: next } });
                        }}
                      >
                        ↓
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({
                            ...selected,
                            data: {
                              ...data,
                              sections: data.sections.filter((_: any, j: number) => j !== i),
                            },
                          });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </article>
              ))}
              <footer className="website-footer">
                {identity?.data?.name || data.title} · Public content preview
              </footer>
            </section>
            <aside className="website-editor-sidebar">
              <div className="phase3-tabs">
                <button className="active">Blocks</button>
                <button
                  onClick={() =>
                    setSelected({
                      ...selected,
                      data: { ...data, theme: { ...(data.theme || {}), primary: '#087e78' } },
                    })
                  }
                >
                  Style
                </button>
                <button
                  onClick={() =>
                    setSelected({
                      ...selected,
                      data: { ...data, theme: { ...(data.theme || {}), width: 'wide' } },
                    })
                  }
                >
                  Theme
                </button>
              </div>
              <h3>Insert a block</h3>
              {[
                'hero',
                'heading',
                'text',
                'image',
                'gallery',
                'columns',
                'features',
                'cta',
                'testimonial',
                'pricing',
                'faq',
                'contact',
                'contact_form',
                'footer',
                'commerce_showcase',
              ].map((type) => (
                <button
                  className="website-block-choice"
                  key={type}
                  onClick={() =>
                    setSelected({
                      ...selected,
                      data: {
                        ...data,
                        sections: [
                          ...data.sections,
                          {
                            type,
                            title: type.replaceAll('_', ' '),
                            body: 'Edit this content',
                            image_url: '',
                            image_id: null,
                            alt: '',
                            button_label: '',
                            button_url: '',
                            background: '#ffffff',
                          },
                        ],
                      },
                    })
                  }
                >
                  <strong>{type.replaceAll('_', ' ')}</strong>
                  <small>Insert editable {type.replaceAll('_', ' ')} block</small>
                </button>
              ))}
              {selected.editingSection !== undefined && data.sections[selected.editingSection] && (
                <section className="website-block-settings" aria-label="Selected block settings">
                  <h3>
                    Selected block ·{' '}
                    {data.sections[selected.editingSection].type.replaceAll('_', ' ')}
                  </h3>
                  <p className="muted">
                    {['features', 'columns'].includes(data.sections[selected.editingSection].type)
                      ? 'Enter one card per line. Use “Title :: description” for each card.'
                      : data.sections[selected.editingSection].type === 'faq'
                        ? 'Enter one question per line as “Question :: Answer”.'
                        : data.sections[selected.editingSection].type === 'pricing'
                          ? 'Enter one plan per line as “Plan | price | description”. Use only prices you have verified.'
                          : 'Select the block on the canvas to edit its text inline.'}
                  </p>
                  <Field label="Background color">
                    <input
                      type="color"
                      value={data.sections[selected.editingSection].background || '#ffffff'}
                      onChange={(e) => updateSelectedBlock('background', e.target.value)}
                    />
                  </Field>
                  {['image', 'gallery', 'hero'].includes(
                    data.sections[selected.editingSection].type,
                  ) && (
                    <Field label="Image alt text">
                      <input
                        value={data.sections[selected.editingSection].alt || ''}
                        maxLength={500}
                        onChange={(e) => updateSelectedBlock('alt', e.target.value)}
                      />
                    </Field>
                  )}
                  {['hero', 'cta', 'contact', 'commerce_showcase'].includes(
                    data.sections[selected.editingSection].type,
                  ) && (
                    <>
                      <Field label="Button label">
                        <input
                          value={data.sections[selected.editingSection].button_label || ''}
                          maxLength={100}
                          onChange={(e) => updateSelectedBlock('button_label', e.target.value)}
                        />
                      </Field>
                      <Field label="Button link">
                        <input
                          value={data.sections[selected.editingSection].button_url || ''}
                          maxLength={1000}
                          onChange={(e) => updateSelectedBlock('button_url', e.target.value)}
                        />
                      </Field>
                    </>
                  )}
                  {data.sections[selected.editingSection].type === 'commerce_showcase' && (
                    <Field label="Published Commerce storefront slug">
                      <input
                        value={data.sections[selected.editingSection].storefront_slug || ''}
                        maxLength={100}
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        placeholder="your-store"
                        onChange={(e) => updateSelectedBlock('storefront_slug', e.target.value)}
                      />
                    </Field>
                  )}
                </section>
              )}
              <h3>Page details</h3>
              <Field label="Page title">
                <input
                  value={data.title}
                  onChange={(e) =>
                    setSelected({ ...selected, data: { ...data, title: e.target.value } })
                  }
                />
              </Field>
              <Field label="Path">
                <input
                  value={data.slug}
                  onChange={(e) =>
                    setSelected({ ...selected, data: { ...data, slug: e.target.value } })
                  }
                />
              </Field>
              <Field label="Meta description">
                <textarea
                  value={data.meta_description || ''}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      data: { ...data, meta_description: e.target.value },
                    })
                  }
                />
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={!!data.noindex}
                  onChange={(e) =>
                    setSelected({ ...selected, data: { ...data, noindex: e.target.checked } })
                  }
                />{' '}
                No index
              </label>
              <button className="button" onClick={() => void save()} disabled={busy}>
                Save draft
              </button>
            </aside>
          </div>
        </>
      ) : (
        <>
          {section === 'settings' && (
            <section className="panel website-management-panel">
              <h2>Website settings</h2>
              <p>Workspace owners and administrators manage this canonical site identity. Public settings apply to newly published snapshots.</p>
              {identity?.data && <>
                <Field label="Website name"><input value={identity.data.name} maxLength={120} onChange={(e) => setIdentity({ ...identity, data: { ...identity.data, name: e.target.value } })} /></Field>
                <Field label="Description"><textarea value={identity.data.description || ''} maxLength={1000} onChange={(e) => setIdentity({ ...identity, data: { ...identity.data, description: e.target.value } })} /></Field>
                <Field label="Brand color"><input type="color" value={identity.data.brand_color} onChange={(e) => setIdentity({ ...identity, data: { ...identity.data, brand_color: e.target.value } })} /></Field>
                <Field label="Content width"><select value={identity.data.content_width} onChange={(e) => setIdentity({ ...identity, data: { ...identity.data, content_width: e.target.value } })}><option value="standard">Standard</option><option value="wide">Wide</option></select></Field>
                <Field label="Default page"><select value={identity.data.default_page_id || ''} onChange={(e) => setIdentity({ ...identity, data: { ...identity.data, default_page_id: e.target.value || null } })}><option value="">None selected</option>{pages.filter((page: any) => page.status === 'active').map((page: any) => <option key={page.id} value={page.id}>{page.data.title}</option>)}</select></Field>
                <Field label="Public logo"><select value={identity.data.logo_media_id || ''} onChange={(e) => setIdentity({ ...identity, data: { ...identity.data, logo_media_id: e.target.value || null } })}><option value="">No logo</option>{media.filter((asset: any) => asset.status === 'active').map((asset: any) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}</select><small>Only reviewed active Website media can be selected.</small></Field>
                <label className="checkbox-field"><input type="checkbox" checked={!!identity.data.public_enabled} onChange={(e) => setIdentity({ ...identity, data: { ...identity.data, public_enabled: e.target.checked } })} />Allow published pages on the public production route</label>
                <p>Public paths use the AfriCore <code>/sites/&lt;page-slug&gt;</code> route. Custom domains and arbitrary hosts are not enabled.</p>
                <button className="button" disabled={busy || !identity.data.name.trim()} onClick={() => void saveIdentity()}>Save website identity</button>
              </>}
            </section>
          )}
          {section === 'publication' && <section className="panel website-management-panel"><h2>Publication history</h2><p>Select a page from the register below to see its immutable publication history and restore an earlier version as a new publication.</p></section>}
          {['menus', 'theme', 'seo'].includes(section) && (
            <section className="panel website-management-panel" role="status">
              <h2>{section === 'menus' ? 'Choose a page to edit its menu' : section === 'theme' ? 'Choose a page to edit its draft theme' : 'Choose a page to edit search details'}</h2>
              <p>These settings belong to a page draft. Select a page from the register below, then reopen this section.</p>
              <button className="secondary-button" onClick={() => choosePanel('Pages')}>Open pages</button>
            </section>
          )}
          <div className="phase3-actions">
            <Field label="Search pages">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </Field>
            <button className="button" onClick={() => setShowTemplates(true)}>
              New
            </button>
          </div>
          <div className="phase3-table-wrap">
            <table className="phase3-table">
              <thead>
                <tr>
                  <th>Page Title</th>
                  <th>URL</th>
                  <th>Draft / Published</th>
                  <th>SEO</th>
                  <th>Version</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button className="link-button" onClick={() => selectPage(p)}>
                        {p.data.title}
                      </button>
                    </td>
                    <td>/{p.data.slug}</td>
                    <td>{p.data.published_version ? 'Published' : 'Draft'}</td>
                    <td>{p.data.noindex ? 'No index' : 'Indexable'}</td>
                    <td>{p.version}</td>
                    <td>{new Date(p.updated_at).toLocaleDateString()}</td>
                    <td>
                      <button className="quiet-button" onClick={() => selectPage(p)}>
                        Edit
                      </button>
                      <button className="quiet-button" disabled={busy} onClick={() => void duplicatePage(p)}>
                        Duplicate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {section === 'forms' ? (
            <section className="panel website-management-panel">
              <h2>Website inquiries</h2>
              <p>
                Submissions are encrypted and administrator-only. Their content expires after 90
                days and is cleared the next time this inbox is opened.
              </p>
              <button className="secondary-button" onClick={() => void loadFormSubmissions()}>
                Refresh submissions
              </button>
              {formSubmissions.length ? (
                <div className="phase3-table-wrap">
                  <table className="phase3-table">
                    <thead>
                      <tr>
                        <th>Received</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Company</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formSubmissions.map((entry: any) => (
                        <tr key={entry.id}>
                          <td>{new Date(entry.created_at).toLocaleString()}</td>
                          <td>{entry.name || 'Expired'}</td>
                          <td>{entry.email || ''}</td>
                          <td>{entry.company || ''}</td>
                          <td>{entry.message || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No website inquiries received yet.</p>
              )}
            </section>
          ) : section === 'media' ? (
            <section className="panel website-management-panel">
              <h2>Public media library</h2>
              <p>Only explicitly public, rights-acknowledged images are stored here. Private Documents are not selectable.</p>
              <Field label="Upload JPEG, PNG or WebP (512 KiB max)">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void readMediaFile(e.target.files?.[0])} />
              </Field>
              <Field label="Media label"><input value={mediaLabel} onChange={(e) => setMediaLabel(e.target.value)} /></Field>
              <Field label="Alternative text"><input maxLength={300} value={mediaAlt} onChange={(e) => setMediaAlt(e.target.value)} /></Field>
              <label className="checkbox-field"><input type="checkbox" checked={ackPublicUse} onChange={(e) => setAckPublicUse(e.target.checked)} />I authorize this image for public website use.</label>
              <label className="checkbox-field"><input type="checkbox" checked={ackRights} onChange={(e) => setAckRights(e.target.checked)} />I have the rights needed to publish this image.</label>
              <div className="phase3-actions">
                <button className="button" disabled={busy || !mediaBase64 || !mediaLabel.trim() || !mediaAlt.trim() || !ackPublicUse || !ackRights} onClick={() => void uploadMedia()}>Upload public media</button>
                <button className="secondary-button" onClick={() => void loadMedia()}>Refresh library</button>
              </div>
              <div className="website-media-grid">
                {media.map((asset: any) => (
                  <article className="website-media-card" key={asset.id}>
                    {mediaPreviews[asset.id] ? <img src={mediaPreviews[asset.id]} alt={asset.alt_text || asset.label} /> : <button className="secondary-button" onClick={() => void previewMedia(asset.id)}>Load preview</button>}
                    <strong>{asset.label}</strong><span>{asset.alt_text || 'Alternative text missing'}</span>
                    <span>{asset.status === 'active' ? 'Active public media' : 'Withdrawn'}</span>
                    {asset.status === 'active' && <button className="secondary-button" disabled={busy} onClick={() => void withdrawMedia(asset)}>Withdraw public media</button>}
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <div className="phase3-workspace-grid">
              {['Menus', 'Theme', 'Media', 'Forms', 'SEO', 'Publication', 'Settings'].map((x) => (
                <button
                  className="panel website-section-link"
                  key={x}
                  onClick={() => choosePanel(x)}
                >
                  <h3>{x}</h3>
                  <span>Open {x.toLowerCase()} settings</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {showTemplates && (
        <Overlay portal onClose={() => setShowTemplates(false)}>
          <section
            className="panel phase3-dialog template-gallery"
            role="dialog"
            aria-modal="true"
            aria-labelledby="website-template-title"
          >
            <header>
              <h2 id="website-template-title">New Page · Choose a template</h2>
              <button
                className="icon-button"
                onClick={() => setShowTemplates(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="template-card-grid">
              {Object.entries(templates).map(([name, sections]: any) => (
                <button
                  key={name}
                  className="template-card"
                  onClick={() => void create(name)}
                  disabled={busy}
                >
                  <div className="template-preview">
                    {sections.length ? (
                      sections.map((s: any, i: number) => <span key={i}>{s.type}</span>)
                    ) : (
                      <span>Blank Page</span>
                    )}
                  </div>
                  <strong>{name}</strong>
                  <small>{sections.length} editable blocks</small>
                </button>
              ))}
            </div>
            <footer>
              <button className="secondary-button" onClick={() => setShowTemplates(false)}>
                Cancel
              </button>
            </footer>
          </section>
        </Overlay>
      )}
    </main>
  );
}
