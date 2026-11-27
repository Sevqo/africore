import { z } from 'zod';
import { currencySchema } from '../platform/domain';

export const agentPermissionMode = z.enum(['disabled', 'approval_required', 'autonomous']);
export type AgentPermissionMode = z.infer<typeof agentPermissionMode>;

export const agentRunInput = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(2)
      .max(2000)
      .refine(
        (v) =>
          !/\bsk-[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/|-----BEGIN [A-Z ]*PRIVATE KEY/.test(v),
        'Remove credentials and private keys before instructing the agent',
      ),
    currency: currencySchema.default('KES'),
    tool_hint: z.string().max(80).optional(),
    target_workspace_id: z.string().uuid().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    computer_use: z.boolean().default(true),
    stage_in_sandbox: z.boolean().default(false),
    consent_to_provider: z.boolean().default(false),
  })
  .strict();

export const agentApprovalDecisionInput = z
  .object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(500).default(''),
    edited_params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const agentPermissionsUpdateInput = z
  .object({
    autonomy_mode: z.enum(['read_only', 'supervised', 'autonomous']).optional(),
    computer_use_enabled: z.boolean().optional(),
    cross_dev_bridge_enabled: z.boolean().optional(),
    permissions: z.record(z.string(), agentPermissionMode).optional(),
  })
  .strict();

export const agentRoutineCreateInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(400).default(''),
    trigger_type: z.enum(['schedule', 'event', 'manual']).default('schedule'),
    schedule_label: z.string().trim().min(2).max(100).default('Weekdays at 08:00 EAT'),
    prompt: z.string().trim().min(3).max(1500),
    tool_name: z.string().trim().min(2).max(80),
    execution_mode: z.enum(['approval_required', 'autonomous']).default('approval_required'),
    enabled: z.boolean().default(true),
  })
  .strict();

export const agentRoutinePatchInput = z
  .object({
    enabled: z.boolean().optional(),
    execution_mode: z.enum(['approval_required', 'autonomous']).optional(),
    schedule_label: z.string().trim().min(2).max(100).optional(),
    prompt: z.string().trim().min(3).max(1500).optional(),
  })
  .strict();

export const agentBillingUpdateInput = z
  .object({
    plan_tier: z.enum(['agent_starter', 'agent_growth', 'agent_autonomous']).optional(),
    monthly_spend_cap_minor: z.number().int().min(0).max(100_000_000).nullable().optional(),
    hard_stop: z.boolean().optional(),
  })
  .strict();

export const agentCreditsGrantInput = z
  .object({
    credits: z.number().int().min(10).max(500).default(100),
    reason: z.string().trim().min(3).max(200).default('Evaluation agent credit top-up'),
  })
  .strict();

export const agentMemoryInput = z
  .object({
    category: z.enum(['preference', 'business_context', 'workflow_rule', 'tone']).default('preference'),
    content: z.string().trim().min(3).max(800),
  })
  .strict();
