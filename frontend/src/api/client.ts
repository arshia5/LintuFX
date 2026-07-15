import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('fx_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// FastAPI returns 422 validation errors as `detail: [{loc, msg, ...}]` (a list of
// objects). The UI reads `err.response.data.detail` as a string, so an object/array
// there would be rendered as a React child and crash the whole page (React error #31).
// Normalize any non-string detail into a readable string here, once, for every request.
function formatErrorDetail(detail: unknown): string {
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object') {
          const loc = Array.isArray((item as { loc?: unknown[] }).loc)
            ? (item as { loc: unknown[] }).loc.filter((p) => p !== 'body').join('.')
            : ''
          const msg = (item as { msg?: string }).msg ?? 'Invalid value'
          return loc ? `${loc}: ${msg}` : msg
        }
        return String(item)
      })
      .join('; ')
  }
  if (detail && typeof detail === 'object') {
    return (detail as { msg?: string }).msg ?? JSON.stringify(detail)
  }
  return String(detail)
}

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('fx_token')
      localStorage.removeItem('fx_user')
      window.location.href = '/login'
    }
    const data = err.response?.data
    if (data && data.detail != null && typeof data.detail !== 'string') {
      data.detail = formatErrorDetail(data.detail)
    }
    return Promise.reject(err)
  }
)
