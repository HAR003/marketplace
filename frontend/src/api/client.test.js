import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../store/authStore.js'
import { register } from './auth.js'
import { ApiError } from './client.js'
import { getMe } from './user.js'

const user = { id: 7, username: 'alice' }

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('apiRequest', () => {
  let fetchMock

  const callsTo = (path) =>
    fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === path)

  // The backend in miniature: /auth/refresh hands out 'fresh', and
  // /user/me accepts only that token
  const backendWithExpiredToken = () =>
    fetchMock.mockImplementation(async (url, init) => {
      if (new URL(url).pathname === '/auth/refresh') {
        return json(200, { accessToken: 'fresh', user })
      }
      return init.headers.Authorization === 'Bearer fresh'
        ? json(200, user)
        : json(401, { message: 'Unauthorized' })
    })

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore.setState({ user: null, accessToken: null, status: 'checking' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the access token and the cookies', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token-1', user })
    fetchMock.mockImplementation(async () => json(200, user))

    await expect(getMe()).resolves.toEqual(user)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${import.meta.env.VITE_API_URL}/user/me`)
    expect(init.headers.Authorization).toBe('Bearer token-1')
    expect(init.credentials).toBe('include')
  })

  it('refreshes an expired access token once and retries with the new one', async () => {
    useAuthStore.getState().setSession({ accessToken: 'expired', user })
    backendWithExpiredToken()

    await expect(getMe()).resolves.toEqual(user)

    expect(callsTo('/auth/refresh')).toHaveLength(1)
    expect(callsTo('/user/me')).toHaveLength(2)
    expect(useAuthStore.getState().accessToken).toBe('fresh')
  })

  it('shares one refresh between parallel requests', async () => {
    useAuthStore.getState().setSession({ accessToken: 'expired', user })
    backendWithExpiredToken()

    await Promise.all([getMe(), getMe(), getMe()])

    expect(callsTo('/auth/refresh')).toHaveLength(1)
  })

  it('ends the session when the refresh cookie is no longer valid', async () => {
    useAuthStore.getState().setSession({ accessToken: 'expired', user })
    fetchMock.mockImplementation(async () =>
      json(401, { message: 'Unauthorized' }),
    )

    await expect(getMe()).rejects.toMatchObject({ status: 401 })

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      user: null,
      status: 'guest',
    })
  })

  it('does not refresh when login fails', async () => {
    fetchMock.mockImplementation(async () =>
      json(401, { message: 'Invalid credentials' }),
    )

    await expect(
      useAuthStore
        .getState()
        .login({ email: 'alice@example.com', password: 'wrong password' }),
    ).rejects.toMatchObject({ status: 401, message: 'Invalid credentials' })

    expect(callsTo('/auth/refresh')).toHaveLength(0)
  })

  it('keeps every validation message', async () => {
    const messages = [
      'email must be an email',
      'password must be longer than or equal to 8 characters',
    ]
    fetchMock.mockImplementation(async () => json(400, { message: messages }))

    await expect(
      register({ username: 'alice', email: 'x', password: 'short' }),
    ).rejects.toMatchObject({ status: 400, messages })
  })

  it('reports an unreachable server as status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await getMe().catch((thrown) => thrown)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
  })
})
