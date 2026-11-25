import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Overlay } from '../components/Overlay';
import { Field, type API } from '../operations/UI';
import { appNavigationEvent } from './AppNavigation';
import { publicWebsiteCtaHref } from './public-website-links';
import { moveWebsiteBlock, moveWebsiteBlockSelection } from './website-editor';
import './phase3-apps.css';
const websiteBlockTypes = [
  'hero', 'heading', 'text', 'image', 'gallery', 'columns', 'features', 'cta',
  'testimonial', 'pricing', 'faq', 'contact', 'contact_form', 'footer', 'commerce_showcase',
] as const;
const blockDragType = 'application/x-africore-website-block';
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
      button_url: 'https://example.com',
    },
    {
      type: 'features',
      title: 'What we offer',
      body: 'Fast Onboarding :: Launch in minutes with clear workflows\nConnected Operations :: Keep customer inquiries and orders in sync\nTrusted Security :: Built-in review and audit trails',
    },
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
    [fullPreviewOpen, setFullPreviewOpen] = useState(false),
    [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop'),
    [query, setQuery] = useState(''),
    [pageStatus, setPageStatus] = useState<'all' | 'published' | 'draft'>('all'),
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
    [draggedSection, setDraggedSection] = useState<number | null>(null),
    [dropTargetSection, setDropTargetSection] = useState<number | null>(null),
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
        const match =
          (r.data || []).find((x: any) => x.id === requestedPage) ||
          (section !== 'pages' ? (r.data || [])[0] : null);
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
      const url = new URL(location.href);
      url.searchParams.set('section', 'editor');
      if (r?.id) url.searchParams.set('page', r.id);
      history.pushState(null, '', url.pathname + url.search + url.hash);
      dispatchEvent(new Event(appNavigationEvent));
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
        canonical_path: '',
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
    setError('');
    try {
      let currentRecord = selected;
      const savedPage = pages.find((p: any) => p.id === selected.id);
      if (!savedPage || JSON.stringify(savedPage.data) !== JSON.stringify(selected.data)) {
        const { published_version, public_url, published_at, ...draft } = selected.data;
        currentRecord = await api(
          `/website/pages/${selected.id}`,
          'PUT',
          { ...draft, expected_version: selected.version },
          { 'Idempotency-Key': crypto.randomUUID() },
        );
        setSelected(currentRecord);
      }
      const r = await api(
        `/website/pages/${currentRecord.id}/publish`,
        'POST',
        { expected_version: currentRecord.version },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setNotice(
        r.url
          ? `Saved & published snapshot v${r.version}. Live at ${r.url}.`
          : `Saved & published snapshot v${r.version}! Click "Live Site Preview" to view your full website.`,
      );
      await Promise.all([load(), loadIdentity()]);
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
      await Promise.all([load(), loadIdentity()]);
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
  async function convertFormToLead(entry: any) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api(
        `/website/forms/${encodeURIComponent(entry.id)}/convert-to-crm`,
        'POST',
        {},
      );
      setNotice(`CRM lead created for inquiry ${entry.id}.`);
      await loadFormSubmissions();
      return response;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
      await Promise.all([load(), loadIdentity()]);
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
    const galleryIds: string[] = current.image_ids || (current.image_id ? [current.image_id] : []);
    if (current.type === 'gallery' && !galleryIds.includes(asset.id) && galleryIds.length >= 12) {
      setError('A gallery can contain up to 12 reviewed images. Remove one before adding another.');
      return;
    }
    setSelected({
      ...selected,
      data: {
        ...selected.data,
        sections: selected.data.sections.map((item: any, i: number) =>
          i === index
            ? current.type === 'gallery'
              ? {
                  ...item,
                  image_ids: [...new Set([...(item.image_ids || (item.image_id ? [item.image_id] : [])), asset.id])],
                  image_id: null,
                  image_url: '',
                  alt: asset.alt,
                }
              : { ...item, image_id: asset.id, image_url: '', alt: asset.alt }
            : item,
        ),
      },
    });
    if (previewUrl) setMediaPreviews((current) => ({ ...current, [asset.id]: previewUrl }));
    setError('');
    setNotice(current.type === 'gallery'
      ? `Image added to the gallery (${Math.min(12, galleryIds.length + (galleryIds.includes(asset.id) ? 0 : 1))} of 12). Save the page draft to keep the change.`
      : `Image attached to ${current.type} block. Save the page draft to keep the change.`);
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
    const mapped =
      label === 'Website Editor' ? 'editor' : label.toLowerCase().replaceAll(' ', '-');
    if (!selected && pages.length > 0 && ['editor', 'menus', 'theme', 'seo', 'publication'].includes(mapped)) {
      const fallback = pages.find((p) => p.id === identity?.data?.default_page_id) || pages[0];
      if (fallback) setSelected(fallback);
    }
    const url = new URL(location.href);
    url.searchParams.set('section', mapped);
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
  }
  const data = selected?.data,
    defaultPageSlug = pages.find((page) => page.id === identity?.data?.default_page_id)?.data?.slug,
    filtered = pages.filter((page) => {
      const status = page.data.published_version ? 'published' : 'draft';
      return (pageStatus === 'all' || pageStatus === status) &&
        (page.data.title + ' ' + page.data.slug).toLowerCase().includes(query.trim().toLowerCase());
    }),
    selectedMediaIds = (data?.sections || [])
      .flatMap((item: any) => [item.image_id, ...(item.image_ids || [])])
      .filter(Boolean)
      .join(',');
  const siteAddressField = identity?.data && (
    <Field label="Website address">
      <input
        value={identity.data.site_slug || ''}
        maxLength={63}
        placeholder="your-business"
        onChange={(event) => setIdentity({ ...identity, data: { ...identity.data, site_slug: event.target.value } })}
      />
      <small>Publish the default page to activate /sites/{identity.data.site_slug || 'your-business'}/home.</small>
    </Field>
  );
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
  function insertBlock(type: string, position: number) {
    if (preview || busy || !selected || !websiteBlockTypes.some((item) => item === type) || data.sections.length >= 60)
      return;
    setSelected({
      ...selected,
      editingSection: position,
      data: {
        ...data,
        sections: data.sections.toSpliced(position, 0, {
          type,
          title: type.replaceAll('_', ' '),
          body: '',
          background: '#ffffff',
        }),
      },
    });
  }
  useEffect(() => {
    if (section === 'media' || section === 'settings') void loadMedia();
    if (section === 'forms') void loadFormSubmissions();
    if (section === 'publication' && selected) void loadPublicationHistory();
    if (!selected && pages.length > 0 && ['editor', 'menus', 'theme', 'seo', 'publication'].includes(section)) {
      const fallback = pages.find((p) => p.id === identity?.data?.default_page_id) || pages[0];
      if (fallback) setSelected(fallback);
    }
  }, [section, scope, selected?.id, pages.length]);
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
          <h2>{selected ? data?.title || 'Website Editor' : 'AfriCore Website Builder'}</h2>
          <p>Click any text on the canvas to edit inline · Preview across devices · 1-click Save &amp; Publish</p>
        </div>
        <div className="phase3-actions">
          {pages.length > 0 && (
            <select
              aria-label="Switch active page"
              value={selected?.id || ''}
              onChange={(e) => {
                const match = pages.find((p) => p.id === e.target.value);
                if (match) selectPage(match);
                else choosePanel('Pages');
              }}
            >
              <option value="">All Pages ({pages.length})</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.data.title} (/{p.data.slug})
                </option>
              ))}
            </select>
          )}
          <button className="secondary-button" onClick={() => setShowTemplates(true)}>
            + New Page
          </button>
          <button
            className="secondary-button"
            disabled={!selected}
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? 'Edit Canvas' : 'Inline Preview'}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!selected}
            onClick={() => setFullPreviewOpen(true)}
          >
            Live Site Preview
          </button>
          {selected && (
            <>
              <button className="secondary-button" aria-label="Undo draft change" title="Undo (Ctrl+Z)" disabled={editorHistory.current.cursor <= 0} onClick={undoEditor}>↶ Undo</button>
              <button className="secondary-button" aria-label="Redo draft change" title="Redo (Ctrl+Y)" disabled={editorHistory.current.cursor >= editorHistory.current.entries.length - 1} onClick={redoEditor}>↷ Redo</button>
              <button className="secondary-button" disabled={busy} onClick={() => void save()}>
                Save Draft
              </button>
            </>
          )}
          <button className="button" disabled={!selected || busy} onClick={() => void publish()}>
            {busy ? 'Publishing…' : 'Save & Publish'}
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
          {identity?.public_home_url && (
            <a className="secondary-button" href={identity.public_home_url} target="_blank" rel="noreferrer">
              Open site home ↗
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
      {selected && section !== 'pages' ? (
        <>
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
              <Field label="Typography">
                <select value={data.theme?.typography || 'system'} onChange={(e) => setSelected({ ...selected, data: { ...data, theme: { ...(data.theme || {}), typography: e.target.value } } })}>
                  <option value="system">System sans serif</option>
                  <option value="modern">Modern sans serif</option>
                  <option value="serif">Editorial serif</option>
                </select>
              </Field>
              <Field label="Page background">
                <input type="color" value={data.theme?.background || '#ffffff'} onChange={(e) => setSelected({ ...selected, data: { ...data, theme: { ...(data.theme || {}), background: e.target.value } } })} />
              </Field>
              <Field label="Section spacing">
                <select value={data.theme?.section_spacing || 'standard'} onChange={(e) => setSelected({ ...selected, data: { ...data, theme: { ...(data.theme || {}), section_spacing: e.target.value } } })}>
                  <option value="compact">Compact</option>
                  <option value="standard">Standard</option>
                  <option value="relaxed">Relaxed</option>
                </select>
              </Field>
              <Field label="Header style">
                <select value={data.theme?.header_style || 'plain'} onChange={(e) => setSelected({ ...selected, data: { ...data, theme: { ...(data.theme || {}), header_style: e.target.value } } })}>
                  <option value="plain">Plain</option>
                  <option value="sticky">Sticky</option>
                  <option value="contrast">Brand contrast</option>
                </select>
              </Field>
              <Field label="Footer style">
                <select value={data.theme?.footer_style || 'light'} onChange={(e) => setSelected({ ...selected, data: { ...data, theme: { ...(data.theme || {}), footer_style: e.target.value } } })}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Field>
              <Field label="Buttons">
                <select value={data.theme?.button_style || 'rounded'} onChange={(e) => setSelected({ ...selected, data: { ...data, theme: { ...(data.theme || {}), button_style: e.target.value } } })}>
                  <option value="rounded">Rounded</option>
                  <option value="square">Square</option>
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
              <Field label="Canonical page">
                <select
                  value={data.canonical_path || ''}
                  onChange={(e) => setSelected({ ...selected, data: { ...data, canonical_path: e.target.value } })}
                >
                  <option value="">Use this page’s published URL</option>
                  {!!data.canonical_path && !pages.some((page) => page.id !== selected.id && page.data.public_url === data.canonical_path) && (
                    <option value={data.canonical_path}>{data.canonical_path}</option>
                  )}
                  {pages.filter((page) => page.id !== selected.id && page.data.public_url && !page.data.noindex).map((page) => (
                    <option key={page.id} value={page.data.public_url}>{page.data.title} · {page.data.public_url}</option>
                  ))}
                </select>
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
                      disabled={asset.status !== 'active' || (selected?.editingSection !== undefined && selected.data.sections[selected.editingSection]?.type === 'gallery' && (selected.data.sections[selected.editingSection]?.image_ids || []).length >= 12 && !(selected.data.sections[selected.editingSection]?.image_ids || []).includes(asset.id))}
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
                        <th>CRM</th>
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
                          <td>
                            {entry.status === 'new' ? (
                              <button className="secondary-button" disabled={busy} onClick={() => void convertFormToLead(entry)}>
                                Create CRM lead
                              </button>
                            ) : entry.status === 'converted' ? 'Lead created' : 'Unavailable'}
                          </td>
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
                  {siteAddressField}
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
                  '--website-font': data.theme?.typography === 'serif' ? 'Georgia, serif' : data.theme?.typography === 'modern' ? 'Arial, Helvetica, sans-serif' : 'system-ui, sans-serif',
                  '--website-background': data.theme?.background || '#ffffff',
                  '--website-section-spacing': data.theme?.section_spacing === 'compact' ? '28px' : data.theme?.section_spacing === 'relaxed' ? '64px' : '46px',
                  '--website-button-radius': data.theme?.button_style === 'square' ? '2px' : '8px',
                } as CSSProperties
              }
            >
              <header className={'website-preview-header website-header-' + (data.theme?.header_style || 'plain')}>
                <strong>{identity?.data?.name || 'AfriCore Website'}</strong>
                <nav aria-label="Draft website navigation">
                  {renderDraftMenus(data.menus || [], () => setNotice('Draft navigation preview. Links become active when published.'))}
                </nav>
              </header>
              {data.sections.map((s: any, i: number) => (
                <article
                  key={i}
                  draggable={!preview}
                  className={'website-section website-block-' + s.type + (dropTargetSection === i ? ' website-section-drop-target' : '')}
                  data-content-width={s.content_width}
                  data-alignment={s.alignment}
                  data-layout-columns={s.layout_columns}
                  style={{ background: s.background || '#fff' }}
                  onClick={() => setSelected({ ...selected, editingSection: i })}
                  onDragStart={(event) => {
                    if (preview) return;
                    setDraggedSection(i);
                    setDropTargetSection(null);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(i));
                    event.currentTarget.classList.add('website-section-dragging');
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (!preview) setDropTargetSection(i);
                  }}
                  onDragOver={(event) => {
                    if (preview || (!event.dataTransfer.types.includes(blockDragType) && draggedSection === null)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(blockDragType) ? 'copy' : 'move';
                  }}
                  onDrop={(event) => {
                    if (preview) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const type = event.dataTransfer.getData(blockDragType);
                    if (type) insertBlock(type, i);
                    else if (draggedSection !== null) {
                      setSelected({
                        ...selected,
                        editingSection: moveWebsiteBlockSelection(selected.editingSection, draggedSection, i),
                        data: { ...data, sections: moveWebsiteBlock(data.sections, draggedSection, i) },
                      });
                    }
                    setDraggedSection(null);
                    setDropTargetSection(null);
                  }}
                  onDragEnd={(event) => {
                    event.currentTarget.classList.remove('website-section-dragging');
                    setDraggedSection(null);
                    setDropTargetSection(null);
                  }}
                >
                  <div>
                    {s.type === 'gallery' && (s.image_ids || []).length ? (
                      <div className="website-draft-gallery">
                        {(s.image_ids || []).map((id: string, imageIndex: number) =>
                          mediaPreviews[id] ? (
                            <img key={id} className="website-draft-image" src={mediaPreviews[id]} alt={s.alt || `Gallery image ${imageIndex + 1}`} />
                          ) : <div key={id} className="website-image-placeholder">Loading image {imageIndex + 1}</div>,
                        )}
                      </div>
                    ) : s.image_id && mediaPreviews[s.image_id] ? (
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
                    {(() => {
                      const ctaHref = publicWebsiteCtaHref(
                        s.button_label,
                        s.button_url,
                        data.slug,
                        defaultPageSlug,
                      );
                      return s.button_label ? (
                        preview && ctaHref ? (
                          <a className="button" href={ctaHref}>{s.button_label}</a>
                        ) : (
                          <span
                            className="button"
                            aria-disabled="true"
                            title={ctaHref ? 'Switch to preview to follow this link.' : 'Add a valid link to enable this call to action.'}
                          >
                            {s.button_label}
                          </span>
                        )
                      ) : null;
                    })()}
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
              {!preview && data.sections.length < 60 && (
                <div className="website-block-drop"
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes(blockDragType)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    insertBlock(event.dataTransfer.getData(blockDragType), data.sections.length);
                    setDropTargetSection(null);
                  }}
                >Drop a block here</div>
              )}
              <footer className={'website-footer website-footer-' + (data.theme?.footer_style || 'light')}>
                {identity?.data?.name || data.title} · Public content preview
              </footer>
            </section>
            <aside className="website-editor-sidebar">
              <div className="phase3-tabs">
                <button type="button" onClick={() => choosePanel('Theme')}>Edit theme</button>
              </div>
              <h3>Insert a block</h3>
              {websiteBlockTypes.map((type) => (
                <button
                  className="website-block-choice"
                  key={type}
                  type="button"
                  draggable={!preview && !busy && data.sections.length < 60}
                  disabled={preview || busy || data.sections.length >= 60}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData(blockDragType, type);
                  }}
                  onDragEnd={() => setDropTargetSection(null)}
                  onClick={() => insertBlock(type, data.sections.length)}
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
                  <Field label="Content width">
                    <select value={data.sections[selected.editingSection].content_width || 'theme'} onChange={(event) => updateSelectedBlock('content_width', event.target.value)}>
                      <option value="theme">Use theme width</option>
                      <option value="narrow">Narrow</option>
                      <option value="wide">Wide</option>
                    </select>
                  </Field>
                  <Field label="Content alignment">
                    <select value={data.sections[selected.editingSection].alignment || 'start'} onChange={(event) => updateSelectedBlock('alignment', event.target.value)}>
                      <option value="start">Start</option>
                      <option value="center">Center</option>
                    </select>
                  </Field>
                  {['columns', 'features', 'gallery', 'pricing'].includes(data.sections[selected.editingSection].type) && (
                    <Field label="Desktop columns">
                      <select value={data.sections[selected.editingSection].layout_columns || 'auto'} onChange={(event) => updateSelectedBlock('layout_columns', event.target.value)}>
                        <option value="auto">Fit to content</option>
                        <option value="two">Two columns</option>
                        <option value="three">Three columns</option>
                      </select>
                    </Field>
                  )}
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
                  {data.sections[selected.editingSection].type === 'gallery' && (
                    <div className="website-gallery-editor">
                      <p className="muted">Choose up to 12 active, reviewed media assets in Media. Gallery images are included in the publication snapshot.</p>
                      {(data.sections[selected.editingSection].image_ids || []).map((id: string, imageIndex: number) => (
                        <div key={id} className="website-gallery-item">
                          <span>Image {imageIndex + 1}</span>
                          <button className="quiet-button" onClick={() => updateSelectedBlock('image_ids', (data.sections[selected.editingSection].image_ids || []).filter((item: string) => item !== id) as any)}>Remove</button>
                        </div>
                      ))}
                    </div>
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
                {siteAddressField}
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
            <Field label="Publication status">
              <select value={pageStatus} onChange={(event) => setPageStatus(event.target.value as typeof pageStatus)}>
                <option value="all">All pages</option>
                <option value="draft">Drafts</option>
                <option value="published">Published</option>
              </select>
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
                {!filtered.length && <tr><td colSpan={7}>{pages.length ? 'No pages match these filters.' : 'No pages yet.'}</td></tr>}
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
                        <th>Status</th>
                        <th>CRM</th>
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
                          <td>
                            {entry.status === 'new' ? (
                              <button className="secondary-button" disabled={busy} onClick={() => void convertFormToLead(entry)}>
                                Create CRM lead
                              </button>
                            ) : entry.status === 'converted' ? 'Lead created' : 'Unavailable'}
                          </td>
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
      {fullPreviewOpen && selected && (
        <Overlay portal onClose={() => setFullPreviewOpen(false)}>
          <section
            className="panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="website-live-preview-title"
            style={{
              width: 'min(1140px, 96vw)',
              maxHeight: '92vh',
              overflow: 'auto',
              padding: 0,
            }}
          >
            <div
              style={{
                padding: '12px 20px',
                background: '#0f172a',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                <strong id="website-live-preview-title">
                  {identity?.data?.name || 'Website'} — /{data.slug}
                </strong>
                <small style={{ display: 'block', color: '#94a3b8' }}>
                  {data.published_version
                    ? `Published v${data.published_version} · Live Interactive Preview`
                    : 'Draft Preview · Works immediately in Sandbox & Production'}
                </small>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPreviewViewport('desktop')}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPreviewViewport('tablet')}
                >
                  Tablet
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPreviewViewport('mobile')}
                >
                  Mobile
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => void publish()}
                >
                  {busy ? 'Publishing…' : 'Save & Publish'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setFullPreviewOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div
              style={{
                background: '#e2e8f0',
                padding: previewViewport === 'desktop' ? '0' : '20px',
              }}
            >
              <div
                className="website-canvas website-preview"
                style={
                  {
                    maxWidth:
                      previewViewport === 'mobile'
                        ? '390px'
                        : previewViewport === 'tablet'
                          ? '768px'
                          : '100%',
                    margin: '0 auto',
                    '--website-primary': data.theme?.primary || '#087e78',
                    '--website-content-width': data.theme?.width === 'wide' ? '1120px' : '900px',
                    '--website-font':
                      data.theme?.typography === 'serif'
                        ? 'Georgia, serif'
                        : data.theme?.typography === 'modern'
                          ? 'Arial, Helvetica, sans-serif'
                          : 'system-ui, sans-serif',
                    '--website-background': data.theme?.background || '#ffffff',
                    '--website-section-spacing':
                      data.theme?.section_spacing === 'compact'
                        ? '28px'
                        : data.theme?.section_spacing === 'relaxed'
                          ? '64px'
                          : '46px',
                    '--website-button-radius': data.theme?.button_style === 'square' ? '2px' : '8px',
                  } as CSSProperties
                }
              >
                <header
                  className={
                    'website-preview-header website-header-' + (data.theme?.header_style || 'plain')
                  }
                >
                  <strong>{identity?.data?.name || 'AfriCore Website'}</strong>
                  <nav aria-label="Full website preview navigation">
                    {renderDraftMenus(data.menus || [], () => {})}
                  </nav>
                </header>
                {(data.sections || []).map((s: any, idx: number) => (
                  <article
                    key={idx}
                    className={'website-section website-block-' + s.type}
                    style={{ background: s.background || '#fff' }}
                  >
                    <div>
                      <DraftBlockContent
                        block={s}
                        editable={false}
                        onTitle={() => {}}
                        onBody={() => {}}
                      />
                      {s.button_label && (
                        <span className="button" style={{ marginTop: '12px', display: 'inline-block' }}>
                          {s.button_label}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
                <footer
                  className={'website-footer website-footer-' + (data.theme?.footer_style || 'light')}
                >
                  {identity?.data?.name || data.title}
                </footer>
              </div>
            </div>
          </section>
        </Overlay>
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
