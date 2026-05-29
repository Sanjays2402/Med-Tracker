import type { ReactNode } from 'react';
export default function Layout({ children }: { children: ReactNode }) {
  return <div data-route="shared_[token]_layout">{children}</div>;
}
