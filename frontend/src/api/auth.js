import { apiRequest } from './client.js'

// None of these send the access token. Refresh and logout use the HttpOnly
// refresh cookie, which the browser attaches on its own.

export const register = ({ username, email, password }) =>
  apiRequest('/auth/register', {
    method: 'POST',
    body: { username, email, password },
  })

export const login = ({ username, password }) =>
  apiRequest('/auth/login', { method: 'POST', body: { username, password } })

export const refresh = () => apiRequest('/auth/refresh', { method: 'POST' })

export const logout = () => apiRequest('/auth/logout', { method: 'POST' })

export const verifyEmail = (token) =>
  apiRequest(`/auth/verify-email?token=${encodeURIComponent(token)}`)

export const resendVerification = (username) =>
  apiRequest('/auth/resend-verification', {
    method: 'POST',
    body: { username },
  })
