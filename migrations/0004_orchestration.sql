-- Shiftii hospital orchestration foundation (0004).
--
-- Adds the pieces required for real hospital operations without changing the
-- privacy contract of 0002:
--   * richer organisation attributes (hospital type, beds, confidentiality)
--   * clinical roles + explicit swap-approval permissions (head doctor)
--   * ward/unit metadata for future floor-plan and 3-D views
--   * shift templates + staffing requirements (demand)
--   * open-shift pairing / recommendations (local score or future AI agent)
--   * human-in-the-loop agent runs and proposals for AI orchestration
--   * a transactional email outbox (Resend), queued when no key is configured
--   * assignment history + sensitive-data access log
--
-- Every row is still reachable only through its organisation. No patient
-- identifiers are introduced.

-- ── Organisation attributes ─────────────────────────────────────────────────
alter table organizations
  add column if not exists org_type text not null default 'HOSPITAL',
  add column if not exists bed_count integer,
  add column if not exists accreditation text,
  add column if not exists regulatory_region text,
  add column if not exists confidentiality_level text not null default 'STANDARD',
  add column if not exists swap_requires_head_doctor boolean not null default true,
  add column if not exists email_from_name text,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists branding jsonb not null default '{}'::jsonb;

alter table organizations drop constraint if exists organizations_org_type_chk;
alter table organizations add constraint organizations_org_type_chk
  check (org_type in ('HOSPITAL', 'CLINIC', 'HEALTH_SYSTEM', 'AGENCY', 'OTHER'));

alter table organizations drop constraint if exists organizations_confidentiality_chk;
alter table organizations add constraint organizations_confidentiality_chk
  check (confidentiality_level in ('STANDARD', 'RESTRICTED', 'SENSITIVE'));

-- ── Clinical roles + permissions ────────────────────────────────────────────
alter table memberships drop constraint if exists memberships_role_chk;
alter table memberships add constraint memberships_role_chk
  check (role in (
    'OWNER', 'ADMIN', 'MANAGER', 'HEAD_DOCTOR', 'CHARGE_NURSE',
    'DOCTOR', 'NURSE', 'MIDWIFE', 'TECHNICIAN', 'EMPLOYEE'
  ));

alter table memberships
  add column if not exists job_title text,
  add column if not exists practitioner_number_last4 text,
  add column if not exists can_approve_swaps boolean not null default false,
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists seniority integer not null default 0,
  add column if not exists contact_email text,
  add column if not exists email_notifications boolean not null default true;

create index if not exists memberships_org_approver_idx
  on memberships (organization_id, can_approve_swaps)
  where can_approve_swaps = true;

-- The first person in a hospital is usually the head doctor. Existing owners
-- keep their role and can grant this explicitly; no backfill is guessed.

-- ── Wards / units (3-D ready metadata) ──────────────────────────────────────
alter table locations
  add column if not exists code text,
  add column if not exists description text,
  add column if not exists unit_kind text,
  add column if not exists floor text,
  add column if not exists wing text,
  add column if not exists bed_capacity integer,
  add column if not exists confidentiality_level text not null default 'STANDARD',
  add column if not exists map_x double precision,
  add column if not exists map_y double precision,
  add column if not exists map_z double precision,
  add column if not exists map_width double precision,
  add column if not exists map_depth double precision,
  add column if not exists map_meta jsonb not null default '{}'::jsonb;

alter table locations drop constraint if exists locations_confidentiality_chk;
alter table locations add constraint locations_confidentiality_chk
  check (confidentiality_level in ('STANDARD', 'RESTRICTED', 'SENSITIVE'));

create unique index if not exists locations_org_code_unique
  on locations (organization_id, upper(code))
  where code is not null;

-- ── Shift templates + staffing demand ───────────────────────────────────────
create table if not exists shift_templates (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  location_id text references locations(id) on delete cascade,
  position_id text references positions(id) on delete set null,
  name text not null,
  shift_window text not null default 'DAY',
  start_minute integer not null default 420,
  end_minute integer not null default 1140,
  break_minutes integer not null default 30,
  required_headcount integer not null default 1,
  color_hex text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_templates_window_chk
    check (shift_window in ('DAY', 'EVENING', 'NIGHT')),
  constraint shift_templates_minutes_chk
    check (start_minute >= 0 and start_minute < 1440 and end_minute >= 0 and end_minute < 1440),
  constraint shift_templates_headcount_chk
    check (required_headcount >= 0 and required_headcount <= 500)
);
create index if not exists shift_templates_org_idx on shift_templates (organization_id, is_active);
create index if not exists shift_templates_org_loc_idx on shift_templates (organization_id, location_id);

create table if not exists staffing_requirements (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  location_id text not null references locations(id) on delete cascade,
  position_id text references positions(id) on delete set null,
  shift_window text not null default 'DAY',
  day_of_week integer,
  required_count integer not null default 1,
  min_seniority integer not null default 0,
  notes text,
  effective_from date,
  effective_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staffing_requirements_window_chk
    check (shift_window in ('DAY', 'EVENING', 'NIGHT')),
  constraint staffing_requirements_dow_chk
    check (day_of_week is null or (day_of_week >= 0 and day_of_week <= 6)),
  constraint staffing_requirements_count_chk
    check (required_count >= 0 and required_count <= 500)
);
create index if not exists staffing_requirements_org_loc_idx
  on staffing_requirements (organization_id, location_id, shift_window);

