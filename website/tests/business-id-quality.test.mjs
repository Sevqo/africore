import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync('src/trust/PassportWorkspace.tsx', 'utf8');
const entry = fs.readFileSync('src/apps/BusinessIDWorkspace.tsx', 'utf8');
const styles = fs.readFileSync('src/apps/business-id.css', 'utf8');
const trust = fs.readFileSync('../src/trust/routes.ts', 'utf8');
const domain = fs.readFileSync('../src/trust/domain.ts', 'utf8');

test('Business ID presents the ten Odoo-structured registers over existing Passport services', () => {
  for (const section of [
    'Overview', 'Business Profile', 'Verification', 'Business Passport', 'Credentials',
    'Evidence', 'Shared Access', 'Relationships', 'History', 'Settings',
  ]) assert.ok(ui.includes("['" + section + "'"), section + ' navigation is missing');
  assert.ok(entry.includes('PassportWorkspace'));
  assert.ok(!entry.includes('identity-reading-guide'));
  assert.ok(ui.includes('business-id-smart-buttons'));
  assert.ok(ui.includes('business-id-table'));
  for (const label of ['Active Credentials', 'Expiring · 30 days', 'Pending Reviews', 'Active Sharing Grants', 'Confirmed Relationships']) {
    assert.ok(ui.includes(label), `overview measure ${label} is missing`);
  }
  assert.ok(ui.includes('View Passport'));
});

test('Business ID reads fail independently, reports unavailable states, and rejects stale responses', () => {
  assert.ok(ui.includes('Promise.allSettled'));
  assert.ok(ui.includes('requestGeneration.current'));
  assert.ok(ui.includes('history?page='));
  assert.ok(ui.includes("sources?kind=${encodeURIComponent(sourcePickerKind)}&page=${sourcePage}&limit=25"));
  assert.ok(ui.includes('sourceMeta.has_more'));
  assert.ok(ui.includes("request('/trust/config'"));
  assert.ok(ui.includes('readError(\'sharing\')'));
});

test('counterparty and issuer choices are searchable or scoped service records, not typed identifiers', () => {
  assert.ok(ui.includes("apiRef.current('/organizations?q='"));
  assert.ok(ui.includes('Only opted-in public profiles are searchable'));
  assert.ok(ui.includes('Choose an eligible issuer'));
  assert.ok(!ui.includes('Named recipient organization ID'));
  assert.ok(!ui.includes('Holder organization ID'));
  assert.match(trust, /p\.public_profile === true/);
  assert.match(trust, /sandbox\(a\);\s+const input = passportInput\.partial\(\)/);
  assert.match(trust, /requiredService\[query\.kind\]/);
  assert.match(trust, /has_more: offset \+ rows\.length < total/);
});

test('sharing requires explicit consent, displays a hidden copy-only recipient link, and keeps presentations sealed', () => {
  assert.ok(ui.includes("d.consent !== 'on'"));
  assert.ok(ui.includes('Copy access link'));
  assert.ok(ui.includes('navigator.clipboard.writeText(grantLink)'));
  assert.ok(ui.includes('Previously disclosed copies cannot be remotely erased'));
  assert.match(domain, /unseal\(row\.data,[\s\S]+?\{\s*\.\.\.safe,[\s\S]+?purpose: disclosure\.purpose,[\s\S]+?types: disclosure\.types/);
  assert.match(domain, /data: _sealedData/);
});

test('history uses paged short references and settings report environment, configuration and data limits', () => {
  assert.ok(ui.includes('historyMeta.has_more'));
  assert.ok(ui.includes('String(h.resource_id).slice(0, 8)'));
  assert.ok(ui.includes('Current environment'));
  assert.ok(ui.includes('Optional blockchain proof'));
  assert.ok(ui.includes('cryptographic selective disclosure is not enabled'));
  assert.ok(ui.includes('Retention expiry does not guarantee immediate deletion'));
});

test('Business ID styling matches compact register and responsive Odoo form patterns', () => {
  assert.ok(styles.includes('.business-id-record-toolbar'));
  assert.ok(styles.includes('.business-id-smart-buttons'));
  assert.ok(styles.includes('.business-id-tabs'));
  assert.ok(styles.includes('@media (max-width: 900px)'));
  assert.ok(styles.includes('@media (max-width: 600px)'));
});
