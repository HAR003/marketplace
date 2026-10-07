import { useAuthStore } from '../store/authStore.js'

const API_URL = import.meta.env.VITE_API_URL

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

// An error answer from the backend; status 0 means the server couldn't be reached
export class ApiError extends Error {
  constructor(status, messages) {
    super(messages[0])
    this.name = 'ApiError'
    this.status = status
    this.messages = messages
  }
}

// The messages to show the user for any error thrown while calling the API
export function errorMessages(error) {
  return error instanceof ApiError ? error.messages : [FALLBACK_MESSAGE]
}

// Calls the backend and returns the JSON body (null for 204 No Content).
// With auth: true it sends the access token, and after a 401 it refreshes the
// session once and retries, so an expired access token never reaches the UI.
export async function apiRequest(path, { method = 'GET', body, auth = false } = {}) {
  const response = await send(path, { method, body, auth })
  if (
    response.status === 401 &&
    auth &&
    (await useAuthStore.getState().refreshSession())
  ) {
    return parse(await send(path, { method, body, auth }))
  }
  return parse(response)
}

async function send(path, { method, body, auth }) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const { accessToken } = useAuthStore.getState()
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`

  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Lets the browser store and send the HttpOnly refresh_token cookie
      credentials: 'include',
    })
  } catch {
    throw new ApiError(0, [
      "Can't reach the server. Check your connection and try again.",
    ])
  }
}

async function parse(response) {
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (response.ok) return data
  // Nest sends { message: string }, or { message: string[] } for validation errors
  const message = data?.message ?? FALLBACK_MESSAGE
  throw new ApiError(
    response.status,
    Array.isArray(message) ? message : [message],
  )
}
