-- Constraints Prisma cannot express in `schema.prisma`: value CHECKs and
-- partial / functional indexes. Applied right after `prisma db push`
-- (`npm run db:push`). Every statement is idempotent.

-- ── organizations ───────────────────────────────────────────────────────────
alter table organizations drop constraint if exists organizations_claim_mode_chk;
alter table organizations add constraint organizations_claim_mode_chk
  check (claim_approval_mode in ('AUTO', 'MANAGER_APPROVAL'));

alter table organizations drop constraint if exists organizations_swap_mode_chk;
alter table organizations add constraint organizations_swap_mode_chk
  check (swap_approval_mode in ('AUTO', 'MANAGER_APPROVAL'));

alter table organizations drop constraint if exists organizations_org_type_chk;
alter table organizations add constraint organizations_org_type_chk
  check (org_type in ('HOSPITAL', 'CLINIC', 'HEALTH_SYSTEM', 'AGENCY', 'OTHER'));

alter table organizations drop constraint if exists organizations_confidentiality_chk;
alter table organizations add constraint organizations_confidentiality_chk
  check (confidentiality_level in ('STANDARD', 'RESTRICTED', 'SENSITIVE'));

alter table organizations drop constraint if exists organizations_access_code_format_chk;
alter table organizations add constraint organizations_access_code_format_chk
  check (access_code is null or access_code ~ '^[A-Z0-9][A-Z0-9-]{3,19}$');

create unique index if not exists organizations_access_code_unique
  on organizations (upper(access_code))
  where access_code is not null;

-- ── memberships ─────────────────────────────────────────────────────────────
alter table memberships drop constraint if exists memberships_role_chk;
alter table memberships add constraint memberships_role_chk
  check (role in (
    'OWNER', 'ADMIN', 'MANAGER', 'HEAD_DOCTOR', 'CHARGE_NURSE',
    'DOCTOR', 'NURSE', 'MIDWIFE', 'TECHNICIAN', 'EMPLOYEE'
  ));

alter table memberships drop constraint if exists memberships_status_chk;
alter table memberships add constraint memberships_status_chk
  check (status in ('PENDING', 'ACTIVE', 'INACTIVE'));

create index if not exists memberships_org_approver_idx
  on memberships (organization_id, can_approve_swaps)
  where can_approve_swaps = true;

-- ── locations ───────────────────────────────────────────────────────────────
alter table locations drop constraint if exists locations_confidentiality_chk;
alter table locations add constraint locations_confidentiality_chk
  check (confidentiality_level in ('STANDARD', 'RESTRICTED', 'SENSITIVE'));

create unique index if not exists locations_org_code_unique
  on locations (organization_id, upper(code))
  where code is not null;

