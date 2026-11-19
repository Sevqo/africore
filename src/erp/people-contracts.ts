import { z } from 'zod';
import { currencySchema } from '../platform/domain';
const id = z.string().uuid(),
  name = z.string().trim().min(1).max(160);
export const peoplePolicy = z
  .object({
    working_week: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .default('Africa/Nairobi')
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Use a valid IANA timezone'),
    working_hours: z
      .object({
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        break_minutes: z.number().int().min(0).max(360),
      })
      .strict()
      .nullable()
      .default(null)
      .refine(
        (schedule) => !schedule || schedule.start < schedule.end,
        'The configured daily schedule must end after it starts',
      ),
    holidays: z.array(z.object({ date: z.string().date(), name })).max(366),
    allow_manager_profiles: z.boolean(),
    allow_manager_leave_approval: z.boolean(),
    share_leave_calendar_with_managers: z.boolean(),
    share_self_personnel_files: z.boolean(),
    share_self_compensation: z.boolean(),
    hr_members: z
      .array(z.object({ user_id: id, permission: z.enum(['view', 'edit', 'manage']) }).strict())
      .max(100),
    compensation_members: z
      .array(z.object({ user_id: id, permission: z.enum(['view', 'edit']) }).strict())
      .max(100),
    recruitment_members: z
      .array(z.object({ user_id: id, permission: z.enum(['view', 'edit']) }).strict())
      .max(100)
      .default([]),
    performance_members: z
      .array(z.object({ user_id: id, permission: z.enum(['view', 'edit']) }).strict())
      .max(100)
      .default([]),
    share_appraisal_feedback: z.boolean().default(false),
  })
  .strict();
export const peopleConfigurationInput = z
  .object({ expected_version: z.number().int().min(0), policy: peoplePolicy })
  .strict();
export const departmentInput = z
  .object({
    expected_version: z.number().int().min(0),
    name,
    manager_id: id.nullable().default(null),
    parent_id: id.nullable().default(null),
    description: z.string().max(2000).default(''),
    active: z.boolean().default(true),
  })
  .strict();
export const employeeInput = z
  .object({
    expected_version: z.number().int().min(0),
    employee_number: z.string().trim().min(1).max(60),
    name,
    job_title: z.string().max(160).default(''),
    position_id: id.nullable().optional(),
    department_id: id.nullable().default(null),
    manager_id: id.nullable().default(null),
    linked_user_id: id.nullable().default(null),
    self_service: z.boolean().default(false),
    work_email: z.string().email().max(200).or(z.literal('')).default(''),
    work_phone: z.string().max(80).default(''),
    start_on: z.string().date(),
    status: z.enum(['active', 'onboarding', 'inactive']).default('onboarding'),
    hr_notes: z.string().max(5000).default(''),
  })
  .strict();

export const peoplePositionInput = z
  .object({
    expected_version: z.number().int().min(0),
    title: name,
    department_id: id.nullable().default(null),
    hiring_manager_id: id.nullable().default(null),
    description: z.string().max(4000).default(''),
    responsibilities: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
    required_skill_ids: z.array(id).max(40).default([]),
    employment_category: z
      .enum(['full_time', 'part_time', 'temporary', 'contractor'])
      .nullable()
      .default(null),
    planned_vacancies: z.number().int().min(0).max(1000).default(0),
    active: z.boolean().default(true),
  })
  .strict();

export const peopleSkillInput = z
  .object({
    expected_version: z.number().int().min(0),
    name,
    type: z.enum(['technical', 'language', 'soft', 'other']).default('other'),
    active: z.boolean().default(true),
  })
  .strict();

