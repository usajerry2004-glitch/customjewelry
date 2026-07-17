import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuthStore } from '../store/auth.store';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Toaster } from '../components/Toaster';
import '../styles/globals.css';

const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password'];
const PUBLIC_PREFIXES = ['/track/', '/custom/'];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { hydrate, user } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    const isPublic = PUBLIC_ROUTES.includes(router.pathname) || PUBLIC_PREFIXES.some(p => router.pathname.startsWith(p));
    const isCustomerRoute = router.pathname.startsWith('/customer/');
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('jf_user') : null;
    const role = storedUser ? JSON.parse(storedUser).role : null;

    if (!storedUser && !isPublic) {
      router.replace('/login');
      return;
    }
    if (storedUser && !isPublic) {
      if (role === 'CUSTOMER' && !isCustomerRoute) {
        router.replace('/customer/orders');
      } else if (role !== 'CUSTOMER' && isCustomerRoute) {
        router.replace('/dashboard');
      }
    }
  }, [router.pathname]);

  return (
    <ErrorBoundary>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </Head>
      <Component {...pageProps} />
      <Toaster />
    </ErrorBoundary>
  );
}
