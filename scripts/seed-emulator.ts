/**
 * Seeds the local Emulator Suite with fixture data (P0-16 skeleton; fixtures arrive in P2-10).
 *
 * Safety: the emulator hosts are forced before the Admin SDK loads, so this script can
 * never write to a real Firebase project.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const PROJECT_ID = 'demo-shikor';

async function main() {
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  const app = initializeApp({ projectId: PROJECT_ID }, 'seed');
  const db = getFirestore(app);

  await db.doc('_meta/seed').set({ seededAt: FieldValue.serverTimestamp(), fixtures: [] });
  console.warn(
    `Seeded ${PROJECT_ID} at ${process.env.FIRESTORE_EMULATOR_HOST}. Fixture trees arrive in P2-10.`,
  );
}

main().catch((error: unknown) => {
  console.error('Seeding failed. Is `pnpm emulators` running?', error);
  process.exit(1);
});
