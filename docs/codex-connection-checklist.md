# Codex runner connection checklist — NOT ACTIVE

Approved project: robigo/smarttrade-ai, branch `preview/cloudflare-unified-v09`.
Approved experimental budget: USD 5/month. **Approval is not evidence of a hard spending cap.**

## Safe activation order

1. Create a dedicated OpenAI API project. Configure the smallest supported project budget and notifications. Verify independently whether an actual hard stop is supported; do not treat budget alerts as a hard stop.
2. Implement an external usage guard with a reserved-spend ledger, conservative per-request upper bounds, concurrency serialization, and a fail-closed cutoff below USD 5. Account for usage reporting delay and retry costs. Never infer available budget from missing usage data.
3. Create a restricted API credential in the dedicated project. Store it only in an approved secret manager, never in source, Actions logs, issue text or chat. Do not provision it until the guard is tested.
4. Separate the agent runner from the Preview deployment job, which has Cloudflare deployment credentials. The agent must never receive those credentials.
5. Begin with a non-writing Codex run in an isolated checkout, no production endpoints, no market-data keys, no trading actions, and a strict timeout. Store only sanitized reports and diffs.
6. Test a failed budget guard, expired credential, unavailable API, malformed output, and blocked file changes. Verify the runner stops and does not commit.
7. Enable writes only after separate review of branch-scoped authorization and a rollback procedure. Keep staging/production promotions manual.
8. Use event-driven triggers, dedupe keys, a maximum iteration count and an operator-visible audit trail. No hourly agent scheduler is needed.

## Current state

Codex API execution: **disabled**. Budget hard-stop verification: **pending**. Dedicated credential: **not provisioned here**. Autonomous commits: **disabled**.

The code in `agent/codex-preflight.mjs` is a fail-closed configuration check, not a real billing guard. Never set its verification flags to true without independent evidence.
