'use client';

import { useParams, redirect } from 'next/navigation';

export default function SharedRefills() {
  const routed = useParams<{ token: string }>();
  redirect(`/shared/${routed?.token ?? ''}`);
}
