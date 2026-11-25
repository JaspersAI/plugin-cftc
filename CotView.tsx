import { useEffect, useState, type ReactElement } from 'react'
import { useData, usePanelState, usePublish, type PanelRef } from '@jaspers-ai/sdk'
import {
  buildCotOutput,
  fmtContracts,
  fmtSigned,
  readCotState,
  type CotReport,
  type CotState,
} from './cftc.ts'
import './styles.css'

const REPORT_TABS: { id: CotReport; label: string }[] = [
  { id: 'legacy', label: 'Legacy' },
  { id: 'disaggregated', label: 'Disaggregated' },
  { id: 'financial', label: 'Financial (TFF)' },
]

function rowsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  if (data && typeof data === 'object') {
    const rows = (data as Record<string, unknown>)['rows']
    if (Array.isArray(rows)) return rows as Record<string, unknown>[]
  }
  return []
}

function signClass(val: unknown): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return ''
  return val > 0 ? 'cf-pos' : val < 0 ? 'cf-neg' : ''
}

export function CotView({ panel }: { panel: PanelRef }): ReactElement {
  const initial = useData(`workspaces/${panel.workspaceId}/panels/${panel.id}/state`)
  if (initial === undefined) return <div className="cf-root"><p className="cf-note">Loading…</p></div>
  return <CotPanel panel={panel} initial={initial} />
}

function CotPanel({ panel, initial }: { panel: PanelRef; initial: unknown }): ReactElement {
  const first = readCotState(initial)
  const [market, setMarket] = usePanelState<string>(panel, 'market', first.market)
  const [report, setReport] = usePanelState<CotReport>(panel, 'report', first.report)
  const [limit] = usePanelState<number>(panel, 'limit', first.limit)
  const state = readCotState({ market, report, limit })
  const [draft, setDraft] = useState(state.market)

  useEffect(() => {
    setDraft(state.market)
  }, [state.market])

  return (
    <div className="cf-root">
      <div className="cf-bar">
        <input
          className="cf-input"
          value={draft}
          placeholder="GOLD or S&P 500"
          aria-label="Futures contract"
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setMarket(draft.trim().toUpperCase())
          }}
          onBlur={() => {
            const next = draft.trim().toUpperCase()
            if (next && next !== state.market) setMarket(next)
          }}
        />
        <div className="cf-tabs">
          {REPORT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cf-tab ${state.report === t.id ? 'cf-tab-active' : ''}`}
              onClick={() => setReport(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="cf-body">
        {!state.market ? (
          <Empty panel={panel} state={state} />
        ) : (
          <CotBody panel={panel} state={state} />
        )}
      </div>
    </div>
  )
}

function Empty({ panel, state }: { panel: PanelRef; state: CotState }): ReactElement {
  usePublish(panel, buildCotOutput(state, []))
  return <p className="cf-note">Enter a futures contract (e.g. E-MINI S&amp;P 500, GOLD, CRUDE OIL, 10-YEAR, BITCOIN).</p>
}

function CotBody({ panel, state }: { panel: PanelRef; state: CotState }): ReactElement {
  const sourceName =
    state.report === 'disaggregated'
      ? 'cftc/disaggregated'
      : state.report === 'financial'
        ? 'cftc/financial-traders'
        : 'cftc/positions'
  const run = useData(sourceName, { market: state.market, limit: state.limit })
  const rows = rowsOf(run.data)
  usePublish(panel, buildCotOutput(state, rows))

  if (run.error) return <p className="cf-error">{run.error}</p>
  if (run.loading && rows.length === 0) return <p className="cf-note">Loading CFTC positioning…</p>

  const newestFirst = [...rows].reverse()
  const matched = String(newestFirst[0]?.['market'] ?? state.market)

  if (state.report === 'disaggregated') {
    return (
      <>
        <p className="cf-sub">{matched}</p>
        <table className="cf-table">
          <thead>
            <tr>
              <th>Report Date</th>
              <th className="cf-num">Open Interest</th>
              <th className="cf-num">Managed Money Net</th>
              <th className="cf-num">Producer Net</th>
              <th className="cf-num">Swap Dealer Net</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((row, idx) => (
              <tr key={`${String(row['date'] ?? idx)}`}>
                <td>{String(row['date'] ?? '')}</td>
                <td className="cf-num">{fmtContracts(row['openInterest'])}</td>
                <td className={`cf-num ${signClass(row['managedMoneyNet'])}`}>{fmtSigned(row['managedMoneyNet'])}</td>
                <td className={`cf-num ${signClass(row['producerNet'])}`}>{fmtSigned(row['producerNet'])}</td>
                <td className={`cf-num ${signClass(row['swapDealerNet'])}`}>{fmtSigned(row['swapDealerNet'])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  }

  if (state.report === 'financial') {
    return (
      <>
        <p className="cf-sub">{matched}</p>
        <table className="cf-table">
          <thead>
            <tr>
              <th>Report Date</th>
              <th className="cf-num">Open Interest</th>
              <th className="cf-num">Asset Mgr Net</th>
              <th className="cf-num">Leveraged Funds Net</th>
              <th className="cf-num">Dealer Net</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((row, idx) => (
              <tr key={`${String(row['date'] ?? idx)}`}>
                <td>{String(row['date'] ?? '')}</td>
                <td className="cf-num">{fmtContracts(row['openInterest'])}</td>
                <td className={`cf-num ${signClass(row['assetMgrNet'])}`}>{fmtSigned(row['assetMgrNet'])}</td>
                <td className={`cf-num ${signClass(row['leveragedNet'])}`}>{fmtSigned(row['leveragedNet'])}</td>
                <td className={`cf-num ${signClass(row['dealerNet'])}`}>{fmtSigned(row['dealerNet'])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  }

  return (
    <>
      <p className="cf-sub">{matched}</p>
      <table className="cf-table">
        <thead>
          <tr>
            <th>Report Date</th>
            <th className="cf-num">Open Interest</th>
            <th className="cf-num">Non-Commercial Net</th>
            <th className="cf-num">Commercial Hedger Net</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((row, idx) => (
            <tr key={`${String(row['date'] ?? idx)}`}>
              <td>{String(row['date'] ?? '')}</td>
              <td className="cf-num">{fmtContracts(row['openInterest'])}</td>
              <td className={`cf-num ${signClass(row['fundsNet'])}`}>{fmtSigned(row['fundsNet'])}</td>
              <td className={`cf-num ${signClass(row['hedgersNet'])}`}>{fmtSigned(row['hedgersNet'])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
