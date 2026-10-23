# CLAUDE.md

Guidance for Claude (and humans) working in this repository. Read it at the start of every session.

## Project in one paragraph

**শিকড়** (pronounced *Shikor*, meaning "roots") is a bilingual (বাংলা / English) web app for building family trees. The repository is still named `Family-Tree`. Ease of use is the top priority. Visitors start immediately as a **guest** (Firebase anonymous auth); every edit is saved to Firestore and survives reloads. Guests can later sign up with email or Google without losing data. People and relationships (parent→child and spouse) are stored in Firestore and shown in several views: **Tree**, **Family card**, **Circle** and **List** in v1.0; **Generation album** in v1.1; **Timeline** in v1.2. Every view exports as PNG or PDF, and v1.2 adds a printable **Family book**. Photos live on **Cloudinary**. The app is **Next.js full-stack**: there is no separate Express server, and privileged logic runs in Next.js Route Handlers with the Firebase Admin SDK.

## Source of truth

| Need | Read |
| --- | --- |
| *What* to build (requirement IDs such as `REL-04`) | `docs/SRS.md` |
| *How* it is built (architecture, data model, rules, UI system) | `docs/DESIGN.md` |
| *What to do next* (phases and task IDs such as `P4-07`) | `docs/IMPLEMENTATION_PLAN.md` |
| Step-by-step workflows and recipes | `.claude/skills/family-tree-dev/SKILL.md` |
| Setup and status for humans | `README.md` |

**Current status:** **Phases 0–5 are complete** (foundation, VPS deployment pipeline, authentication and guest sessions, domain core with the graph engine, security rules, repositories, stores and undoable commands, the dashboard, the editor shell, the guest merge and account deletion, the Tree view with quick add, bulk children, relationship editors, search, undo/redo and keyboard shortcuts, and full person details with "This is me" and Cloudinary photos). The first deploy (P0-17), the iOS Safari redirect check (P1-05) and checking photos in a real Cloudinary account wait for the owner's server, domain and keys. **Next: Phase 6** (List, Circle and Family card views). Update this line when phases complete.

## Tech stack (pinned in package.json once scaffolded)

Next.js 16 (App Router, `src/`, `src/proxy.ts` = Next 16 middleware) · React 19 · TypeScript 6.0.x strict (not 7 until typescript-eslint supports it) · ESLint 9 (not 10 until the React/import/a11y plugins support it) · Tailwind CSS 4 + shadcn/ui · motion · Zustand · Zod 4 · react-hook-form · next-intl 4 · d3-hierarchy / d3-flextree / d3-shape / d3-zoom / d3-scale · html-to-image + jsPDF · Firebase JS SDK 13 / firebase-admin 14 · Cloudinary (REST from Route Handlers, no SDK) · react-easy-crop · Serwist (R2) · Vitest · Playwright · pnpm · Node 22.

## Commands

Use `pnpm`, never npm or yarn. Local work needs no Firebase account: `cp .env.example .env.local` turns on the emulators.

```bash
pnpm dev            # Next.js dev server (http://localhost:3000/bn or /en)
pnpm emulators      # Firebase Auth + Firestore emulators (run alongside dev)
pnpm seed           # demo trees (10–2,000 people) for demo@shikor.test / shikor-demo
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write
pnpm format:check   # prettier --check (CI)
pnpm test           # vitest (unit + component)
pnpm test:coverage  # vitest with the domain coverage gate (CI)
pnpm test:rules     # rules tests + *.emulator.test.ts integration tests (runs firebase emulators:exec)
pnpm test:e2e       # playwright (mobile + desktop); starts the emulators itself; run pnpm build first
pnpm i18n:check     # en/bn message key parity
pnpm bench:tree     # Tree view benchmark (needs emulators, seed, pnpm build && pnpm start --port 3100)
pnpm build          # production build
```

Before every commit, run `pnpm typecheck && pnpm lint && pnpm test && pnpm i18n:check`. If you changed the rules, repositories or commands, also run `pnpm test:rules`.

## Architecture map

