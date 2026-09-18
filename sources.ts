import { defineSource } from '@jaspers-ai/sdk'
import { z } from 'zod'


// The CFTC's Commitments of Traders, from its public reporting site. No key. Who is positioned
// where in futures: what the funds hold against what the commercial hedgers hold.

const HOST = 'publicreporting.cftc.gov'
/** Futures only, the legacy report: the one whose columns everyone quotes. */
const DATASET = '6dca-aqww'

export const positions = defineSource({
  description:
    'Commitments of Traders: weekly futures positioning by trader kind. market matches the contract name, like "GOLD", "E-MINI S&P 500", or "CRUDE OIL". Non-commercial is the speculators, commercial the hedgers.',
  hosts: [HOST],
  input: z.object({
    market: z.string().describe('Part of the contract name, like GOLD or E-MINI S&P 500.'),
    limit: z.number().int().min(1).max(2000).default(104).describe('Weeks to read, newest first. 104 is two years.'),
  }),
  async run({ market, limit }, ctx) {
    const where = `upper(market_and_exchange_names) like upper('%${market.replace(/'/g, "''")}%')`
    // Several contracts match a name, and the rows are picked apart below, so ask for enough that
    // the one that is kept still has `limit` weeks of its own.
    const query = new URLSearchParams({ $where: where, $order: 'report_date_as_yyyy_mm_dd DESC', $limit: String(Math.min(limit * 6, 10000)) })
    const response = await ctx.fetch(`https://${HOST}/resource/${DATASET}.json?${query.toString()}`)
    if (!response.ok) throw new Error(`The CFTC answered ${response.status}.`)
    const found = (await response.json()) as Record<string, string>[]
    if (found.length === 0) throw new Error(`No contract matches "${market}". Try a shorter piece of its name, like GOLD.`)
    // A name matches several contracts (GOLD also finds MICRO GOLD and PAX GOLD), and mixing them
    // in one series is a chart of nothing. The largest by open interest is the one meant; the rest
    // come back named, so a caller who wanted one of those can ask for it exactly.
    const byMarket = new Map<string, Record<string, string>[]>()
    for (const row of found) {
      const name = row['market_and_exchange_names'] ?? ''
      byMarket.set(name, [...(byMarket.get(name) ?? []), row])
    }
    const biggest = [...byMarket.entries()].sort(
      (a, b) => Number(b[1][0]?.['open_interest_all'] ?? 0) - Number(a[1][0]?.['open_interest_all'] ?? 0),
    )
    const rows = (biggest[0]?.[1] ?? []).slice(0, limit)
      .map((row) => {
        const number = (key: string): number | null => (row[key] === undefined ? null : Number(row[key]))
        const long = number('noncomm_positions_long_all')
        const short = number('noncomm_positions_short_all')
        return {
          market: row['market_and_exchange_names'],
          date: row['report_date_as_yyyy_mm_dd']?.slice(0, 10),
          openInterest: number('open_interest_all'),
          fundsLong: long,
          fundsShort: short,
          // The number the report is read for: what the speculators are betting, on balance.
          fundsNet: long !== null && short !== null ? long - short : null,
          hedgersLong: number('comm_positions_long_all'),
          hedgersShort: number('comm_positions_short_all'),
          smallLong: number('nonrept_positions_long_all'),
          smallShort: number('nonrept_positions_short_all'),
        }
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    return { market: rows[0]?.market, alsoMatched: biggest.slice(1).map(([name]) => name), rows }
  },
})
