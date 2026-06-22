import { create } from 'zustand';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  setAuth: (user: AuthUser, token?: string) => void;
  clearAuth: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,

  setAuth: (user, token) => {
    if (typeof window !== 'undefined') {
      // Store user info (non-sensitive) for UI display
      localStorage.setItem('jf_user', JSON.stringify(user));
      // Legacy: if a token is provided (initial login), also store for backward compat
      // until the httpOnly cookie fully replaces it on next login
      if (token) localStorage.setItem('jf_token', token);
    }
    set({ user });
  },

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('jf_token');
      localStorage.removeItem('jf_user');
    }
    set({ user: null });
  },

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('jf_user');
    if (raw) {
      try { set({ user: JSON.parse(raw) }); } catch {}
    }
  },
}));
