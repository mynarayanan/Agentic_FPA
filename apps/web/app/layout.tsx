import type { ReactNode } from 'react';
import { NavLinks } from '../components/NavLinks';
import { TokenField } from '../components/TokenField';
import './globals.css';

export const metadata = {
  title: 'Finance AI Studio',
  description: 'AI-powered FP&A proof of concept (synthetic data)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="banner">
          Proof of concept on synthetic data. Not connected to any financial system.
        </div>
        <header className="topbar">
          <span className="brand">Finance AI Studio</span>
          <NavLinks />
          <TokenField />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
