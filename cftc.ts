// Pure normalization, contract disambiguation, and view state/output helpers for CFTC COT reports.

export const OUTPUT_MAX = 4096
export const REPORTS = ['legacy', 'disaggregated', 'financial'] as const
export type CotReport = (typeof REPORTS)[number]

export type CotState = {
  market: string
  report: CotReport
  limit: number
}

export type CotOutput = {
  market: string
  matchedContract: string | null
  report: CotReport
  count: number
  latestDate: string | null
  openInterest: number | null
  primaryNetLabel: string | null
  primaryNet: number | null
  secondaryNetLabel: string | null
  secondaryNet: number | null
}

function num(row: Record<string, unknown>, key: string): number | null {
  const val = row[key]
  if (val === undefined || val === null || val === '') return null
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

function net(long: number | null, short: number | null): number | null {
  return long !== null && short !== null ? long - short : null
}

/**
 * Picks the contract with the largest open interest when a substring like "GOLD" or "S&P 500"
 * matches multiple CFTC contracts (e.g. standard vs micro), and lists the other matches.
 */
export function pickLargestContract(
  found: readonly Record<string, unknown>[],
): { contract: string; rows: Record<string, unknown>[]; alsoMatched: string[] } {
  const byMarket = new Map<string, Record<string, unknown>[]>()
  for (const row of found) {
    const name = String(row['market_and_exchange_names'] ?? '')
    if (!name) continue
    const list = byMarket.get(name)
    if (list) list.push(row)
    else byMarket.set(name, [row])
  }
  const ranked = [...byMarket.entries()].sort(
    (a, b) => (num(b[1][0] ?? {}, 'open_interest_all') ?? 0) - (num(a[1][0] ?? {}, 'open_interest_all') ?? 0),
  )
  return {
    contract: ranked[0]?.[0] ?? '',
    rows: ranked[0]?.[1] ?? [],
    alsoMatched: ranked.slice(1).map(([name]) => name),
  }
}

export function normalizeLegacyRows(rawRows: readonly Record<string, unknown>[], limit: number) {
  return rawRows
    .slice(0, limit)
    .map((row) => {
      const fundsLong = num(row, 'noncomm_positions_long_all')
      const fundsShort = num(row, 'noncomm_positions_short_all')
      const hedgersLong = num(row, 'comm_positions_long_all')
      const hedgersShort = num(row, 'comm_positions_short_all')
      return {
        market: String(row['market_and_exchange_names'] ?? ''),
        date: String(row['report_date_as_yyyy_mm_dd'] ?? '').slice(0, 10),
        openInterest: num(row, 'open_interest_all'),
        fundsLong,
        fundsShort,
        fundsNet: net(fundsLong, fundsShort),
        hedgersLong,
        hedgersShort,
        hedgersNet: net(hedgersLong, hedgersShort),
        smallLong: num(row, 'nonrept_positions_long_all'),
        smallShort: num(row, 'nonrept_positions_short_all'),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function normalizeDisaggregatedRows(rawRows: readonly Record<string, unknown>[], limit: number) {
  return rawRows
    .slice(0, limit)
    .map((row) => {
      const managedMoneyLong = num(row, 'm_money_positions_long_all')
      const managedMoneyShort = num(row, 'm_money_positions_short_all')
      const producerLong = num(row, 'prod_merc_positions_long')
      const producerShort = num(row, 'prod_merc_positions_short')
      const swapDealerLong = num(row, 'swap_positions_long_all')
      // Upstream Socrata column has a double underscore after swap (`swap__positions_short_all`).
      const swapDealerShort = num(row, 'swap__positions_short_all') ?? num(row, 'swap_positions_short_all')
      return {
        market: String(row['market_and_exchange_names'] ?? ''),
        date: String(row['report_date_as_yyyy_mm_dd'] ?? '').slice(0, 10),
        openInterest: num(row, 'open_interest_all'),
        managedMoneyLong,
        managedMoneyShort,
        managedMoneyNet: net(managedMoneyLong, managedMoneyShort),
        producerLong,
        producerShort,
        producerNet: net(producerLong, producerShort),
        swapDealerLong,
        swapDealerShort,
        swapDealerNet: net(swapDealerLong, swapDealerShort),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function normalizeFinancialTradersRows(rawRows: readonly Record<string, unknown>[], limit: number) {
  return rawRows
    .slice(0, limit)
    .map((row) => {
      const assetMgrLong = num(row, 'asset_mgr_positions_long')
      const assetMgrShort = num(row, 'asset_mgr_positions_short')
      const leveragedLong = num(row, 'lev_money_positions_long')
      const leveragedShort = num(row, 'lev_money_positions_short')
      const dealerLong = num(row, 'dealer_positions_long_all')
      const dealerShort = num(row, 'dealer_positions_short_all')
      return {
        market: String(row['market_and_exchange_names'] ?? ''),
        date: String(row['report_date_as_yyyy_mm_dd'] ?? '').slice(0, 10),
        openInterest: num(row, 'open_interest_all'),
        assetMgrLong,
        assetMgrShort,
        assetMgrNet: net(assetMgrLong, assetMgrShort),
        leveragedLong,
        leveragedShort,
        leveragedNet: net(leveragedLong, leveragedShort),
        dealerLong,
        dealerShort,
        dealerNet: net(dealerLong, dealerShort),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function readCotState(raw: unknown): CotState {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const market = typeof obj['market'] === 'string' ? obj['market'].trim().toUpperCase() : ''
  const r = obj['report']
  const report: CotReport = REPORTS.includes(r as CotReport) ? (r as CotReport) : 'legacy'
  const lim = typeof obj['limit'] === 'number' && Number.isFinite(obj['limit']) ? Math.trunc(obj['limit']) : 52
  const limit = Math.max(1, Math.min(260, lim))
  return { market, report, limit }
}

export function buildCotOutput(state: CotState, rows: readonly Record<string, unknown>[]): CotOutput {
  if (!state.market || rows.length === 0) {
    return {
      market: state.market,
      matchedContract: null,
      report: state.report,
      count: 0,
      latestDate: null,
      openInterest: null,
      primaryNetLabel: null,
      primaryNet: null,
      secondaryNetLabel: null,
      secondaryNet: null,
    }
  }
  const latest = rows[rows.length - 1] ?? {}
  const contract = typeof latest['market'] === 'string' ? latest['market'].slice(0, 140) : null
  const latestDate = typeof latest['date'] === 'string' ? latest['date'].slice(0, 10) : null
  const openInterest = num(latest, 'openInterest')
  if (state.report === 'disaggregated') {
    return {
      market: state.market.slice(0, 80),
      matchedContract: contract,
      report: state.report,
      count: rows.length,
      latestDate,
      openInterest,
      primaryNetLabel: 'Managed Money Net',
      primaryNet: num(latest, 'managedMoneyNet'),
      secondaryNetLabel: 'Producer/Merchant Net',
      secondaryNet: num(latest, 'producerNet'),
    }
  }
  if (state.report === 'financial') {
    return {
      market: state.market.slice(0, 80),
      matchedContract: contract,
      report: state.report,
      count: rows.length,
      latestDate,
      openInterest,
      primaryNetLabel: 'Asset Manager Net',
      primaryNet: num(latest, 'assetMgrNet'),
      secondaryNetLabel: 'Leveraged Funds Net',
      secondaryNet: num(latest, 'leveragedNet'),
    }
  }
  return {
    market: state.market.slice(0, 80),
    matchedContract: contract,
    report: state.report,
    count: rows.length,
    latestDate,
    openInterest,
    primaryNetLabel: 'Non-Commercial Net',
    primaryNet: num(latest, 'fundsNet'),
    secondaryNetLabel: 'Commercial Hedger Net',
    secondaryNet: num(latest, 'hedgersNet'),
  }
}

export function cotSummary(
  state: { market?: string; report?: CotReport },
  output: CotOutput | null | undefined,
): string {
  const market = (state.market ?? output?.market ?? '').trim()
  const report = state.report ?? output?.report ?? 'legacy'
  if (!market) return 'CFTC Commitments of Traders'
  if (!output || output.count === 0) return `CFTC COT (${report}): ${market}`
  const netStr =
    output.primaryNet !== null && output.primaryNetLabel
      ? `, ${output.primaryNetLabel} ${output.primaryNet >= 0 ? '+' : ''}${Math.round(output.primaryNet).toLocaleString('en-US')}`
      : ''
  return `CFTC ${output.matchedContract ?? market} (${output.latestDate ?? ''})${netStr}`
}

export function fmtContracts(val: unknown): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '—'
  return Math.round(val).toLocaleString('en-US')
}

export function fmtSigned(val: unknown): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '—'
  const r = Math.round(val)
  return `${r > 0 ? '+' : ''}${r.toLocaleString('en-US')}`
}
