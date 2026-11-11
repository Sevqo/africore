/** New cash facts are merchant observations, never fabricated ac_events rows.
 * Migration 019 owns installation; historical migration 008 is unchanged. */
export const cashMovementTable = 'ac_cash_movements';
export const cashMovementStatement = 'CREATE TABLE IF NOT EXISTS ac_cash_movements (id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES ac_organizations(id),environment TEXT NOT NULL,document_id TEXT NOT NULL REFERENCES ac_records(id),amount_minor BIGINT NOT NULL,currency TEXT NOT NULL,kind TEXT NOT NULL,related_receipt_id TEXT REFERENCES ac_cash_movements(id),source_type TEXT NOT NULL,source_id TEXT NOT NULL,session_id TEXT REFERENCES ac_erp_objects(id),occurred_at TEXT NOT NULL,actor TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(org_id,environment,source_type,source_id,kind),CHECK ((kind=\'receipt\' AND amount_minor>0 AND related_receipt_id IS NULL) OR (kind=\'return\' AND amount_minor<0 AND related_receipt_id IS NOT NULL)))';

/** Existing columns retain their order and semantics. The extra classification
 * prevents consumers from representing recorded cash as provider confirmation. */
export const effectiveAllocationsWithCash = `CREATE VIEW ac_effective_allocations AS
 SELECT a.id,a.org_id,a.environment,a.event_id,a.document_id,a.amount_minor,
 COALESCE(d.occurred_at,a.created_at) AS created_at,
 COALESCE(d.time_basis,'legacy_recorded') AS time_basis,'provider_event' AS evidence_kind
 FROM ac_allocations a LEFT JOIN ac_payment_event_details d ON d.event_id=a.event_id
 UNION ALL
 SELECT c.id,c.org_id,c.environment,c.event_id,c.document_id,c.amount_minor,
 CASE WHEN c.amount_minor>0 THEN COALESCE(d.occurred_at,c.occurred_at) ELSE c.occurred_at END AS created_at,
 CASE WHEN c.amount_minor>0 THEN COALESCE(d.time_basis,'legacy_recorded') ELSE 'provider_occurrence' END AS time_basis,
 'provider_event' AS evidence_kind
 FROM ac_allocation_changes c LEFT JOIN ac_payment_event_details d ON d.event_id=c.event_id
 UNION ALL
 SELECT m.id,m.org_id,m.environment,m.id AS event_id,m.document_id,m.amount_minor,
 m.occurred_at AS created_at,'merchant_observation' AS time_basis,'cash_observation' AS evidence_kind
 FROM ac_cash_movements m`;
