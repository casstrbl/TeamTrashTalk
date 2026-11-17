import { useState } from 'react'
import { clearServerLogin, loadServerLogin } from './api'
import type { ServerProfile } from './api'
import ServerSignIn from './ServerSignIn'
import TestPanelPage from './TestPanelPage'
import type { ToolBin } from './TestPanelPage'
import ManageBinsPage from './ManageBinsPage'

// editors only: the test panel and bin management, behind one tab in the nav

type Tab = 'test' | 'bins'

export default function ToolsPage({ bins, allBins, fillOn, fillAt, offlineOn, usingSampleData, onChanged, onScrollTop }: {
  bins: ToolBin[] // bins this editor can see on the dashboard
  allBins: ToolBin[] // every bin from the server, including ones with no zone yet
  fillOn: boolean
  fillAt: number
  offlineOn: boolean
  usingSampleData: boolean // the server isn't answering, so the app is showing mockBins
  onChanged: () => void
  onScrollTop: () => void
}) {
  const [tab, setTab] = useState<Tab>('test')
  const [staff, setStaff] = useState<ServerProfile | null>(() => {
    const login = loadServerLogin()
    return login?.staff.role === 'editor' ? login.staff : null
  })

  function signOut() {
    clearServerLogin()
    setStaff(null)
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-pine tracking-tight">{tab === 'test' ? 'Test Panel' : 'Manage bins'}</h1>
          <p className="text-sm md:text-[15px] font-medium text-pine-muted mt-1">
            {tab === 'test'
              ? 'Simulate sensor activity to see how the system responds.'
              : 'Add bins, update their details, and organize them into zones.'}
          </p>
        </div>
        <span className="text-xs bg-teal-soft text-teal px-3 py-1.5 rounded-full font-bold whitespace-nowrap">Editors only</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center glass rounded-full p-1 text-[13px]" role="group" aria-label="Editor tools">
          {([['test', 'Test Panel'], ['bins', 'Manage bins']] as const).map(([value, label]) => (
            <button key={value} onClick={() => setTab(value)} aria-pressed={tab === value}
              className={`px-4 min-h-9 rounded-full font-bold transition-colors ${tab === value ? 'bg-teal text-ivory' : 'text-pine-muted hover:text-pine'}`}
            >{label}</button>
          ))}
        </div>
        {staff && (
          <p className="text-sm font-medium text-pine-muted">
            Server: <span className="font-bold text-pine">{staff.email}</span>{' '}
            <button onClick={signOut} className="font-bold text-teal hover:underline underline-offset-4 min-h-11 px-1">Sign out</button>
          </p>
        )}
      </div>

      {usingSampleData && (
        <p className="rounded-2xl bg-warn-soft text-status-warn-ink text-sm font-bold px-4 py-3">
          The server isn’t answering, so the app is showing sample bins. Start the backend (or check the test link) to use these tools.
        </p>
      )}

      {!staff ? (
        <ServerSignIn onSignedIn={setStaff} />
      ) : tab === 'test' ? (
        <TestPanelPage bins={bins} fillOn={fillOn} fillAt={fillAt} offlineOn={offlineOn} onChanged={onChanged} />
      ) : (
        <ManageBinsPage bins={allBins} onChanged={onChanged} onScrollTop={onScrollTop} />
      )}
    </div>
  )
}
