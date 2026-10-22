---
name: family-tree-dev
description: Project playbook for building Shikor (শিকড়), the family-tree app in this repo (Next.js 16 + Firebase + Cloudinary, bilingual bn/en). Use when implementing, changing or reviewing any feature in this repo, including data model or Firestore rules changes, commands/undo, views (tree, family card, circle, list, album, timeline), export and the family book, photo upload, translations, Route Handlers, and verifying UI on mobile and desktop.
---

# Shikor development playbook

This skill holds the repeatable workflows for this repository. The *why* lives in `docs/DESIGN.md`, the *what* in `docs/SRS.md`, and the *order of work* in `docs/IMPLEMENTATION_PLAN.md`. The non-negotiable rules are in `CLAUDE.md`. Follow them.

## 0. Orient (every task)

1. Find the task in `docs/IMPLEMENTATION_PLAN.md` (for example `P4-07`) and the SRS IDs it lists.
2. Read the referenced DESIGN sections. If the design doesn't cover what you're about to build, **update DESIGN first**, or ask the product owner when it changes product behaviour, data shape, cost or security.
3. Check that the phase dependencies are done. Create a branch: `feat/p4-07-bulk-add-children`.

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

```ts
// src/features/editor/commands/addSpouse.ts
import type { Command } from './types';
import { spouseLinkId } from '@/lib/domain/ids';
import { canLinkSpouses } from '@/lib/domain/graph/validate';

export function addSpouseCommand(ctx: CommandContext, personId: ID, input: NewPersonInput): Command | Issue[] {
  const issues = canLinkSpouses(ctx.graph, personId, /* new */ null);
  if (issues.some((i) => i.severity === 'error')) return issues;

  const newId = ctx.newPersonId();
  const linkId = spouseLinkId(personId, newId);
  const stamp = ctx.stamp(); // { updatedAt: serverTimestamp(), updatedBy: uid, ... }

  return {
    id: ctx.newCommandId(),
    labelKey: 'history.addSpouse',
    labelValues: { name: input.displayName },
    forward: [
      { op: 'set', path: ctx.personPath(newId), data: ctx.newPersonDoc(input, stamp) },
      { op: 'set', path: ctx.relPath(linkId), data: ctx.spouseDoc(personId, newId, stamp) },
      { op: 'update', path: ctx.treePath(), data: { personCount: ctx.increment(1), ...stamp } },
    ],
    inverse: [
      { op: 'delete', path: ctx.relPath(linkId) },
      { op: 'delete', path: ctx.personPath(newId) },
      { op: 'update', path: ctx.treePath(), data: { personCount: ctx.increment(-1), ...stamp } },
    ],
    touched: [{ path: ctx.personPath(newId) }, { path: ctx.relPath(linkId) }],
  };
}
```

Checklist:

- [ ] Validate against the **current graph** first. Return `Issue[]` (with i18n codes) instead of throwing.
- [ ] The inverse restores the **exact** prior state. For `update`, capture the previous field values and use `deleteField()` for fields that were absent.
- [ ] At most 450 operations per command. Bigger jobs (imports) use chunked batches and are not undoable.
- [ ] Add the `history.*` label key to both message files.
- [ ] Test do → undo → redo against the emulator. Unit-test the validation branches.
- [ ] Do **not** `await` the batch commit before updating the UI. Surface commit failures with a toast.

## 4. Recipe: UI strings & Bangla

- Add the key to **both** `messages/en.json` and `messages/bn.json` under the right namespace (`editor`, `person`, `relations`, `views`, `export`, …). Run `pnpm i18n:check`.
- Use ICU for counts: `"{count, plural, one {# person} other {# people}}"`. In Bangla, `other` alone is usually enough (`"{count, plural, other {#জন}}"`). Digits become Bangla automatically through the `bn-BD` number format.
- Use the glossary in SRS Appendix A (বংশতালিকা, প্রজন্ম, জীবনসঙ্গী, প্রয়াত, ডাকনাম …), the polite "আপনি" form, and a warm tone. Gendered relationship words must match (ছেলে/মেয়ে, স্বামী/স্ত্রী, বাবা/মা).
- Format dates and life spans with `lib/domain/dates.ts`, and names with `lib/domain/names.ts` (`displayName`, `initials`). Never hand-roll them.
- Never truncate with `.slice()`. Use the grapheme helpers in `lib/domain/text.ts`, or CSS/SVG ellipsis via the measure cache.
- Bangla text blocks need `leading-relaxed` (≥ 1.6) and no `tracking-*`.

## 5. Recipe: Route Handler (server)

