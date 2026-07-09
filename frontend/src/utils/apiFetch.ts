const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export { API };

const PUBLIC_PATHS = ['/login', '/track/'];

function isPublicPage() {
  if (typeof window === 'undefined') return true;
  const p = window.location.pathname;
  return PUBLIC_PATHS.some(prefix => p.startsWith(prefix));
}

// Safely extract a display-ready string from an API error response body.
// Backend errors should always be { message: string | string[] }, but this
// defends against any unexpected shape (nested object, null, etc.) so the UI
// never tries to render a raw object as a React child and crash the page.
export function getErrorMessage(data: any, fallback = 'Something went wrong. Please try again.'): string {
  const msg = data?.message ?? data?.error;
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg)) {
    const strs = msg.filter((m: any) => typeof m === 'string');
    if (strs.length) return strs.join(', ');
  }
  return fallback;
}

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  const token = typeof window !== 'undefined' ? localStorage.getItem('jf_token') : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers, credentials: 'include' }).then(res => {
    if (res.status === 401 && !isPublicPage()) {
      localStorage.removeItem('jf_user');
      localStorage.removeItem('jf_token');
      window.location.replace('/login');
    }
    return res;
  });
}
