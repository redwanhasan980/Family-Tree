# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Phase 2, the family data model underneath the editor:
  - **People and relationships:** types and schemas with the SRS field limits, partial dates in Bangla and English, display names in either language, and search across both scripts and nicknames.
  - **The graph engine:** families grouped by the other parent, descendant and ancestor trees that handle cousin marriages and adoption, and generations, numbering and "unplaced people". Validation stops loops (nobody can become their own ancestor) and more than one biological father or mother, and warns about unlikely dates and possible duplicates.
  - **Commands:** every change is an undoable command: add a person, several children at once, a spouse, a parent or a sibling; edit details; delete a person alone or with their descendants; link existing people; and change, reorder, move or remove relationships. Quick edits to the same person merge into one undo step.
  - **Security rules** for trees, people, relationships and sharing, tested path by path. Every command is checked against them on the Firebase emulator.
  - **Stores and the tree session:** the open tree renders from the device cache first, then keeps in sync live, with a saving/saved/offline status.
  - **Demo trees** of 10, 150, 500 and 2,000 people for local development (`pnpm seed`).
- Phase 1, authentication and guest sessions. Entering the app creates a guest that survives reloads and later visits; the landing page never creates one. Sign-up with email/password or Google keeps everything by linking to the guest. Also: log-in, password reset (which never reveals whether an account exists), email verification with a resend banner, and log-out. The header gets a guest chip that explains guest storage and an account menu. Settings cover name, language and theme, and the account's choices follow it to other devices. Google sign-in inside Facebook and other in-app browsers shows an "open in your browser" guide instead.
- Server foundation for Route Handlers: `verifyRequest()` (ID token with revocation check, App Check, guest policy), a shared error format with codes, and strict request validation. App Check with reCAPTCHA v3 in production once a site key is set. `/__/auth` is proxied to Firebase for redirect sign-in on the app's own domain.
- Security rules for user profiles (`users/{uid}`) with tests, and end-to-end tests for the guest and account flows that run against the emulators in CI.
- Deployment to the owner's Contabo VPS instead of Vercel: production Docker image, `/api/health`, Docker Compose stack with Caddy (automatic HTTPS), a one-time server setup script, a deploy script with automatic rollback, a GitHub Actions deploy workflow (enabled with the `DEPLOY_ENABLED` variable), a CI image build, and the owner guide `docs/DEPLOYMENT.md`.
- Phase 0 foundation: Next.js 16 app with Bangla and English routes (`/bn`, `/en`) and automatic language detection, a placeholder landing page with language and theme switches, design tokens for light and dark mode with an automated contrast check, Inter and Hind Siliguri fonts, the shadcn/ui component kit, and the product name শিকড় always shown in Bangla script.
- Developer tooling: ESLint with layering rules, Prettier, Husky and commitlint, Vitest, Playwright smoke and accessibility tests on mobile and desktop, Firebase Auth and Firestore emulators with a security-rules test harness, an emulator-only seed script, security headers, and GitHub Actions CI.
- Named the product **শিকড়**, always written in Bangla script in both languages (I18N-10); technical identifiers use the Latin `shikor` prefix.
- Planned the Family card (v1.0), Generation album (v1.1), Timeline (v1.2) and Family book (v1.2) in the SRS, Design Document and Implementation Plan. Later phases are renumbered: P11–P15.
- Project documentation baseline: Software Requirements Specification (`docs/SRS.md`), Design Document (`docs/DESIGN.md`), Implementation Plan (`docs/IMPLEMENTATION_PLAN.md`), `CLAUDE.md`, the `family-tree-dev` Claude skill, and this README and changelog.
