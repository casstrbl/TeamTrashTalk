
import type { ToolBin } from './TestPanelPage'

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
  if (action === 'reset') {
    return {
      bins: bins.map(bin => ({
        ...bin,
        compartments: bin.compartments.map(c => ({
          ...c,
          fill: 2
        })),
        sensorStatus: 'online' as const,
        lastUpdated: 'just now'
      })),
      result: {
        message: 'Browser demo bins reset',
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
  }

  if (action === 'empty') {
    updated.compartments = updated.compartments.map(c => ({
      ...c,
      fill: 2
    }))
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
