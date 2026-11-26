/**
 * Domain types for Shiftii. Safe to import from client code.
 * Server services return these shapes; a later UI plugs in against this contract.
 */

export type MembershipRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "HEAD_DOCTOR"
  | "CHARGE_NURSE"
  | "DOCTOR"
  | "NURSE"
  | "MIDWIFE"
  | "TECHNICIAN"
  | "EMPLOYEE";
export type MembershipStatus = "PENDING" | "ACTIVE" | "INACTIVE";
export type ClaimApprovalMode = "AUTO" | "MANAGER_APPROVAL";
export type RosterStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ShiftStatus = "DRAFT" | "OPEN" | "ASSIGNED" | "CANCELLED";
export type LeaveType = "VACATION" | "SICK" | "PERSONAL" | "UNPAID" | "OTHER";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type ShiftClaimType = "CLAIM" | "RELEASE";
export type ShiftClaimStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type ShiftSwapStatus =
  | "PENDING_TARGET"
  | "TARGET_ACCEPTED"
  | "PENDING_HEAD_DOCTOR"
  | "PENDING_MANAGER"
  | "APPROVED"
  | "REJECTED"
  | "DECLINED"
  | "CANCELLED";
export type ShiftWindow = "DAY" | "EVENING" | "NIGHT";
export type ConfidentialityLevel = "STANDARD" | "RESTRICTED" | "SENSITIVE";
export type OrgType = "HOSPITAL" | "CLINIC" | "HEALTH_SYSTEM" | "AGENCY" | "OTHER";
export type OpenPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type RecommendationSource = "LOCAL_SCORE" | "AI_AGENT" | "MANUAL";
export type RecommendationStatus = "PROPOSED" | "ACCEPTED" | "REJECTED" | "EXPIRED";
export type AgentRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "AWAITING_REVIEW";
export type AgentProposalKind =
  | "ASSIGN_SHIFT"
  | "OPEN_SHIFT"
  | "SWAP_DECISION"
  | "STAFFING_ADJUSTMENT"
  | "NOTE";
export type AgentProposalStatus = "PROPOSED" | "ACCEPTED" | "REJECTED" | "APPLIED" | "EXPIRED";
export type EmailStatus = "QUEUED" | "SENDING" | "SENT" | "FAILED" | "DEFERRED" | "CANCELLED";

export type StaffPreferences = {
  preferDays?: boolean;
  preferNights?: boolean;
  noNights?: boolean;
  preferredUnitTypes?: string[];
  maxConsecutiveNights?: number;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  weekStartDay: number;
  locale: string;
  orgType: OrgType;
  bedCount: number | null;
  accreditation: string | null;
  regulatoryRegion: string | null;
  confidentialityLevel: ConfidentialityLevel;
  accessCode: string | null;
  emailFromName: string | null;
  settings: Record<string, unknown>;
  branding: Record<string, unknown>;
  defaultShiftLengthMinutes: number;
  defaultBreakMinutes: number;
  maxWeeklyHours: number | null;
  minRestHoursBetweenShifts: number;
  claimApprovalMode: ClaimApprovalMode;
  swapApprovalMode: ClaimApprovalMode;
  swapRequiresHeadDoctor: boolean;
  aiFeaturesEnabled: boolean;
  isActive: boolean;
};

export type Location = {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  unitType: string | null;
  unitKind: string | null;
  floor: string | null;
  wing: string | null;
  bedCapacity: number | null;
  confidentialityLevel: ConfidentialityLevel;
  /** Optional coordinates for a future 3-D floor view. */
  map: {
    x: number | null;
    y: number | null;
    z: number | null;
    width: number | null;
    depth: number | null;
    meta: Record<string, unknown>;
  };
  isActive: boolean;
};

export type Position = {
  id: string;
  organizationId: string;
  name: string;
  colorHex: string | null;
  isActive: boolean;
};

export type Membership = {
  id: string;
  organizationId: string;
  userId: string;
  displayName: string;
  initials: string;
  role: MembershipRole;
  status: MembershipStatus;
  jobTitle: string | null;
  seniority: number;
  canApproveSwaps: boolean;
  permissions: Record<string, unknown>;
  contactEmail: string | null;
  emailNotifications: boolean;
  targetWeeklyHours: number | null;
  preferences: StaffPreferences;
  isSynthetic: boolean;
};

export type SessionContext = {
  userId: string;
  organization: Organization;
  membership: Membership;
  locationIds: string[];
  positionIds: string[];
  primaryLocationId: string | null;
};

export type Shift = {
  id: string;
  organizationId: string;
  rosterId: string;
  locationId: string;
  positionId: string;
  employeeId: string | null;
  date: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  notes: string | null;
  status: ShiftStatus;
  isOpenForClaim: boolean;
  shiftWindow: ShiftWindow | null;
  templateId: string | null;
  openPriority: OpenPriority;
  fillDeadline: string | null;
  version: number;
  locationName?: string;
  unitType?: string | null;
  positionName?: string;
  employeeName?: string | null;
};

export type ShiftClaim = {
  id: string;
  organizationId: string;
  shiftId: string;
  membershipId: string;
  type: ShiftClaimType;
  status: ShiftClaimStatus;
  note: string | null;
  createdAt: string;
  membershipName?: string;
  shift?: Shift;
};

export type ShiftSwap = {
  id: string;
  organizationId: string;
  initiatorMembershipId: string;
  initiatorShiftId: string;
  targetMembershipId: string;
  targetShiftId: string;
  status: ShiftSwapStatus;
  note: string | null;
  decisionReason: string | null;
  headDoctorId: string | null;
  headDoctorReviewedAt: string | null;
  createdAt: string;
  initiatorName?: string;
  targetName?: string;
};

