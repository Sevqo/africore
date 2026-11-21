const pageSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Resolve safe same-site paths through AfriCore's published page route. */
export function publicWebsiteHref(value: string, currentSlug: string, defaultSlug?: string | null) {
  const input = value.trim();
  if (!input) return '#';
  if (input.startsWith('#')) return input;
  if (/^(https:\/\/|mailto:|tel:)/i.test(input)) return input;
  if (input.startsWith('//') || input.includes('\\')) return '#';
  const rawPath = input.split(/[?#]/, 1)[0];
  if (rawPath.includes('%')) return '#';

  let url: URL;
  try {
    url = new URL(input, 'https://africore.invalid');
  } catch {
    return '#';
  }
  if (url.origin !== 'https://africore.invalid') return '#';
  if (url.pathname.startsWith('/sites/'))
    return pageSlug.test(url.pathname.slice('/sites/'.length))
      ? url.pathname + url.search + url.hash
      : '#';

  const path = rawPath.replace(/^\/+|\/+$/g, ''),
    target = path || defaultSlug || currentSlug;
  if (!pageSlug.test(target)) return '#';
  return (
    '/sites/' + encodeURIComponent(target) + url.search + url.hash
  );
}
