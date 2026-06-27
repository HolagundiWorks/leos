# Security Finding — Server does not enforce user levels (broken access control)

| Field | Value |
|---|---|
| **ID** | BUG-20260627-02 |
| **Date** | 2026-06-27 |
| **Module** | Auth / all protected routes |
| **Severity** | Critical (security) |
| **Found by** | manual review while scoping the L1–L5 permission test matrix |
| **LEOS version** | 0.2.0 |
| **Layer** | API |
| **Status** | 🟡 Partially fixed 2026-06-27 — /admin/* + /audit-log now L1-gated; finer per-module gating is follow-up |

## Summary
Every protected route is guarded only by `with_auth`, which checks that the
bearer token maps to *some* logged-in user. It never checks that user's `level`
or `role`. The L1–L5 model (Principal … Parent/Student) is enforced **only in the
React ribbon** (`profileToLevel` / `accessLevel` filtering). The API itself
grants every authenticated user full access to every endpoint.

## Impact
A low-level user (e.g. L5 parent/student) who is authenticated can call any API
directly (curl, devtools, a script) and:
- read/modify/delete any student, staff, class, fee, exam, etc.;
- hit admin endpoints, including **`POST /admin/users/:id/level`** to set their
  own account to L1 (full privilege escalation);
- toggle modules, read the audit log, etc.

The UI hiding a button does not protect the data — the endpoint is open.

## Evidence
- `with_auth` (server/src/lib.rs) resolves only `token -> uid` and calls the
  handler; it performs no level/role check.
- Admin handlers are wired as `with_auth(state, token, |_| admin_...())` — the
  uid is discarded (`|_|`), so no caller-level check happens even there. E.g.
  `GET /admin/users/levels`, `POST /admin/users/:id/level`.
- `users.level` exists (default 3) and `module_settings.min_level` exists, but
  neither is consulted during request dispatch.

## Steps to reproduce
1. Create/login as an L5 user (or set any user to level 5 via the UI).
2. With that user's token: `POST /admin/users/<own-id>/level {"level":1}`.
3. Response is `200 {"ok":true,"level":1}` — the low-level user is now L1.

## Suggested fix (server-side enforcement)
1. Track the caller's level in the session (or look it up by uid in `with_auth`).
2. Add a `require_level(max_level)` guard and apply it to handlers — at minimum
   gate all `/admin/*` routes to L1, and write routes to the level that the
   ribbon already advertises (`accessLevel` in `ribbon.config.ts` is the spec).
3. Consult `module_settings.min_level` for module-scoped routes.

## Test implications
The L1–L5 permission matrix asserts that a low-level token is **denied** (403) on
privileged routes. Implemented in `tests/api/permissions.spec.ts`.

## Resolution (2026-06-27) — phase 1
Added server-side enforcement in `server/src/lib.rs`:
- `profile_to_level(role)` mirrors the frontend `profileToLevel`.
- `user_level(state, uid)` resolves the caller's level from their stored role.
- `require_level(state, token, max_level, f)` returns **403** when the caller is
  below the required level.
- All `/admin/*` routes and `/audit-log` are now gated to **L1** — this closes
  the privilege-escalation path (`POST /admin/users/:id/level`).

Verified by `tests/api/permissions.spec.ts`: an L5 user gets 403 on every admin
route and cannot escalate; the L1 admin still gets 200.

**Remaining (phase 2, follow-up):** general write routes (students/staff/classes/
fees/etc.) are still open to any authenticated user. Gate them to the levels the
ribbon advertises (`accessLevel` in `ribbon.config.ts`). Tracked in
`test-inventory.md` → Permission matrix.
