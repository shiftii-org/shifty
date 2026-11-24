-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "refreshTokenExpiresAt" TIMESTAMPTZ,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "week_start_day" INTEGER NOT NULL DEFAULT 1,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "default_shift_length_minutes" INTEGER NOT NULL DEFAULT 720,
    "default_break_minutes" INTEGER NOT NULL DEFAULT 30,
    "max_weekly_hours" DOUBLE PRECISION,
    "min_rest_hours_between_shifts" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "claim_approval_mode" TEXT NOT NULL DEFAULT 'MANAGER_APPROVAL',
    "swap_approval_mode" TEXT NOT NULL DEFAULT 'MANAGER_APPROVAL',
    "ai_features_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_code" TEXT,
    "headquarters_address" TEXT,
    "org_type" TEXT NOT NULL DEFAULT 'HOSPITAL',
    "bed_count" INTEGER,
    "accreditation" TEXT,
    "regulatory_region" TEXT,
    "confidentiality_level" TEXT NOT NULL DEFAULT 'STANDARD',
    "swap_requires_head_doctor" BOOLEAN NOT NULL DEFAULT true,
    "email_from_name" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "branding" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "unit_type" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT,
    "description" TEXT,
    "unit_kind" TEXT,
    "floor" TEXT,
    "wing" TEXT,
    "bed_capacity" INTEGER,
    "confidentiality_level" TEXT NOT NULL DEFAULT 'STANDARD',
    "map_x" DOUBLE PRECISION,
    "map_y" DOUBLE PRECISION,
    "map_z" DOUBLE PRECISION,
    "map_width" DOUBLE PRECISION,
    "map_depth" DOUBLE PRECISION,
    "map_meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color_hex" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "initials" TEXT,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "target_weekly_hours" DOUBLE PRECISION,
    "pay_rate_cents" INTEGER,
    "pay_currency" TEXT DEFAULT 'USD',
    "start_date" DATE,
    "deactivated_at" TIMESTAMPTZ,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_title" TEXT,
    "practitioner_number_last4" TEXT,
    "can_approve_swaps" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "seniority" INTEGER NOT NULL DEFAULT 0,
    "contact_email" TEXT,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_positions" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_locations" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_types" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "warn_days_before_expiry" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_credentials" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "credential_type_id" TEXT NOT NULL,
    "identifier_last4" TEXT,
    "issued_at" DATE,
    "expires_at" DATE,
    "document_path" TEXT,
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_credential_requirements" (
    "id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "credential_type_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_credential_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "location_id" TEXT,
    "position_ids" JSONB NOT NULL DEFAULT '[]',
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invited_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rosters" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "location_id" TEXT,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "availability_lock_at" TIMESTAMPTZ,
    "created_by_id" TEXT NOT NULL,
    "published_by_id" TEXT,
    "published_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "roster_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "date" DATE NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "is_open_for_claim" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shift_window" TEXT,
    "template_id" TEXT,
    "open_priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "fill_deadline" TIMESTAMPTZ,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "location_id" TEXT,
    "position_id" TEXT,
    "name" TEXT NOT NULL,
    "shift_window" TEXT NOT NULL DEFAULT 'DAY',
    "start_minute" INTEGER NOT NULL DEFAULT 420,
    "end_minute" INTEGER NOT NULL DEFAULT 1140,
    "break_minutes" INTEGER NOT NULL DEFAULT 30,
    "required_headcount" INTEGER NOT NULL DEFAULT 1,
    "color_hex" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffing_requirements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "position_id" TEXT,
    "shift_window" TEXT NOT NULL DEFAULT 'DAY',
    "day_of_week" INTEGER,
    "required_count" INTEGER NOT NULL DEFAULT 1,
    "min_seniority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "effective_from" DATE,
    "effective_until" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staffing_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignment_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "from_membership_id" TEXT,
    "to_membership_id" TEXT,
    "action" TEXT NOT NULL,
    "actor_membership_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_assignment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_recommendations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'LOCAL_SCORE',
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE,
    "effective_until" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "is_available" BOOLEAN NOT NULL,
    "start_minute" INTEGER,
    "end_minute" INTEGER,
    "reason" TEXT,
    "parsed_from_text" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "custom_type_label" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT,
    "attachment_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "manager_note" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_claims" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_swap_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "initiator_membership_id" TEXT NOT NULL,
    "initiator_shift_id" TEXT NOT NULL,
    "target_membership_id" TEXT NOT NULL,
    "target_shift_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_TARGET',
    "note" TEXT,
    "target_responded_at" TIMESTAMPTZ,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "head_doctor_id" TEXT,
    "head_doctor_reviewed_at" TIMESTAMPTZ,
    "decision_reason" TEXT,
    "approval_chain" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "shift_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "metadata" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_notification_preferences" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "organization_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "recipient_membership_id" TEXT,
    "recipient_email" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "body_html" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "metadata" JSONB,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_census_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shift_window" TEXT NOT NULL,
    "patient_count" INTEGER NOT NULL,
    "average_acuity" DOUBLE PRECISION,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_census_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_notes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "pending_tasks_count" INTEGER NOT NULL DEFAULT 0,
    "critical_alerts_count" INTEGER NOT NULL DEFAULT 0,
    "equipment_issues_flag" BOOLEAN NOT NULL DEFAULT false,
    "free_text_note" TEXT,
    "acknowledged_by_id" TEXT,
    "acknowledged_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fatigue_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "flags" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fatigue_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interaction_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "error_code" TEXT,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_by_membership_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_proposals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "run_id" TEXT,
    "kind" TEXT NOT NULL,
    "shift_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION,
    "rationale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "reviewed_by_membership_id" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_membership_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensitive_access_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "access_kind" TEXT NOT NULL DEFAULT 'READ',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensitive_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_migrations" (
    "name" TEXT NOT NULL,
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_migrations_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "locations_organization_id_idx" ON "locations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_organization_id_name_key" ON "locations"("organization_id", "name");

-- CreateIndex
CREATE INDEX "positions_organization_id_idx" ON "positions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_organization_id_name_key" ON "positions"("organization_id", "name");

-- CreateIndex
CREATE INDEX "memberships_organization_id_status_idx" ON "memberships"("organization_id", "status");

-- CreateIndex
CREATE INDEX "memberships_organization_id_role_idx" ON "memberships"("organization_id", "role");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "employee_positions_position_id_idx" ON "employee_positions"("position_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_positions_membership_id_position_id_key" ON "employee_positions"("membership_id", "position_id");

-- CreateIndex
CREATE INDEX "membership_locations_location_id_idx" ON "membership_locations"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_locations_membership_id_location_id_key" ON "membership_locations"("membership_id", "location_id");

-- CreateIndex
CREATE INDEX "credential_types_organization_id_idx" ON "credential_types"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "credential_types_organization_id_name_key" ON "credential_types"("organization_id", "name");

-- CreateIndex
CREATE INDEX "employee_credentials_expires_at_idx" ON "employee_credentials"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "employee_credentials_membership_id_credential_type_id_key" ON "employee_credentials"("membership_id", "credential_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "position_credential_requirements_position_id_credential_typ_key" ON "position_credential_requirements"("position_id", "credential_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_organization_id_status_idx" ON "invitations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "rosters_organization_id_status_idx" ON "rosters"("organization_id", "status");

-- CreateIndex
CREATE INDEX "rosters_organization_id_start_date_end_date_idx" ON "rosters"("organization_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "shifts_organization_id_roster_id_idx" ON "shifts"("organization_id", "roster_id");

-- CreateIndex
CREATE INDEX "shifts_organization_id_employee_id_date_idx" ON "shifts"("organization_id", "employee_id", "date");

-- CreateIndex
CREATE INDEX "shifts_organization_id_date_idx" ON "shifts"("organization_id", "date");

-- CreateIndex
CREATE INDEX "shifts_organization_id_status_is_open_for_claim_idx" ON "shifts"("organization_id", "status", "is_open_for_claim");

-- CreateIndex
CREATE INDEX "shifts_location_id_date_idx" ON "shifts"("location_id", "date");

-- CreateIndex
CREATE INDEX "shift_templates_organization_id_is_active_idx" ON "shift_templates"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "shift_templates_organization_id_location_id_idx" ON "shift_templates"("organization_id", "location_id");

-- CreateIndex
CREATE INDEX "staffing_requirements_organization_id_location_id_shift_win_idx" ON "staffing_requirements"("organization_id", "location_id", "shift_window");

-- CreateIndex
CREATE INDEX "shift_assignment_events_organization_id_shift_id_idx" ON "shift_assignment_events"("organization_id", "shift_id");

-- CreateIndex
CREATE INDEX "shift_recommendations_organization_id_shift_id_status_rank_idx" ON "shift_recommendations"("organization_id", "shift_id", "status", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "shift_recommendations_shift_id_membership_id_key" ON "shift_recommendations"("shift_id", "membership_id");

-- CreateIndex
CREATE INDEX "availability_rules_membership_id_day_of_week_idx" ON "availability_rules"("membership_id", "day_of_week");

-- CreateIndex
CREATE INDEX "availability_exceptions_membership_id_date_idx" ON "availability_exceptions"("membership_id", "date");

-- CreateIndex
CREATE INDEX "leave_requests_organization_id_membership_id_status_idx" ON "leave_requests"("organization_id", "membership_id", "status");

-- CreateIndex
CREATE INDEX "leave_requests_organization_id_start_date_end_date_idx" ON "leave_requests"("organization_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "shift_claims_organization_id_shift_id_status_idx" ON "shift_claims"("organization_id", "shift_id", "status");

-- CreateIndex
CREATE INDEX "shift_claims_organization_id_membership_id_status_idx" ON "shift_claims"("organization_id", "membership_id", "status");

-- CreateIndex
CREATE INDEX "shift_swap_requests_organization_id_status_idx" ON "shift_swap_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "shift_swap_requests_organization_id_initiator_membership_id_idx" ON "shift_swap_requests"("organization_id", "initiator_membership_id");

-- CreateIndex
CREATE INDEX "shift_swap_requests_organization_id_target_membership_id_idx" ON "shift_swap_requests"("organization_id", "target_membership_id");

-- CreateIndex
CREATE INDEX "notifications_organization_id_recipient_id_is_read_idx" ON "notifications"("organization_id", "recipient_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "notifications"("recipient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "organization_notification_preferences_organization_id_type_key" ON "organization_notification_preferences"("organization_id", "type");

-- CreateIndex
CREATE INDEX "email_messages_status_next_attempt_at_idx" ON "email_messages"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "email_messages_organization_id_created_at_idx" ON "email_messages"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "unit_census_snapshots_organization_id_location_id_date_idx" ON "unit_census_snapshots"("organization_id", "location_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "unit_census_snapshots_organization_id_location_id_date_shif_key" ON "unit_census_snapshots"("organization_id", "location_id", "date", "shift_window");

-- CreateIndex
CREATE INDEX "handover_notes_organization_id_shift_id_idx" ON "handover_notes"("organization_id", "shift_id");

-- CreateIndex
CREATE INDEX "handover_notes_organization_id_location_id_created_at_idx" ON "handover_notes"("organization_id", "location_id", "created_at");

-- CreateIndex
CREATE INDEX "fatigue_snapshots_organization_id_date_idx" ON "fatigue_snapshots"("organization_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "fatigue_snapshots_membership_id_date_key" ON "fatigue_snapshots"("membership_id", "date");

-- CreateIndex
CREATE INDEX "ai_interaction_logs_organization_id_created_at_idx" ON "ai_interaction_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_interaction_logs_organization_id_agent_name_idx" ON "ai_interaction_logs"("organization_id", "agent_name");

-- CreateIndex
CREATE INDEX "agent_runs_organization_id_created_at_idx" ON "agent_runs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_proposals_organization_id_status_created_at_idx" ON "agent_proposals"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_action_idx" ON "audit_logs"("organization_id", "action");

-- CreateIndex
CREATE INDEX "sensitive_access_logs_organization_id_created_at_idx" ON "sensitive_access_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "sensitive_access_logs_organization_id_entity_type_entity_id_idx" ON "sensitive_access_logs"("organization_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_locations" ADD CONSTRAINT "membership_locations_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_locations" ADD CONSTRAINT "membership_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_types" ADD CONSTRAINT "credential_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_credentials" ADD CONSTRAINT "employee_credentials_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_credentials" ADD CONSTRAINT "employee_credentials_credential_type_id_fkey" FOREIGN KEY ("credential_type_id") REFERENCES "credential_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_credential_requirements" ADD CONSTRAINT "position_credential_requirements_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_credential_requirements" ADD CONSTRAINT "position_credential_requirements_credential_type_id_fkey" FOREIGN KEY ("credential_type_id") REFERENCES "credential_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "shift_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_requirements" ADD CONSTRAINT "staffing_requirements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_requirements" ADD CONSTRAINT "staffing_requirements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_requirements" ADD CONSTRAINT "staffing_requirements_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignment_events" ADD CONSTRAINT "shift_assignment_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignment_events" ADD CONSTRAINT "shift_assignment_events_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignment_events" ADD CONSTRAINT "shift_assignment_events_from_membership_id_fkey" FOREIGN KEY ("from_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignment_events" ADD CONSTRAINT "shift_assignment_events_to_membership_id_fkey" FOREIGN KEY ("to_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignment_events" ADD CONSTRAINT "shift_assignment_events_actor_membership_id_fkey" FOREIGN KEY ("actor_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_recommendations" ADD CONSTRAINT "shift_recommendations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_recommendations" ADD CONSTRAINT "shift_recommendations_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_recommendations" ADD CONSTRAINT "shift_recommendations_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_claims" ADD CONSTRAINT "shift_claims_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_claims" ADD CONSTRAINT "shift_claims_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_initiator_membership_id_fkey" FOREIGN KEY ("initiator_membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_target_membership_id_fkey" FOREIGN KEY ("target_membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_head_doctor_id_fkey" FOREIGN KEY ("head_doctor_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_initiator_shift_id_fkey" FOREIGN KEY ("initiator_shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_target_shift_id_fkey" FOREIGN KEY ("target_shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_notification_preferences" ADD CONSTRAINT "organization_notification_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_recipient_membership_id_fkey" FOREIGN KEY ("recipient_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_census_snapshots" ADD CONSTRAINT "unit_census_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_census_snapshots" ADD CONSTRAINT "unit_census_snapshots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_notes" ADD CONSTRAINT "handover_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_notes" ADD CONSTRAINT "handover_notes_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_notes" ADD CONSTRAINT "handover_notes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_notes" ADD CONSTRAINT "handover_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_notes" ADD CONSTRAINT "handover_notes_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fatigue_snapshots" ADD CONSTRAINT "fatigue_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fatigue_snapshots" ADD CONSTRAINT "fatigue_snapshots_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interaction_logs" ADD CONSTRAINT "ai_interaction_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_reviewed_by_membership_id_fkey" FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensitive_access_logs" ADD CONSTRAINT "sensitive_access_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensitive_access_logs" ADD CONSTRAINT "sensitive_access_logs_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
