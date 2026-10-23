import { AuthGate } from '@/features/auth/AuthGate';

import type { ReactNode } from 'react';

// The editor fills the screen with its own header (DESIGN §21.6); it still needs a user.
export default function EditorLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
