import { MergeDialog } from '@/features/auth/MergeDialog';
import { SessionProvider } from '@/features/auth/SessionProvider';

import type { ReactNode } from 'react';

// One session for the app and the account pages, so moving between them keeps it. The
// merge dialog appears on any of them after a guest signs in to an existing account.
export default function SessionLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <MergeDialog />
    </SessionProvider>
  );
}
