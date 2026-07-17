import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function SummaryRedirect() {
  const router = useRouter();
  const { id } = router.query;
  useEffect(() => {
    if (id) router.replace(`/orders/${id}`);
  }, [id, router]);
  return null;
}
