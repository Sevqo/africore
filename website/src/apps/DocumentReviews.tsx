import { useEffect, useState } from 'react';
import { Field, Form, type API } from '../operations/UI';
function approvalValue(value: any) {
  if (typeof value !== 'string') return value || {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
export function DocumentReviews({
  document: d,
  members,
  actorId,
  api,
  onChanged,
}: {
  document: any;
  members: any[];
  actorId: string;
  api: API;
  onChanged: () => void;
}) {
  const [reviews, setReviews] = useState<any[]>([]),
    [error, setError] = useState(''),
    [reviewers, setReviewers] = useState<any[]>([]),
    [reviewerError, setReviewerError] = useState(''),
    [reviewerRetry, setReviewerRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setReviews([]);
    setError('');
    api('/business/approvals')
      .then((r) => {
        if (current)
          setReviews(
            r.data.filter((a: any) => a.action === 'document_review' && a.resource_id === d.id),
          );
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [d.id, d.version]);
  useEffect(() => {
    let current = true;
    setReviewers([]);
    setReviewerError('');
    api('/documents/' + d.id + '/reviewers')
      .then((result) => {
        if (current) setReviewers(result.data);
      })
      .catch((e) => {
        if (current) setReviewerError(e.message || 'Eligible reviewers could not be loaded.');
      });
    return () => {
      current = false;
    };
  }, [api, d.id, reviewerRetry]);
  return (
    <section className="app-price-review">
      <h3>Exact file-content review</h3>
      <p>
        A review binds the document revision and retained content version. It records a human review
        only; it does not verify the claim independently, change sharing or approve a financial
        operation.
      </p>
      {error && <p role="alert">{error}</p>}
      {reviewerError && (
        <p role="alert">
          {reviewerError}{' '}
          <button
            className="quiet-button"
            type="button"
            onClick={() => setReviewerRetry((n) => n + 1)}
          >
            Retry eligible reviewers
          </button>
        </p>
      )}
      {d.data.review && (
        <p>
          Latest recorded review: {d.data.review.decision} ·{' '}
          {new Date(d.data.review.at).toLocaleString()} · Applies to retained version{' '}
          {d.data.review.version_id === d.data.current_version_id
            ? 'currently selected'
            : 'from an earlier upload'}
        </p>
      )}
      {d.permissions.edit && d.permissions.download && d.status === 'active' && (
        <Form
          submit={async (value) => {
            await api('/documents/' + d.id + '/review', 'POST', {
              expected_version: d.version,
              approver: value.approver,
            });
            onChanged();
          }}
        >
          {reviewers.length === 0 && !reviewerError ? (
            <p role="status">No other current member can inspect this file for review.</p>
          ) : (
            <Field label="Separate file reviewer">
              <select name="approver" required defaultValue="" disabled={!!reviewerError}>
                <option value="">Choose a current member with file download access</option>
                {reviewers
                  .filter((reviewer) => reviewer.id !== actorId)
                  .map((reviewer) => {
                    const member = members.find((candidate) => candidate.id === reviewer.id);
                    return (
                      <option key={reviewer.id} value={reviewer.id}>
                        {member?.display_name || member?.email || 'Current workspace member'}
                      </option>
                    );
                  })}
              </select>
            </Field>
          )}
          <p>
            The current file grant and any financial/personnel restrictions must allow the reviewer
            to inspect this content. Requesting a review does not grant access.
          </p>
          <button
            className="button"
            disabled={!!reviewerError || !reviewers.some((reviewer) => reviewer.id !== actorId)}
          >
            Request exact-version file review
          </button>
        </Form>
      )}
      {reviews.map((a) => (
        <article className="app-price-review" key={a.id}>
          <h4>{a.status}</h4>
          <p>
            {approvalValue(a.review_summary).file?.filename || 'Retained file version'} ·{' '}
            {approvalValue(a.review_summary).file?.size_bytes ?? 'Size unavailable'} bytes ·
            document revision{' '}
            {approvalValue(a.parameters).document_review?.document_version ?? 'unavailable'}
          </p>
          {approvalValue(a.review_summary).file?.sha256 && (
            <p>Content fingerprint: {approvalValue(a.review_summary).file.sha256}</p>
          )}
          {a.source_changed && (
            <p role="status">
              The document changed after this review request. This approval cannot certify the
              current file.
            </p>
          )}
          <p>
            A human review records a decision on the submitted version. It does not establish that
            the file is safe, truthful, legally valid or independently verified.
          </p>
          {a.can_decide && (
            <Form
              submit={async (value) => {
                await api('/approvals/' + a.id + '/decide', 'POST', value);
                onChanged();
              }}
            >
              <Field label="File-content decision">
                <select name="decision">
                  <option value="approved">Accept this retained file version</option>
                  <option value="rejected">Reject this retained file version</option>
                </select>
              </Field>
              <Field label="Private file review reason">
                <textarea name="reason" required minLength={5} maxLength={1000} />
              </Field>
              <button className="button">Record exact file-content decision</button>
            </Form>
          )}
        </article>
      ))}
    </section>
  );
}
