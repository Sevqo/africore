import type { ServicePolicy } from '../marketplace/policy';

export const agentRouteKinds: Record<string, readonly string[]> = {};
export const agentPolicies: Record<string, ServicePolicy> = {};

const allKinds = ['business', 'personal', 'developer'] as const;

const routes = [
  'GET /agent/overview',
  'GET /agent/runs',
  'POST /agent/runs',
  'GET /agent/approvals',
  'POST /agent/approvals/:id/decide',
  'GET /agent/permissions',
  'PUT /agent/permissions',
  'GET /agent/routines',
  'POST /agent/routines',
  'PATCH /agent/routines/:id',
  'POST /agent/routines/:id/run',
  'DELETE /agent/routines/:id',
  'GET /agent/billing',
  'PUT /agent/billing',
  'POST /agent/billing/credits',
  'GET /agent/memory',
  'POST /agent/memory',
  'PATCH /agent/memory/:id',
  'DELETE /agent/memory/:id',
  'POST /agent/transcribe',
  'GET /agent/sessions/search',
];

for (const entry of routes) {
  const [method, path] = entry.split(' ');
  const key = `${method} /organizations/:org${path}`;
  agentRouteKinds[key] = allKinds;
  // Separate Agent Billing & Floating Agent availability: accessible across all workspaces
  // without forcing standard ERP service bundling; credit caps are enforced by src/agent/billing.ts.
  agentPolicies[key] = { services: [] };
}
