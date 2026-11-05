import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import BinLogo from './BinLogo'
import Aura from './Aura'

// welcome, log in and create account screens (the dark aura look from figma).
// demo sign-in only: any password works for an email on the staff list. real accounts and
// passwords need a login endpoint in the backend, this screen is ready to call one

interface LoginStaff {
  id: string
  name: string
  email: string
  role: 'editor' | 'viewer'
}

type View = 'welcome' | 'login' | 'create'

const INPUT = 'w-full min-h-13 rounded-2xl glass-night px-4 text-base text-white placeholder:text-white/45 outline-none focus:border-lime/80 focus:ring-2 focus:ring-lime/30 transition'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-white/80 mb-2">{label}</span>
      {children}
    </label>
  )
}

function Arrow({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} type="button" className="inline-flex items-center gap-1.5 glass-night rounded-full pl-3 pr-4 min-h-11 text-sm font-semibold text-white hover:bg-white/15 transition-colors">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M5 12l6 6M5 12l6-6" /></svg>
      Back
    </button>
  )
}

function PasswordInput({ value, onChange, autoComplete }: { value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        className={`${INPUT} pr-14`}
        placeholder="Your password"
      />
      <button
        type="button"
        onClick={() => setShown(s => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  )
}

export default function LoginPage({ staff, onLogin, onCreate, onScrollTop }: {
  staff: LoginStaff[]
  onLogin: (staffId: string) => void
  onCreate: (name: string, email: string) => void
  onScrollTop: () => void // back to the top (the app's smooth scroller) when the screen changes
}) {
  const [view, setView] = useState<View>('welcome')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function go(next: View) {
    setView(next)
    setError('')
    setPassword('')
    onScrollTop()
  }

  function submitLogin(e: FormEvent) {
    e.preventDefault()
    const found = staff.find(s => s.email.toLowerCase() === email.trim().toLowerCase())
    if (!found) return setError('We couldn’t find that email. Check the spelling, or create an account.')
    if (!password) return setError('Enter your password.')
    onLogin(found.id)
  }

  function submitCreate(e: FormEvent) {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!name.trim()) return setError('Enter your name.')
    if (!/^[^\s@]+@csus\.edu$/.test(clean)) return setError('Use your Sac State email (ends in @csus.edu).')
    if (staff.some(s => s.email.toLowerCase() === clean)) return setError('That email already has an account. Log in instead.')
    if (password.length < 8) return setError('Use at least 8 characters for your password.')
    onCreate(name.trim(), clean)
  }

  return (
    <div className="relative min-h-dvh text-white flex flex-col">
      <Aura night />
      <main className="flex-1 flex flex-col w-full max-w-[520px] mx-auto px-6 pt-[max(24px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))] md:justify-center">
        {view === 'welcome' && (
          <div className="flex-1 md:flex-none flex flex-col justify-end md:justify-center gap-10 animate-page-in motion-reduce:animate-none">
            <div className="space-y-6">
              <BinLogo size={80} glow className="-ml-2" />
              <h1 className="text-[46px] md:text-[68px] leading-[1.12] font-normal tracking-tight">
                Monitor<br />
                <span className="text-lime font-semibold">all bins</span><br />
                in one place.
              </h1>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => go('create')}
                className="min-h-[72px] rounded-full glass-night text-white text-[17px] font-medium px-4 hover:bg-white/15 transition-colors"
              >
                Create account
              </button>
              <button
                onClick={() => go('login')}
                className="min-h-[72px] rounded-full bg-lime text-pine text-[17px] font-semibold px-4 inline-flex items-center justify-center gap-2 hover:brightness-105 transition"
              >
                Log in <Arrow />
              </button>
            </div>
          </div>
        )}

        {view === 'login' && (
          <form onSubmit={submitLogin} noValidate className="flex-1 md:flex-none flex flex-col gap-8 animate-page-in motion-reduce:animate-none">
            <div><BackButton onClick={() => go('welcome')} /></div>
            <div className="flex-1 md:flex-none flex flex-col justify-center gap-7">
              <div className="space-y-3">
                <BinLogo size={56} glow className="-ml-1.5" />
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Welcome back</h1>
                <p className="text-white/70">Log in with your Sac State email.</p>
              </div>
              <div className="space-y-5">
                <Field label="Campus email">
                  <input type="email" inputMode="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@csus.edu" className={INPUT} />
                </Field>
                <Field label="Password">
                  <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
                </Field>
                {error && <p role="alert" className="text-sm font-semibold text-rose bg-rose/15 rounded-2xl px-4 py-3">{error}</p>}
              </div>
              <button type="submit" className="min-h-[64px] rounded-full bg-lime text-pine text-[17px] font-semibold inline-flex items-center justify-center gap-2 hover:brightness-105 transition">
                Log in <Arrow />
              </button>
              <p className="text-center text-sm text-white/70">
                New here?{' '}
                <button type="button" onClick={() => go('create')} className="font-semibold text-lime underline-offset-4 hover:underline min-h-11 px-1">Create an account</button>
              </p>
              {/* demo only: there's no password check yet, so say which emails exist */}
              <div className="glass-night rounded-2xl px-4 py-3 text-sm text-white/75 leading-relaxed">
                <span className="font-semibold text-white">Demo accounts:</span> person1@csus.edu (editor), person2@csus.edu (viewer), person3@csus.edu (viewer, sample data). Any password works.
              </div>
            </div>
          </form>
        )}

        {view === 'create' && (
          <form onSubmit={submitCreate} noValidate className="flex-1 md:flex-none flex flex-col gap-8 animate-page-in motion-reduce:animate-none">
            <div><BackButton onClick={() => go('welcome')} /></div>
            <div className="flex-1 md:flex-none flex flex-col justify-center gap-7">
              <div className="space-y-3">
                <BinLogo size={56} glow className="-ml-1.5" />
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Create account</h1>
              </div>
              <div className="space-y-5">
                <Field label="Your name">
                  <input type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" className={INPUT} />
                </Field>
                <Field label="Campus email">
                  <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@csus.edu" className={INPUT} />
                </Field>
                <Field label="Password">
                  <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
                </Field>
                {error && <p role="alert" className="text-sm font-semibold text-rose bg-rose/15 rounded-2xl px-4 py-3">{error}</p>}
              </div>
              <button type="submit" className="min-h-[64px] rounded-full bg-lime text-pine text-[17px] font-semibold inline-flex items-center justify-center gap-2 hover:brightness-105 transition">
                Create account <Arrow />
              </button>
              <p className="text-center text-sm text-white/70">
                Already have an account?{' '}
                <button type="button" onClick={() => go('login')} className="font-semibold text-lime underline-offset-4 hover:underline min-h-11 px-1">Log in</button>
              </p>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