export const employeePrivateInput = z
  .object({
    expected_version: z.number().int().min(0),
    legal_name: z.string().trim().max(160).default(''),
    private_email: z.string().email().max(200).or(z.literal('')).default(''),
    private_phone: z.string().max(80).default(''),
    birthday: z.string().date().nullable().default(null),
    place_of_birth: z.string().max(160).default(''),
    gender: z.enum(['female', 'male', 'non_binary', 'undisclosed']).nullable().default(null),
    emergency_contact_name: z.string().max(160).default(''),
    emergency_contact_phone: z.string().max(80).default(''),
    visa_reference: z.string().max(120).default(''),
    work_permit_reference: z.string().max(120).default(''),
    work_permit_expiry: z.string().date().nullable().default(null),
    private_notes: z.string().max(3000).default(''),
  })
  .strict();

export const employeeResumeInput = z
  .object({
    expected_version: z.number().int().min(0),
    title: name,
    organization: z.string().max(180).default(''),
    description: z.string().max(3000).default(''),
    from_on: z.string().date().nullable().default(null),
    to_on: z.string().date().nullable().default(null),
  })
  .strict()
  .refine((d) => !d.from_on || !d.to_on || d.from_on <= d.to_on, 'Resume dates must be ordered');

export const employeeSkillInput = z
  .object({
    expected_version: z.number().int().min(0),
    skill_id: id,
    proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
    years_experience: z.number().min(0).max(80).default(0),
    verified: z.boolean().default(false),
  })
  .strict();

export const employeeCertificationInput = z
  .object({
    expected_version: z.number().int().min(0),
    name,
    issuer: z.string().trim().min(1).max(180),
    credential_reference: z.string().max(160).default(''),
    issued_on: z.string().date().nullable().default(null),
    expires_on: z.string().date().nullable().default(null),
    reminder_days: z.number().int().min(0).max(365).default(30),
  })
  .strict()
  .refine(
    (d) => !d.issued_on || !d.expires_on || d.issued_on <= d.expires_on,
    'Certificate dates must be ordered',
  );

export const openingInput = z
  .object({
    expected_version: z.number().int().min(0),
    position_id: id,
    recruiter_id: id,
    vacancies: z.number().int().min(1).max(1000),
    description: z.string().max(4000).default(''),
    opening_on: z.string().date(),
    deadline: z.string().date().nullable().default(null),
    status: z.enum(['draft', 'open', 'closed']).default('draft'),
  })
  .strict()
  .refine((d) => !d.deadline || d.opening_on <= d.deadline, 'Opening dates must be ordered');

export const candidateInput = z
  .object({
    expected_version: z.number().int().min(0),
    name,
    email: z.string().email().max(200).or(z.literal('')).default(''),
    phone: z.string().max(80).default(''),
    source: z.string().max(160).default(''),
    private_notes: z.string().max(4000).default(''),
  })
  .strict()
  .refine((d) => !!d.email || !!d.phone, 'Provide an email or phone for duplicate checks');

