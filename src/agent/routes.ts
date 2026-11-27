import { Router } from 'express';
import { z } from 'zod';
import { access, fail, route } from '../platform/auth';
import {
  addAgentMemory,
  createAgentRoutine,
  decideAgentApproval,
  deleteAgentMemory,
  deleteAgentRoutine,
  getAgentOverview,
  getAgentPolicy,
  listAgentApprovals,
  listAgentMemory,
  listAgentRoutines,
  listAgentRuns,
  runAgent,
  triggerAgentRoutineNow,
  updateAgentPolicy,
  updateAgentRoutine,
} from './engine';
import {
  getAgentBillingSummary,
  grantEvaluationAgentCredits,
  updateAgentBilling,
} from './billing';
import { agentBillingUpdateInput, agentCreditsGrantInput } from './contracts';

export const agentRoutes = Router();

const idempotencyKey = (req: any) =>
  z.string().min(8).max(150).parse(req.headers['idempotency-key']);

agentRoutes.get(
  '/organizations/:org/agent/overview',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human session required for Autonomous Agent');
    res.json(await getAgentOverview(a));
  }),
);

agentRoutes.get(
  '/organizations/:org/agent/runs',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human session required');
    const limit = z.coerce.number().int().min(1).max(100).default(30).parse(req.query.limit);
    res.json({ data: await listAgentRuns(a, limit) });
  }),
);

agentRoutes.post(
  '/organizations/:org/agent/runs',
  route(async (req, res) => {
    const a = await access(req);
    res.status(201).json(await runAgent(a, req.body, idempotencyKey(req)));
  }),
);

agentRoutes.get(
  '/organizations/:org/agent/approvals',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human session required');
    res.json({ data: await listAgentApprovals(a) });
  }),
);

agentRoutes.post(
  '/organizations/:org/agent/approvals/:id/decide',
  route(async (req, res) => {
    const a = await access(req);
    res.json(await decideAgentApproval(a, String(req.params.id), req.body));
  }),
);

agentRoutes.get(
  '/organizations/:org/agent/permissions',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human session required');
    res.json(await getAgentPolicy(a));
  }),
);

agentRoutes.put(
  '/organizations/:org/agent/permissions',
  route(async (req, res) => {
    const a = await access(req, 'admin');
    res.json(await updateAgentPolicy(a, req.body));
  }),
);

agentRoutes.get(
  '/organizations/:org/agent/routines',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human session required');
    res.json({ data: await listAgentRoutines(a) });
  }),
);

agentRoutes.post(
  '/organizations/:org/agent/routines',
  route(async (req, res) => {
    const a = await access(req);
    res.status(201).json(await createAgentRoutine(a, req.body));
  }),
);

agentRoutes.patch(
  '/organizations/:org/agent/routines/:id',
  route(async (req, res) => {
    const a = await access(req);
    res.json(await updateAgentRoutine(a, String(req.params.id), req.body));
  }),
);

agentRoutes.post(
  '/organizations/:org/agent/routines/:id/run',
  route(async (req, res) => {
    const a = await access(req);
    res.json(await triggerAgentRoutineNow(a, String(req.params.id), idempotencyKey(req)));
  }),
);

agentRoutes.delete(
  '/organizations/:org/agent/routines/:id',
  route(async (req, res) => {
    const a = await access(req);
    res.json(await deleteAgentRoutine(a, String(req.params.id)));
  }),
);

agentRoutes.get(
  '/organizations/:org/agent/billing',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human session required');
    const period = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional()
      .parse(req.query.period);
    res.json(await getAgentBillingSummary(a, period));
  }),
);

agentRoutes.put(
  '/organizations/:org/agent/billing',
  route(async (req, res) => {
    const a = await access(req, 'admin');
    res.json(await updateAgentBilling(a, agentBillingUpdateInput.parse(req.body)));
  }),
);

agentRoutes.post(
  '/organizations/:org/agent/billing/credits',
  route(async (req, res) => {
    const a = await access(req, 'admin');
    const d = agentCreditsGrantInput.parse(req.body);
    res.json(await grantEvaluationAgentCredits(a, d.credits, d.reason));
  }),
);

agentRoutes.get(
  '/organizations/:org/agent/memory',
  route(async (req, res) => {
    const a = await access(req);
    if (a.api) fail(403, 'Human session required');
    res.json({ data: await listAgentMemory(a) });
  }),
);

agentRoutes.post(
  '/organizations/:org/agent/memory',
  route(async (req, res) => {
    const a = await access(req);
    res.status(201).json(await addAgentMemory(a, req.body));
  }),
);

agentRoutes.delete(
  '/organizations/:org/agent/memory/:id',
  route(async (req, res) => {
    const a = await access(req);
    res.json(await deleteAgentMemory(a, String(req.params.id)));
  }),
);
