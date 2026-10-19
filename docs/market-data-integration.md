# SmartTrade AI: Market data integration plan

## Provider candidate
Twelve Data Basic (free tier), subject to terms, coverage, and rate limits. US market quotes may represent selected venues, not consolidated NBBO. Tel Aviv coverage is not assumed.

## Security and licensing gates
- Never put API keys in index.html, GitHub Pages assets, or a public quote JSON file.
- Store credentials as server-side secrets.
- Do not redistribute or publicly display provider quotes until the provider/exchange licenses explicitly allow that use.
- For personal testing, use a private authenticated backend or a local test harness, not a public endpoint.
- Clearly distinguish sample prices, manually imported quotes, delayed quotes, and licensed live quotes.

## Implementation plan
1. Obtain a free API key privately (do not paste into issues or chats).
2. Validate access and symbol coverage using a private test environment.
3. Add a backend quote adapter with rate limiting, timestamp validation, USD/ILS conversion, and stale data handling.
4. Run the adapter on a 15-minute schedule; scheduling can be approximate, not guaranteed real time.
5. Add authentication before any display of restricted quote data.
6. Test symbol mapping, failures, market holidays, missing prices, and refresh quotas.

## Current status
Frontend v0.4 supports an optional HTTPS JSON feed, but **no provider has been connected**. Paper trading only.
