import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuthStore } from '../store/auth.store';
import '../styles/globals.css';

const PUBLIC_ROUTES = ['/login'];
const CUSTOMER_ROUTES = ['/customer/orders', '/customer/orders/new'];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { hydrate, user } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    const isPublic = PUBLIC_ROUTES.includes(router.pathname);
    const isCustomerRoute = router.pathname.startsWith('/customer/');
    const stored = typeof window !== 'undefined' ? localStorage.getItem('jf_token') : null;
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('jf_user') : null;
    const role = storedUser ? JSON.parse(storedUser).role : null;

    if (!stored && !isPublic) {
      router.replace('/login');
      return;
    }
    if (stored && !isPublic) {
      if (role === 'CUSTOMER' && !isCustomerRoute) {
        router.replace('/customer/orders');
      } else if (role !== 'CUSTOMER' && isCustomerRoute) {
        router.replace('/dashboard');
      }
    }
  }, [router.pathname]);

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
