import { useEffect, useState, type CSSProperties } from 'react';
import { publicWebsiteCtaHref, publicWebsiteHref } from './public-website-links';
import { currencyDigits } from '../../../src/finance/money';
import './phase3-apps.css';

function CommerceShowcase({ section, websiteSlug }: { section: any; websiteSlug: string }) {
  const storeSlug = String(section.storefront_slug || ''),
    [catalog, setCatalog] = useState<any>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null);
    setFailed(false);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeSlug)) return () => controller.abort();
    fetch(`/api/v1/storefronts/production/${encodeURIComponent(storeSlug)}?offset=0`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Store unavailable');
        return response.json();
      })
      .then((result) => {
        if (!controller.signal.aborted && Array.isArray(result.products)) setCatalog(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [storeSlug]);
  const products = (catalog?.products || []).slice(0, 4);
  return (
    <>
      <h2>{section.title}</h2>
      {String(section.body || '')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line: string, index: number) => <p key={index}>{line}</p>)}
      {!storeSlug ? (
        <p role="status">This product section is not connected to a published Commerce storefront.</p>
      ) : failed ? (
        <p role="status">The published storefront is not currently available.</p>
      ) : !catalog ? (
        <p role="status">Loading published products…</p>
      ) : !products.length ? (
        <p>No published products are available.</p>
      ) : (
        <div className="website-commerce-products">
          {products.map((product: any) => {
            const digits = currencyDigits[product.currency as keyof typeof currencyDigits] ?? 2;
            const price = new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: product.currency,
              maximumFractionDigits: digits,
            }).format(product.unit_price_minor / 10 ** digits);
            const image = product.images?.[0];
            return (
              <article key={product.listing_id}>
                {image && (
                  <img
                    src={`/api/v1/storefronts/production/${encodeURIComponent(storeSlug)}/assets/${encodeURIComponent(image.id)}`}
                    alt={image.alt || product.name}
                    loading="lazy"
                  />
                )}
                <h3>{product.name}</h3>
                <p>{product.description}</p>
                <strong>{price}</strong>
              </article>
            );
          })}
        </div>
      )}
      {storeSlug && (
        <a className="button" href={`/s/production/${encodeURIComponent(storeSlug)}`}>
          {section.button_label || 'Visit store'}
        </a>
      )}
      {section.button_url && !storeSlug && (
        <a className="button" href={publicWebsiteHref(section.button_url, websiteSlug)}>
          {section.button_label || 'Learn more'}
        </a>
      )}
    </>
  );
}

