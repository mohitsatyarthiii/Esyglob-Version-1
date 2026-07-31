import axios from 'axios'
import { validateEnvironment } from '../config/environment'

const { environment } = validateEnvironment()
const apiBaseUrl = environment?.apiBaseUrl || '/__configuration_error__'
const SAFE_RETRY_METHODS = new Set(['get', 'head', 'options'])
const AUTH_PATHS = new Set(['/auth/signin', '/auth/logout', '/auth/refresh'])
const MAX_NETWORK_RETRIES = 2
let refreshRequest = null

const client = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { Accept: 'application/json' },
  timeout: 20_000,
})

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config || {}
    const payload = error.response?.data
    const status = error.response?.status || 0
    const path = String(request.url || '').split('?')[0]

    if (status === 401 && !request.skipAuthRefresh && !request.authRetried && !AUTH_PATHS.has(path)) {
      request.authRetried = true
      try {
        refreshRequest ||= client.post('/auth/refresh', null, { skipAuthRefresh: true })
          .finally(() => { refreshRequest = null })
        await refreshRequest
        return client(request)
      } catch {
        window.dispatchEvent(new CustomEvent('esyglob:unauthorized'))
      }
    }

    const retryCount = Number(request.networkRetryCount || 0)
    const retryableFailure = !status || status === 408 || status === 429 || status >= 500
    if (
      retryableFailure
      && SAFE_RETRY_METHODS.has(String(request.method || 'get').toLowerCase())
      && retryCount < MAX_NETWORK_RETRIES
    ) {
      request.networkRetryCount = retryCount + 1
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** retryCount)))
      return client(request)
    }

    error.message = payload?.error || payload?.message
      || (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)
        ? 'The request timed out. Please try again.'
        : status
          ? 'Unable to complete this request.'
          : 'Unable to reach the secure API. Check your connection and try again.')
    error.status = status
    error.fieldErrors = payload?.fieldErrors || {}
    return Promise.reject(error)
  },
)

export const apiUrl = (path) => `${apiBaseUrl}/${String(path).replace(/^\/+/, '')}`
export const getCurrentUser = () => client.post('/auth/refresh', null, { skipAuthRefresh: true }).then(({ data }) => data.user)
export const login = (body) => client.post('/auth/signin', body).then(({ data }) => data.user)
export const logout = () => client.post('/auth/logout')
export const getOverview = () => client.get('/admin/overview').then(({ data }) => data.data)
export const listResource = (resource, params) => client.get(`/admin/${resource}`, { params }).then(({ data }) => data.data)
export const getResource = (resource, id) => client.get(`/admin/${resource}/${id}`).then(({ data }) => {
  const record = data.data
  if (resource === 'verifications' && Array.isArray(record?.documents)) {
    return {
      ...record,
      documents: record.documents.map((document) => {
        const fileAvailable = document.storageProvider === 'vps' && Boolean(document.storageKey)
        return {
          ...document,
          fileAvailable,
          url: fileAvailable ? apiUrl(`/suppliers/verification/documents/${document._id}`) : '',
        }
      }),
    }
  }
  return record
})
export const createResource = (resource, body) => client.post(`/admin/${resource}`, body).then(({ data }) => data.data)
export const updateResource = (resource, id, body) => client.patch(`/admin/${resource}/${id}`, body).then(({ data }) => data.data)
export const deleteResource = (resource, id) => client.delete(`/admin/${resource}/${id}`).then(({ data }) => data.data)
export const runResourceAction = (resource, id, body) => client.post(`/admin/${resource}/${id}/actions`, body).then(({ data }) => data.data)
export const reviewVerificationDocument = (verificationId, documentId, body) => client.post(`/admin/verifications/${verificationId}/documents/${documentId}/review`, body).then(({ data }) => data.data)
export const fetchVerificationDocument = (documentId) => client.get(`/suppliers/verification/documents/${documentId}`, { responseType: 'blob' }).then(({ data }) => data)
export const uploadImages = (files, folder, onProgress) => {
  const body = new FormData()
  Array.from(files).forEach((file) => body.append('files', file))
  body.append('folder', folder)
  return client.post('/upload', body, {
    timeout: 120_000,
    onUploadProgress: (event) => {
      if (!event.total) return
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    },
  }).then(({ data }) => data.uploads || data.files || [])
}
export const searchAddressSuggestions = (input) => client.get('/location/autocomplete/search', { params: { input } }).then(({ data }) => data.suggestions || [])
export const resolveAddressSuggestion = (placeId) => client.get('/location/autocomplete/resolve', { params: { placeId } }).then(({ data }) => data.location)
export const reverseAddressCoordinates = (latitude, longitude) => client.get('/location/autocomplete/reverse', { params: { latitude, longitude } }).then(({ data }) => data.location)

export default client
