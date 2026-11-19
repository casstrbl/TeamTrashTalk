import { useState } from 'react'
import type { FormEvent } from 'react'
import { serverLogin } from './api'
import type { ServerProfile } from './api'

// shown on editor tools until there's a server login. the dashboard sign-in is still the browser
// demo, so these buttons need a real editor account on the server
export default function ServerSignIn({ notice = '', onSignedIn }: { notice?: string; onSignedIn: (staff: ServerProfile) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return setError('Enter your email and password.')
    setBusy(true)
    setError('')
    try {
      const login = await serverLogin(email, password)
      if (login.staff.role !== 'editor') {
        setError('That account is a viewer. These tools need an editor account.')
        return
      }
      onSignedIn(login.staff)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full min-h-12 rounded-2xl bg-white/70 border border-pine/10 px-4 text-base text-pine placeholder:text-pine-muted/70 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/20 transition'

  return (
    <form onSubmit={submit} noValidate className="rounded-[28px] p-5 md:p-6 glass max-w-xl space-y-4">
      <div>
        <h2 className="text-lg font-bold text-pine">Sign in to the server</h2>
        <p className="text-[13px] font-medium text-pine-muted mt-1">
          These buttons change real data on the server, so they need an editor account. Use the test login your team gave you.
        </p>
      </div>
      <label className="block">
        <span className="block text-sm font-bold text-pine mb-1.5">Email</span>
        <input type="email" inputMode="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={input} />
      </label>
      <label className="block">
        <span className="block text-sm font-bold text-pine mb-1.5">Password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" className={input} />
      </label>
      {notice && !error && <p role="status" className="text-sm font-semibold text-status-warn-ink bg-warn-soft rounded-2xl px-4 py-3">{notice}</p>}
      {error && <p role="alert" className="text-sm font-semibold text-status-critical-ink bg-critical-soft rounded-2xl px-4 py-3">{error}</p>}
      <button type="submit" disabled={busy} className="w-full min-h-12 rounded-full bg-pine text-ivory text-[15px] font-bold hover:bg-forest-light transition-colors disabled:opacity-60">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
