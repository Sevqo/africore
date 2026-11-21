import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderWebsiteSeoDocument } from '../apps/website-seo';

const html =
  '<html><head><title>Default</title><meta name="description" content="Default"><link rel="canonical" href="/"><script type="application/ld+json">{"url":"/"}</script></head><body><div id="root" data-route="/">Prerendered home</div><script type="module" src="/assets/app.js"></script></body></html>';

test('published Website HTML carries escaped page SEO and clears the homepage prerender before SPA render', () => {
  const result = renderWebsiteSeoDocument(
    html,
    {
      title: '<img src=x onerror=alert(1)> & About',
      meta_description: 'A safe description & more',
      noindex: true,
    },
    'about-us',
    'https://example.test',
  );
  assert.ok(result);
  assert.match(result, /<title>&lt;img src=x onerror=alert\(1\)&gt; &amp; About<\/title>/);
  assert.match(result, /name="robots" content="noindex, nofollow"/);
  assert.match(result, /href="https:\/\/example\.test\/sites\/about-us"/);
  assert.match(result, /<div id="root"><\/div>/);
  assert.doesNotMatch(result, /Prerendered home|application\/ld\+json|<title>Default/);
  assert.equal((result.match(/name="description"/g) || []).length, 1);
});

test('Website SEO omits canonical URLs for unreviewed hosts and rejects malformed slugs', () => {
  const withoutHost = renderWebsiteSeoDocument(html, { title: 'About' }, 'about', 'http://evil.test');
  assert.ok(withoutHost);
  assert.doesNotMatch(withoutHost, /rel="canonical"|property="og:url"/);
  assert.equal(renderWebsiteSeoDocument(html, { title: 'About' }, '../outside', 'https://example.test'), null);
});
