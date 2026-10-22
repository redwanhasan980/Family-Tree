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

**Current status:** documentation baseline is complete; **Phase 0 (foundation) has not started**. Update this line when phases complete.

## Tech stack (pinned in package.json once scaffolded)

Next.js 16 (App Router, `src/`, `src/proxy.ts` = Next 16 middleware) · React 19 · TypeScript 6.0.x strict (not 7 until typescript-eslint supports it) · Tailwind CSS 4 + shadcn/ui · motion · Zustand · Zod 4 · react-hook-form · next-intl 4 · d3-hierarchy / d3-flextree / d3-shape / d3-zoom / d3-scale · html-to-image + jsPDF · Firebase JS SDK 13 / firebase-admin 14 · Cloudinary (server SDK only) · Serwist (R2) · Vitest · Playwright · pnpm · Node 22.

## Commands

These are available once Phase 0 is done. Use `pnpm`, never npm or yarn.

```bash
pnpm dev            # Next.js dev server (http://localhost:3000/bn or /en)
pnpm emulators      # Firebase Auth + Firestore emulators (run alongside dev)
pnpm seed           # seed emulator with fixture trees
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write
pnpm test           # vitest (unit + component)
pnpm test:rules     # firestore rules tests (needs emulators: firebase emulators:exec)
pnpm test:e2e       # playwright (mobile + desktop projects)
pnpm i18n:check     # en/bn message key parity
pnpm build          # production build
```

Before every commit, run `pnpm typecheck && pnpm lint && pnpm test && pnpm i18n:check`. If you changed the rules, also run `pnpm test:rules`.

## Architecture map

```text
src/app/[locale]/...        pages (landing, (auth), (app)/trees, s/[shareId])
src/app/api/...             Route Handlers (server only; Admin SDK, Cloudinary)
src/features/<feature>/     UI + hooks per feature (auth, trees, editor, person, views/*, export, media, ...)
src/lib/domain/             PURE TypeScript: types, zod schemas, graph engine, names/dates, kinship, gedcom
src/lib/repositories/       the ONLY client code that touches Firestore
src/lib/firebase/           client.ts (SDK init, persistent cache) · admin.ts (server-only)
src/lib/server/             verifyRequest, http errors, cloudinary, treeAdmin, rate limit
src/stores/                 Zustand: treeStore, uiStore, historyStore, prefsStore
messages/{en,bn}.json       all UI strings
firebase/                   firestore.rules, indexes, rules tests
```

## Non-negotiable rules

1. **Ease of use comes first.** At most 2 taps from a selected person to start adding a relative. Plain language; no jargon such as "node" or "edge" in the UI.
2. **No hard-coded UI strings.** Every string goes in **both** `messages/en.json` and `messages/bn.json`. Follow the glossary in SRS Appendix A. Bangla uses the polite "আপনি" form.
3. **Data access layering:** components never import `firebase/*`. All Firestore access goes through `src/lib/repositories/*`. ESLint enforces this.
4. **Every data mutation is a Command** (`src/features/editor/commands`) with forward and inverse operations. That gives undo/redo, validation and the activity log. Never write to Firestore directly from UI code.
5. **`src/lib/domain` is pure.** No React, Firebase or browser globals. Keep its test coverage at or above 90%.
6. **Changing the schema means touching all of these together:** `types.ts`, `schemas.ts`, converters, `firestore.rules`, the rules tests, DESIGN §6–8 and `schemaVersion`/migration if needed.
7. **Secrets:** only `NEXT_PUBLIC_*` values may reach the client. Admin and Cloudinary modules start with `import 'server-only'`. Never commit `.env*` files except `.env.example`.
8. **Route Handlers** always call `verifyRequest()` (ID token + App Check), validate input with Zod, and return `{ error: { code, message } }` on failure.
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

- **Guest merge:** linking keeps the user ID (nothing to move). Only an *existing* account needs the merge-ticket flow (DESIGN §9.4). Capture guest tree summaries **before** signing in, because afterwards they are unreadable.
- **Google sign-in:** use popup first and fall back to redirect. Redirects need the `/__/auth/*` rewrite and an app-domain `authDomain` (DESIGN §9.5). In-app browsers (Messenger and similar) block Google OAuth, so show the "open in browser" guide.
- **Firestore rules** allow at most 20 `get`/`exists` calls per batch. Graph integrity (cycles, a single biological father) is enforced in the domain layer, not in the rules.
- **Writes are not awaited for UI updates.** Latency compensation updates the listeners instantly; `await` blocks forever while offline. Use snapshot metadata for save status.
- **Cousin marriages** make a person appear twice. The first occurrence is primary and later ones are `isRef` nodes. Collapse keys are *path keys*, not person IDs.
- **Two kinds of views (ADR-013):** Tree, Circle and Timeline are SVG canvas views (camera, no `foreignObject`). Family card, List and Album are HTML card views. Exports follow the same split: serialize SVG directly, or use html-to-image for HTML (render twice on Safari).
- **Exports:** Cloudinary images must be inlined as data URLs (`export` variant, `f_jpg`; the Family book uses `print`). Clamp the canvas size for iOS (≤ 16.7 MP) and tile PDFs. The Family book renders page by page with one canvas alive at a time.
- **Product name:** always **শিকড়** in Bangla script, in both locales. Use `APP_NAME` / `<AppName />` from `src/lib/brand.ts` (it adds `lang="bn"`). Never write "Shikor" in the UI; Latin `shikor` is only for technical identifiers.
- **Bangla genitives:** never build "করিমের ছেলে" by appending suffixes to names. Use label forms such as "বাবা: করিম".
- **Staged views** (Album, Timeline, Family book) sit behind `lib/features.ts` flags until their release.
- **Cloudinary:** store `publicId` + `version`, never URLs. Keep the variant set small because each transformation costs credits. Photo deletion is deferred until the undo window closes.
- **Fonts:** Bangla needs `line-height ≥ 1.6` and no letter-spacing. Measure SVG text with the canvas cache, using the same font stack.
- **Next.js 16:** middleware is `src/proxy.ts`, and `next lint` is gone (call ESLint directly). The `proxy` matcher must exclude `api`, `_next`, `__/` and static files.
- **Quotas (free tier):** opening a tree costs about N + M reads. Never add per-person reads or count queries; use `personCount`.

## Working style for Claude

- Start a task by locating its **task ID** in the plan and its **SRS IDs**, then follow the skill's feature workflow.
- Keep each change minimal and in scope. If something in the docs is wrong, fix the doc in the same PR and say so.
- Ask the product owner before changing product behaviour, data shape, cost profile (new paid services) or security posture.
- Never commit to `main` directly. Never push secrets. Do not create PRs unless asked.
