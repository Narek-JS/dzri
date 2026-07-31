import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'dzri',
  description: 'Ձրի իրեր Հայաստանում',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hy" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
