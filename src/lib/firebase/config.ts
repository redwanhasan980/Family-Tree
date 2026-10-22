import { z } from 'zod';

/** Project used with the Emulator Suite. `demo-*` projects need no real Firebase project. */
export const EMULATOR_PROJECT_ID = 'demo-shikor';

const ConfigSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  appId: z.string().min(1),
});

export type FirebaseWebConfig = z.infer<typeof ConfigSchema>;

export interface PublicFirebaseEnv {
  NEXT_PUBLIC_FIREBASE_API_KEY?: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_APP_ID?: string;
  NEXT_PUBLIC_USE_EMULATORS?: string;
}

/**
 * Builds the web SDK config. With emulators, missing values fall back to a demo project
 * so a fresh clone runs without any Firebase account; otherwise every value is required.
 */
export function parseFirebaseConfig(env: PublicFirebaseEnv): {
  config: FirebaseWebConfig;
  useEmulators: boolean;
} {
  const useEmulators = env.NEXT_PUBLIC_USE_EMULATORS === 'true';
  const raw = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY || (useEmulators ? 'demo-api-key' : ''),
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (useEmulators ? 'localhost' : ''),
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (useEmulators ? EMULATOR_PROJECT_ID : ''),
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID || (useEmulators ? 'demo-app-id' : ''),
  };
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(
      `Firebase config is incomplete (${missing}). Set the NEXT_PUBLIC_FIREBASE_* variables or NEXT_PUBLIC_USE_EMULATORS=true.`,
    );
  }
  return { config: result.data, useEmulators };
}
