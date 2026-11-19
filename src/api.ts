// talking to the java server with a real login. the dashboard's sign-in is still the browser demo,
// so editor tools (test panel, manage bins) keep their own server token here

export const API_URL: string = import.meta.env.VITE_API_URL ?? ''

const TOKEN_KEY = 'tt-server-token'
export const SIGNED_OUT_EVENT = 'tt-server-signed-out'

export interface ServerProfile {
  id: number
  name: string
  email: string
  role: 'editor' | 'viewer'
}

interface StoredLogin {
  token: string
  staff: ServerProfile
}

// session storage: gone when the tab closes, and the server drops tokens after two hours anyway
export function loadServerLogin(): StoredLogin | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as StoredLogin) : null
  } catch {
    return null
  }
}

export function clearServerLogin() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage blocked, nothing to clear
  }
}

// signs in to the server. throws a message that's ready to show on screen
export async function serverLogin(email: string, password: string): Promise<StoredLogin> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    })
  } catch {
    throw new Error('Can’t reach the server. Check that the backend is running.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.token) throw new Error(res.status === 401 ? 'That email and password don’t match a server account.' : body.error ?? 'Sign-in failed.')
  const login: StoredLogin = { token: body.token, staff: body.staff }
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(login))
  } catch {
    // storage blocked: the login still works until the page reloads
  }
  return login
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// sends a request with the saved token. 401/403 clear it so the sign-in card comes back
export async function apiRequest<T>(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown): Promise<T> {
  const login = loadServerLogin()
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(login ? { Authorization: `Bearer ${login.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Can’t reach the server. Check that the backend is running.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearServerLogin()
      // editor tools listen for this and bring the sign-in card back
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
    }
    if (res.status === 401) throw new ApiError('Your server sign-in expired. Please sign in again.', 401)
    throw new ApiError(data.error ?? (res.status === 403 ? 'This needs an editor account.' : 'Something went wrong.'), res.status)
  }
  return data as T
}

// "TB-12" -> 12
export function triBinNumber(id: string): number {
  return Number.parseInt(id.replace(/^TB-/i, ''), 10)
}
