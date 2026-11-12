import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {dbAll,dbGet,dbRun,dbTransaction} from '../db/adapter';
import {type Access,audit,fail} from '../platform/auth';
import {hash,now,secret} from '../platform/crypto';
import {record,enqueue,mpesaProvider} from '../platform/payments';
import {requireServices} from '../marketplace/engine';
import {documentBalance} from './ledger';
import {canonical} from './service';
import {requestInput} from './contracts';
/** Shared request factory. Callers establish current actor/policy authorization;
 * financial evidence, key binding and one-time checkout disclosure stay canonical. */
export async function createPaymentRequest(a:Access,input:unknown,key:string){
 const d=requestInput.parse(input),idempotency=z.string().min(8).max(200).parse(key);
 await requireServices(a,['payments']);
    return dbTransaction(async () => {
      await dbRun('UPDATE ac_organizations SET name=name WHERE id=?', [a.org]);
      const previous = await dbGet(
        'SELECT * FROM ac_requests WHERE org_id=? AND environment=? AND idempotency_key=?',
        [a.org, a.environment, idempotency],
      );
      if (previous) {
        const input=await dbGet('SELECT fingerprint FROM ac_finance_operations WHERE org_id=? AND environment=? AND operation=? AND idempotency_key=?',[a.org,a.environment,'payment_request.input',idempotency]);if(input&&input.fingerprint!==hash(canonical(d)))fail(409,'Idempotency key conflicts with original payment request');
        if (previous.document_id !== d.document_id || (d.amount_minor!==undefined&&Number(previous.amount_minor)!==d.amount_minor))
          fail(409, 'Idempotency key already used with different input');
        return {
          status: 200,
          data: {
            ...previous,
            checkout_hash: undefined,
            checkout_url: null,
            message: 'Checkout secret is shown once; use the original URL.',
          },
        };
      }
      if (a.environment !== 'sandbox') await mpesaProvider.initiate({}, '');
      const doc = await record(a, d.document_id);
      const { all: stage2Objects } = await import('../operations/store');
      if (
        (await stage2Objects(a, 'protected_sales')).some(
          (s) =>
            [doc.id, doc.order_id].filter(Boolean).includes(s.order_id) &&
            !['cancelled', 'expired'].includes(s.state),
        )
      )
        fail(409, 'Use the protected-payment workflow for this order');
      if (
        !['invoices', 'orders'].includes(doc.kind) ||
        !['issued', 'partially_paid', 'awaiting_payment'].includes(doc.status)
      )
        fail(409, 'Issue the document first');
      if (doc.kind === 'orders' && doc.fulfillment_status === 'cancelled')
        fail(409, 'Order is cancelled');
      // Pay against invoice when an order is invoiced; prevent double collection through both documents.
      if (doc.kind === 'orders') {
        const invoices = await dbAll(
          "SELECT data FROM ac_records WHERE org_id=? AND environment=? AND kind='invoices'",
          [a.org, a.environment],
        );
        if (
          invoices.some(
            (r) =>
              JSON.parse(r.data).order_id === doc.id &&
              JSON.parse(r.data).status !== 'voided',
          )
        )
          fail(409, 'Collect against the linked invoice');
      }
      const balance=await documentBalance(a,doc.id);
      if(balance.collection_hold)fail(409,'A recorded cash return requires reviewed invoice correction before further collection');
      const id = randomUUID(),
        token = secret(),
        amount = d.amount_minor??balance.outstanding_minor,
        expires = new Date(Date.now() + d.expires_in_hours*3600000).toISOString();
      if(amount<=0||amount>balance.outstanding_minor)fail(409,'Payment request exceeds the open balance');
      await dbRun(
        'INSERT INTO ac_requests(id,org_id,environment,document_id,amount_minor,currency,status,checkout_hash,idempotency_key,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [
          id,
          a.org,
          a.environment,
          doc.id,
          amount,
          doc.currency,
          'pending',
          hash(token),
          idempotency,
          expires,
          now(),
        ],
      );
      await dbRun('INSERT INTO ac_finance_operations(org_id,environment,operation,idempotency_key,fingerprint,response,created_at) VALUES (?,?,?,?,?,?,?)',[a.org,a.environment,'payment_request.input',idempotency,hash(canonical(d)),JSON.stringify({id}),now()]);
      await enqueue(a, 'payment.pending', { request_id: id });
      await audit(a.org, a.actor, 'payment_request.created', id);
      return {
        status: 201,
        data: {
          id,
          amount_minor: amount,
          currency: doc.currency,
          status: 'pending',
          checkout_url: '/checkout/' + token,
          expires_at: expires,
          environment: a.environment,
        },
      };
    });
}