-- ── Shift enrichment ────────────────────────────────────────────────────────
alter table shifts
  add column if not exists shift_window text,
  add column if not exists template_id text references shift_templates(id) on delete set null,
  add column if not exists open_priority text not null default 'NORMAL',
  add column if not exists fill_deadline timestamptz;

alter table shifts drop constraint if exists shifts_window_chk;
alter table shifts add constraint shifts_window_chk
  check (shift_window is null or shift_window in ('DAY', 'EVENING', 'NIGHT'));

alter table shifts drop constraint if exists shifts_open_priority_chk;
alter table shifts add constraint shifts_open_priority_chk
  check (open_priority in ('LOW', 'NORMAL', 'HIGH', 'CRITICAL'));

create index if not exists shifts_org_open_priority_idx
  on shifts (organization_id, open_priority)
  where employee_id is null and status <> 'CANCELLED';

-- ── Swap approval by head doctor ────────────────────────────────────────────
alter table shift_swap_requests drop constraint if exists swap_status_chk;
alter table shift_swap_requests add constraint swap_status_chk check (status in (
  'PENDING_TARGET', 'TARGET_ACCEPTED', 'PENDING_HEAD_DOCTOR', 'PENDING_MANAGER',
  'APPROVED', 'REJECTED', 'DECLINED', 'CANCELLED'
));

alter table shift_swap_requests
  add column if not exists head_doctor_id text references memberships(id) on delete set null,
  add column if not exists head_doctor_reviewed_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists approval_chain jsonb not null default '[]'::jsonb;

create index if not exists swaps_org_head_doctor_idx
  on shift_swap_requests (organization_id, status)
  where status = 'PENDING_HEAD_DOCTOR';

-- ── Assignment history (orchestration + 3-D timeline) ───────────────────────
create table if not exists shift_assignment_events (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  shift_id text not null references shifts(id) on delete cascade,
  from_membership_id text references memberships(id) on delete set null,
  to_membership_id text references memberships(id) on delete set null,
  action text not null,
  actor_membership_id text references memberships(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  constraint shift_assignment_action_chk
    check (action in ('ASSIGNED', 'UNASSIGNED', 'SWAPPED', 'CLAIMED', 'RELEASED', 'OPENED', 'CANCELLED'))
);
create index if not exists assignment_events_org_shift_idx
  on shift_assignment_events (organization_id, shift_id, created_at desc);

-- ── Open-shift pairing / recommendations ────────────────────────────────────
create table if not exists shift_recommendations (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  shift_id text not null references shifts(id) on delete cascade,
  membership_id text not null references memberships(id) on delete cascade,
  rank integer not null default 1,
  score double precision not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  source text not null default 'LOCAL_SCORE',
  status text not null default 'PROPOSED',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, membership_id),
  constraint recommendations_source_chk
    check (source in ('LOCAL_SCORE', 'AI_AGENT', 'MANUAL')),
  constraint recommendations_status_chk
    check (status in ('PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED'))
);
create index if not exists recommendations_org_shift_idx
  on shift_recommendations (organization_id, shift_id, status, rank);

-- ── Human-in-the-loop agent orchestration ───────────────────────────────────
create table if not exists agent_runs (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  agent_name text not null,
  trigger text not null default 'MANUAL',
  status text not null default 'QUEUED',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  provider text,
  model text,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by_membership_id text references memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint agent_runs_status_chk
    check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'AWAITING_REVIEW'))
);
create index if not exists agent_runs_org_created_idx on agent_runs (organization_id, created_at desc);

create table if not exists agent_proposals (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  run_id text references agent_runs(id) on delete cascade,
  kind text not null,
  shift_id text references shifts(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  confidence double precision,
  rationale text,
  status text not null default 'PROPOSED',
  reviewed_by_membership_id text references memberships(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint agent_proposals_kind_chk
    check (kind in ('ASSIGN_SHIFT', 'OPEN_SHIFT', 'SWAP_DECISION', 'STAFFING_ADJUSTMENT', 'NOTE')),
  constraint agent_proposals_status_chk
    check (status in ('PROPOSED', 'ACCEPTED', 'REJECTED', 'APPLIED', 'EXPIRED'))
);
create index if not exists agent_proposals_org_status_idx
  on agent_proposals (organization_id, status, created_at desc);

-- ── Transactional email outbox (Resend) ─────────────────────────────────────
create table if not exists email_messages (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  recipient_membership_id text references memberships(id) on delete set null,
  recipient_email text not null,
  template text not null,
  subject text not null,
  body_text text not null,
  body_html text,
  status text not null default 'QUEUED',
  provider text not null default 'resend',
  provider_message_id text,
  error_code text,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_status_chk
    check (status in ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'DEFERRED', 'CANCELLED'))
);
create index if not exists email_outbox_status_idx
  on email_messages (status, next_attempt_at);
create index if not exists email_outbox_org_idx
  on email_messages (organization_id, created_at desc);

-- ── Sensitive-data access log ───────────────────────────────────────────────
create table if not exists sensitive_access_logs (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  membership_id text not null references memberships(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  purpose text not null,
  access_kind text not null default 'READ',
  created_at timestamptz not null default now(),
  constraint sensitive_access_kind_chk
    check (access_kind in ('READ', 'WRITE', 'EXPORT'))
);
create index if not exists sensitive_access_org_created_idx
  on sensitive_access_logs (organization_id, created_at desc);
create index if not exists sensitive_access_org_entity_idx
  on sensitive_access_logs (organization_id, entity_type, entity_id);
