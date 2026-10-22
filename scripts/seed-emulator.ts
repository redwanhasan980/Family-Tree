/**
 * Seeds the local Emulator Suite with demo trees of 10, 150, 500 and 2,000 people (P2-10),
 * owned by a demo account you can log in with.
 *
 * Safety: the emulator hosts are forced before the Admin SDK loads, so this script can
 * never write to a real Firebase project.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

import { personDoc, relationshipFields } from '../src/lib/domain/documents';
import { generateFamily } from '../src/lib/domain/fixtures/generate';
import { DEFAULT_TREE_SETTINGS } from '../src/lib/domain/schemas';
import { paths } from '../src/lib/domain/writes';

const PROJECT_ID = 'demo-shikor';
const DEMO = { email: 'demo@shikor.test', password: 'shikor-demo', displayName: 'Demo' };
const SIZES = [10, 150, 500, 2000];

async function main() {
  const { initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore } = await import('firebase-admin/firestore');

  const app = initializeApp({ projectId: PROJECT_ID }, 'seed');
  const auth = getAuth(app);
  const db = getFirestore(app);

  const user = await auth
    .getUserByEmail(DEMO.email)
    .catch(() => auth.createUser({ ...DEMO, emailVerified: true }));
  const uid = user.uid;
  const now = new Date();

  await db.doc(`users/${uid}`).set({
    isGuest: false,
    email: DEMO.email,
    displayName: DEMO.displayName,
    locale: 'bn',
    theme: 'system',
    selfPersonIds: {},
    onboardingCompleted: true,
    createdAt: now,
    lastActiveAt: now,
    schemaVersion: 1,
  });

  for (const size of SIZES) {
    const treeId = `demo${size}`;
    const { persons, relationships, rootId } = generateFamily({ size });
    await db.recursiveDelete(db.doc(paths.tree(treeId)));

    const writer = db.bulkWriter();
    void writer.set(db.doc(paths.tree(treeId)), {
      name: `নমুনা পরিবার · ${size}`,
      description: `Demo tree with ${size} people`,
      ownerId: uid,
      memberIds: [uid],
      roles: { [uid]: 'owner' },
      rootPersonId: rootId,
      personCount: persons.length,
      settings: { ...DEFAULT_TREE_SETTINGS },
      createdAt: now,
      updatedAt: now,
      updatedBy: uid,
      schemaVersion: 1,
    });
    const stamps = {
      createdAt: now,
      createdBy: uid,
      updatedAt: now,
      updatedBy: uid,
      schemaVersion: 1,
    };
    for (const person of persons)
      void writer.set(db.doc(paths.person(treeId, person.id)), personDoc(person, stamps));
    for (const link of relationships) {
      void writer.set(db.doc(paths.relationship(treeId, link.id)), {
        ...relationshipFields(link),
        ...stamps,
      });
    }
    await writer.close();
    console.warn(`  ${treeId}: ${persons.length} people, ${relationships.length} relationships`);
  }

  console.warn(`Seeded ${PROJECT_ID}. Log in with ${DEMO.email} / ${DEMO.password}`);
}

main().catch((error: unknown) => {
  console.error('Seeding failed. Is `pnpm emulators` running?', error);
  process.exit(1);
});
