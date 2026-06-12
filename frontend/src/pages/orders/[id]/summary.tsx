import { useEffect } from 'react';
import { useRouter } from 'next/router';

export async function getServerSideProps() { return { props: {} }; }

export default function SummaryRedirect() {
  const router = useRouter();
  const { id } = router.query;
  useEffect(() => {
    if (id) router.replace(`/orders/${id}`);
  }, [id, router]);
  return null;
}
