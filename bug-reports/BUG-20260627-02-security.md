# Security Finding — Complete the staff-route permission matrix

| Field | Value |
|---|---|
| **ID** | BUG-20260627-02 |
| **Date** | 2026-06-27 |
| **Module** | Auth / all protected routes |
| **Severity** | Critical (security) |
| **Found by** | manual review while scoping the L1–L5 permission test matrix |
| **LEOS version** | 0.2.0 |
| **Layer** | API |
| **Status** | 🟡 Mitigated — privileged routes and portal isolation are enforced; complete staff-role matrix coverage remains |

## Summary

The original Rust authorization defect is retired with that runtime. The
TypeScript `ApiRouter` now enforces L1 on administrative operations, explicit
levels on migrated write operations, and a fail-closed route allowlist for
parent/student portal sessions. The remaining work is to prove the complete
L1–L4 staff-role matrix against every route, independent of renderer visibility.

## Residual risk

Any staff route whose expected level is not covered by the permission matrix
could drift from the access advertised by the ribbon. Renderer visibility is
not a security boundary, so server-side checks and tests remain required.

## Current evidence

- `desktop/src/api-router.ts` calls `AuthService.requireLevel` for privileged
  operations.
- Parent/student sessions are limited to `/portal/profile` and `/lms/*` before
  general route dispatch.
- `tests/api/permissions.spec.ts` verifies L5 denial on admin routes and blocks
  self-escalation, and exercises representative L2–L4 read boundaries.
- `desktop/scripts/verify-portal-security.cjs` verifies linked-profile scoping,
  LMS access, and denial of general routes.

## Remaining work

1. Generate a route inventory with the expected L1–L4 read/write level.
2. Test each route with allowed and denied staff roles.
3. Keep `module_settings.min_level` and `frontend/src/ribbon.config.ts` aligned
   with the server-side policy.

## Test implications
The L1–L5 permission matrix asserts that a low-level token is **denied** (403) on
privileged routes. Implemented in `tests/api/permissions.spec.ts`.

## Resolution

The TypeScript authentication service resolves the stored role/level and
`requireLevel` returns 403 below the route's allowed level. All `/admin/*`
routes and `/audit-log` are L1-gated, closing the original privilege-escalation
path. Parent/student accounts additionally fail closed outside their personal
profile and LMS routes.

Verified by `tests/api/permissions.spec.ts`: an L5 user gets 403 on every admin
route and cannot escalate; the L1 admin still gets 200.

**Remaining (phase 2, follow-up):** general write routes (students/staff/classes/
fees/etc.) are still open to any authenticated user. Gate them to the levels the
ribbon advertises (`accessLevel` in `ribbon.config.ts`). Tracked in
`test-inventory.md` → Permission matrix.
