# SmartTrade Preview rollback runbook

Only target the isolated `smarttrade-ai-preview` Worker. Record failing workflow run, SHA, and last known-good Preview deployment. Verify `/health`, `/`, `/auth/me`, and anonymous market endpoints before and after any rollback. An authorized human operator must select rollback in Cloudflare after confirming the Preview Worker identity; never touch production Worker `smarttrade-ai`, secrets, or real trades. Keep NO-GO until post-rollback verification passes.

This document is a procedure, not evidence that a rollback drill has been executed.