```ts
// src/app/api/<area>/<action>/route.ts
import 'server-only';
import { z } from 'zod';
import { verifyRequest } from '@/lib/server/auth';
import { json, handleError, HttpError } from '@/lib/server/http';
import { adminDb } from '@/lib/firebase/admin';

const Body = z.object({ treeId: z.string().min(1).max(64) }).strict();

export async function POST(req: Request) {
  try {
    const { uid } = await verifyRequest(req, { allowGuest: false }); // ID token + App Check
    const body = Body.parse(await req.json());
    const tree = await adminDb.doc(`trees/${body.treeId}`).get();
    if (!tree.exists) throw new HttpError(404, 'tree_not_found');
    if (tree.get(`roles.${uid}`) !== 'owner') throw new HttpError(403, 'forbidden');
    // ... privileged work; make it idempotent ...
    return json({ ok: true });
  } catch (err) {
    return handleError(err); // maps ZodError→400, HttpError→status, else 500 {error:{code,message}}
  }
}
```

Checklist: idempotent (safe to retry); bounded work per request (batch through lists); a rate limit for endpoints that cost money (`lib/server/rateLimit.ts`); no PII in logs; add the endpoint to the DESIGN §10.2 table; API tests against the emulator.

## 6. Recipe: view work (Tree, Family card, Circle, List, Album, Timeline)

- **Pick the kind of view (ADR-013).** *Canvas views* (Tree, Circle, Timeline) render **SVG** with the shared camera and never use `foreignObject`, so export can serialize them directly. *Card views* (Family card, List, Album) are plain **HTML/CSS** with native scrolling, exported through html-to-image.
- Keep the **model and layout pure** (`lib/domain/...` or `features/views/<view>/layout.ts`): input from the graph or `DescNode`, output a view model or positions. Snapshot-test it on the fixtures (10, 150, 500 people, cousin marriage, multiple spouses, partial dates).
- In SVG, measure text with the shared canvas measure cache. In HTML, use CSS line clamping and grapheme-safe helpers.
- **Focus and selection** live in `uiStore` and are shared by every view. Changing the focus pushes `?view=&focus=` so browser Back works.
- **Staged views** must check their flag in `lib/features.ts` (ADR-014).
- **Camera:** use the shared d3-zoom hook. Apply the transform through a ref; update React state only on zoom end (culling).
- **Colour:** take it from `views/shared/colors.ts` (branch, gender, generation, none; DESIGN §21.3). Never cycle hues. Branches 9 and up are neutral "Other". Text uses ink tokens, never the data colour.
- **Interactions:** each one needs a desktop **and** a mobile path (DESIGN §13.3 table). Long-press or right-click menus must have a button alternative.
- **Read-only mode:** respect `editable={false}` (viewers and share links).
- **Export mode:** the view must render with `mode="export"` (full bounds or fixed page frames, no buttons or empty "+ add" slots, header and legend slots). If you add a visual element, make sure the export still looks right.
- **Performance:** check against the 500-person fixture at 4× CPU throttle. Animations switch off above 300 cards and with reduced motion.

## 7. Recipe: photos (Cloudinary)

- The client never holds the API secret. Flow: pick → crop → compress → `POST /api/media/sign` → upload directly to Cloudinary (XHR with progress) → command updates `person.photo = { publicId, version, width, height }`.
- Build URLs only with `features/media/cloudinaryUrl.ts` (variants `thumb`, `card`, `full`, `export`). **Don't add variants casually**, because each one consumes transformation credits.
- `publicId` has the form `shikor/{env}/{treeId}/{personId}/{random}`, and both the rules and `/api/media/delete` check that prefix.
- Delete the old photo **after** the undo window. Tree, account and merge-discard deletions use prefix deletion on the server.
- In tests, mock Cloudinary with Playwright `page.route('https://api.cloudinary.com/**', …)`.

## 8. Verification

Run locally before every PR:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm i18n:check
pnpm test:rules          # when rules or data access changed
pnpm test:e2e            # when user flows changed (runs mobile + desktop projects)
```

Then check the UI manually or with Playwright screenshots. Run `pnpm dev` with `pnpm emulators` and `pnpm seed`, then capture:

| Viewport | Locales | Themes |
| --- | --- | --- |
| 360 × 740 (mobile) | `/bn/...` and `/en/...` | light + dark |
| 1440 × 900 (desktop) | `/bn/...` and `/en/...` | light + dark |

Look for clipped Bangla vowel signs, overflowing names, touch targets under 44 px, focus rings, empty and loading states, and offline behaviour (DevTools → Offline). Check that a reload keeps the data. A UI change isn't done until it has been seen working on both form factors.

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
