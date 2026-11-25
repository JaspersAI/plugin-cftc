import { defineSource } from '@jaspers-ai/sdk'
import { z } from 'zod'
import {
  normalizeDisaggregatedRows,
  normalizeFinancialTradersRows,
  normalizeLegacyRows,
  pickLargestContract,
} from './cftc.ts'

// CFTC Commitments of Traders from publicreporting.cftc.gov (Socrata JSON API). No API key needed.
// - Legacy Futures-Only: 6dca-aqww
// - Disaggregated Futures-Only (Commodities / Energy / Metals / Ags): 72hh-3qpy
// - Traders in Financial Futures / TFF (Equity Indices, Rates, FX, Crypto): gpe5-46if

const HOST = 'publicreporting.cftc.gov'

async function fetchCotDataset(
  ctx: { fetch: typeof fetch },
  dataset: string,
  market: string,
  limit: number,
): Promise<{ contract: string; rows: Record<string, unknown>[]; alsoMatched: string[] }> {
  const cleaned = market.trim()
  const where = `upper(market_and_exchange_names) like upper('%${cleaned.replace(/'/g, "''")}%')`
  const query = new URLSearchParams({
    $where: where,
    $order: 'report_date_as_yyyy_mm_dd DESC',
    $limit: String(Math.min(limit * 6, 10000)),
  })
  const response = await ctx.fetch(`https://${HOST}/resource/${dataset}.json?${query.toString()}`)
  if (!response.ok) throw new Error(`The CFTC answered ${response.status}.`)
  const found = (await response.json()) as Record<string, unknown>[]
  if (found.length === 0) {
    throw new Error(`No CFTC contract in dataset ${dataset} matches "${cleaned}". Try a shorter piece, like GOLD or S&P 500.`)
  }
  return pickLargestContract(found)
}

export const positions = defineSource({
  description:
    'Legacy Commitments of Traders (futures only): weekly positioning split into Non-Commercial speculators (fundsLong/fundsShort/fundsNet), Commercial hedgers, and small traders. No key needed.',
  hosts: [HOST],
  input: z.object({
    market: z.string().describe('Part of the contract name, like GOLD, CRUDE OIL, or E-MINI S&P 500.'),
    limit: z.number().int().min(1).max(2000).default(104).describe('Weeks to read, oldest first. 104 is two years.'),
  }),
  async run({ market, limit }, ctx) {
    const picked = await fetchCotDataset(ctx, '6dca-aqww', market, limit)
    const rows = normalizeLegacyRows(picked.rows, limit)
    return { market: picked.contract, alsoMatched: picked.alsoMatched, rows }
  },
})

export const disaggregated = defineSource({
  description:
    'Disaggregated Commitments of Traders for physical commodities (energy, metals, agriculture): weekly positioning split into Managed Money (CTAs/commodity hedge funds), Producer/Merchant/Processor/User, and Swap Dealers. No key needed.',
  hosts: [HOST],
  input: z.object({
    market: z.string().describe('Part of a commodity contract name, like CRUDE OIL, NATURAL GAS, GOLD, COPPER, or CORN.'),
    limit: z.number().int().min(1).max(2000).default(104).describe('Weeks to read, oldest first.'),
  }),
  async run({ market, limit }, ctx) {
    const picked = await fetchCotDataset(ctx, '72hh-3qpy', market, limit)
    const rows = normalizeDisaggregatedRows(picked.rows, limit)
    return { market: picked.contract, alsoMatched: picked.alsoMatched, rows }
  },
})

export const financialTraders = defineSource({
  description:
    'Traders in Financial Futures (TFF): weekly positioning in equity index, Treasury, rate, FX, VIX, and crypto futures split into Asset Managers/Institutional, Leveraged Funds (hedge funds), and Dealers. No key needed.',
  hosts: [HOST],
  input: z.object({
    market: z
      .string()
      .describe('Part of a financial contract name, like E-MINI S&P 500, NASDAQ, 10-YEAR, SOFR, EURO FX, or BITCOIN.'),
    limit: z.number().int().min(1).max(2000).default(104).describe('Weeks to read, oldest first.'),
  }),
  async run({ market, limit }, ctx) {
    const picked = await fetchCotDataset(ctx, 'gpe5-46if', market, limit)
    const rows = normalizeFinancialTradersRows(picked.rows, limit)
    return { market: picked.contract, alsoMatched: picked.alsoMatched, rows }
  },
})
