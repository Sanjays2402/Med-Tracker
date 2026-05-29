import type { ReactNode } from 'react';
export default function Layout({ children }: { children: ReactNode }) {
  return <div data-route="(marketing)_layout">{children}</div>;
}
