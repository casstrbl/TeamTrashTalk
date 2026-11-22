
import type { ToolBin } from './TestPanelPage'
import { mockBins } from './data/mockBins'

type BrowserAction = 'fill' | 'empty' | 'offline' | 'reset'

interface SimulationInput {
  triBinID?: number
  stream?: string
  percent?: number
}

export function simulateBrowserAction(
  bins: ToolBin[],
  action: BrowserAction,
  input: SimulationInput = {}
) {
  // Restore the original demo values without changing the server.
  if (action === 'reset') {
    const defaults = new Map(mockBins.map(bin => [bin.id, bin]))
    return {
      bins: bins.map(bin => {
        const initial = defaults.get(bin.id)
        return {
          ...bin,
          compartments: bin.compartments.map(c => ({
            ...c,
            fill: initial?.compartments.find(base => base.label === c.label)?.fill ?? 2
          })),
          sensorStatus: (initial?.sensorStatus ?? 'online') as 'online' | 'offline',
          lastUpdated: initial?.lastUpdated ?? 'just now'
        }
      }),
      result: {
        message: 'Browser demo bins restored to starting levels',
        binsReset: bins.length
      }
    }
  }

  const index = bins.findIndex(
    bin => Number(bin.id.replace(/\D/g, '')) === input.triBinID
  )

  if (index === -1) {
    throw new Error('Demo bin not found')
  }

  const original = bins[index]
  let updated: ToolBin = {
    ...original,
    compartments: original.compartments.map(c => ({ ...c })),
    lastUpdated: 'just now'
  }

  if (action === 'fill') {
    const percent = Number(input.percent)
    const stream = input.stream?.toLowerCase()

    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new Error('Fill must be between 0 and 100')
    }

    if (!updated.compartments.some(c => c.label.toLowerCase() === stream)) {
      throw new Error('Invalid waste stream')
    }

    updated.compartments = updated.compartments.map(c =>
      c.label.toLowerCase() === stream
        ? { ...c, fill: percent }
        : c
    )
    updated.sensorStatus = 'online'
  }

  if (action === 'empty') {
    updated.compartments = updated.compartments.map(c => ({
      ...c,
      fill: 2
    }))
    updated.sensorStatus = 'online'
  }

  if (action === 'offline') {
    updated.sensorStatus = 'offline'
  }

  return {
    bins: bins.map((bin, i) => i === index ? updated : bin),
    result: {
      message: `Browser simulation: ${action} completed`,
      id: updated.id,
      fullest: Math.max(...updated.compartments.map(c => c.fill)),
      sensorStatus: updated.sensorStatus
    }
  }
}
