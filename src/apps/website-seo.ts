const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function validPublicOrigin(value: string) {
  try {
    const origin = new URL(value);
    return origin.protocol === 'https:' && origin.origin === value && !origin.username && !origin.password
      ? origin.origin
      : null;
  } catch {
    return null;
  }
}

/** Add page-specific SEO metadata while letting the SPA render from an empty root. */
export function renderWebsiteSeoDocument(
  indexHtml: string,
  page: { title?: string; meta_title?: string; meta_description?: string; site?: { name?: string }; noindex?: boolean },
  slug: string,
  publicOrigin: string,
) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const title = String(page.meta_title || page.title || page.site?.name || 'Website').slice(0, 180);
  const description = String(page.meta_description || '').slice(0, 320);
  const url = validPublicOrigin(publicOrigin);
  const metas = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="${page.noindex ? 'noindex, nofollow' : 'index, follow'}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    ...(url
      ? [
          `<link rel="canonical" href="${escapeHtml(url + '/sites/' + slug)}">`,
          `<meta property="og:url" content="${escapeHtml(url + '/sites/' + slug)}">`,
        ]
      : []),
  ].join('');
  let html = indexHtml.replace(/<title>[\s\S]*?<\/title>/i, '');
  html = html.replace(/<meta\s+(?:name="description"|property="og:title"|property="og:description"|property="og:url")[^>]*>/gi, '');
  html = html.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="robots"[^>]*>/gi, '');
  html = html.replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');
  if (!/<\/head>/i.test(html) || !/<body[^>]*>[\s\S]*<\/body>/i.test(html)) return null;
  html = html.replace(/<\/head>/i, metas + '</head>');
  const rootStart = html.search(/<div\s+id="root"[^>]*>/i);
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
  const rootEnd = html.toLowerCase().lastIndexOf('</div>', bodyEnd);
  if (rootStart < 0 || rootEnd < rootStart) return null;
  return html.slice(0, rootStart) + '<div id="root"></div>' + html.slice(rootEnd + 6);
}
