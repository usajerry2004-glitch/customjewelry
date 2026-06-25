const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export { API };

const PUBLIC_PATHS = ['/login', '/track/'];

function isPublicPage() {
  if (typeof window === 'undefined') return true;
  const p = window.location.pathname;
  return PUBLIC_PATHS.some(prefix => p.startsWith(prefix));
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