```text
src/app/[locale]/...        pages (landing, (auth), (app)/trees, s/[shareId])
src/app/api/...             Route Handlers (server only; Admin SDK, Cloudinary)
src/features/<feature>/     UI + hooks per feature (auth, trees, editor, person, views/*, export, media, ...)
src/lib/domain/             PURE TypeScript: types, zod schemas, graph engine, names/dates, kinship, gedcom
src/lib/repositories/       the ONLY client code that touches Firebase (Firestore data, Auth flows in auth.ts)
src/lib/firebase/           client.ts (SDK init, persistent cache) · admin.ts (server-only)
src/lib/server/             verifyRequest, http errors, cloudinary, treeAdmin, rate limit
src/stores/                 Zustand: treeStore, uiStore, historyStore, prefsStore
messages/{en,bn}.json       all UI strings
firebase/                   firestore.rules, indexes, rules tests
```

## Non-negotiable rules

1. **Ease of use comes first.** At most 2 taps from a selected person to start adding a relative. Plain language; no jargon such as "node" or "edge" in the UI.
2. **No hard-coded UI strings.** Every string goes in **both** `messages/en.json` and `messages/bn.json`. Follow the glossary in SRS Appendix A. Bangla uses the polite "আপনি" form.
3. **Data access layering:** components never import `firebase/*` or `@/lib/firebase/*`. All Firestore access and every Auth flow go through `src/lib/repositories/*` (`auth.ts` for sign-in). ESLint enforces this.
4. **Every data mutation is a Command** (`src/features/editor/commands`) with forward and inverse operations. That gives undo/redo, validation and the activity log. Never write to Firestore directly from UI code.
5. **`src/lib/domain` is pure.** No React, Firebase or browser globals. Keep its test coverage at or above 90%.
6. **Changing the schema means touching all of these together:** `types.ts`, `schemas.ts`, converters, `firestore.rules`, the rules tests, DESIGN §6–8 and `schemaVersion`/migration if needed.
7. **Secrets:** only `NEXT_PUBLIC_*` values may reach the client. Admin and Cloudinary modules start with `import 'server-only'`. Never commit `.env*` files except `.env.example`.
8. **Route Handlers** always call `verifyRequest()` (ID token + App Check), validate input with Zod, and return `{ error: { code, message } }` on failure. The only exception is the public `/api/health` check.
9. **Bangla-safe text:** never slice user strings by index. Use `Intl.Segmenter` (graphemes). Never render user text with jsPDF's `text()`; exports rasterize browser-rendered SVG or HTML instead (ADR-006).
10. **Mobile and desktop are equal.** Verify UI changes at 360×740 and 1440×900, in `bn` and `en`, light and dark.
11. **Docs move with code.** Update README, DESIGN, the plan checkboxes and CHANGELOG in the same PR.
12. **Security rules** are deployed from the repository by CI only, never edited in the console. Every allow/deny path needs a test.

## Coding conventions

