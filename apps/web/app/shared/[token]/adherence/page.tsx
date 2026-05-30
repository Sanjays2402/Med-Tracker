'use client';

import { useParams } from 'next/navigation';
import { redirect } from 'next/navigation';

export default function SharedAdherence() {
  const routed = useParams<{ token: string }>();
  redirect(`/shared/${routed?.token ?? ''}`);
}
