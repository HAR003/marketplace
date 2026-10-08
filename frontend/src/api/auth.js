import { apiRequest } from './client.js'

// None of these send the access token. Refresh and logout use the HttpOnly
// refresh cookie, which the browser attaches on its own.

export const register = ({ username, email, password }) =>
  apiRequest('/auth/register', {
    method: 'POST',
    body: { username, email, password },
  })

export const login = ({ email, password }) =>
  apiRequest('/auth/login', { method: 'POST', body: { email, password } })

// Trades the one-time code Google sent to /auth/google/callback for a session.
// Like login, the answer sets the refresh cookie.
export const googleLogin = (code) =>
  apiRequest('/auth/google', { method: 'POST', body: { code } })

export const refresh = () => apiRequest('/auth/refresh', { method: 'POST' })

export const logout = () => apiRequest('/auth/logout', { method: 'POST' })

export const verifyEmail = (token) =>
  apiRequest(`/auth/verify-email?token=${encodeURIComponent(token)}`)

export const resendVerification = (email) =>
  apiRequest('/auth/resend-verification', {
    method: 'POST',
    body: { email },
  })
