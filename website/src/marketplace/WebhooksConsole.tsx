import { useEffect, useState, type FormEvent } from 'react';
import { Field } from '../accounts/AccountUI';

type Call = (suffix: string, method?: string, body?: unknown) => Promise<any>;

export function WebhooksConsole({ call, manager }: { call: Call; manager?: boolean }) {
  const [data, setData] = useState<{ data: any[]; deliveries: any[] }>({ data: [], deliveries: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  async function run(fn: () => Promise<any>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try { const result = await fn(); if (result?.secret) setSecret(result.secret); setNotice(success); setRevision((value) => value + 1); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!manager) return;
    let live = true;
    call('/webhooks').then((result) => { if (live) setData({ data: result.data || [], deliveries: result.deliveries || [] }); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [manager, revision]);
  if (!manager) return <section className="panel"><h2>Webhooks</h2><p>Webhook configuration is available to workspace owners and administrators. Delivery history and signing secrets are never shown to read-only members.</p></section>;
  return <div className="service-marketplace">
    <p>Receive signed event notifications at an approved public HTTPS receiver. Delivery is at-least-once, so receivers must deduplicate. Hosted delivery is disabled unless the backend allowlist is configured.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert" role="status">{notice}</p>}
    {secret && <section className="panel"><h2>Signing secret</h2><pre className="account-code">{secret}</pre><p>Store this now. It is shown only on creation or rotation. Verify the signature header and never expose the secret in a browser client.</p><button className="secondary-button" onClick={() => setSecret('')}>I have stored it</button></section>}
    <form className="panel" onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      run(() => call('/webhooks', 'POST', {
        url: form.get('url'),
        subscriptions: String(form.get('subscriptions')).split(',').map((value) => value.trim()).filter(Boolean),
      }), 'Webhook endpoint created.').then(() => formElement.reset());
    }}>
      <h2>Add endpoint</h2>
      <Field label="Public HTTPS destination"><input name="url" type="url" required placeholder="https://approved-test-host.example/events" /></Field>
      <Field label="Event subscriptions"><input name="subscriptions" required defaultValue="invoice.issued,payment.succeeded" placeholder="invoice.issued,payment.succeeded" /></Field>
      <p className="muted">Backend destination allowlist and private-network restrictions apply.</p>
      <button className="button" disabled={busy}>Create endpoint</button>
    </form>
    <section className="panel"><h2>Endpoints</h2>
      {data.data.map((endpoint) => <article className="account-record" key={endpoint.id}><strong>{endpoint.url}</strong><span>{endpoint.environment} · {(endpoint.subscriptions || []).join(', ')}</span><button className="secondary-button" disabled={busy} onClick={() => run(() => call('/webhooks/' + endpoint.id + '/rotate', 'POST', {}), 'Signing secret rotated; the previous secret no longer validates.')}>Rotate secret</button></article>)}
      {!data.data.length && <p>No webhook endpoints yet.</p>}
      <button className="secondary-button" disabled={busy} onClick={() => run(() => call('/webhooks/process', 'POST', {}), 'Queued test deliveries processed.')}>Process queued test deliveries</button>
    </section>
    <section className="panel"><h2>Delivery history</h2>
      {data.deliveries.map((delivery) => <article className="account-record" key={delivery.id}><strong>{delivery.event_type} · {delivery.status}</strong><span>Attempts {delivery.attempts}{delivery.last_error ? ' · ' + delivery.last_error : ''}</span><button className="secondary-button" disabled={busy} onClick={() => run(() => call('/deliveries/' + delivery.id + '/replay', 'POST', {}), 'Delivery queued for retry.')}>Retry delivery</button></article>)}
      {!data.deliveries.length && <p>No delivery attempts recorded in this environment.</p>}
    </section>
  </div>;
}
