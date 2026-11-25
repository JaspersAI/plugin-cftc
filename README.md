# CFTC Commitments of Traders for Jaspers Terminal

Weekly futures positioning by trader category straight from `publicreporting.cftc.gov`, with no API key required:

- **Sources:**
  - `cftc/positions` — Legacy Futures-Only COT (Non-Commercial speculators vs. Commercial hedgers)
  - `cftc/disaggregated` — Disaggregated COT for commodities (Managed Money vs. Producer/Merchant vs. Swap Dealers)
  - `cftc/financial-traders` — Traders in Financial Futures / TFF for equity indices, rates, FX, VIX, and crypto (Asset Managers vs. Leveraged Funds vs. Dealers)
- **Views:** `cftc/cot` (`Legacy`, `Disaggregated`, and `Financial (TFF)` tabs)

## Working on it

```sh
npm ci
npm run typecheck
npm test
npm run package
```

MIT.
