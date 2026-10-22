import { SessionProvider } from '@/features/auth/SessionProvider';

import type { ReactNode } from 'react';

// One session for the app and the account pages, so moving between them keeps it.
export default function SessionLayout({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
