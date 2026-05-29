import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Med-Tracker',
  description: 'Open source medication adherence tracker.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#2aa06b' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
