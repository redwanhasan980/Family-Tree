import type { ReactNode } from 'react';

// Pass-through root layout: <html> and <body> are rendered per locale in app/[locale]/layout.tsx.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
