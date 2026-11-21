# Runbook: recommendations and approvals

## Switch on writes

Writes are **off by default**. In Vercel add `API_WRITE_TOKEN` (a long random string, for example 40+ characters) for Production and Preview and redeploy. Without it, write endpoints return 503. With it, callers must send `Authorization: Bearer <token>`.

> POC limitation: the token only protects the endpoint. `actor_id` and `actor_role` in each request are **asserted, not authenticated**. Do not treat the audit trail as proof of who acted until SSO replaces this.

## Walk through the flow (Windows PowerShell)

```powershell
$app = "https://YOUR-APP.vercel.app"
$h = @{ Authorization = "Bearer $env:API_WRITE_TOKEN" }
function Post($path, $body) { Invoke-RestMethod -Method Post -Uri "$app$path" -Headers $h -ContentType 'application/json' -Body ($body | ConvertTo-Json) }

# 1. The AI agent assesses the actions and files recommendations (idempotent)
Post "/api/recommendations/generate" @{ requested_by = "rita"; period = "2026-11" }

# 2. Read them
Invoke-RestMethod "$app/api/recommendations?period=2026-11"

# 3. Level 2: a finance business partner validates (not rita, who requested it)
Post "/api/recommendations/AI-INS-00002/events" @{ type = "VALIDATE"; actor_id = "vera"; actor_role = "FINANCE_BUSINESS_PARTNER" }

# 4. Level 3: a controller authorises (not vera, who validated)
Post "/api/recommendations/AI-INS-00002/events" @{ type = "AUTHORISE"; actor_id = "carl"; actor_role = "CONTROLLER" }

# 5. Inspect the audit trail, and verify every chain
Invoke-RestMethod "$app/api/recommendations/AI-INS-00002"
Invoke-RestMethod "$app/api/audit/verify"
```

Other events: `REJECT` and `MODIFY` need `justification` (10+ characters); `MODIFY` also needs `amount_inr`.

## What the API refuses (and the status you get)

| Situation                                                            | Status | Code                                    |
| -------------------------------------------------------------------- | ------ | --------------------------------------- |
| Wrong role for the step                                              | 403    | ROLE_NOT_PERMITTED                      |
| Requester, proposer, modifier or validator acting again              | 403    | SEGREGATION_OF_DUTIES                   |
| Controller authorising more than 2 Cr                                | 403    | DELEGATION_LIMIT                        |
| Skipping a level, repeating a step, acting after AUTHORISED/REJECTED | 409    | INVALID_TRANSITION / TERMINAL_STATE     |
| Reject or modify without a justification, bad amount                 | 422    | JUSTIFICATION_REQUIRED / INVALID_AMOUNT |
| Unknown item                                                         | 404    | NOT_FOUND                               |
| The log fails its integrity check                                    | 500    | AUDIT_CORRUPT                           |

## Integrity checks

`GET /api/audit/verify` (or `pnpm db:verify`) checks every hash chain and that every stored status equals what its log replays to. A non-200 response means something was changed outside the application.

## Developer reset (never in production)

`pnpm --filter @fpa/db cli reset-audit --i-understand-this-destroys-the-audit-log` clears all recommendations and history. It is not available over HTTP.
