# Private market-data gateway prototype

`quote-gateway.cjs` is a Node.js 20+ proof of concept for authenticated quote retrieval from Twelve Data. It is **not deployed** and **not connected to the public GitHub Pages app**.

## Local-only test

Set environment variables in a private shell or secret manager (never commit them):

- `TWELVE_DATA_API_KEY` — existing Twelve Data key
- `SMARTTRADE_ACCESS_TOKEN` — independent random token, 32+ characters

Run `node server/quote-gateway.cjs`. The gateway listens on `127.0.0.1:8787` by default. Query `/api/quote?symbol=AAPL` with the header `Authorization: Bearer <your private access token>`.

## Safety limitations

- Do not put `SMARTTRADE_ACCESS_TOKEN` in public browser JavaScript. The public frontend cannot securely call this private endpoint yet.
- Before production use: deploy behind HTTPS, add real user login/session authentication, stricter rate limiting, logging with secret redaction, monitoring, and a compliant data license.
- API quotes may be USD-denominated, venue-specific, delayed or subject to restrictions. The existing frontend uses ILS; **do not feed these USD prices into its ILS portfolio calculations** without validated currency conversion and instrument mapping.
- Check provider/exchange display and redistribution permissions before showing quotes on public GitHub Pages.
- The gateway supports a small symbol allowlist (`AAPL`, `MSFT`, `SPY`) as a connectivity demonstration only.
