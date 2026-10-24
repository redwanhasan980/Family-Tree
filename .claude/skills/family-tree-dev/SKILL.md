---
name: family-tree-dev
description: Project playbook for building শিকড় (Shikor), the family-tree app in this repo (Next.js 16 + Firebase + Cloudinary, bilingual bn/en). Use when implementing, changing or reviewing any feature in this repo, including data model or Firestore rules changes, commands/undo, views (tree, family card, circle, list, album, timeline), export and the family book, photo upload, translations, Route Handlers, and verifying UI on mobile and desktop.
---

# শিকড় development playbook

This skill holds the repeatable workflows for this repository. The *why* lives in `docs/DESIGN.md`, the *what* in `docs/SRS.md`, and the *order of work* in `docs/IMPLEMENTATION_PLAN.md`. The non-negotiable rules are in `CLAUDE.md`. Follow them.

## 0. Orient (every task)

1. Find the task in `docs/IMPLEMENTATION_PLAN.md` (for example `P4-07`) and the SRS IDs it lists.
2. Read the referenced DESIGN sections. If the design doesn't cover what you're about to build, **update DESIGN first**, or ask the product owner when it changes product behaviour, data shape, cost or security.
3. Check that the phase dependencies are done. Work on `main` with small, frequent commits and push after each logical step (owner's choice); create a `feat/<task-id>-<slug>` branch only when asked.

## 1. Feature workflow (end to end)

Work from the inside out, so each layer is tested before the next one depends on it:

1. **Domain** (`src/lib/domain/**`): types, Zod schema and pure functions, with unit tests first. No React, Firebase or DOM.
2. **Data** (only when the shape changes): converters, repository functions, `firestore.rules`, rules tests, DESIGN §6–8 (see §2 below).
3. **Command** (when it mutates data): forward and inverse operations, validation, history label (see §3).
4. **State**: store slices and selectors; memoize derived data.
5. **UI** (`src/features/<feature>/`): components and hooks; every string goes through `useTranslations` (see §4).
6. **Server** (only when privileged): a Route Handler from the template in §5.
7. **Verify** (see §8): tests, both locales, both form factors, both themes.
8. **Document** (see §9): README, DESIGN, plan checkboxes, CHANGELOG.

## 2. Recipe: change the data model

Change all of these **in one PR**:

- [ ] `src/lib/domain/types.ts` (the type)
- [ ] `src/lib/domain/schemas.ts` (the Zod schema with limits from SRS §6.2)
- [ ] `src/lib/firebase/converters.ts` (read and write mapping; upgrade old `schemaVersion` documents on read)
- [ ] `firebase/firestore.rules`: add the field to the `hasOnly([...])` allow-list and its validator
- [ ] `firebase/tests/*`: allow and deny tests for the new field (valid, too long, wrong type, wrong role)
- [ ] `firebase/firestore.indexes.json` if it is queried, **or** a field exemption if it is long text
- [ ] DESIGN §6 (types), §7 (documents) and §8 (rules)
- [ ] Fixture generator (`scripts/seed-emulator.ts`) if fixtures should exercise the field

Rules to remember:

- Relationship IDs are always built through `lib/domain/ids.ts`, and rules check them.
- Rules cannot check graph integrity (the limit is 20 `get` calls per batch). Put that in `lib/domain/graph/validate.ts`.
- Use field-path `update`s for edits. Never `set` an entire existing document, because that clobbers collaborators' changes.

## 3. Recipe: add a mutation (Command)

Builders are **pure**: they read `ctx.graph`/`ctx.tree` and return writes as plain data (`WriteOp` from `lib/domain/writes.ts`, with `SERVER_TIME`, `increment(n)` and `DELETE_FIELD`). Put them in `src/features/editor/commands/{person,relationship,tree}Commands.ts` and use the helpers in `build.ts`. The real `addSpouse`:

```ts
export function addSpouse(ctx: CommandContext, personId: ID, input: NewPersonInput, { status = 'married' } = {}): BuildResult {
  if (!ctx.graph.persons.has(personId)) return fail('missingPerson');      // errors block
  const parsed = parsePeople([input]);                                     // Zod, i18n error keys
  if (!parsed.ok) return failWith(parsed.issues);
  const limits = capacity(ctx, 1);                                         // hard limit = error, soft = warning
  if (errorsIn(limits).length > 0) return failWith(limits);

  const id = ctx.newId();
  const link = spouseLink(personId, id, status, nextMarriageSequence(ctx.graph, personId));
  const forward = [createPerson(ctx, id, parsed.people[0]!), createLink(ctx, link), touchTree(ctx, 1)];
  const inverse = [remove(linkPath(ctx, link.id)), remove(personPath(ctx, id)), touchTree(ctx, -1)];
  return ok({ id: commandId(), labelKey: 'addSpouse', forward, inverse, touched: touchedPaths(forward), createdIds: [id] }, limits);
}
```

The UI shows `warnings` (dates, possible duplicates) for confirmation. In the editor it runs commands with `useEditor().run((ctx) => addSpouse(ctx, personId, input))` (`features/editor/EditorProvider.tsx`): that builds the context from the open tree, runs a valid command through the executor without awaiting it, and returns the `BuildResult` for the UI.

Checklist:

- [ ] Validate against the **current graph** first (`lib/domain/graph/validate.ts`). Return issues with i18n codes; never throw.
- [ ] The inverse restores the **exact** prior state: previous values for updates (`DELETE_FIELD` for absent fields), `restorePerson`/`restoreLink` (original `createdAt`) for deletes, the opposite `increment` for `personCount`.
- [ ] Edits use field-path `update`s (`'names.en'`), never whole-document `set`.
- [ ] At most 450 operations per command (`MAX_BATCH_OPS`). Bigger jobs (imports) use `commitInChunks` and are not undoable.
- [ ] Unit test in `commands.test.ts` with `MemoryDb` and `roundTrip()` (do → undo → redo), plus the validation branches.
- [ ] Add it to `commands.emulator.test.ts` so the security rules check its writes (`pnpm test:rules`).
- [ ] Add the `history.*` label and any new issue codes to both message files when the UI first shows them.

## 4. Recipe: UI strings & Bangla

- The product name is never a translated string: insert `{appName}` and pass `APP_NAME` (always শিকড়), or render `<AppName />`.
- Add the key to **both** `messages/en.json` and `messages/bn.json` under the right namespace (`editor`, `person`, `relations`, `views`, `export`, …). Run `pnpm i18n:check`.
- Use ICU for counts: `"{count, plural, one {# person} other {# people}}"`. In Bangla, `other` alone is usually enough (`"{count, plural, other {#জন}}"`). Digits become Bangla automatically through the `bn-BD` number format.
- Use the glossary in SRS Appendix A (বংশতালিকা, প্রজন্ম, জীবনসঙ্গী, প্রয়াত, ডাকনাম …), the polite "আপনি" form, and a warm tone. Gendered relationship words must match (ছেলে/মেয়ে, স্বামী/স্ত্রী, বাবা/মা).
- Format dates and life spans with `lib/domain/dates.ts`, and names with `lib/domain/names.ts` (`displayName`, `initials`). Never hand-roll them.
- Never truncate with `.slice()`. Use the grapheme helpers in `lib/domain/text.ts`, or CSS/SVG ellipsis via the measure cache.
- Bangla text blocks need `leading-relaxed` (≥ 1.6) and no `tracking-*`.

## 5. Recipe: Route Handler (server)

```ts
// src/app/api/<area>/<action>/route.ts
import { z } from 'zod';

import { getAdminDb } from '@/lib/firebase/admin';
import { verifyRequest } from '@/lib/server/auth';
import { HttpError, json, readJson, route } from '@/lib/server/http';

const Body = z.strictObject({ treeId: z.string().min(1).max(64) }); // unknown keys → 400

// route() turns HttpError into { error: { code, message } } and anything else into 500 "internal".
export const POST = route('trees.example', async (req) => {
  const { uid } = await verifyRequest(req); // ID token + App Check; add { allowGuest: true } if guests may call it
  const body = await readJson(req, Body);
  const tree = await getAdminDb().doc(`trees/${body.treeId}`).get();
  if (!tree.exists) throw new HttpError('not_found', 'No such tree.');
  if (tree.get(`roles.${uid}`) !== 'owner') throw new HttpError('forbidden');
  // ... privileged work; make it idempotent ...
  return json({ ok: true });
});
```

`HttpError(code, message?)` takes its status from the code (`ERROR_STATUS` in `lib/server/http.ts`). Messages are for developers: never put user data in them.

Checklist: idempotent (safe to retry); bounded work per request (batch through lists); a rate limit for endpoints that cost money or are sensitive (`enforceRateLimit` in `lib/server/rateLimit.ts`); no PII in logs; add the endpoint to the DESIGN §10.2 table; API tests against the emulator.

Shared request schemas and response types live in `src/lib/domain` (for example `account.ts`), so the browser and the handler agree. The browser calls the endpoint with `callApi()` from `lib/repositories/api.ts`, which adds the ID and App Check tokens and throws `ApiError(code)`; `useApiErrorText()` turns it into a message.

API tests: a `route.emulator.test.ts` (or `<area>.emulator.test.ts`) next to the handler calls the exported `POST`/`DELETE` directly with `apiRequest(path, { user, body })` and users from `lib/server/testing/authEmulator.ts` (`createGuestUser`, `createEmailUser`, `linkEmail`, `clearAuthEmulator`), which are real Auth emulator tokens. Check the response *and* what the Admin SDK sees in Firestore and Auth afterwards. Run with `pnpm test:rules`.

## 6. Recipe: view work (Tree, Family card, Circle, List, Album, Timeline)

- **Pick the kind of view (ADR-013).** *Canvas views* (Tree, Circle, Timeline) render **SVG** with the shared camera and never use `foreignObject`, so export can serialize them directly. *Card views* (Family card, List, Album) are plain **HTML/CSS** with native scrolling, exported through html-to-image.
- Keep the **model and layout pure** (`lib/domain/...` or `features/views/<view>/layout.ts`): input from the graph or `DescNode`, output a view model or positions. Snapshot-test it on the fixtures (10, 150, 500 people, cousin marriage, multiple spouses, partial dates).
- In SVG, measure text with the shared canvas measure cache. In HTML, use CSS line clamping and grapheme-safe helpers.
- **Focus and selection** live in `uiStore` and are shared by every view. The Family card moves with `goToFamily` (`views/family/goToFamily.ts`), which sets `uiStore.familyId`, selects the person, leaves a reveal request (so other views centre on them without re-rooting) and adds a history entry (`window.history.pushState`, `?view=family&person=`); `EditorShell`'s `popstate` listener reads it back, so browser Back works. Use the same pattern for any view that navigates.
- **Staged views** must check their flag in `lib/features.ts` (ADR-014).
- **Camera:** use the shared d3-zoom hook. Apply the transform through a ref; update React state only on zoom end (culling).
- **Colour:** take it from `views/shared/colors.ts` (branch, gender, generation, none; DESIGN §21.3). Never cycle hues. Branches 9 and up are neutral "Other". Text uses ink tokens, never the data colour.
- **Interactions:** each one needs a desktop **and** a mobile path (DESIGN §13.3 table). Long-press or right-click menus must have a button alternative.
- **Read-only mode:** respect `editable={false}` (viewers and share links).
- **Export scenes:** each view has a scene in `features/export/scenes/` (Tree, Circle: SVG in `SceneFrame`; Family sheet, List pages: HTML) that reuses the view's own drawing parts (`PersonCard`, `Connectors`, `ArcFor`, `CentreDisc`, `useLegendEntries`) at full bounds, without buttons or empty "+ add" slots. If you change one of those parts or add a visual element, export the view (PNG and PDF, `bn` and `en`) and look at it. Colours must be CSS variables from the tokens (the stage's `[data-export]` makes them light; `themeCss` copies them into the SVG), and photos must come through `photoUrl(photo, 'export')`.
- **Descendant views** (Tree, List, Circle) get their people from `useDescendantView(view)` and answer search with `useRevealRequest(view, …)` (`views/shared/`), so the start, focus, default depth and reveal behave the same everywhere. Each view keeps its own `collapsed` keys.
- **Accessible names:** an element with a widget role (`treeitem`, `button`, …) and an `aria-label` must contain all of its visible text, or axe fails `label-content-name-mismatch`. Rows with controls inside take their name from content instead: hide decoration with `aria-hidden` (inner controls `tabIndex=-1`) and add screen-reader-only words.
- **Search and keys:** honour `uiStore.revealRequest` (open the way to the person, centre, select, then `revealDone()`), keep a roving tabindex on cards, and route any new window key handler through `acceptsShortcuts` and `editorShortcut` (`features/editor/shortcuts.ts`) so typing, dialogs and Bangla layouts keep working. Dialogs opened from code get focus back through `components/ui/returnFocus.ts`; open them through the store rather than managing focus by hand.
- **Performance:** check against the 500-person fixture at 4× CPU throttle with `pnpm bench:tree` (method and baseline in `docs/PERFORMANCE.md`). Animations switch off above 300 cards and with reduced motion. Memoize per-item components and anything that isn't culled (the Tree's connector layer), and create `Intl` formatters once, not per item.

