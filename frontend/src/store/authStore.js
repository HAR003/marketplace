import { create } from 'zustand'
import * as authApi from '../api/auth.js'

// The refresh in progress, shared so parallel callers send only one request
let refreshing = null

export const useAuthStore = create((set, get) => ({
  user: null,
  // Kept in memory only (no persist middleware), so it never sits in localStorage
  accessToken: null,
  // 'checking' until the first refresh answers, then 'authenticated' or 'guest'
  status: 'checking',

  setSession: ({ accessToken, user }) =>
    set({ accessToken, user, status: 'authenticated' }),
  clearSession: () => set({ accessToken: null, user: null, status: 'guest' }),
  setUser: (user) => set({ user }),

  // Trades the HttpOnly refresh cookie for a new access token.
  // Resolves to false when the session is over (cookie missing or expired).
  refreshSession: () => {
    refreshing ??= authApi
      .refresh()
      .then((session) => {
        get().setSession(session)
        return true
      })
      .catch(() => {
        get().clearSession()
        return false
      })
      .finally(() => {
        refreshing = null
      })
    return refreshing
  },

  login: async (credentials) => {
    get().setSession(await authApi.login(credentials))
  },

  // Clears the session even when the request fails, e.g. if the server is down
  logout: async () => {
    try {
      await authApi.logout()
    } finally {
      get().clearSession()
    }
  },
}))
