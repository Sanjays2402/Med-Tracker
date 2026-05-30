import type { Metadata, Viewport } from 'next';
import { Inter_Tight, Fraunces } from 'next/font/google';
import './globals.css';

const sansBody = Inter_Tight({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans-body',
  weight: ['400', '500', '600', '700'],
});

const serifDisplay = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-serif-display',
  axes: ['opsz', 'SOFT'],
});

export const metadata: Metadata = {
  title: 'Med Tracker',
  description: 'A calm, clinical pillbox. Track doses, refills, and adherence.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#faf7f2' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sansBody.variable} ${serifDisplay.variable}`}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
