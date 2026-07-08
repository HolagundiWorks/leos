# Bug Report — <short title>

| Field | Value |
|---|---|
| **ID** | BUG-YYYYMMDD-NN |
| **Date** | YYYY-MM-DD |
| **Reporter** | name / "automated suite" |
| **Module** | e.g. Students |
| **Severity** | Blocker / Critical / Major / Minor / Trivial |
| **Found by** | test file & name, or manual |
| **LEOS version** | e.g. 0.3.0 |
| **Layer** | E2E / API / DB / Installer |

## Summary
One sentence: what's wrong.

## Steps to reproduce
1. …
2. …
3. …

(For a failing automated test, paste the exact command, e.g.
`npm run test:e2e -- tests/e2e/students/students-crud.spec.ts`.)

## Expected
What should happen.

## Actual
What happened instead (include exact error text / HTTP status).

## Evidence
- Screenshot: `tests/reports/playwright-artifacts/.../test-failed-1.png`
- Video: `…/video.webm`
- Trace: `npx playwright show-trace <trace.zip>`
- Console / network logs:
- Server output:

## Environment
- OS / version:
- Test DB: isolated temp (`LEOS_DATA_DIR`) — note path if relevant
- Server port: 8788 (api) / 8799 (e2e)

## Notes / suspected cause
Optional: file:line, recent change, hypothesis.
