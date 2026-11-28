import { z } from 'zod';
import { currencySchema, roles } from '../platform/domain';

export const agentPermissionMode = z.enum(['disabled', 'approval_required', 'autonomous']);
export type AgentPermissionMode = z.infer<typeof agentPermissionMode>;

export const agentImageAttachmentInput = z
  .object({
    kind: z.literal('image').default('image'),
    filename: z.string().trim().min(1).max(160).default('attachment.png'),
    mime_type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    data_url: z
      .string()
      .min(32)
      .max(2_900_000)
      .refine(
        (v) => /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
        'Image attachment must be a valid PNG, JPEG, or WebP data URL',
      ),
    alt_text: z.string().trim().max(400).optional(),
  })
  .strict();

export const agentRunInput = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(2)
      .max(2500)
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
    input_modality: z.enum(['text', 'voice', 'image', 'multimodal']).default('text'),
    attachments: z.array(agentImageAttachmentInput).max(3).default([]),
  })
  .strict();

export const agentTranscribeInput = z
  .object({
    audio_base64: z.string().max(4_500_000).optional(),
    mime_type: z
      .enum(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/mpeg', 'audio/webm;codecs=opus'])
      .default('audio/webm'),
    duration_ms: z.number().int().min(0).max(180_000).default(0),
    client_transcript: z.string().trim().max(2500).default(''),
    language: z.string().trim().max(16).default('en'),
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
    agent_handle: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(/^@?[a-zA-Z0-9][a-zA-Z0-9_-]{1,30}$/, 'Use 2-31 letters, numbers, hyphens, or underscores')
      .refine(
        (v) => {
          const clean = v.replace(/^@+/, '').toLowerCase();
          return clean.endsWith('agent') && clean !== 'agent';
        },
        "Workspace agent handle must end with 'agent' (for example, 'continua-agent')",
      )
      .optional(),
    agent_display_name: z.string().trim().min(2).max(60).optional(),
    floating_agent_roles: z.array(z.enum(roles)).max(15).optional(),
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
    category: z
      .enum(['preference', 'business_context', 'workflow_rule', 'tone', 'user_profile', 'learned_fact'])
      .default('preference'),
    scope: z.enum(['workspace_memory', 'user_profile']).default('workspace_memory'),
    content: z.string().trim().min(3).max(800),
  })
  .strict();

export const agentMemoryPatchInput = z
  .object({
    category: z
      .enum(['preference', 'business_context', 'workflow_rule', 'tone', 'user_profile', 'learned_fact'])
      .optional(),
    scope: z.enum(['workspace_memory', 'user_profile']).optional(),
    content: z.string().trim().min(3).max(800),
  })
  .strict();
