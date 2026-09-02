import axios from 'axios'

/**
 * Extracts a human-readable message from an API error, matching the backend's
 * {error:{code,message}} envelope. Priority order:
 *   1. The backend's own structured error message (error.response.data.error.message) —
 *      used whenever a response was actually received, regardless of status code (400,
 *      403, 404, 409, 500, ...).
 *   2. A clear "couldn't reach the server" message — ONLY when no response was received
 *      at all (axios error.response is undefined: DNS/connection failure, CORS block,
 *      timeout). This is the sole generic-fallback path; it must never fire for a request
 *      that got a real HTTP response, structured or not.
 *   3. A final catch-all for non-Axios errors (e.g. a thrown value that isn't even an
 *      AxiosError, such as an error from a request interceptor).
 */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error?.message
    if (typeof message === 'string' && message.length > 0) {
      return message
    }
    if (error.response) {
      // A response came back but didn't match our envelope shape — surface the status
      // rather than silently falling through to a network-failure-flavored message.
      return `Request failed (status ${error.response.status}).`
    }
    return 'Unable to reach the server. Please check your connection and try again.'
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