## 7. Recipe: photos (Cloudinary)

- The client never holds the API secret. Flow (`features/media/PhotoDialog.tsx`, `upload.ts`): pick → crop (`react-easy-crop`) → `cropToBlob` (canvas, square JPEG ≤ 1600 px) → `POST /api/media/sign` → upload directly to Cloudinary (XHR with progress and abort) → the `setPersonPhoto` command sets `person.photo = { publicId, version, width, height }` (or `null` to remove).
- Server side, `lib/server/cloudinary.ts` signs and deletes with `fetch` against Cloudinary's REST API (no SDK); `lib/server/media.ts` checks the role (owner or editor) and rate limits. Without the keys the routes answer `503 unavailable`.
- Build URLs only with `features/media/cloudinaryUrl.ts` (variants `thumb`, `card`, `full`, `export`). **Don't add variants casually**, because each one consumes transformation credits. Show photos with `Avatar` and respect the tree's `showPhotos` setting through `useShownPhoto`; without `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `photosEnabled()` is false and the UI hides photo buttons.
- `publicId` has the form `shikor/{env}/{treeId}/{personId}/{random}` (`lib/domain/media.ts`: `photoId`, `parsePhotoId`), and the rules, the command and `/api/media/delete` all check it.
- Never delete a photo directly. `EditorProvider` queues every photo a command, undo or redo takes away (`features/media/photoCleanup.ts`) and deletes it once no person and no history step has it; the server keeps photos that are in use again. Tree, account and merge-discard deletions call `deleteTreePhotos` (prefix deletion) from `recursiveDeleteTree`.
- In tests: Route Handlers stub `fetch` for `api.cloudinary.com` (`app/api/media/media.emulator.test.ts`); E2E mocks the upload and `res.cloudinary.com` with `page.route` (`e2e/photos.spec.ts`). The E2E build needs some `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (CI uses `e2e-cloud`; set it yourself for `pnpm build`), and the Playwright web server passes test keys with `APP_ENV=test`.