export type LeaveRequest = {
  id: string;
  organizationId: string;
  membershipId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: LeaveStatus;
  membershipName?: string;
};

export type Notification = {
  id: string;
  organizationId: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export type HandoverNote = {
  id: string;
  organizationId: string;
  shiftId: string;
  locationId: string;
  authorId: string;
  pendingTasksCount: number;
  criticalAlertsCount: number;
  equipmentIssuesFlag: boolean;
  /** Present only for authorized org members. Never sent to any AI provider. */
  freeTextNote: string | null;
  acknowledgedById: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  authorName?: string;
  locationName?: string;
};

export type CensusSnapshot = {
  id: string;
  organizationId: string;
  locationId: string;
  date: string;
  shiftWindow: ShiftWindow | string;
  patientCount: number;
  averageAcuity: number | null;
};

export type FatigueSnapshot = {
  membershipId: string;
  date: string;
  score: number;
  flags: FatigueFlags;
  displayName?: string;
};

export type FatigueFlags = {
  consecutiveNights: number;
  consecutiveDays: number;
  restViolations: number;
  hours7d: number;
  hours14d: number;
  nights7d: number;
};

export type FairnessRow = {
  membershipId: string;
  displayName: string;
  role: string;
  hours: number;
  nights: number;
  weekends: number;
  openClaims: number;
  preferenceHitRate: number;
  hoursDeltaFromMedian: number;
};

export type ForecastPoint = {
  date: string;
  locationId: string;
  locationName: string;
  shiftWindow: ShiftWindow;
  predictedHeadcount: number;
  assignedHeadcount: number;
  censusPatientCount: number | null;
  acuity: number | null;
};

export type CoverageGap = {
  id: string;
  date: string;
  locationId: string;
  locationName: string;
  unitType: string | null;
  positionId: string;
  positionName: string;
  shiftWindow: ShiftWindow;
  needed: number;
  assigned: number;
  shortfall: number;
  openShiftIds: string[];
};

export type FillCandidate = {
  membershipId: string;
  displayName: string;
  score: number;
  reasons: string[];
  warnings: string[];
  eligible: boolean;
  hours7d: number;
  consecutiveNights: number;
  credentialOk: boolean;
  restOk: boolean;
  fairnessDeficit: number;
};

export type AssignmentCheck = {
  ok: boolean;
  violations: string[];
  warnings: string[];
};

export type CredentialAlert = {
  membershipId: string;
  displayName: string;
  credentialType: string;
  expiresAt: string;
  daysUntil: number;
};

export type DashboardSnapshot = {
  organization: Organization;
  me: Membership;
  today: string;
  coverageTonight: {
    locationId: string;
    locationName: string;
    needed: number;
    assigned: number;
    open: number;
  }[];
  gaps: CoverageGap[];
  pendingClaims: number;
  pendingSwaps: number;
  pendingLeave: number;
  unreadNotifications: number;
  fatigueFlags: FatigueSnapshot[];
  credentialAlerts: CredentialAlert[];
  myUpcomingShifts: Shift[];
  openShiftsCount: number;
  aiAvailable: boolean;
  localMlNote: string;
};

export type AiExplainResult = {
  usedAi: boolean;
  provider: string | null;
  model: string | null;
  text: string;
  degraded: boolean;
};

// ── Orchestration foundation ────────────────────────────────────────────────

export type ShiftTemplate = {
  id: string;
  organizationId: string;
  locationId: string | null;
  positionId: string | null;
  name: string;
  shiftWindow: ShiftWindow;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  requiredHeadcount: number;
  colorHex: string | null;
  isActive: boolean;
};

export type StaffingRequirement = {
  id: string;
  organizationId: string;
  locationId: string;
  positionId: string | null;
  shiftWindow: ShiftWindow;
  dayOfWeek: number | null;
  requiredCount: number;
  minSeniority: number;
  notes: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
};

/** One ward × one day × one shift window, ready for a 3-D floor view. */
export type WardOccupancyCell = {
  wardId: string;
  wardName: string;
  wardCode: string | null;
  floor: string | null;
  wing: string | null;
  bedCapacity: number | null;
  map: Location["map"];
  date: string;
  shiftWindow: ShiftWindow;
  required: number;
  assigned: number;
  open: number;
  gap: number;
  /** 0–1, assigned / max(required, 1). */
  coverage: number;
  assignedNames: string[];
};

export type WardOccupancyDay = {
  date: string;
  wards: WardOccupancyCell[];
};

export type WardFloorPlan = {
  organizationId: string;
  from: string;
  to: string;
  wards: Location[];
  days: WardOccupancyDay[];
};

export type OpenShiftMatch = {
  shiftId: string;
  membershipId: string;
  displayName: string;
  rank: number;
  score: number;
  eligible: boolean;
  reasons: string[];
  warnings: string[];
  hours7d: number;
  source: RecommendationSource;
};

export type OpenShiftPairing = {
  shift: Shift;
  candidates: OpenShiftMatch[];
  generatedAt: string;
  source: RecommendationSource;
};

export type AgentRun = {
  id: string;
  organizationId: string;
  agentName: string;
  trigger: string;
  status: AgentRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  provider: string | null;
  model: string | null;
  errorCode: string | null;
  createdByMembershipId: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type AgentProposal = {
  id: string;
  organizationId: string;
  runId: string | null;
  kind: AgentProposalKind;
  shiftId: string | null;
  payload: Record<string, unknown>;
  confidence: number | null;
  rationale: string | null;
  status: AgentProposalStatus;
  reviewedByMembershipId: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type EmailMessage = {
  id: string;
  organizationId: string;
  recipientMembershipId: string | null;
  recipientEmail: string;
  template: string;
  subject: string;
  status: EmailStatus;
  attempts: number;
  errorCode: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
};
