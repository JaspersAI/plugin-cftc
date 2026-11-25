import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildCotOutput,
  cotSummary,
  normalizeDisaggregatedRows,
  normalizeFinancialTradersRows,
  normalizeLegacyRows,
  OUTPUT_MAX,
  pickLargestContract,
  readCotState,
} from './cftc.ts'
import * as sources from './sources.ts'

const all = Object.entries(sources).filter(([, one]) => (one as { kind?: string }).kind === 'source')

test('it declares legacy, disaggregated, and financial-traders COT sources', () => {
  assert.deepEqual(all.map(([name]) => name).sort(), ['disaggregated', 'financialTraders', 'positions'])
})

test('every source says what it is for, and which hosts it reaches', () => {
  for (const [name, source] of all) {
    const one = source as { description?: string; hosts?: string[] }
    assert.ok((one.description ?? '').length > 30, `${name} has no description worth reading`)
    assert.ok((one.hosts ?? []).length > 0, `${name} declares no hosts`)
    for (const host of one.hosts ?? []) assert.match(host, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, host)
  }
})

test('pickLargestContract chooses the largest open-interest contract and lists other matches', () => {
  const picked = pickLargestContract([
    { market_and_exchange_names: 'MICRO GOLD - COMEX', open_interest_all: '48000' },
    { market_and_exchange_names: 'GOLD - COMMODITY EXCHANGE INC.', open_interest_all: '540000' },
  ])
  assert.equal(picked.contract, 'GOLD - COMMODITY EXCHANGE INC.')
  assert.deepEqual(picked.alsoMatched, ['MICRO GOLD - COMEX'])
})

test('disaggregated normalizer handles swap__positions_short_all double underscore and computes nets', () => {
  const rows = normalizeDisaggregatedRows(
    [
      {
        market_and_exchange_names: 'GOLD - COMMODITY EXCHANGE INC.',
        report_date_as_yyyy_mm_dd: '2026-11-17T00:00:00.000',
        open_interest_all: '500000',
        m_money_positions_long_all: '210000',
        m_money_positions_short_all: '35000',
        prod_merc_positions_long: '40000',
        prod_merc_positions_short: '130000',
        swap_positions_long_all: '30000',
        swap__positions_short_all: '220000',
      },
    ],
    10,
  )
  assert.equal(rows[0]!.managedMoneyNet, 175_000)
  assert.equal(rows[0]!.producerNet, -90_000)
  assert.equal(rows[0]!.swapDealerNet, -190_000)
})

test('financial traders (TFF) normalizer computes Asset Manager and Leveraged Funds net positioning', () => {
  const rows = normalizeFinancialTradersRows(
    [
      {
        market_and_exchange_names: 'E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE',
        report_date_as_yyyy_mm_dd: '2026-11-17T00:00:00.000',
        open_interest_all: '2400000',
        asset_mgr_positions_long: '1250000',
        asset_mgr_positions_short: '450000',
        lev_money_positions_long: '180000',
        lev_money_positions_short: '520000',
        dealer_positions_long_all: '210000',
        dealer_positions_short_all: '610000',
      },
    ],
    10,
  )
  assert.equal(rows[0]!.assetMgrNet, 800_000)
  assert.equal(rows[0]!.leveragedNet, -340_000)
  assert.equal(rows[0]!.dealerNet, -400_000)
})

test('legacy normalizer and bounded 4 KB view output hold', () => {
  const rows = normalizeLegacyRows(
    [
      {
        market_and_exchange_names: 'CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE '.repeat(5),
        report_date_as_yyyy_mm_dd: '2026-11-17',
        open_interest_all: '1800000',
        noncomm_positions_long_all: '310000',
        noncomm_positions_short_all: '140000',
        comm_positions_long_all: '600000',
        comm_positions_short_all: '790000',
      },
    ],
    10,
  )
  const state = readCotState({ market: ' crude oil ', report: 'legacy', limit: 900 })
  assert.equal(state.limit, 260)
  const output = buildCotOutput(state, rows)
  assert.ok(new TextEncoder().encode(JSON.stringify(output)).length <= OUTPUT_MAX)
  assert.match(cotSummary(state, output), /Non-Commercial Net \+170,000/)
})
