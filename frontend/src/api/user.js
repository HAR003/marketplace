import { apiRequest } from './client.js'

export const getMe = () => apiRequest('/user/me', { auth: true })
