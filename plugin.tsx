import { definePlugin, defineView } from '@jaspers-ai/sdk'
import { z } from 'zod'
import { cotSummary, REPORTS } from './cftc.ts'
import { CotView } from './CotView.tsx'
import { disaggregated, financialTraders, positions } from './sources.ts'

const CotStateSchema = z.object({
  market: z.string().default(''),
  report: z.enum(REPORTS).default('legacy'),
  limit: z.number().int().min(1).max(260).default(52),
})

const CotOutputSchema = z.object({
  market: z.string(),
  matchedContract: z.string().nullable(),
  report: z.enum(REPORTS),
  count: z.number(),
  latestDate: z.string().nullable(),
  openInterest: z.number().nullable(),
  primaryNetLabel: z.string().nullable(),
  primaryNet: z.number().nullable(),
  secondaryNetLabel: z.string().nullable(),
  secondaryNet: z.number().nullable(),
})

export default definePlugin({
  id: 'cftc',
  sources: {
    positions,
    disaggregated,
    'financial-traders': financialTraders,
  },
  views: {
    cot: defineView(CotView, {
      title: 'CFTC Commitments of Traders',
      state: CotStateSchema,
      output: CotOutputSchema,
      instructions:
        'Weekly CFTC Commitments of Traders positioning (no key needed). Set state.market (e.g. "E-MINI S&P 500", "GOLD", "CRUDE OIL", "10-YEAR") and state.report to "legacy", "disaggregated" (Managed Money vs Producers/Swap Dealers for commodities), or "financial" (Asset Managers vs Leveraged Hedge Funds for equity/rate/FX/crypto futures).',
      renders: [positions, disaggregated, financialTraders],
      summarize: cotSummary,
    }),
  },
})