export const applicationInput = z
  .object({
    expected_version: z.number().int().min(0),
    candidate_id: id,
    opening_id: id,
    stage: z.enum(['new', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected']),
    recruiter_id: id,
    interview_on: z.string().date().nullable().default(null),
    assessment_notes: z.string().max(3000).default(''),
    decision_reason: z.string().max(2000).default(''),
  })
  .strict();

export const hireCandidateInput = z
  .object({
    expected_version: z.number().int().positive(),
    employee_number: z.string().trim().min(1).max(60),
    start_on: z.string().date(),
    manager_id: id.nullable().default(null),
    linked_user_id: id.nullable().default(null),
  })
  .strict();

export const goalInput = z
  .object({
    expected_version: z.number().int().min(0),
    employee_id: id,
    title: name,
    description: z.string().max(3000).default(''),
    start_on: z.string().date(),
    deadline: z.string().date().nullable().default(null),
    progress: z.number().int().min(0).max(100).default(0),
    status: z.enum(['active', 'completed', 'cancelled']).default('active'),
    skill_ids: z.array(id).max(30).default([]),
    work_task_id: id.nullable().default(null),
  })
  .strict()
  .refine((d) => !d.deadline || d.start_on <= d.deadline, 'Goal dates must be ordered');

export const appraisalInput = z
  .object({
    expected_version: z.number().int().min(0),
    employee_id: id,
    reviewer_id: id,
    period_start: z.string().date(),
    period_end: z.string().date(),
    review_on: z.string().date().nullable().default(null),
    state: z.enum([
      'draft',
      'scheduled',
      'in_progress',
      'pending_review',
      'completed',
      'cancelled',
    ]),
    self_assessment: z.string().max(4000).default(''),
    manager_assessment: z.string().max(4000).default(''),
    skills_development: z.string().max(3000).default(''),
    feedback: z.string().max(3000).default(''),
    private_manager_notes: z.string().max(4000).default(''),
    goal_ids: z.array(id).max(100).default([]),
  })
  .strict()
  .refine((d) => d.period_start <= d.period_end, 'Review period must be ordered');

export const lifecyclePlanInput = z
  .object({
    expected_version: z.number().int().min(0),
    name,
    direction: z.enum(['onboarding', 'offboarding']),
    department_id: id.nullable().default(null),
    position_id: id.nullable().default(null),
    tasks: z
      .array(
        z
          .object({
            title: z.string().trim().min(2).max(200),
            due_offset_days: z.number().int().min(-365).max(365),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    active: z.boolean().default(true),
  })
  .strict();

export const lifecycleCaseInput = z
  .object({
    expected_version: z.number().int().min(0),
    employee_id: id,
    plan_id: id,
    effective_on: z.string().date(),
    departure_reason: z.string().max(2000).default(''),
  })
  .strict();
export const lifecycleTaskInput = z
  .object({
    expected_version: z.number().int().min(1),
    task_index: z.number().int().min(0).max(29),
    done: z.boolean(),
    note: z.string().max(1000).default(''),
  })
  .strict();
export const lifecycleCompleteInput = z
  .object({ expected_version: z.number().int().min(1) })
  .strict();
export const goalProgressInput = z
  .object({ expected_version: z.number().int().min(1), progress: z.number().int().min(0).max(100) })
  .strict();
export const appraisalSelfInput = z
  .object({ expected_version: z.number().int().min(1), self_assessment: z.string().max(4000) })
  .strict();
export const leaveTypeInput = z
  .object({
    expected_version: z.number().int().min(0),
    name,
    active: z.boolean().default(true),
    annual_allowance_milli: z.number().int().min(0).max(366000),
    accrual: z.enum(['annual', 'monthly']),
    prorate_start_year: z.boolean().default(false),
    paid: z.boolean().default(false),
  })
  .strict();
export const leaveRequestInput = z
  .object({
    leave_type_id: id,
    from: z.string().date(),
    to: z.string().date(),
    half_day: z.boolean().default(false),
    reason: z.string().max(3000).default(''),
    approver: id,
  })
  .strict();
export const leavePreviewInput = leaveRequestInput.omit({ approver: true, reason: true });
export const leaveAdjustmentInput = z
  .object({
    leave_type_id: id,
    year: z.number().int().min(1900).max(9999),
    units_milli: z
      .number()
      .int()
      .min(-366000)
      .max(366000)
      .refine((n) => n !== 0, 'A non-zero adjustment is required'),
    reference: z.string().trim().min(3).max(120),
    reason: z.string().trim().min(8).max(2000),
  })
  .strict();
export const attendanceCorrectionInput = z
  .object({
    expected_version: z.number().int().min(1),
    check_in: z.string().datetime(),
    check_out: z.string().datetime(),
    reason: z.string().trim().min(8).max(2000),
  })
  .strict();
export const compensationInput = z
  .object({
    effective_from: z.string().date(),
    effective_to: z.string().date().nullable().default(null),
    amount_minor: z.number().int().min(0).max(100000000000),
    currency: currencySchema,
    period: z.enum(['hour', 'week', 'month', 'year']),
    notes: z.string().max(3000).default(''),
    supersedes_id: id.nullable().default(null),
  })
  .strict();

export const peopleConfirmationInput = z.object({ confirm: z.literal(true) }).strict();
export const leaveCancelInput = z
  .object({ expected_version: z.number().int().min(1), reason: z.string().trim().min(8).max(2000) })
  .strict();
