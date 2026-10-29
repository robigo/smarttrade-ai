# Local simulation value observations

The existing chart previously populated only when prices were imported. A user
could trade in the simulation and still see an empty chart. The production-only
chart extension now records the currently observed ILS value as a baseline and
records later observations when successful local trades or price updates change
the local simulation state. A manual observation button records the current value
without contacting a provider. A single baseline is shown as a dot, not a made-up
historical line.

The chart describes the local simulation (`smarttrade-v02`), not the separate
Google account ledger and not a stock's historical market prices. Twelve Data
quote/watchlist requests do not feed its fictional ILS assets or create history
points. No provider API, subscription change or automatic polling is added.

Observations are kept under the existing local history key, bounded to the
existing 120-point retention. Reloading the same state does not append a duplicate.
Same-timestamp observations replace one another rather than inventing a later
timestamp. Capturing currently valued holdings after an old-dated CSV import uses
the observation time, not a fabricated historic portfolio valuation. Existing
legacy dated points are retained as supplied; they are not reconstructed from
the trade ledger.

The display sorts and filters valid dates and uses elapsed time for horizontal
spacing. Flat values remain flat. A portfolio restore starts a new visible segment
so unrelated portfolios are not connected; earlier records remain stored until
normal retention removes them. The existing confirmed reset clears history and
starts a fresh baseline. Malformed stored history is not silently overwritten;
the user can explicitly reset it. Storage errors are reported without changing
the portfolio state.

The observation chart is a value history, not a deposit-adjusted return series.
No prior market prices, price-date verification or performance claims are inferred.
The implementation is served only by the optional production account app; Preview's
existing chart and source assets remain unchanged.