- **TypeScript:** `strict` with `noUncheckedIndexedAccess`. No `any` without a `// reason:` comment. Prefer `type` unions over enums. Make exhaustive `switch` statements use `never`.
- **Naming:** `PascalCase.tsx` for components, `camelCase.ts` for modules, `useX` for hooks, `SCREAMING_CASE` for constants. Relationship IDs are built **only** through `lib/domain/ids.ts` (`p_{parent}_{child}`, `s_{minId}_{maxId}`).
- **Components:** server components by default in `app/`. Interactive features are client components (`'use client'`) under `features/`. Keep components small, and put logic in hooks or the domain layer.
- **Styling:** Tailwind with the design tokens (`bg-surface`, `text-muted-foreground`, …). No raw hex values in components. Data colours come from the palette in DESIGN §21.3, and text always uses the text tokens.
- **State:** Zustand selectors that select narrowly. Derived data (graph, layout) is memoized. The camera transform is applied imperatively (no React state per frame).
- **Errors:** user-facing errors are i18n keys. Log with the `logger` wrapper and never include PII.
- **Tests:** colocate `*.test.ts(x)` with the source. Rules tests live in `firebase/tests`, E2E specs in `e2e/`. Use fixtures from the seed generator.
- **Commits and branches:** Conventional Commits (`feat(person): add custom fields`). Branches follow `feat/p5-01-person-form`. Reference task and SRS IDs in PRs.
- **Commit authorship (owner's choice):** commits are authored by the repository owner. Before committing in a new session, run `git config user.name "redwanhasan980"` and `git config user.email "redwanhasan980@gmail.com"`. Do **not** add a `Co-Authored-By: Claude` trailer.

## Gotchas (read before touching these areas)

- **Guest merge:** linking keeps the user ID (nothing to move). Only an *existing* account needs the merge-ticket flow (DESIGN §9.4). Capture guest tree summaries **before** signing in, because afterwards they are unreadable: every sign-in into an existing account passes `beforeSwitch: prepareGuestMerge` (`features/auth/guestMerge.ts`), and `MergeDialog` in the `(session)` layout finishes the merge.
- **Editor:** `/trees/[treeId]` lives in the `(app)/(editor)` route group with its own header; the dashboard and settings are in `(app)/(pages)`. UI code runs commands through `useEditor().run(ctx => command(ctx, …))` (`EditorProvider`), which supplies the open tree, graph, user and IDs. The dashboard commits tree commands directly (`features/trees/treeActions.ts`), without history.
- **Route Handler tests** are `*.emulator.test.ts` files that call the handler with real Auth emulator tokens (`lib/server/testing/authEmulator.ts`). `pnpm test:rules` starts its own emulators, so stop `pnpm emulators` first or the ports clash.
- **Google sign-in:** use popup first and fall back to redirect. Redirects need the `/__/auth/*` rewrite and an app-domain `authDomain` (DESIGN §9.5). In-app browsers (Messenger and similar) block Google OAuth, so show the "open in browser" guide.
- **Firestore rules** allow at most 20 *distinct* document reads per batch (repeated reads of one tree count once, so a 450-write batch inside one tree passes). Graph integrity (cycles, a single biological father) is enforced in the domain layer, not in the rules. Creates and updates check the role with `getAfter(tree)`, deletes and reads with `get(tree)`. A missing tree reads as `permission-denied`, the same as no access.
- **Commands are pure builders** returning `WriteOp`s (`lib/domain/writes.ts`: `SERVER_TIME`, `increment`, `DELETE_FIELD`). Test a new one with `MemoryDb` round-trips in `commands.test.ts` and add it to `commands.emulator.test.ts` so the rules check its writes.
- **Sibling order:** an explicit `childOrder` and the birth-date rank share one number space (`graph/order.ts`). New children get `nextSiblingKey()`; never compare `childOrder` values on their own.
- **Writes are not awaited for UI updates.** Latency compensation updates the listeners instantly; `await` blocks forever while offline. Use snapshot metadata for save status. A tree created a moment ago can be refused by the server until its own write arrives; `useTreeSession` listens again while that write is pending (DESIGN §11.2). E2E tests wait for "Saved" before a reload.
- **Cousin marriages** make a person appear twice. The first occurrence is primary and later ones are `isRef` nodes. Collapse keys are *path keys*, not person IDs.
- **Editor keys and dialogs:** shortcuts live in `features/editor/shortcuts.ts`; any new window key handler must check `acceptsShortcuts(event.target)` so typing and dialogs aren't hijacked. Dialogs, sheets and the delete confirmation are opened through `uiStore` (`addFlow`, `deletingId`, `searchOpen`, `revealRequest`), and `components/ui/returnFocus.ts` gives focus back when they close. The Tree view animates cards with CSS transitions, not `motion`.
- **Accessible names:** a `treeitem` or `button` with an `aria-label` must contain all of its visible text (axe `label-content-name-mismatch`). The List view's rows take their name from content, with screen-reader-only extras; follow that pattern for rows with controls inside.
- **Two kinds of views (ADR-013):** Tree, Circle and Timeline are SVG canvas views (camera, no `foreignObject`). Family card, List and Album are HTML card views. Exports follow the same split: serialize SVG directly, or use html-to-image for HTML (render twice on Safari).
- **Exports:** Cloudinary images must be inlined as data URLs (`export` variant, `f_jpg`; the Family book uses `print`). Clamp the canvas size for iOS (≤ 16.7 MP) and tile PDFs. The Family book renders page by page with one canvas alive at a time.
- **Product name:** always **শিকড়** in Bangla script, in both locales. Use `APP_NAME` / `<AppName />` from `src/lib/brand.ts` (it adds `lang="bn"`). Never write "Shikor" in the UI; Latin `shikor` is only for technical identifiers.
- **Bangla genitives:** never build "করিমের ছেলে" by appending suffixes to names. Use label forms such as "বাবা: করিম".
- **Staged views** (Album, Timeline, Family book) sit behind `lib/features.ts` flags until their release.
- **Cloudinary:** store `publicId` + `version`, never URLs. Keep the variant set small because each transformation costs credits. Never delete a photo directly: `EditorProvider` queues the photos a command, undo or redo removes (`features/media/photoCleanup.ts`, kept in localStorage) and deletes them once no person and no history step has them. The E2E build needs some `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (CI uses `e2e-cloud`; Cloudinary itself is mocked) or the photo tests find no photo buttons.
- **Toasts over modals:** a Radix dialog or sheet turns off pointer events on `body`; `globals.css` turns them back on for toasts and `ignoringToasts` stops a toast press from closing the dialog. Keep both when adding a modal surface.
- **Fonts:** Bangla needs `line-height ≥ 1.6` and no letter-spacing. Measure SVG text with the canvas cache, using the same font stack.
- **Next.js 16:** middleware is `src/proxy.ts`, and `next lint` is gone (call ESLint directly). The docs for the installed version are in `node_modules/next/dist/docs/`; read them before relying on memory. `agentRules: false` stops `next dev` from writing an `AGENTS.md`. The `proxy` matcher must exclude `api`, `_next`, `__/` and static files.
- **Quotas (free tier):** opening a tree costs about N + M reads. Never add per-person reads or count queries; use `personCount`.
- **Firebase projects:** production is `shikor-fe44d`; development and tests use the emulators. The web config is public, but keep the API key out of the repository (GitHub's secret scanner flags it); deploys take it from GitHub variables. Never import `firebase/analytics` (ESLint blocks it).
- **Emulators:** project `demo-shikor`, bound to `127.0.0.1` (some machines resolve `localhost` to IPv6, where the emulators don't listen). The browser uses `NEXT_PUBLIC_EMULATOR_HOST` (default `127.0.0.1`). `pnpm seed` always targets the emulators.
- **Playwright:** E2E runs against the production build, so run `pnpm build` first. A local Firestore emulator that has run for hours (benchmarks, hundreds of test trees) gets slow enough to time tests out; restart it before blaming the code. On machines with a preinstalled Chromium and no WebKit, set `PLAYWRIGHT_CHROMIUM_PATH`; the iPhone project is then skipped (CI runs it).
- **Design tokens:** shadcn names are kept: `--accent` is the hover surface, the brand marigold is `--highlight`. The contrast test fails CI if a text/background pair drops below WCAG AA.
- **Hosting is a self-managed VPS** (D7, DESIGN §27.4): Docker Compose with Next.js (standalone, only when `BUILD_STANDALONE=1`) behind Caddy, deployed by `.github/workflows/deploy.yml`. Never ask for or accept server passwords; deploys use the key in GitHub secrets. `NEXT_PUBLIC_*` values are build-time, so changing one needs a redeploy. There is no Vercel.
- **pnpm build scripts:** pnpm 10 blocks dependency install scripts; allowed ones are listed in `package.json` → `pnpm.onlyBuiltDependencies`.

## Working style for Claude

- Start a task by locating its **task ID** in the plan and its **SRS IDs**, then follow the skill's feature workflow.
- Keep each change minimal and in scope. If something in the docs is wrong, fix the doc in the same PR and say so.
- Ask the product owner before changing product behaviour, data shape, cost profile (new paid services) or security posture.
- **Workflow (owner's choice):** work directly on `main` with small, frequent commits, and push after each logical step. Every commit must pass the pre-commit checks. Use feature branches and PRs only when the owner asks. Never push secrets.
