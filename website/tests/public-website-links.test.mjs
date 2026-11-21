import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicWebsiteHref } from '../src/apps/public-website-links.ts';

test('public Website internal links resolve to published page routes', () => {
  assert.equal(publicWebsiteHref('/about', 'current-page'), '/sites/about');
  assert.equal(publicWebsiteHref('/', 'current-page', 'home-page'), '/sites/home-page');
  assert.equal(publicWebsiteHref('/services-consulting?from=home#rates', 'home'), '/sites/services-consulting?from=home#rates');
  assert.equal(publicWebsiteHref('/services/consulting', 'home'), '#');
  assert.equal(publicWebsiteHref('#contact', 'home'), '#contact');
});

test('public Website links preserve approved external destinations and reject unsafe paths', () => {
  assert.equal(publicWebsiteHref('https://example.test/contact', 'home'), 'https://example.test/contact');
  assert.equal(publicWebsiteHref('mailto:hello@example.test', 'home'), 'mailto:hello@example.test');
  assert.equal(publicWebsiteHref('//attacker.test', 'home'), '#');
  assert.equal(publicWebsiteHref('/%2e%2e/admin', 'home'), '#');
});
