# SmartTrade AI v0.8 — Google sign-in integration plan

Status: **planning only; Google sign-in is not yet enabled**.

## Architecture
- Public UI: GitHub Pages at https://robigo.github.io/smarttrade-ai/
- Private API: Cloudflare Worker at https://smarttrade-ai.goshen-r.workers.dev/
- Authentication: Google OpenID Connect authorization-code flow with PKCE and state; validate issuer, audience, expiry, nonce and signature via Google JWKS.
- Server-side allowlist: authorize a single Google account by immutable Google `sub`, not just email. Only then grant an app session.
- Sessions: secure HttpOnly, Secure, SameSite cookies, short expiry, CSRF defenses and strict CORS for the exact frontend origin. Consider same-site custom domain for reliable browser cookies across sites.
- Do not put `SMARTTRADE_ACCESS_TOKEN`, `TWELVE_DATA_API_KEY` or Google client secrets in GitHub Pages JavaScript.
- Provider quote display/redistribution rights must be verified before exposing quotes to authenticated users.

## Google Cloud setup
1. Create a project in Google Cloud Console.
2. Configure Google Auth Platform branding and an External app in Testing mode; add the intended Google account as a test user where required.
3. Request only `openid email profile`.
4. Create OAuth Client ID of type **Web application**.
5. Register the precise HTTPS redirect URI of the **backend callback** (proposed: `https://smarttrade-ai.goshen-r.workers.dev/auth/google/callback`). This callback does not exist yet; do not attempt login until implementation is complete.
6. Store OAuth client secret and session-signing key as Cloudflare **runtime secrets**, never build variables or public repo files.

## Implementation checklist
- [ ] Google Cloud OAuth client configured
- [ ] OIDC flow with state, PKCE and nonce
- [ ] ID token signature and claims validation
- [ ] Server-side user allowlist
- [ ] Secure session, logout, CSRF protection, rate limits
- [ ] Browser flow and negative-case tests
- [ ] Licensed market data display review
- [ ] Remove legacy bearer token from any future browser-facing design

No production Google sign-in has been implemented yet.
