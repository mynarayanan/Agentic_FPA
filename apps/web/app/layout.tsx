import type { ReactNode } from 'react';

export const metadata = {
  title: 'Finance AI Studio',
  description: 'AI-powered FP&A proof of concept (synthetic data)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: '2rem', maxWidth: 720 }}
      >
        {children}
      </body>
    </html>
  );
}
