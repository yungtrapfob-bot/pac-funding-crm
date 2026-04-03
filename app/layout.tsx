import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Paragon Arm',
  description: 'Internal CRM for Paragon Alternative Capital'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
