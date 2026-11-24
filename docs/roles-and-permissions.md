# Roles and permissions

Roles are **per organisation**: one person can be an `OWNER` in one hospital and
a `NURSE` in another. The role lives on `memberships.role`, never on the user.

## The catalogue

| Role | Scope | Roster | Approve swaps | Org settings |
| --- | --- | --- | --- | --- |
| `OWNER` | Full control of the workspace | ✅ | ✅ | ✅ |
| `ADMIN` | Settings, wards, roles, rostering | ✅ | ✅ | ✅ |
| `MANAGER` | Scheduling manager | ✅ | ⚠️ only with `can_approve_swaps` | ❌ |
| `HEAD_DOCTOR` | Clinical lead | ✅ | ✅ | ❌ |
| `CHARGE_NURSE` | Ward shift lead | ✅ | ⚠️ only with `can_approve_swaps` | ❌ |
| `DOCTOR` | Clinical staff | ❌ | ❌ | ❌ |
| `NURSE` | Clinical staff | ❌ | ❌ | ❌ |
| `MIDWIFE` | Clinical staff | ❌ | ❌ | ❌ |
| `TECHNICIAN` | Clinical support | ❌ | ❌ | ❌ |
| `EMPLOYEE` | General staff | ❌ | ❌ | ❌ |

The same catalogue is exported at runtime as `ROLE_CATALOG` from
`services/org.server.ts` (via `getRoleCatalog()`), so pickers and UI badges can
never drift from the server rules.

## Predicates in code

`src/lib/shiftii/context.server.ts`:

```ts
isManager(role)            // OWNER | ADMIN | MANAGER      → roster/style admin
isClinicalLead(role)       // managers + HEAD_DOCTOR + CHARGE_NURSE
isSwapApprover(ctx)        // HEAD_DOCTOR | OWNER | ADMIN, or can_approve_swaps
assertManager(ctx)         // throws ForbiddenError otherwise
assertOrgAdmin(ctx)        // OWNER | ADMIN only
assertSwapApprover(ctx)    // throws "Only the head doctor can approve…"
```

Keep authorization in these predicates; UI checks are cosmetic only.

## Swap approval

`organizations.swap_requires_head_doctor` (default `true`) controls the second
stage:

1. The target employee accepts → status becomes `PENDING_HEAD_DOCTOR`.
2. `reviewSwap()` requires `assertSwapApprover(ctx)` for that status.
3. Approving applies the swap inside the same transaction and records
   `head_doctor_id`, `head_doctor_reviewed_at` and an `approval_chain` entry.

Set `swap_requires_head_doctor = false` for a manager-only flow, or
`swap_approval_mode = 'AUTO'` to apply swaps without any approval (small clinics).

## Sensitive-data visibility

`services/sensitive.server.ts`:

| Confidentiality | Who may read free text / credentials / leave reasons |
| --- | --- |
| `STANDARD` | Any member above `EMPLOYEE`, plus the record owner |
| `RESTRICTED` | Clinical leads and the record owner only |
| `SENSITIVE` | Clinical leads only (audited) |

Every read is written to `sensitive_access_logs` with a purpose, so access can
be reviewed or exported for compliance.

## Guard rails

- Ownership cannot be transferred through the staff editor.
- `ADMIN` cannot promote another `ADMIN`; only `OWNER` can.
- `MANAGER` cannot grant `ADMIN`/`MANAGER`.
- Only managers may grant `can_approve_swaps`.
- A head doctor may sign off swaps but cannot change hospital configuration.
- Deactivating a member (`status = 'INACTIVE'`) revokes access without deleting
  their history, keeping the audit trail intact.
