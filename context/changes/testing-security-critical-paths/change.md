---
change_id: testing-security-critical-paths
title: Test runner bootstrap and security-critical paths
status: impl_reviewed
updated: 2026-07-04
phase_4_reviewed: 2026-07-04
phase_2_reviewed: 2026-07-04
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Test runner bootstrap + security-critical paths".
Risks covered: #2 (token leakage in API/logs), #3 (OAuth/session auth gates), #5 (IDOR on integration tokens).
Test types planned: unit + integration.
Risk response intent:

- #2: prove no API route, error body, or client payload exposes plaintext PAT, refresh token, or decrypted calendar credential; challenge redacted errors that still leak secrets in details fields; avoid asserting "no token key" while value lives under nested field.
- #3: prove unauthenticated requests to protected routes redirect to sign-in, valid sessions reach dashboard, expired sessions do not silently proceed; challenge middleware redirect once implies full OAuth/cookie path is sound; avoid full browser e2e for every auth edge.
- #5: prove user A cannot fetch, decrypt, or overwrite user B's integration tokens or sprint-scoped data; challenge "requires login" equals authorization; avoid only testing anonymous vs authenticated with over-mocked DB.
  After creating the folder, follow the downstream continuation rule.