## 8. Verification

Run locally before every commit and push (the pre-commit hook runs lint-staged; CI runs everything):

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm i18n:check
pnpm test:rules          # when rules, repositories or commands changed (rules + *.emulator.test.ts)
pnpm test:e2e            # when user flows changed (runs mobile + desktop projects)
```

Then check the UI manually or with Playwright screenshots. Run `pnpm dev` with `pnpm emulators` and `pnpm seed`, then capture:

| Viewport | Locales | Themes |
| --- | --- | --- |
| 360 × 740 (mobile) | `/bn/...` and `/en/...` | light + dark |
| 1440 × 900 (desktop) | `/bn/...` and `/en/...` | light + dark |

Look for clipped Bangla vowel signs, overflowing names, touch targets under 44 px, focus rings, empty and loading states, and offline behaviour (DevTools → Offline). Check that a reload keeps the data. A UI change isn't done until it has been seen working on both form factors.

## 8a. Deployment changes (Dockerfile, `deploy/`, workflows)

- Hosting is the owner's VPS (DESIGN §27.4, docs/DEPLOYMENT.md). Never ask for or accept server passwords.
- Shell scripts: `shellcheck deploy/*.sh`. Workflows: `actionlint .github/workflows/*.yml`.
- Image: `BUILD_STANDALONE=1 pnpm build`, then run the runtime stage in Docker and check `/api/health`, `/`, `/bn` and a static asset. CI's `image` job builds the full Dockerfile.
- `deploy.sh` must keep its rollback behaviour. Test it locally with two image tags (a good one and one that exits) using `SKIP_PULL=1 SKIP_CONFIG_SYNC=1 APP_DIR=<tmp>`.
- New `NEXT_PUBLIC_*` variable? Add it to the Dockerfile `ARG`/`ENV` lists, the `Deploy` workflow `build-args`, `.env.example` and DEPLOYMENT.md §3 Step 6.

## 9. Documentation & wrap-up

- [ ] `README.md`: update the feature table, the project status table and any setup steps that changed.
- [ ] `docs/IMPLEMENTATION_PLAN.md`: tick the task checkbox(es).
- [ ] `docs/DESIGN.md`: update it if the implementation diverged from it, or add an ADR entry in §4 for any new decision.
- [ ] `CHANGELOG.md`: add user-facing changes under *Unreleased*.
- [ ] `CLAUDE.md`: update the "Current status" line when a phase completes; add new gotchas you discovered.
- [ ] Commit with Conventional Commits, mentioning the task and SRS IDs in the body.

## 10. Common pitfalls (quick list)

- Importing `firebase/*` in a component → use a repository.
- Awaiting `batch.commit()` before updating the UI → the UI hangs offline.
- Whole-document `set` on edit → clobbers collaborators; use field-path `update`.
- `string.slice(0, 1)` for initials → breaks Bangla conjuncts; use `initials()`.
- Using jsPDF `text()` for names → broken Bangla; rasterize the SVG instead.
- Collapsing by person ID → breaks with cousin-marriage references; use path keys.
- New UI string only in `en.json` → CI fails `i18n:check`.
- Adding a per-person Firestore read or a count query → burns the free-tier quota; use the tree store and `personCount`.