-- ── invitations and rosters ─────────────────────────────────────────────────
alter table invitations drop constraint if exists invitations_status_chk;
alter table invitations add constraint invitations_status_chk
  check (status in ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'));

alter table rosters drop constraint if exists rosters_status_chk;
alter table rosters add constraint rosters_status_chk
  check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED'));

-- ── shifts and templates ────────────────────────────────────────────────────
alter table shifts drop constraint if exists shifts_status_chk;
alter table shifts add constraint shifts_status_chk
  check (status in ('DRAFT', 'OPEN', 'ASSIGNED', 'CANCELLED'));

alter table shifts drop constraint if exists shifts_window_chk;
alter table shifts add constraint shifts_window_chk
  check (shift_window is null or shift_window in ('DAY', 'EVENING', 'NIGHT'));

alter table shifts drop constraint if exists shifts_open_priority_chk;
alter table shifts add constraint shifts_open_priority_chk
  check (open_priority in ('LOW', 'NORMAL', 'HIGH', 'CRITICAL'));

create index if not exists shifts_org_open_priority_idx
  on shifts (organization_id, open_priority)
  where employee_id is null and status <> 'CANCELLED';

alter table shift_templates drop constraint if exists shift_templates_window_chk;
alter table shift_templates add constraint shift_templates_window_chk
  check (shift_window in ('DAY', 'EVENING', 'NIGHT'));

alter table shift_templates drop constraint if exists shift_templates_minutes_chk;
alter table shift_templates add constraint shift_templates_minutes_chk
  check (start_minute >= 0 and start_minute < 1440 and end_minute >= 0 and end_minute < 1440);

alter table shift_templates drop constraint if exists shift_templates_headcount_chk;
alter table shift_templates add constraint shift_templates_headcount_chk
  check (required_headcount >= 0 and required_headcount <= 500);

alter table staffing_requirements drop constraint if exists staffing_requirements_window_chk;
alter table staffing_requirements add constraint staffing_requirements_window_chk
  check (shift_window in ('DAY', 'EVENING', 'NIGHT'));

alter table staffing_requirements drop constraint if exists staffing_requirements_dow_chk;
alter table staffing_requirements add constraint staffing_requirements_dow_chk
  check (day_of_week is null or (day_of_week >= 0 and day_of_week <= 6));

alter table staffing_requirements drop constraint if exists staffing_requirements_count_chk;
alter table staffing_requirements add constraint staffing_requirements_count_chk
  check (required_count >= 0 and required_count <= 500);

-- ── leave, claims, swaps ────────────────────────────────────────────────────
alter table leave_requests drop constraint if exists leave_type_chk;
alter table leave_requests add constraint leave_type_chk
  check (type in ('VACATION', 'SICK', 'PERSONAL', 'UNPAID', 'OTHER'));

alter table leave_requests drop constraint if exists leave_status_chk;
alter table leave_requests add constraint leave_status_chk
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

alter table shift_claims drop constraint if exists claim_type_chk;
alter table shift_claims add constraint claim_type_chk
  check (type in ('CLAIM', 'RELEASE'));

alter table shift_claims drop constraint if exists claim_status_chk;
alter table shift_claims add constraint claim_status_chk
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

alter table shift_swap_requests drop constraint if exists swap_status_chk;
alter table shift_swap_requests add constraint swap_status_chk check (status in (
  'PENDING_TARGET', 'TARGET_ACCEPTED', 'PENDING_HEAD_DOCTOR', 'PENDING_MANAGER',
  'APPROVED', 'REJECTED', 'DECLINED', 'CANCELLED'
));

create index if not exists swaps_org_head_doctor_idx
  on shift_swap_requests (organization_id, status)
  where status = 'PENDING_HEAD_DOCTOR';

-- ── orchestration ───────────────────────────────────────────────────────────
alter table shift_assignment_events drop constraint if exists shift_assignment_action_chk;
alter table shift_assignment_events add constraint shift_assignment_action_chk
  check (action in ('ASSIGNED', 'UNASSIGNED', 'SWAPPED', 'CLAIMED', 'RELEASED', 'OPENED', 'CANCELLED'));

alter table shift_recommendations drop constraint if exists recommendations_source_chk;
alter table shift_recommendations add constraint recommendations_source_chk
  check (source in ('LOCAL_SCORE', 'AI_AGENT', 'MANUAL'));

alter table shift_recommendations drop constraint if exists recommendations_status_chk;
alter table shift_recommendations add constraint recommendations_status_chk
  check (status in ('PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED'));

alter table agent_runs drop constraint if exists agent_runs_status_chk;
alter table agent_runs add constraint agent_runs_status_chk
  check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'AWAITING_REVIEW'));

alter table agent_proposals drop constraint if exists agent_proposals_kind_chk;
alter table agent_proposals add constraint agent_proposals_kind_chk
  check (kind in ('ASSIGN_SHIFT', 'OPEN_SHIFT', 'SWAP_DECISION', 'STAFFING_ADJUSTMENT', 'NOTE'));

alter table agent_proposals drop constraint if exists agent_proposals_status_chk;
alter table agent_proposals add constraint agent_proposals_status_chk
  check (status in ('PROPOSED', 'ACCEPTED', 'REJECTED', 'APPLIED', 'EXPIRED'));

alter table email_messages drop constraint if exists email_status_chk;
alter table email_messages add constraint email_status_chk
  check (status in ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'DEFERRED', 'CANCELLED'));

alter table sensitive_access_logs drop constraint if exists sensitive_access_kind_chk;
alter table sensitive_access_logs add constraint sensitive_access_kind_chk
  check (access_kind in ('READ', 'WRITE', 'EXPORT'));
