const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export { API };

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jf_token') : null;
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';
  return fetch(url, { ...options, headers });
}
