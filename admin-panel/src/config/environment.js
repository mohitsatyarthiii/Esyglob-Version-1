const API_BASE_URL_KEY = 'VITE_API_BASE_URL'

function normalizeApiBaseUrl(value) {
  const candidate = String(value || '').trim().replace(/\/+$/, '')

  if (!candidate) throw new Error(`${API_BASE_URL_KEY} is required.`)

  if (candidate.startsWith('/')) {
    if (!candidate.startsWith('/api') || candidate.includes('?') || candidate.includes('#')) {
      throw new Error(`${API_BASE_URL_KEY} must be an API path such as /api.`)
    }
    return candidate
  }

  let url
  try {
    url = new URL(candidate)
  } catch {
    throw new Error(`${API_BASE_URL_KEY} must be a valid URL or an /api path.`)
  }

  if (url.protocol !== 'https:') {
    throw new Error(`${API_BASE_URL_KEY} must use HTTPS. Use the /api development proxy for a local backend.`)
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${API_BASE_URL_KEY} cannot contain credentials, a query, or a fragment.`)
  }

  return candidate
}

let cachedEnvironment
let cachedError

export function getEnvironment() {
  if (cachedEnvironment) return cachedEnvironment
  if (cachedError) throw cachedError

  try {
    cachedEnvironment = Object.freeze({
      apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
      isProduction: import.meta.env.PROD,
    })
    return cachedEnvironment
  } catch (error) {
    cachedError = error
    throw error
  }
}

export function validateEnvironment() {
  try {
    return { environment: getEnvironment(), error: null }
  } catch (error) {
    return { environment: null, error }
  }
}
