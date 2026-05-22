import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../store/auth.store';
import '../styles/globals.css';

const PUBLIC_ROUTES = ['/login'];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { hydrate, user } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    const isPublic = PUBLIC_ROUTES.includes(router.pathname);
    if (!user && !isPublic) {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('jf_token') : null;
      if (!stored) router.replace('/login');
    }
  }, [user, router.pathname]);

  return <Component {...pageProps} />;
}
