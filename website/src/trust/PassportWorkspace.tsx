import { Icon } from '../components/Icon';
import { useEffect, useRef, useState } from 'react';
import { Field, Form, Provenance, request, Timeline } from '../operations/UI';
import { DocumentAttachments } from '../apps/DocumentAttachments';
import { Overlay } from '../components/Overlay';
import { DataTable } from '../components/DataTable';
import { isDemo } from '../demo/transport';
export const trustTypes = [
  'BusinessIdentityCredential',
  'PaymentActivityCredential',
  'TradingHistoryCredential',
  'InvoiceSettlementCredential',
  'DeliveryCompletionCredential',
  'SupplierRelationshipCredential',
  'CustomerRelationshipCredential',
  'BusinessDataCoverageCredential',
  'BusinessRegistrationReviewCredential',
];
const tabs = [
  'Overview',
  'Business Profile',
  'Business Passport',
  'Business Identity',
  'Credentials',
  'Trust Evidence',
  'Business Network',
  'Verification Requests',
  'Shared Access',
  'Activity History',
  'Privacy & Security',
  'Issuer Desk',
  'Trust Operations',
];
const businessTabs = [
  ['Overview', 'dashboard'],
  ['Business Profile', 'profile'],
  ['Verification', 'verification'],
  ['Business Passport', 'passport'],
  ['Credentials', 'credentials'],
  ['Evidence', 'evidence'],
  ['Shared Access', 'sharing'],
  ['Relationships', 'relationships'],
  ['History', 'history'],
  ['Settings', 'settings'],
] as const;
const businessTabTargets: Record<string, string> = {
  Overview: 'dashboard',
  'Business Profile': 'profile',
  Verification: 'verification',
  'Business Passport': 'passport',
  Credentials: 'credentials',
  Evidence: 'evidence',
  'Shared Access': 'sharing',
  Relationships: 'relationships',
  History: 'history',
  Settings: 'settings',
};
const countryCodes = (`AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`).split(' ');
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
function countryLabel(code: string) {
  return countryNames.of(code) || code;
}
function BusinessSelector({
  api,
  label,
  name,
  value,
  onChange,
}: {
  api: (path: string) => Promise<any>;
  label: string;
  name: string;
  value?: string;
  onChange?: (id: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [rows, setRows] = useState<any[]>([]),
    [status, setStatus] = useState('Search public business profiles by name.'),
    [selected, setSelected] = useState(value || ''),
    apiRef = useRef(api),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  apiRef.current = api;
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setRows([]);
      setStatus('Enter at least two characters. Only opted-in public profiles are searchable.');
      return;
    }
    let current = true;
    setStatus('Searching public profiles…');
    timer.current = setTimeout(() => {
      apiRef.current('/organizations?q=' + encodeURIComponent(query.trim()))
        .then((r) => {
          if (!current) return;
          setRows(r.data || []);
          setStatus(r.data?.length ? `${r.data.length} public profile${r.data.length === 1 ? '' : 's'} found.` : 'No matching public profile found.');
        })
        .catch((e) => current && setStatus('Business search unavailable: ' + e.message));
    }, 250);
    return () => {
      current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);
  return (
    <div className="field business-selector">
      <label htmlFor={name + '-search'}>{label}</label>
      <input
        id={name + '-search'}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by business name"
        autoComplete="off"
      />
      <select
        id={name}
        name={name}
        required
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          onChange?.(e.target.value);
        }}
      >
        <option value="">Choose a public business</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.display_name} · {row.category} · {row.country} · {String(row.verification_status).replaceAll('_', ' ')}
          </option>
        ))}
      </select>
      <small aria-live="polite">{status}</small>
    </div>
  );
}
export function download(data: any, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function VerificationReport({ report }: { report: any }) {
  return (
    <section className="panel verification-report" aria-label="Verification report">
      <h2>What the checks establish</h2>
      {Object.entries(report)
        .filter(([key]) => !['credentials', 'limitations'].includes(key))
        .map(([key, value]) => (
          <div className="list-row" key={key}>
            <span>{key.replaceAll('_', ' ')}</span>
            <strong>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</strong>
          </div>
        ))}
      {report.credentials?.map((r: any, i: number) => (
        <VerificationReport key={i} report={r} />
      ))}
      <p>
        A valid signature protects integrity. It does not establish that every claim is true, that
        the issuer has institutional authority, or that the business will honor a contract.
      </p>
      <p>{Array.isArray(report.limitations) ? report.limitations.join(' ') : report.limitations}</p>
    </section>
  );
}
export function PassportWorkspace({
  org,
  environment,
  role,
  serviceIds,
  initialTab = 'Overview',
  holderOnly = false,
}: {
  org: string;
  environment: string;
  role: string;
  serviceIds?: string[];
  initialTab?: string;
  holderOnly?: boolean;
}) {
  const [tab, setTab] = useState('Overview'),
    [data, setData] = useState<any>(null),
    [issuers, setIssuers] = useState<any[]>([]),
    [trustConfig, setTrustConfig] = useState<any>(null),
    [issuance, setIssuance] = useState<any[]>([]),
    [sources, setSources] = useState<any[]>([]),
    [sourcePickerKind, setSourcePickerKind] = useState('profile'),
    [sourcePage, setSourcePage] = useState(1),
    [sourceMeta, setSourceMeta] = useState({ page: 1, limit: 25, total: 0, has_more: false, available: true, required_service: 'passport' }),
    [sourceChoice, setSourceChoice] = useState(''),
    [sourceLoading, setSourceLoading] = useState(false),
    [sourceMessage, setSourceMessage] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState<any>(null),
    [selected, setSelected] = useState<string[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [historyPage, setHistoryPage] = useState(1),
    [historyMeta, setHistoryMeta] = useState({ page: 1, limit: 50, total: 0, has_more: false }),
    [resourceErrors, setResourceErrors] = useState<Record<string, string>>({}),
    [dialog, setDialog] = useState(''),
    [credentialDetail, setCredentialDetail] = useState<any>(null),
    [credentialStatusFilter, setCredentialStatusFilter] = useState('all'),
    [credentialTypeFilter, setCredentialTypeFilter] = useState('all'),
    [credentialIssuerFilter, setCredentialIssuerFilter] = useState('all'),
    [correctionKind, setCorrectionKind] = useState<'evidence' | 'credential'>('evidence'),
    [correctionTarget, setCorrectionTarget] = useState(''),
    [grantLink, setGrantLink] = useState(''),
    [shareRecipient, setShareRecipient] = useState(''),
    [shareRequest, setShareRequest] = useState(''),
    [shareCredentialIds, setShareCredentialIds] = useState<string[]>([]),
    [profileEditing, setProfileEditing] = useState(false),
    [loading, setLoading] = useState(true),
    [file, setFile] = useState<any>(null);
  const editable = ['owner', 'admin'].includes(role),
    base = '/organizations/' + org + '/trust',
    api = (path: string, method = 'GET', body?: any) =>
      request(base + path, method, body, environment),
    documentsApi = (path: string, method = 'GET', body?: any) =>
      request('/organizations/' + org + path, method, body, environment);
  const requestGeneration = useRef(0);
  async function load(page = historyPage) {
    const generation = ++requestGeneration.current;
    setLoading(true);
    const settled = await Promise.allSettled([
      api('/passport'),
      editable ? api('/sources?kind=profile&limit=25') : Promise.resolve({ data: [], page: 1, limit: 25, total: 0, has_more: false, available: false, message: 'Only workspace owners and administrators may add Trust evidence.' }),
      api('/history?page=' + page + '&limit=50'),
      editable && enabled('credentials') ? api('/issuers') : Promise.resolve({ data: [] }),
      editable && enabled('credentials') ? api('/issuance-requests') : Promise.resolve({ data: [] }),
      request('/trust/config', 'GET', undefined, environment),
    ]);
    if (generation !== requestGeneration.current) return;
    const errors: Record<string, string> = {},
      value = (index: number) => settled[index].status === 'fulfilled' ? settled[index].value : null,
      failed = (index: number) => settled[index].status === 'rejected' ? String(settled[index].reason?.message || settled[index].reason) : '';
    const passportResult = value(0);
    if (passportResult) {
      setData(passportResult);
      Object.assign(errors, passportResult.errors || {});
    } else {
      errors.passport = failed(0) || 'Business Passport could not be loaded.';
      setData((previous: any) => previous || { passport: null, credentials: [], evidence: [], relationships: [], requests: [], grants: [], identity_reviews: [], disputes: [] });
    }
    if (value(1)) {
      setSources(value(1).data || []);
      setSourceMeta({ page: value(1).page || 1, limit: value(1).limit || 25, total: Number(value(1).total || 0), has_more: Boolean(value(1).has_more), available: value(1).available !== false, required_service: value(1).required_service || 'passport' });
      setSourceMessage(value(1).available === false ? value(1).message || 'The source service is unavailable.' : '');
    }
    else errors.sources = failed(1) || 'Authorized source records could not be loaded.';
    if (value(2)) {
      const h = value(2);
      setHistory(h.data || []);
      setHistoryMeta({ page: h.page || page, limit: h.limit || 50, total: Number(h.total || 0), has_more: Boolean(h.has_more) });
      setHistoryPage(h.page || page);
    } else errors.history = failed(2) || 'Trust history could not be loaded.';
    if (value(3)) setIssuers(value(3).data || []);
    else errors.issuers = failed(3) || 'Eligible issuers could not be loaded.';
    if (value(4)) setIssuance(value(4).data || []);
    else errors.issuance = failed(4) || 'Issuance requests could not be loaded.';
    if (value(5)) setTrustConfig(value(5));
    else errors.configuration = failed(5) || 'Trust configuration could not be loaded.';
    setResourceErrors(errors);
    setLoading(false);
  }
  const enabled = (id: string) => isDemo() || !serviceIds || serviceIds.includes(id);
  const serviceScope = serviceIds?.join(',') || '';
  const tabAllowed = (name: string) =>
    !['Issuer Desk', 'Trust Operations'].includes(name) || !holderOnly;
  useEffect(() => {
    setTab(tabs.includes(initialTab) || (holderOnly && businessTabs.some(([label]) => label === initialTab)) ? initialTab : 'Overview');
    setProfileEditing(initialTab === 'Business Profile');
  }, [initialTab, org, environment, serviceScope]);
  useEffect(() => {
    void load(1);
  }, [org, environment, serviceScope]);
  const sourceLoadGeneration = useRef(0);
  useEffect(() => {
    if (dialog !== 'evidence' || !editable) return;
    const generation = ++sourceLoadGeneration.current;
    setSourceChoice('');
    setSourceLoading(true);
    setSourceMessage('');
    request(`/organizations/${org}/trust/sources?kind=${encodeURIComponent(sourcePickerKind)}&page=${sourcePage}&limit=25`, 'GET', undefined, environment)
      .then((result: any) => {
        if (generation !== sourceLoadGeneration.current) return;
        setSources(result.data || []);
        setSourceMeta({ page: result.page || sourcePage, limit: result.limit || 25, total: Number(result.total || 0), has_more: Boolean(result.has_more), available: result.available !== false, required_service: result.required_service || sourcePickerKind });
        setSourceMessage(result.available === false ? result.message || `The ${sourcePickerKind} source service is unavailable.` : '');
      })
      .catch((e: Error) => {
        if (generation !== sourceLoadGeneration.current) return;
        setSources([]);
        setSourceMeta((previous) => ({ ...previous, page: sourcePage, total: 0, has_more: false, available: false }));
        setSourceMessage(`Authorized source records could not be loaded: ${e.message}`);
      })
      .finally(() => {
        if (generation === sourceLoadGeneration.current) setSourceLoading(false);
      });
    return () => { sourceLoadGeneration.current++; };
  }, [dialog, sourcePickerKind, sourcePage, org, environment, serviceScope, editable]);
  async function act(fn: () => Promise<any>, rethrow = false) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await fn();
      await load();
      setNotice('Saved. Review the source and assurance labels below.');
      return result;
    } catch (e) {
      setError((e as Error).message);
      if (rethrow) throw e;
      return null;
    } finally {
      setBusy(false);
    }
  }
  const p = data?.passport,
    creds = data?.credentials || [],
    evidence = data?.evidence || [],
    reviewRecords = data?.identity_reviews || [],
    verificationRequests = data?.requests || [],
    shareRecords = data?.grants || [],
    activeShareCredentials = creds.filter((c: any) => c.status === 'active' && Date.parse(c.valid_until) > Date.now()),
    activeCredentials = creds.filter((c: any) => c.status === 'active' && Date.parse(c.valid_until) > Date.now()),
    expiringCredentials = activeCredentials.filter((c: any) => Date.parse(c.valid_until) <= Date.now() + 30 * 86400000),
    pendingReviews = reviewRecords.filter((r: any) => r.status === 'pending'),
    activeShareGrants = shareRecords.filter((g: any) => !g.revoked_at && Date.parse(g.expires_at) > Date.now() && !(g.one_time && g.consumed_at)),
    confirmedRelationships = (data?.relationships || []).filter((r: any) => r.status === 'confirmed'),
    pendingInboundRequests = verificationRequests.filter((r: any) => r.peer_org === org && r.status === 'pending' && Date.parse(r.expires_at) > Date.now()),
    recentCredentials = [...creds].sort((a: any, b: any) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 3),
    matchingShareRequests = (data?.requests || []).filter((r: any) =>
      r.org_id === shareRecipient && r.peer_org === org && r.status === 'pending' && Date.parse(r.expires_at) > Date.now(),
    ),
    filteredCredentials = creds.filter((c: any) =>
      (credentialStatusFilter === 'all' || c.status === credentialStatusFilter) &&
      (credentialTypeFilter === 'all' || c.type === credentialTypeFilter) &&
      (credentialIssuerFilter === 'all' || c.issuer_id === credentialIssuerFilter),
    );
  const consent = (
    <Field label="I authorize this specific use of the selected records.">
      <input name="consent" type="checkbox" required />
    </Field>
  );
  const evidencePicker = (
    <fieldset>
      <legend>Evidence to authorize</legend>
      {evidence
        .filter((e: any) => e.status === 'active')
        .map((e: any) => (
          <label className="check-row" key={e.id}>
            <input
              type="checkbox"
              checked={selected.includes(e.id)}
              onChange={(event) =>
                setSelected(
                  event.target.checked ? [...selected, e.id] : selected.filter((id) => id !== e.id),
                )
              }
            />
            {e.source_kind} · {e.purpose} · {new Date(e.created_at).toLocaleDateString('en-KE')} · Level {e.assurance_level} · {e.status.replaceAll('_', ' ')}
          </label>
        ))}
    </fieldset>
  );
  function selectBusinessTab(next: string) {
    setTab(next);
    setReport(null);
    if (next !== 'Shared Access') setGrantLink('');
    setProfileEditing(next === 'Business Profile');
    if (holderOnly && businessTabTargets[next]) {
      const url = new URL(location.href);
      url.searchParams.set('app', 'business_id');
      url.searchParams.set('section', businessTabTargets[next]);
      url.hash = encodeURIComponent('Apps');
      window.history.pushState(null, '', url.pathname + url.search + url.hash);
      dispatchEvent(new Event('africore:app-navigation'));
    }
  }
  function closeShareDialog() {
    setDialog('');
    setShareRecipient('');
    setShareRequest('');
    setShareCredentialIds([]);
  }
  const readError = (key: string) => resourceErrors[key] || data?.errors?.[key];
  if (!data)
    return (
      <section className="panel">
        <p role="status">{loading ? 'Loading Business ID records…' : 'Business ID records are unavailable.'}</p>
        {(resourceErrors.passport || error) && <p role="alert">{resourceErrors.passport || error}</p>}
        <button type="button" onClick={() => void load(1)}>Retry</button>
      </section>
    );
  return (
    <div className={holderOnly ? 'passport-workspace o-app-sheet' : 'passport-workspace'}>
      {holderOnly && (
        <>
          <header className="business-id-record-toolbar">
            <div className="business-id-record-title">
              <span><button type="button" onClick={() => selectBusinessTab('Overview')}>Business ID</button> /</span>
              <strong>{p?.display_name || 'New Business Passport'}</strong>
            </div>
            {p && (
              <div className="business-id-smart-buttons" aria-label="Related Business ID records">
                {[
                  ['Credentials', 'credentials', creds.length],
                  ['Verification Requests', 'requests', verificationRequests.length],
                  ['Evidence', 'evidence', evidence.length],
                  ['Shared Grants', 'sharing', data.grants?.length || 0],
                  ['Relationships', 'relationships', data.relationships?.length || 0],
                ].map(([label, section, value]) => (
                  <button type="button" className="business-id-smart-button" key={String(label)} onClick={() => selectBusinessTab(String(label) === 'Verification Requests' ? 'Verification' : String(label) === 'Shared Grants' ? 'Shared Access' : String(label))}>
                    <span>{String(label)}</span><strong>{readError(String(section)) || (String(label) === 'Verification Requests' && readError('requests')) ? '—' : value}</strong>
                  </button>
                ))}
              </div>
            )}
            <div className="business-id-record-actions">
              {p ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => selectBusinessTab('Business Profile')}>Edit profile</button>
                  <button type="button" className="secondary-button" onClick={() => selectBusinessTab('Business Passport')}>View Passport</button>
                </>
              ) : (
                <button type="button" className="secondary-button" onClick={() => selectBusinessTab('Business Profile')}>New Passport</button>
              )}
              {p && <Provenance label={p.verification_status || 'not_submitted'} />}
              <button type="button" className="quiet-button" aria-label="Refresh Business ID records" onClick={() => void load()}>↻</button>
            </div>
          </header>
        </>
      )}
      {isDemo() && (
        <p className="muted">
          Browser demo: inspect a real signature over synthetic claims. Current issuer status, new
          issuance and recipient authorization require the connected backend.
        </p>
      )}
      {!holderOnly && (
        <nav className="passport-tabs" aria-label="Business Passport sections">
          {tabs
            .filter((t) => {
              if (holderOnly && ['Issuer Desk', 'Trust Operations'].includes(t)) return false;
              return tabAllowed(t);
            })
            .map((t) => (
              <button
                key={t}
                aria-current={tab === t ? 'page' : undefined}
                onClick={() => {
                  setTab(t);
                  setReport(null);
                }}
              >
                {t}
              </button>
            ))}
        </nav>
      )}
      {Object.entries(resourceErrors).map(([resource, message]) => (
        <div className="alert error business-id-resource-error" role="alert" key={resource}>
          <span>{resource.replaceAll('_', ' ')}: {message}</span>
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      ))}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      {busy && <p role="status">Saving authorized change…</p>}
      {!p ? (
        <Form
          submit={(d) =>
            act(() => api('/passport', 'POST', {
                display_name: d.display_name,
                category: d.category,
                industry: d.industry,
                country: d.country,
                public_profile: false,
              }))
          }
        >
          <h2>Your business identity, with evidence.</h2>
          <p>
            Create a private Passport. You choose what to share; no records are published to a
            blockchain.
          </p>
          <Field label="Business display name">
            <input name="display_name" required minLength={2} defaultValue="" />
          </Field>
          <div className="form-grid">
            <Field label="Category">
              <input name="category" defaultValue="Supplier" required />
            </Field>
            <Field label="Industry">
              <input name="industry" defaultValue="Trade" required />
            </Field>
            <Field label="Country">
              <select name="country" defaultValue="KE" required>
                {countryCodes.map((code) => <option key={code} value={code}>{countryLabel(code)}</option>)}
              </select>
            </Field>
          </div>
          <button className="button" disabled={!editable}>
            Create private Passport
          </button>
        </Form>
      ) : (
        <>
          {tab === 'Overview' && (
            <section className="business-id-profile-document">
              <div className="business-id-company-heading">
                <div className="business-id-company-mark" aria-hidden="true"><Icon name="shield" /></div>
                <div>
                  <h2>{p.display_name}</h2>
                  <p>{p.category} · {p.industry || 'Industry not provided'} · {countryLabel(p.country)}</p>
                  <Provenance label={p.verification_status || 'not_submitted'} />
                </div>
              </div>
              <div className="business-id-overview-metrics" aria-label="Business identity summary">
                {[
                  ['Active Credentials', 'credentials', activeCredentials.length],
                  ['Expiring · 30 days', 'credentials', expiringCredentials.length],
                  ['Pending Reviews', 'identity_reviews', pendingReviews.length],
                  ['Active Sharing Grants', 'sharing', activeShareGrants.length],
                  ['Confirmed Relationships', 'relationships', confirmedRelationships.length],
                ].map(([label, resource, value]) => (
                  <div className="business-id-overview-metric" key={String(label)}>
                    <span>{String(label)}</span>
                    <strong>{readError(String(resource)) ? '—' : value}</strong>
                  </div>
                ))}
              </div>
              <div className="business-id-overview-columns">
                <section>
                  <h3>Business Identity Status</h3>
                  <div className="business-id-detail-columns">
                    <dl>
                      <div><dt>Business category</dt><dd>{p.category || 'Not provided'}</dd></div>
                      <div><dt>Industry</dt><dd>{p.industry || 'Not provided'}</dd></div>
                      <div><dt>Country</dt><dd>{countryLabel(p.country)} ({p.country})</dd></div>
                    </dl>
                    <dl>
                      <div><dt>Passport reference</dt><dd>{String(p.id).slice(0, 8).toUpperCase()}</dd></div>
                      <div><dt>Identity review</dt><dd>{String(p.verification_status || 'not_submitted').replaceAll('_', ' ')}</dd></div>
                      <div><dt>Public profile</dt><dd>{p.public_profile ? 'Opted in · minimal fields only' : 'Private'}</dd></div>
                    </dl>
                  </div>
                  <h4>Current review</h4>
                  {readError('identity_reviews') ? <p role="alert">Review status unavailable: {readError('identity_reviews')}</p> : reviewRecords.length ? reviewRecords.slice(0, 1).map((review: any) => <p key={review.id}><Provenance label={review.status} /> · expires {new Date(review.expires_at).toLocaleDateString('en-KE')}{review.reason ? ` · ${review.reason}` : ''}</p>) : <p>No identity review submitted.</p>}
                  <h4>Evidence coverage</h4>
                  {readError('evidence') ? <p role="alert">Evidence status unavailable: {readError('evidence')}</p> : <p>{evidence.filter((item: any) => item.status === 'active').length} active source records. Uploaded documents and source records have separate assurance states.</p>}
                  <button type="button" onClick={() => selectBusinessTab('Verification')}>Open verification</button>
                </section>
                <section>
                  <h3>Credentials and Sharing</h3>
                  <h4>Recent credentials</h4>
                  {readError('credentials') ? <p role="alert">Credential list unavailable: {readError('credentials')}</p> : recentCredentials.length ? recentCredentials.map((credential: any) => <div className="list-row" key={credential.id}><span>{credential.type.replace(/Credential$/, '').replace(/([A-Z])/g, ' $1').trim()} · {credential.issuer_name || 'Issuer unavailable'}</span><Provenance label={credential.status} /></div>) : <p>No credentials have been issued.</p>}
                  <button type="button" onClick={() => selectBusinessTab('Credentials')}>Open credentials</button>
                  <h4>Pending verification requests</h4>
                  {readError('requests') ? <p role="alert">Verification requests unavailable: {readError('requests')}</p> : pendingInboundRequests.length ? pendingInboundRequests.slice(0, 3).map((requestItem: any) => <div className="list-row" key={requestItem.id}><span>{requestItem.counterparty_profile?.display_name || 'Business with private profile'} · {(requestItem.types || []).join(', ')}</span><small>{requestItem.purpose}</small></div>) : <p>No pending inbound requests.</p>}
                  <button type="button" onClick={() => selectBusinessTab('Verification')}>Review requests</button>
                  <h4>Active sharing grants</h4>
                  {readError('sharing') ? <p role="alert">Sharing status unavailable: {readError('sharing')}</p> : activeShareGrants.length ? activeShareGrants.slice(0, 3).map((grant: any) => <div className="list-row" key={grant.id}><span>{grant.counterparty_profile?.display_name || 'Business with private profile'} · {grant.purpose || 'Purpose unavailable'}</span><small>Expires {new Date(grant.expires_at).toLocaleDateString('en-KE')}</small></div>) : <p>No active sharing grants.</p>}
                  <button type="button" onClick={() => selectBusinessTab('Shared Access')}>Manage shared access</button>
                </section>
              </div>
              <div className="business-id-overview-summary">
                <h3>Business identity records</h3>
                <p>Passport information is self-reported until a separate review decision is recorded. A review, source evidence, issuer authority and signature integrity describe different assurance checks.</p>
                {p.public_profile && <a href={'/passport/' + p.id}>Open minimal public profile <Icon name="right" /></a>}
                <button type="button" onClick={() => selectBusinessTab('Verification')}>Open identity verification</button>
              </div>
              <div className="business-id-recent-activity">
                <h3>Recent activity</h3>
                {history.slice(0, 5).map((item: any) => <div className="list-row" key={item.id}><span>{String(item.action).replaceAll('.', ' ').replaceAll('_', ' ')}</span><small>{new Date(item.created_at).toLocaleString('en-KE')}</small></div>)}
                {!history.length && <p>{readError('history') || 'No trust activity has been recorded yet.'}</p>}
                <button type="button" onClick={() => selectBusinessTab('History')}>View activity history</button>
              </div>
            </section>
          )}
          {tab === 'Business Profile' && (
            <section className="business-id-profile-edit">
              {!profileEditing ? (
                <div className="business-id-profile-document">
                  <h2>Business profile</h2>
                  <p>Profile values are supplied by this business. Editing the display name or country resets the prior identity review and suspends dependent identity credentials.</p>
                  <button className="button" type="button" onClick={() => setProfileEditing(true)}>Edit business profile</button>
                </div>
              ) : (
                <Form
                  className="business-id-edit-form"
                  submit={async (d) => {
                    const result = await act(() => api('/passport', 'PATCH', {
                      display_name: d.display_name,
                      category: d.category,
                      industry: d.industry,
                      country: d.country,
                      public_profile: d.public_profile === 'on',
                    }));
                    if (result) setProfileEditing(false);
                  }}
                >
                  <h2>{p.display_name}</h2>
                  <p>Change the fields below and save the Business Passport.</p>
                  <div className="business-id-edit-columns">
                    <div>
                      <Field label="Business display name"><input name="display_name" defaultValue={p.display_name} minLength={2} maxLength={160} required /></Field>
                      <Field label="Category"><input name="category" defaultValue={p.category} minLength={2} maxLength={100} required /></Field>
                      <Field label="Industry"><input name="industry" defaultValue={p.industry || ''} maxLength={100} /></Field>
                    </div>
                    <div>
                      <Field label="Country"><select name="country" defaultValue={p.country} required>{countryCodes.map((code) => <option key={code} value={code}>{countryLabel(code)} ({code})</option>)}</select></Field>
                      <Field label="Public profile · display name, category, industry, country, reference and review status only"><input name="public_profile" type="checkbox" defaultChecked={p.public_profile} /></Field>
                      <p className="business-id-review-warning">Changing the display name or country resets identity review to “not submitted” and suspends existing identity and registration review credentials. Reviewers do not verify government registries through this form.</p>
                    </div>
                  </div>
                  <div className="business-id-form-footer">
                    <button className="button" disabled={!editable || busy}>Save</button>
                    <button type="button" className="secondary-button" onClick={() => { setProfileEditing(false); selectBusinessTab('Overview'); }}>Discard</button>
                  </div>
                </Form>
              )}
            </section>
          )}
          {tab === 'Business Passport' && (
            <section className="business-id-passport-document">
              <header><div><span className="eyebrow">AFRICORE BUSINESS PASSPORT · {String(environment).toUpperCase()}</span><h2>{p.display_name}</h2></div><Provenance label={p.verification_status || 'not_submitted'} /></header>
              <div className="business-id-detail-columns"><dl><div><dt>Passport reference</dt><dd>{String(p.id).slice(0, 8).toUpperCase()}</dd></div><div><dt>Subject binding</dt><dd>Account-managed reference</dd></div><div><dt>Business</dt><dd>{p.category} · {p.industry || 'Industry not provided'}</dd></div></dl><dl><div><dt>Country</dt><dd>{countryLabel(p.country)} ({p.country})</dd></div><div><dt>Credentials</dt><dd>{readError('credentials') ? 'Unavailable' : creds.length}</dd></div><div><dt>Disclosure</dt><dd>Private by default · recipient-bound authorization</dd></div></dl></div>
              <p>Identity claims, documentary evidence, issuer authority, credential signature and current credential status are assessed separately. A signed credential is not a government registry result.</p>
              {data.index && <section className="business-id-passport-assurance"><h3>Evidence category coverage · {data.index.value}%</h3><p>{data.index.purpose}</p>{data.index.components?.map((c: any) => <div className="list-row" key={c.category}><span>{c.category} · {c.weight}% coverage weight</span><b>{c.covered ? 'Recorded' : 'Not observed'} · {c.source_verified_count} source-supported</b></div>)}</section>}
              {!data.index && readError('evidence') && <p role="alert">Evidence coverage is unavailable: {readError('evidence')}</p>}
            </section>
          )}
          {(tab === 'Business Identity' || tab === 'Verification') && (
            <>
              <section className="panel">
                <h2>Business identity review</h2>
                <p>
                  Current: {p.verification_status.replaceAll('_', ' ')}. A manual document review
                  does not establish government registry verification or independent representative
                  authority.
                </p>
                {data.identity_reviews?.map((r: any) => (
                  <article key={r.id}>
                    <p>
                      {r.status.replaceAll('_', ' ')} · Submitted {new Date(r.created_at).toLocaleDateString('en-KE')}
                    </p>
                    <Timeline items={r.history} />
                    {editable && enabled('documents') && (
                      <>
                        <p>
                          Supplemental Documents attachments do not replace Trust evidence or change
                          verification assurance.
                        </p>
                        <DocumentAttachments
                          api={documentsApi}
                          sourceKind="verification"
                          sourceId={r.id}
                          writable={editable}
                          allowUpload
                        />
                      </>
                    )}
                  </article>
                ))}
              </section>
              {editable && (
                <>
                  <Form
                    submit={(d) =>
                      act(() =>
                        api('/identity-reviews', 'POST', {
                          legal_name: d.legal_name,
                          jurisdiction: d.jurisdiction,
                          registration_number: d.registration_number,
                          representative_statement: d.representative_statement,
                           evidence_ids: selected,
                           consent: d.consent === 'on',
                        }),
                      )
                    }
                  >
                    <h3>Business identity review</h3>
                    <p>Submitting a review does not query a government registry. Only a separately authorized trust operator can decide the review.</p>
                    <Field label="Legal business name">
                      <input name="legal_name" required />
                    </Field>
                    <div className="form-grid">
                      <Field label="Jurisdiction">
                        <input name="jurisdiction" defaultValue="Kenya" required />
                      </Field>
                      <Field label="Registration reference">
                        <input name="registration_number" required />
                      </Field>
                    </div>
                    <Field label="Authority to represent the business">
                      <textarea name="representative_statement" minLength={10} required />
                    </Field>
                    {evidencePicker}
                    {consent}
                    <button className="button" disabled={!selected.length}>Submit for review</button>
                  </Form>
                  <Form
                    submit={(d) =>
                      act(() =>
                        api('/documents', 'POST', {
                          review_id: d.review_id,
                          ...file,
                        }),
                      )
                    }
                  >
                    <h3>Attach a supporting document</h3>
                    <p>
                      Files receive type, signature and size checks and encrypted private storage.
                      Malware scanning is not configured. A document upload is not independent
                      verification.
                    </p>
                    <Field label="Pending identity review">
                      <select name="review_id" required defaultValue="">
                        <option value="" disabled>
                          Choose a current review accepting evidence
                        </option>
                        {data.identity_reviews
                          ?.filter((review: any) =>
                            ['pending', 'additional_information_required'].includes(review.status),
                          )
                          .map((review: any) => (
                            <option key={review.id} value={review.id}>
                              {review.status.replaceAll('_', ' ')} · {new Date(review.created_at).toLocaleDateString('en-KE')}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="TXT, PDF, PNG or JPEG · up to 250 KB">
                      <input
                        type="file"
                        accept=".txt,.pdf,.png,.jpg,.jpeg"
                        required
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 250000) {
                            setError('Maximum 250 KB');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () =>
                            setFile({
                              filename: f.name,
                              content_type: f.type || 'text/plain',
                              content_base64: String(reader.result).split(',')[1],
                            });
                          reader.readAsDataURL(f);
                        }}
                      />
                    </Field>
                    <button
                      className="secondary-button"
                      disabled={
                        !file ||
                        !data.identity_reviews?.some((review: any) =>
                          ['pending', 'additional_information_required'].includes(review.status),
                        )
                      }
                    >
                      Upload privately
                    </button>
                  </Form>
                </>
              )}
            </>
          )}
          {tab === 'Credentials' && (
            <>
              <section className="business-id-register">
                <h2>Minimal claims. Inspectable signatures.</h2>
                <p>
                  Credentials distinguish issuer authority, evidence level, expiry, status and
                  technical integrity. Entire minimal signed credentials are disclosed when shared;
                  cryptographic selective disclosure is not enabled.
                </p>
                <div className="business-id-register-filters">
                  <Field label="Status"><select value={credentialStatusFilter} onChange={(e) => setCredentialStatusFilter(e.target.value)}><option value="all">All statuses</option>{['active', 'expired', 'suspended', 'revoked'].map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
                  <Field label="Credential type"><select value={credentialTypeFilter} onChange={(e) => setCredentialTypeFilter(e.target.value)}><option value="all">All types</option>{[...new Set(creds.map((c: any) => c.type))].map((t: any) => <option key={t} value={t}>{t}</option>)}</select></Field>
                  <Field label="Issuer"><select value={credentialIssuerFilter} onChange={(e) => setCredentialIssuerFilter(e.target.value)}><option value="all">All issuers</option>{[...new Map(creds.map((c: any) => [c.issuer_id, c.issuer_name])).entries()].map(([id, name]) => <option key={String(id)} value={String(id)}>{String(name)}</option>)}</select></Field>
                </div>
                {readError('credentials') ? <p role="alert">Credential records unavailable: {readError('credentials')}</p> : filteredCredentials.length ? (
                  <DataTable className="business-id-table">
                    <thead><tr><th>Credential Type</th><th>Issuer</th><th>Subject</th><th>Issued</th><th>Valid Until</th><th>Current Status</th><th>Verification</th><th>Actions</th></tr></thead>
                    <tbody>{filteredCredentials.map((c: any) => <tr key={c.id}>
                      <td><button type="button" className="business-id-table-link" onClick={() => setCredentialDetail(c)}>{c.type.replace(/Credential$/, '').replace(/([A-Z])/g, ' $1').trim()}</button><small>Reference {String(c.id).slice(0, 8).toUpperCase()}</small></td>
                      <td>{c.issuer_name || 'Issuer profile unavailable'}<small>{String(c.issuer_authority || 'unverified').replaceAll('_', ' ')}</small></td>
                      <td>{p.display_name}<small>Current business Passport</small></td>
                      <td>{new Date(c.created_at).toLocaleDateString('en-KE')}</td>
                      <td>{new Date(c.valid_until).toLocaleDateString('en-KE')}</td>
                      <td><Provenance label={c.status} /></td>
                      <td>{report?.credential_id === 'urn:uuid:' + c.id ? report.signature : 'Not checked'}</td>
                      <td><div className="business-id-row-actions">
                        <button type="button" onClick={() => setCredentialDetail(c)}>Details</button>
                        <button type="button" onClick={() => act(async () => { setCredentialDetail(c); setReport(await api('/verify', 'POST', { credential_id: c.id, verify_anchor: false })); })}>Verify</button>
                        <button type="button" onClick={() => act(async () => download(await api('/credentials/' + c.id + '/export'), 'africore-credential-' + String(c.id).slice(0, 8) + '.json'))}>Export</button>
                        <button type="button" disabled={!enabled('blockchain')} title={!enabled('blockchain') ? 'Optional blockchain proof service is not active.' : undefined} onClick={() => act(async () => setReport(await api('/credentials/' + c.id + '/proof')))}>Check proof</button>
                      </div></td>
                    </tr>)}</tbody>
                  </DataTable>
                ) : <p>No credentials match this filter. Credentials are issued only through an approved issuer and holder-authorized request.</p>}
                {credentialDetail && <section className="business-id-credential-detail"><header><div><span>Credential detail</span><h3>{credentialDetail.type.replace(/Credential$/, '').replace(/([A-Z])/g, ' $1').trim()}</h3></div><button type="button" onClick={() => setCredentialDetail(null)}>Close</button></header><div className="business-id-detail-columns"><dl><div><dt>Reference</dt><dd>{String(credentialDetail.id).slice(0, 8).toUpperCase()}</dd></div><div><dt>Issuer</dt><dd>{credentialDetail.issuer_name || 'Issuer profile unavailable'}</dd></div><div><dt>Issuer recognition</dt><dd>{String(credentialDetail.issuer_authority || 'unverified').replaceAll('_', ' ')}</dd></div><div><dt>Validity</dt><dd>{credentialDetail.status} · until {new Date(credentialDetail.valid_until).toLocaleString('en-KE')}</dd></div></dl><dl><div><dt>Subject</dt><dd>{credentialDetail.claims?.id === p.subject ? p.display_name + ' · current Passport subject' : 'Subject does not match the current Passport or cannot be confirmed'}</dd></div><div><dt>Evidence assurance at issue</dt><dd>{credentialDetail.claims?.evidence?.assurance_level ?? 'Not included'}</dd></div><div><dt>Evidence references</dt><dd>{credentialDetail.claims?.evidence?.evidence_count ?? 'Not included'} authorized records</dd></div><div><dt>Signature verification</dt><dd>{report?.credential_id === 'urn:uuid:' + credentialDetail.id ? report.signature : 'Not checked'}</dd></div></dl></div><details><summary>Inspect disclosed claims</summary><pre>{JSON.stringify(credentialDetail.claims, null, 2)}</pre></details></section>}
              </section>
              {editable && (
                <Form
                  className="business-id-compact-form"
                  submit={(d) => {
                    if (!selected.length) throw Error('Select at least one eligible evidence record.');
                    return act(() => api('/issuance-requests', 'POST', {
                        issuer_id: d.issuer_id,
                        holder_org: org,
                        type: d.type,
                        evidence_ids: selected,
                        valid_days: Number(d.valid_days),
                        consent: d.consent === 'on',
                      }));
                  }}
                >
                  <h3>Authorize credential issuance</h3>
                  <p>This creates a holder-authorized request for the selected approved sandbox issuer. It does not issue a credential by itself.</p>
                  <Field label="Approved sandbox issuer"><select name="issuer_id" required defaultValue=""><option value="" disabled>{readError('issuers') ? 'Issuer list unavailable' : 'Choose an eligible issuer'}</option>{issuers.filter((i) => i.status === 'approved_sandbox').map((i) => <option key={i.id} value={i.id}>{i.name} · sandbox approved · {i.types.join(', ')}</option>)}</select></Field>
                  <Field label="Credential type">
                    <select name="type">
                      {trustTypes.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Validity in days">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      defaultValue={90}
                      name="valid_days"
                      required
                    />
                  </Field>
                  {evidencePicker}
                  {consent}
                  {readError('issuers') && <p role="alert">Approved issuers could not be loaded: {readError('issuers')}</p>}
                  <button className="button" disabled={!editable || !selected.length || !issuers.some((i) => i.status === 'approved_sandbox')}>Authorize selected evidence</button>
                </Form>
              )}
              {issuance.length > 0 && (
                <section className="business-id-register">
                  <header className="business-id-register-toolbar">
                    <div>
                      <h3>Pending &amp; Recorded Issuance Requests</h3>
                      <p>Holder-authorized requests awaiting issuer review or completion.</p>
                    </div>
                  </header>
                  <DataTable className="business-id-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Credential Type</th>
                        <th>Status</th>
                        <th>Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issuance.map((r: any) => (
                        <tr key={r.id}>
                          <td>{String(r.id).slice(0, 8).toUpperCase()}</td>
                          <td>{r.type}</td>
                          <td><Provenance label={r.status} /></td>
                          <td>{r.evidence?.length || 0} record(s)</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </section>
              )}
            </>
          )}
          {(tab === 'Trust Evidence' || tab === 'Evidence') && (
            <>
              <section className="business-id-register">
                <header className="business-id-register-toolbar"><div><h2>Trust evidence</h2><p>Source links, purpose, processing basis and assurance are shown separately.</p></div><div className="business-id-row-actions"><button type="button" className="button" disabled={!editable} onClick={() => setDialog('evidence')}>Add Evidence</button><button type="button" className="secondary-button" disabled={!editable || (!evidence.length && !creds.length)} onClick={() => { setCorrectionKind('evidence'); setCorrectionTarget(''); setDialog('correction'); }}>Request Correction</button></div></header>
                {readError('evidence') ? <p role="alert">Evidence records unavailable: {readError('evidence')}</p> : evidence.length ? <DataTable className="business-id-table"><thead><tr><th>Evidence Reference</th><th>Source Type</th><th>Source Record</th><th>Purpose</th><th>Lawful Basis</th><th>Date</th><th>Review / Assurance State</th><th>Actions</th></tr></thead><tbody>{evidence.map((e: any) => {
                  const source = sources.find((s: any) => s.kind === e.source_kind && s.id === e.source_id);
                  return <tr key={e.id}><td>{String(e.id).slice(0, 8).toUpperCase()}</td><td>{e.source_kind}</td><td>{e.source_label || source?.label || `Record ${String(e.source_id).slice(0, 8).toUpperCase()}`}</td><td>{e.purpose}</td><td>{String(e.lawful_basis || 'Not recorded').replaceAll('_', ' ')}</td><td>{new Date(e.observed_at || e.created_at).toLocaleDateString('en-KE')}</td><td><Provenance label={e.status} /> · Level {e.assurance_level}<small>{e.method}</small></td><td><button type="button" disabled={!editable} onClick={() => { setCorrectionKind('evidence'); setCorrectionTarget(e.id); setDialog('correction'); }}>Request correction</button></td></tr>;
                })}</tbody></DataTable> : <p>No trust evidence is recorded.</p>}
              </section>
              {dialog === 'evidence' && <Overlay onClose={() => setDialog('')}><section className="business-id-modal" role="dialog" aria-modal="true" aria-labelledby="business-id-evidence-title"><header><h2 id="business-id-evidence-title">Add Evidence</h2><button type="button" aria-label="Close" onClick={() => setDialog('')}>×</button></header><Form className="business-id-modal-form" submit={(d) => {
                const source = sources.find((s: any) => s.key === d.source);
                if (!source) throw Error('Choose an authorized source record.');
                return act(() => api('/evidence', 'POST', { source_kind: source.kind, source_id: source.id, lawful_basis: d.lawful_basis, purpose: d.purpose }), true).then((r) => { if (r) setDialog(''); });
              }}>
                <div className="business-id-edit-columns"><div><Field label="Source Type"><select value={sourcePickerKind} onChange={(e) => { setSourcePickerKind(e.target.value); setSourcePage(1); setSourceChoice(''); }}><option value="profile">Business profile</option><option value="payment">Successful payment</option><option value="invoice">Invoice</option><option value="order">Order</option><option value="shipment">Shipment</option><option value="relationship">Confirmed relationship</option></select></Field><Field label="Authorized Source Record"><select name="source" value={sourceChoice} onChange={(e) => setSourceChoice(e.target.value)} required disabled={sourceLoading || !sourceMeta.available}><option value="" disabled>{sourceLoading ? 'Loading eligible records…' : 'Choose an authorized record'}</option>{sources.map((s: any) => <option key={s.key} value={s.key}>{s.label} · {s.kind}</option>)}</select></Field><div className="business-id-pagination"><span>{sourceMessage || (sourceMeta.total ? `Page ${sourcePage} · ${sourceMeta.total} eligible records` : sourceLoading ? 'Loading source records…' : 'No eligible records for this source type.')}</span><div><button type="button" className="secondary-button" disabled={sourcePage <= 1 || sourceLoading} onClick={() => { setSourceChoice(''); setSourcePage((page) => page - 1); }}>Previous</button><button type="button" className="secondary-button" disabled={!sourceMeta.has_more || sourceLoading} onClick={() => { setSourceChoice(''); setSourcePage((page) => page + 1); }}>Next</button></div></div></div><div><Field label="Lawful Basis"><select name="lawful_basis" required><option value="consent">Consent</option><option value="contract">Contract</option><option value="legitimate_interests">Legitimate interests (assess first)</option></select></Field><Field label="Specific Purpose"><textarea name="purpose" minLength={10} maxLength={500} required /></Field></div></div>
                <footer><button className="button" disabled={!editable || !sourceMeta.available || !sources.length || sourceLoading}>Save &amp; Close</button><button type="button" className="secondary-button" onClick={() => setDialog('')}>Discard</button></footer>
              </Form></section></Overlay>}
              {dialog === 'correction' && <Overlay onClose={() => setDialog('')}><section className="business-id-modal" role="dialog" aria-modal="true" aria-labelledby="business-id-correction-title"><header><h2 id="business-id-correction-title">Request a Correction</h2><button type="button" aria-label="Close" onClick={() => setDialog('')}>×</button></header><Form className="business-id-modal-form" submit={(d) => act(() => api('/corrections', 'POST', d), true).then((r) => { if (r) setDialog(''); })}><div className="business-id-edit-columns"><Field label="Record Type"><select name="kind" value={correctionKind} onChange={(e) => { const kind = e.target.value as 'evidence' | 'credential'; setCorrectionKind(kind); setCorrectionTarget(''); }}><option value="evidence">Evidence</option><option value="credential">Credential</option></select></Field><Field label="Evidence or credential"><select name="resource_id" value={correctionTarget} onChange={(e) => setCorrectionTarget(e.target.value)} required><option value="" disabled>Select a record</option>{(correctionKind === 'evidence' ? evidence : creds).map((item: any) => <option key={item.id} value={item.id}>{correctionKind === 'evidence' ? `${item.source_kind} · ${item.purpose}` : `${item.type} · ${item.status}`} · ${String(item.id).slice(0, 8).toUpperCase()}</option>)}</select></Field><Field label="Reason"><textarea name="reason" minLength={10} maxLength={1000} required /></Field><Field label="Supporting Statement"><textarea name="supporting_statement" maxLength={1000} /></Field></div><footer><button className="button" disabled={!correctionTarget}>Request Correction</button><button type="button" className="secondary-button" onClick={() => setDialog('')}>Discard</button></footer></Form></section></Overlay>}
              {data.disputes?.map((r: any) => (
                <article className="panel" key={r.id}>
                  <h3>Correction · {r.status}</h3>
                  <p>{r.reason}</p>
                  <Timeline items={r.history} />
                </article>
              ))}
            </>
          )}
          {(tab === 'Business Network' || tab === 'Relationships') && (
            <>
              <section className="business-id-register">
                <header className="business-id-register-toolbar"><div><h2>Business relationships</h2>
                <p>
                  A one-sided request stays pending until an authorized counterparty responds. Confirmation is not an endorsement or proof of independence.
                </p></div><button type="button" className="button" disabled={!editable || !enabled('trust_network')} onClick={() => setDialog('relationship')}>Request Relationship</button></header>
                {readError('relationships') ? <p role="alert">Relationship records unavailable: {readError('relationships')}</p> : data.relationships?.length ? <DataTable className="business-id-table"><thead><tr><th>Counterparty</th><th>Relationship Type</th><th>Status</th><th>Requested</th><th>Confirmed</th><th>Actions</th></tr></thead><tbody>{data.relationships.map((r: any) => {
                  const counterparty = r.counterparty_profile?.display_name || 'Business with private profile';
                  const confirmed = r.history?.find((item: any) => item.status === 'confirmed')?.at;
                  return <tr key={r.id}><td>{counterparty}{r.counterparty_profile && <small>{r.counterparty_profile.country} · {String(r.counterparty_profile.verification_status).replaceAll('_', ' ')}</small>}<small>{r.statement}</small></td><td>{String(r.relationship).replaceAll('_', ' ')}</td><td><Provenance label={r.status} /></td><td>{new Date(r.created_at).toLocaleDateString('en-KE')}</td><td>{confirmed ? new Date(confirmed).toLocaleDateString('en-KE') : '—'}</td><td>{editable && r.peer_org === org && r.status === 'pending' ? <details><summary>Respond</summary><Form className="business-id-inline-form" submit={(d) => act(() => api('/relationships/' + r.id + '/respond', 'POST', d))}><select name="decision"><option value="confirm">Confirm</option><option value="reject">Reject</option></select><input name="statement" placeholder="Response statement" minLength={10} required /><button>Submit response</button></Form></details> : editable && r.status === 'confirmed' ? <button type="button" onClick={() => act(() => api('/relationships/' + r.id + '/respond', 'POST', { decision: 'revoke', statement: 'Relationship revoked by an authorized business member.' }))}>Revoke</button> : r.status === 'pending' ? 'Awaiting counterparty' : '—'}</td></tr>;
                })}</tbody></DataTable> : <p>No relationship requests or confirmations yet.</p>}
              </section>
              {dialog === 'relationship' && <Overlay onClose={() => setDialog('')}><section className="business-id-modal" role="dialog" aria-modal="true" aria-labelledby="business-id-relationship-title"><header><h2 id="business-id-relationship-title">Request Business Relationship</h2><button type="button" aria-label="Close" onClick={() => setDialog('')}>×</button></header><Form className="business-id-modal-form" submit={(d) => act(() => api('/relationships', 'POST', { ...d, consent: d.consent === 'on' })).then((r) => { if (r) setDialog(''); })}><div className="business-id-edit-columns"><div><BusinessSelector api={api} name="counterparty_org" label="Counterparty business" /><Field label="Relationship type"><select name="relationship" required>{['supplier', 'customer', 'logistics', 'commercial_partner'].map((t) => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}</select></Field></div><div><Field label="Relationship statement"><textarea name="statement" minLength={10} maxLength={1000} required /></Field>{consent}</div></div><p>The other business must accept or reject the request. Creating it does not confirm the relationship.</p><footer><button className="button" disabled={!editable || !enabled('trust_network')}>Save &amp; Close</button><button type="button" className="secondary-button" onClick={() => setDialog('')}>Discard</button></footer></Form></section></Overlay>}
            </>
          )}
          {(tab === 'Verification Requests' || tab === 'Verification') && (
            <>
              <section className="panel">
                <h2>Review before disclosure</h2>
                {data.requests?.map((r: any) => (
                  <article className="credential-card" key={r.id}>
                    <h3>
                      {r.status.replaceAll('_', ' ')} · {r.purpose}
                    </h3>
                    <p>{r.counterparty_profile?.display_name || 'Business with private profile'} · {r.peer_org === org ? 'Requested from this business' : 'Requested by this business'}</p>
                    <p>
                      {r.types.join(', ')} · Expires {new Date(r.expires_at).toLocaleString()}
                    </p>
                    <p className="record-id">Request {String(r.id).slice(0, 8).toUpperCase()}</p>
                    {r.peer_org === org && r.status === 'pending' && Date.parse(r.expires_at) > Date.now() && (
                      <>
                        <button type="button" onClick={() => selectBusinessTab('Shared Access')}>
                          Choose credentials & create grant
                        </button>
                        <button type="button"
                          onClick={() =>
                            act(() => api('/requests/' + r.id + '/reject', 'POST', {}))
                          }
                        >
                          Reject request
                        </button>
                      </>
                    )}
                  </article>
                ))}
              </section>
              {editable && (
                <Form
                  submit={(d) => {
                    const types = trustTypes.filter((type) => d['type_' + type] === 'on');
                    if (!types.length) throw Error('Select at least one required credential type.');
                    return act(() => api('/requests', 'POST', {
                      holder_org: d.holder_org,
                      types,
                      purpose: d.purpose,
                      expires_days: Number(d.expires_days),
                    }));
                  }}
                >
                  <h3>Request evidence from another business</h3>
                  <BusinessSelector api={api} name="holder_org" label="Holder business" />
                  <fieldset className="business-id-choice-list">
                    <legend>Required credential types</legend>
                    {trustTypes.map((t) => <label className="check-row" key={t}><input type="checkbox" name={'type_' + t} />{t.replace(/Credential$/, '').replace(/([A-Z])/g, ' $1').trim()}</label>)}
                  </fieldset>
                  <Field label="Purpose">
                    <input name="purpose" minLength={10} required />
                  </Field>
                  <Field label="Expires in days">
                    <input name="expires_days" type="number" min={1} max={30} defaultValue={7} />
                  </Field>
                  <button className="button">Send verification request</button>
                </Form>
              )}
            </>
          )}
          {tab === 'Shared Access' && (
            <>
              <section className="business-id-register">
                <header className="business-id-register-toolbar"><div><h2>Shared access</h2><p>Named-recipient presentations expire and can be revoked for future access. Previously disclosed copies cannot be remotely erased.</p></div><button type="button" className="button" disabled={!editable || !enabled('trust_network') || !enabled('credentials')} onClick={() => { setShareCredentialIds([]); setShareRecipient(''); setShareRequest(''); setDialog('sharing'); }}>Share Credentials</button></header>
                {readError('sharing') ? <p role="alert">Share records unavailable: {readError('sharing')}</p> : (data.grants || []).length ? <DataTable className="business-id-table"><thead><tr><th>Recipient</th><th>Purpose</th><th>Credential Types</th><th>Created</th><th>Expires</th><th>Access</th><th>State</th><th>Actions</th></tr></thead><tbody>{data.grants.map((g: any) => {
                  const expired = Date.parse(g.expires_at) <= Date.now();
                  const status = g.revoked_at ? 'Revoked' : expired ? 'Expired' : g.consumed_at && g.one_time ? 'Consumed' : g.consumed_at ? 'Accessed' : 'Active';
                  return <tr key={g.id}><td>{g.counterparty_profile?.display_name || 'Business with private profile'}<small>Recipient reference {String(g.recipient_org).slice(0, 8).toUpperCase()}</small></td><td>{g.purpose || 'Purpose unavailable'}</td><td>{(g.types || []).join(', ') || 'Type details unavailable'}<small>Minimal signed credentials; no selective disclosure</small></td><td>{new Date(g.created_at).toLocaleDateString('en-KE')}</td><td>{new Date(g.expires_at).toLocaleString('en-KE')}<small>{g.one_time ? 'One-time' : 'Reusable until expiry'}</small></td><td>{g.consumed_at ? new Date(g.consumed_at).toLocaleString('en-KE') : 'Not accessed'}</td><td><Provenance label={status.toLowerCase()} /></td><td>{editable && status === 'Active' ? <button type="button" onClick={() => act(() => api('/grants/' + g.id + '/revoke', 'POST', {}))}>Revoke</button> : '—'}</td></tr>;
                })}</tbody></DataTable> : <p>No recipient access has been authorized.</p>}
                {grantLink && <div className="business-id-share-link" role="status"><strong>Recipient-bound access link created.</strong><span>The link includes a temporary access token. Copy it only to the named recipient; it is hidden in this screen.</span><div><button type="button" className="button" onClick={async () => { try { await navigator.clipboard.writeText(grantLink); setGrantLink(''); setNotice('Access link copied. Share it only with the named recipient.'); } catch { setError('Clipboard access was unavailable. Close this notice and create a new share link when ready to copy.'); } }}>Copy access link</button><button type="button" className="secondary-button" onClick={() => setGrantLink('')}>Clear link</button></div></div>}
              </section>
              {dialog === 'sharing' && <Overlay onClose={closeShareDialog}><section className="business-id-modal" role="dialog" aria-modal="true" aria-labelledby="business-id-sharing-title"><header><h2 id="business-id-sharing-title">Authorize a minimal presentation</h2><button type="button" aria-label="Close" onClick={closeShareDialog}>×</button></header><Form className="business-id-modal-form" submit={async (d) => {
                if (!shareCredentialIds.length) throw Error('Choose at least one credential to share.');
                if (!d.consent || d.consent !== 'on') throw Error('Confirm consent for this specific disclosure.');
                const result = await act(() => api('/grants', 'POST', { recipient_org: shareRecipient, credential_ids: shareCredentialIds, purpose: d.purpose, expires_hours: Number(d.expires_hours), one_time: d.one_time === 'on', ...(shareRequest ? { request_id: shareRequest } : {}), consent: true }), true);
                if (result?.url) { setGrantLink(location.origin + result.url); closeShareDialog(); }
              }}><div className="business-id-edit-columns"><div><BusinessSelector api={api} name="recipient_org" label="Named recipient business" value={shareRecipient} onChange={(id) => { setShareRecipient(id); setShareRequest(''); }} /><Field label="Matching inbound verification request (optional)"><select value={shareRequest} onChange={(e) => setShareRequest(e.target.value)} disabled={!shareRecipient}><option value="">No linked request</option>{matchingShareRequests.map((r: any) => <option key={r.id} value={r.id}>{(r.types || []).join(', ')} · {r.purpose} · expires {new Date(r.expires_at).toLocaleDateString('en-KE')}</option>)}</select></Field><p className="business-id-help">When using a request, credential types and purpose must exactly match it. The server checks the recipient, purpose, expiry and credentials again.</p></div><div><Field label="Purpose"><textarea name="purpose" minLength={10} maxLength={500} required /></Field><Field label="Expires in hours"><input type="number" name="expires_hours" min={1} max={720} defaultValue={168} required /></Field><Field label="One-time access"><input type="checkbox" name="one_time" defaultChecked /></Field></div></div><fieldset className="business-id-choice-list"><legend>Eligible active credentials</legend>{activeShareCredentials.length ? activeShareCredentials.map((c: any) => <label className="check-row" key={c.id}><input type="checkbox" checked={shareCredentialIds.includes(c.id)} onChange={(e) => setShareCredentialIds(e.target.checked ? [...shareCredentialIds, c.id] : shareCredentialIds.filter((id) => id !== c.id))} />{c.type.replace(/Credential$/, '').replace(/([A-Z])/g, ' $1').trim()} · {c.issuer_name || 'Issuer unavailable'} · valid until {new Date(c.valid_until).toLocaleDateString('en-KE')}</label>) : <p>No active, unexpired credentials are available to share.</p>}</fieldset>{consent}<p className="business-id-help">Credentials are re-verified at creation and again when accessed. Revocation blocks future access but cannot erase copies already disclosed.</p><footer><button className="button" disabled={!editable || !shareRecipient || !shareCredentialIds.length}>Create recipient-bound share</button><button type="button" className="secondary-button" onClick={closeShareDialog}>Discard</button></footer></Form></section></Overlay>}
            </>
          )}
          {(tab === 'Activity History' || tab === 'History') && (
            <section className="business-id-register">
              <header className="business-id-register-toolbar"><div><h2>Trust activity history</h2><p>Events are scoped to this business and environment. Resource references are shortened in the interface.</p></div></header>
              {readError('history') ? <p role="alert">History unavailable: {readError('history')}</p> : history.length ? <DataTable className="business-id-table"><thead><tr><th>Date and Time</th><th>Event</th><th>Resource Reference</th><th>Actor</th></tr></thead><tbody>{history.map((h: any) => <tr key={h.id}><td>{new Date(h.created_at).toLocaleString('en-KE')}</td><td>{String(h.action).replaceAll('.', ' ').replaceAll('_', ' ')}</td><td>{String(h.resource_id).slice(0, 8).toUpperCase()}</td><td>Authorized business member</td></tr>)}</tbody></DataTable> : <p>No trust activity has been recorded yet.</p>}
              <footer className="business-id-pagination"><span>{historyMeta.total ? `Showing page ${historyPage} · ${historyMeta.total} events` : 'No events'}</span><div><button type="button" className="secondary-button" disabled={historyPage <= 1 || loading} onClick={() => void load(historyPage - 1)}>Previous</button><button type="button" className="secondary-button" disabled={!historyMeta.has_more || loading} onClick={() => void load(historyPage + 1)}>Next</button></div></footer>
            </section>
          )}
          {(tab === 'Privacy & Security' || tab === 'Settings') && (
            <section className="business-id-register business-id-settings">
              <header className="business-id-register-toolbar"><div><h2>Business ID settings</h2><p>Manage public discoverability and review the actual trust environment.</p></div></header>
              <section className="business-id-settings-group"><h3>Public business profile</h3><p>Opting in exposes only the display name, category, industry, country, public reference and identity review status. It does not publish evidence, financial records, credentials or contact details.</p><div className="business-id-settings-state"><Provenance label={p.public_profile ? 'public_profile_enabled' : 'private_profile'} /><span>{p.public_profile ? 'Public profile is discoverable by name in this environment.' : 'Profile is private and excluded from business search.'}</span></div>{editable && <button className="secondary-button" disabled={busy} onClick={() => act(() => api('/passport', 'PATCH', { public_profile: !p.public_profile }))}>{p.public_profile ? 'Disable public profile' : 'Enable minimal public profile'}</button>}</section>
              <section className="business-id-settings-group"><h3>Current environment</h3><div className="business-id-detail-columns"><dl><div><dt>Environment</dt><dd>{environment === 'sandbox' ? 'Sandbox' : 'Production'}</dd></div><div><dt>Passport service</dt><dd>{trustConfig?.passport_beta ? 'Enabled' : trustConfig ? 'Disabled by configuration' : 'Configuration unavailable'}</dd></div><div><dt>Credential issuance</dt><dd>{trustConfig?.credential_issuance ? 'Enabled' : trustConfig ? 'Disabled by configuration' : 'Configuration unavailable'}</dd></div></dl><dl><div><dt>Recipient sharing</dt><dd>{trustConfig?.trust_sharing ? 'Enabled' : trustConfig ? 'Disabled by configuration' : 'Configuration unavailable'}</dd></div><div><dt>Optional blockchain proof</dt><dd>{enabled('blockchain') ? (trustConfig?.testnet_anchoring ? 'Blockchain service active · testnet anchoring enabled' : 'Service active; anchoring is not configured') : 'Optional service is not active for this workspace'}</dd></div><div><dt>Production mutations</dt><dd>{environment === 'sandbox' ? 'Production trust mutations are disabled pending governance and key management review.' : 'Service endpoints enforce production mutation restrictions.'}</dd></div></dl></div></section>
              <section className="business-id-settings-group"><h3>Assurance and data handling</h3><ul><li>Credential signatures establish integrity. Issuer authority and current status are checked separately.</li><li>Sharing discloses complete selected signed credentials; cryptographic selective disclosure is not enabled.</li><li>Revoking access blocks future retrieval; it cannot erase a copy already received.</li><li>Private evidence and credentials are stored by AfriCore services. No claim is made that every trust datum is off-chain.</li><li>Retention expiry does not guarantee immediate deletion or replace legal hold and approved erasure procedures.</li><li>Use synthetic or authorized records in sandbox. Document malware scanning is not configured.</li></ul></section>
            </section>
          )}
          {tab === 'Issuer Desk' && (
            <>
              <section className="panel">
                <h2>Issuer authority is separately approved</h2>
                <p>
                  An account does not confer institutional authority. Sandbox approval permits
                  labeled test assertions only.
                </p>
                {issuers.map((i) => (
                  <article className="credential-card" key={i.id}>
                    <h3>
                      {i.name} · {i.status}
                    </h3>
                    <p className="record-id">{i.id}</p>
                    <p>{i.authority}</p>
                    {editable && i.status === 'approved_sandbox' && (
                      <Form
                        submit={(d) =>
                          act(() =>
                            api('/issuers/' + i.id + '/rotate', 'POST', {
                              compromise: d.compromise === 'on',
                              reason: d.reason,
                            }),
                          )
                        }
                      >
                        <input
                          name="reason"
                          minLength={10}
                          required
                          placeholder="Rotation reason"
                        />
                        <Field label="Treat prior active key as compromised and revoke its credentials">
                          <input name="compromise" type="checkbox" />
                        </Field>
                        <button>Rotate sandbox key</button>
                      </Form>
                    )}
                  </article>
                ))}
              </section>
              {editable && (
                <Form
                  submit={(d) =>
                    act(() =>
                      api('/issuers', 'POST', {
                        name: d.name,
                        types: d.type
                          ? [d.type]
                          : trustTypes.filter((type) => d['type_' + type] === 'on'),
                        statement: d.statement,
                      }),
                      true,
                    )
                  }
                >
                  <h3>Apply as a sandbox issuer</h3>
                  <Field label="Issuer display name">
                    <input name="name" required />
                  </Field>
                  <Field label="Credential type authority requested">
                    <select name="type">
                      {trustTypes.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Authority and sandbox purpose">
                    <textarea name="statement" required minLength={10} />
                  </Field>
                  <button className="button">Submit for operator review</button>
                </Form>
              )}
              <section className="panel">
                <h3>Holder-authorized issuance requests</h3>
                {issuance.map((r) => (
                  <article className="credential-card" key={r.id}>
                    <h3>
                      {r.type} · {r.status}
                    </h3>
                    <p>
                      Holder {r.org_id} · {r.evidence?.length || 0} authorized evidence references
                    </p>
                    <p className="record-id">{r.id}</p>
                    {r.peer_org === org && r.status === 'pending' && (
                      <button
                        onClick={() => act(() => api('/credentials', 'POST', { request_id: r.id }))}
                      >
                        Review & issue sandbox credential
                      </button>
                    )}
                  </article>
                ))}
              </section>
              <Form
                submit={(d) =>
                  act(() =>
                    api('/credentials/' + d.credential_id + '/status', 'POST', {
                      status: d.status,
                      reason: d.reason,
                    }),
                  )
                }
              >
                <h3>Issuer status action</h3>
                <Field label="Credential issued by your organization">
                  <input name="credential_id" required />
                </Field>
                <Field label="Status">
                  <select name="status">
                    <option value="suspended">Suspend</option>
                    <option value="revoked">Permanently revoke</option>
                    <option value="active">Resume suspended credential</option>
                  </select>
                </Field>
                <Field label="Reason">
                  <textarea name="reason" minLength={10} required />
                </Field>
                <button className="secondary-button">Record authorized status change</button>
              </Form>
            </>
          )}
          {tab === 'Trust Operations' && (
            <section className="panel">
              <h2>Restricted trust operations</h2>
              <p>
                Issuer reviews and platform-wide trust operations require a separately authorized
                internal channel. They are unavailable through the public workspace. Business
                ownership does not grant operator access.
              </p>
            </section>
          )}
          {report && <VerificationReport report={report} />}
        </>
      )}
    </div>
  );
}
