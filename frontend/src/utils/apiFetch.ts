// Use the proxy path so API calls work via tunnel (browser → Next.js → backend)
const API = '/api/proxy';

export { API };

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jf_token') : null;
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';
  return fetch(url, { ...options, headers });
}