export function PublicWebsite({ slug }: { slug: string }) {
  const [page, setPage] = useState<any>(null),
    [missing, setMissing] = useState(false),
    [loadError, setLoadError] = useState(''),
    [formStatus, setFormStatus] = useState<Record<number, string>>({}),
    [formBusy, setFormBusy] = useState<Record<number, boolean>>({});
  async function submitForm(index: number, form: HTMLFormElement) {
    const body = Object.fromEntries(new FormData(form).entries());
    setFormBusy((current) => ({ ...current, [index]: true }));
    setFormStatus((current) => ({ ...current, [index]: '' }));
    try {
      const response = await fetch('/api/public/sites/' + encodeURIComponent(slug) + '/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, consent: body.consent === 'on' }),
      });
      if (!response.ok)
        throw Error('The form could not be submitted. Check your details and try again.');
      form.reset();
      setFormStatus((current) => ({
        ...current,
        [index]: 'Thanks. Your message has been received.',
      }));
    } catch (error) {
      setFormStatus((current) => ({ ...current, [index]: (error as Error).message }));
    } finally {
      setFormBusy((current) => ({ ...current, [index]: false }));
    }
  }
  useEffect(() => {
    let live = true;
    setPage(null);
    setMissing(false);
    setLoadError('');
    setFormStatus({});
    setFormBusy({});
    fetch('/api/public/sites/' + encodeURIComponent(slug))
      .then((r) => {
        if (r.status === 404 || r.status === 410) {
          if (live) setMissing(true);
          return null;
        }
        if (!r.ok) throw Error('The website page could not be loaded.');
        return r.json();
      })
      .then((d) => {
        if (live && d) setPage(d);
      })
      .catch((error) => {
        if (live) setLoadError((error as Error).message || 'The website page could not be loaded.');
      });
    return () => {
      live = false;
    };
  }, [slug]);
  useEffect(() => {
    if (!page) return;
    const priorTitle = document.title;
    const managed: { element: Element; existed: boolean; content: string | null }[] = [];
    const setMeta = (selector: string, create: () => Element, value: string) => {
      let element = document.head.querySelector(selector);
      const existed = !!element;
      if (!element) {
        element = create();
        document.head.append(element);
      }
      const content = element.getAttribute('content');
      element.setAttribute('content', value);
      managed.push({ element, existed, content });
    };
    const title = String(page.meta_title || page.title || page.site?.name || 'Website');
    const description = String(page.meta_description || page.site?.description || '').slice(0, 320);
    document.title = title;
    setMeta('meta[name="description"]', () => {
      const node = document.createElement('meta');
      node.setAttribute('name', 'description');
      return node;
    }, description);
    setMeta('meta[name="robots"]', () => {
      const node = document.createElement('meta');
      node.setAttribute('name', 'robots');
      return node;
    }, page.noindex ? 'noindex, nofollow' : 'index, follow');
    setMeta('meta[property="og:title"]', () => {
      const node = document.createElement('meta');
      node.setAttribute('property', 'og:title');
      return node;
    }, title);
    setMeta('meta[property="og:description"]', () => {
      const node = document.createElement('meta');
      node.setAttribute('property', 'og:description');
      return node;
    }, description);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    const canonicalExisted = !!canonical;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.append(canonical);
    }
    const oldHref = canonical.getAttribute('href');
    const canonicalPath = typeof page.canonical_path === 'string' && /^\/sites\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.canonical_path)
      ? page.canonical_path
      : '/sites/' + encodeURIComponent(slug);
    canonical.setAttribute('href', location.origin + canonicalPath);
    return () => {
      document.title = priorTitle;
      for (const entry of managed) {
        if (!entry.existed) entry.element.remove();
        else if (entry.content === null) entry.element.removeAttribute('content');
        else entry.element.setAttribute('content', entry.content);
      }
      if (!canonicalExisted) canonical?.remove();
      else if (oldHref === null) canonical?.removeAttribute('href');
      else canonical?.setAttribute('href', oldHref);
    };
  }, [page, slug]);
  if (missing)
    return (
      <main className="public-site-missing">
        <h1>Page not found</h1>
        <p>This website page is unpublished or unavailable.</p>
      </main>
    );
  if (loadError)
    return (
      <main className="public-site-missing" role="alert">
        <h1>Website temporarily unavailable</h1>
        <p>{loadError}</p>
      </main>
    );
  if (!page)
    return (
      <main className="public-site-missing" role="status">
        Loading page…
      </main>
    );
  return (
    <main
      className="public-site"
      style={{
        '--website-primary': page.theme?.primary || page.site?.brand_color || '#087e78',
        '--website-content-width': page.theme?.width === 'wide' ? '1120px' : '900px',
        '--website-font': page.theme?.typography === 'serif' ? 'Georgia, serif' : page.theme?.typography === 'modern' ? 'Arial, Helvetica, sans-serif' : 'system-ui, sans-serif',
        '--website-background': page.theme?.background || '#ffffff',
        '--website-section-spacing': page.theme?.section_spacing === 'compact' ? '28px' : page.theme?.section_spacing === 'relaxed' ? '64px' : '46px',
        '--website-button-radius': page.theme?.button_style === 'square' ? '2px' : '8px',
      } as CSSProperties}
    >
      <header className={'website-header-' + (page.theme?.header_style || 'plain')}>
        {page.site?.logo_media_id && (
          <img
            className="public-site-logo"
            src={`/api/public/sites/${encodeURIComponent(slug)}/media/${page.site.logo_media_id}`}
            alt=""
          />
        )}
        <strong>{page.site?.name || page.title}</strong>
        <nav aria-label="Website navigation">
          {renderMenus(page.menus || [], slug, page.site?.default_page_slug, page.site?.home_url)}
        </nav>
      </header>
      {page.sections.map((s: any, i: number) => {
        const lines = String(s.body || '')
          .split(/\r?\n/)
          .map((line: string) => line.trim())
          .filter(Boolean);
        const ctaHref = publicWebsiteCtaHref(
          s.button_label,
          s.button_url,
          slug,
          page.site?.default_page_slug,
          page.site?.home_url,
        );
        const image = s.image_id ? (
          <img
            src={`/api/public/sites/${encodeURIComponent(slug)}/media/${s.image_id}`}
            alt={s.alt || ''}
          />
        ) : null;
        const paragraphs = lines.map((line: string, index: number) => <p key={index}>{line}</p>);
        return (
          <section
            key={i}
            className={'website-section website-block-' + s.type}
            data-content-width={s.content_width}
            data-alignment={s.alignment}
            data-layout-columns={s.layout_columns}
            style={{ background: s.background || '#fff' }}
          >
            <div>
              {s.type === 'hero' ? (
                <>
                  {image}
                  <h1>{s.title}</h1>
                  {paragraphs}
                  {ctaHref && (
                    <a className="button" href={ctaHref}>
                      {s.button_label}
                    </a>
                  )}
                </>
              ) : s.type === 'heading' ? (
                <h2>{s.title}</h2>
              ) : s.type === 'image' || s.type === 'gallery' ? (
                <>
                  {s.title && <h2>{s.title}</h2>}
                  {s.type === 'gallery' && (s.image_ids || []).length ? (
                    <div className="website-public-gallery">
                      {(s.image_ids || []).map((id: string, index: number) => (
                        <img
                          key={id}
                          src={`/api/public/sites/${encodeURIComponent(slug)}/media/${id}`}
                          alt={s.alt || `Gallery image ${index + 1}`}
                          loading="lazy"
                        />
                      ))}
                    </div>
                  ) : image || (
                    <p className="website-image-placeholder">
                      Add a reviewed image in the Website media library.
                    </p>
                  )}
                  {s.type === 'gallery' && paragraphs}
                </>
              ) : s.type === 'features' || s.type === 'columns' ? (
                <>
                  <h2>{s.title}</h2>
                  <div
                    className={
                      s.type === 'features' ? 'website-feature-grid' : 'website-columns-grid'
                    }
                  >
                    {lines.map((line: string, index: number) => {
                      const [heading, ...description] = line
                        .split('::')
                        .map((part: string) => part.trim());
                      return (
                        <article key={index}>
                          <h3>{heading}</h3>
                          {description.length > 0 && <p>{description.join('::')}</p>}
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : s.type === 'faq' ? (
                <>
                  <h2>{s.title}</h2>
                  {lines.map((line: string, index: number) => {
                    const [question, ...answer] = line
                      .split('::')
                      .map((part: string) => part.trim());
                    return (
                      <details key={index}>
                        <summary>{question}</summary>
                        <p>{answer.join('::')}</p>
                      </details>
                    );
                  })}
                </>
              ) : s.type === 'pricing' ? (
                <>
                  <h2>{s.title}</h2>
                  <div className="website-pricing-grid">
                    {lines.map((line: string, index: number) => {
                      const [name, price, ...description] = line
                        .split('|')
                        .map((part: string) => part.trim());
                      return (
                        <article key={index}>
                          <h3>{name}</h3>
                          {price && <strong>{price}</strong>}
                          {description.length > 0 && <p>{description.join('|')}</p>}
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : s.type === 'testimonial' ? (
                <>
                  <h2>{s.title}</h2>
                  <blockquote>{s.body}</blockquote>
                </>
              ) : s.type === 'contact_form' ? (
                <>
                  <h2>{s.title}</h2>
                  {paragraphs}
                  <form
                    className="public-contact-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitForm(i, event.currentTarget);
                    }}
                  >
                    <label>
                      Name <input name="name" autoComplete="name" required maxLength={120} />
                    </label>
                    <label>
                      Email{' '}
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                      />
                    </label>
                    <label>
                      Company <input name="company" autoComplete="organization" maxLength={120} />
                    </label>
                    <label>
                      Message{' '}
                      <textarea name="message" required minLength={5} maxLength={4000} rows={5} />
                    </label>
                    <label className="public-contact-consent">
                      <input name="consent" type="checkbox" required /> I agree that the site team
                      may use these details to respond to my inquiry.
                    </label>
                    <label className="public-contact-honeypot" aria-hidden="true">
                      Website <input name="website" tabIndex={-1} autoComplete="off" />
                    </label>
                    <button className="button" type="submit" disabled={formBusy[i]}>
                      {formBusy[i] ? 'Sending…' : 'Send message'}
                    </button>
                    {formStatus[i] && <p role="status">{formStatus[i]}</p>}
                  </form>
                </>
              ) : s.type === 'commerce_showcase' ? (
                <CommerceShowcase section={s} websiteSlug={slug} />
              ) : s.type === 'footer' ? (
                <>
                  <h2>{s.title}</h2>
                  {paragraphs}
                </>
              ) : (
                <>
                  {s.title && <h2>{s.title}</h2>}
                  {image}
                  {paragraphs}
                  {ctaHref && (
                    <a className="button" href={ctaHref}>
                      {s.button_label}
                    </a>
                  )}
                </>
              )}
            </div>
          </section>
        );
      })}
      <footer className={'website-footer website-footer-' + (page.theme?.footer_style || 'light')}>
        {page.site?.name || page.title}
      </footer>
    </main>
  );
}
function renderMenus(
  menus: any[],
  currentSlug: string,
  defaultSlug?: string | null,
  homeUrl?: string | null,
  parent: number | null = null,
): any {
  const items = menus.flatMap((item, index) =>
    (item.parent_index ?? null) === parent
      ? [
          <li key={`${item.label}-${index}`}>
            <a href={publicWebsiteHref(item.url, currentSlug, defaultSlug, homeUrl)}>{item.label}</a>
            {renderMenus(menus, currentSlug, defaultSlug, homeUrl, index)}
          </li>,
        ]
      : [],
  );
  return items.length ? <ul>{items}</ul> : null;
}
