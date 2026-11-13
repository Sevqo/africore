import { useState, type FormEvent } from 'react';
import { Field } from '../accounts/AccountUI';
import { VerificationReport } from '../trust/PassportWorkspace';

type Call = (suffix: string, method?: string, body?: unknown) => Promise<any>;

export function VerificationConsole({ call }: { call: Call }) {
  const [credential, setCredential] = useState('');
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setReport(null); setBusy(true);
    try { setReport(await call('/verification', 'POST', { credential: credential.trim() })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="service-marketplace">
    <p>Verify a signed credential through the workspace verification API. Signature integrity, issuer authority, current status and evidence quality are separate questions; a valid signature does not establish that the issuer is trustworthy or that a business claim is true.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    <form className="panel" onSubmit={submit}>
      <h2>Verify a credential</h2>
      <Field label="Compact VC JWT"><textarea required minLength={20} maxLength={100000} rows={6} value={credential} onChange={(event) => setCredential(event.target.value)} placeholder="Paste a credential you are authorized to verify." /></Field>
      <button className="button" disabled={busy || credential.trim().length < 20}>{busy ? 'Verifying…' : 'Verify credential'}</button>
    </form>
    {report && <section className="panel"><h2>Verification result</h2><VerificationReport report={report} /><p className="muted">Sandbox beta. No OpenID conformance, institutional accreditation or mainnet proof is implied.</p></section>}
  </div>;
}
