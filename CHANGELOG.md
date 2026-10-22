# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Deployment to the owner's Contabo VPS instead of Vercel: production Docker image, `/api/health`, Docker Compose stack with Caddy (automatic HTTPS), a one-time server setup script, a deploy script with automatic rollback, a GitHub Actions deploy workflow (enabled with the `DEPLOY_ENABLED` variable), a CI image build, and the owner guide `docs/DEPLOYMENT.md`.
- Phase 0 foundation: Next.js 16 app with Bangla and English routes (`/bn`, `/en`) and automatic language detection, a placeholder landing page with language and theme switches, design tokens for light and dark mode with an automated contrast check, Inter and Hind Siliguri fonts, the shadcn/ui component kit, and the product name শিকড় always shown in Bangla script.
- Developer tooling: ESLint with layering rules, Prettier, Husky and commitlint, Vitest, Playwright smoke and accessibility tests on mobile and desktop, Firebase Auth and Firestore emulators with a security-rules test harness, an emulator-only seed script, security headers, and GitHub Actions CI.
- Named the product **শিকড়**, always written in Bangla script in both languages (I18N-10); technical identifiers use the Latin `shikor` prefix.
- Planned the Family card (v1.0), Generation album (v1.1), Timeline (v1.2) and Family book (v1.2) in the SRS, Design Document and Implementation Plan. Later phases are renumbered: P11–P15.
- Project documentation baseline: Software Requirements Specification (`docs/SRS.md`), Design Document (`docs/DESIGN.md`), Implementation Plan (`docs/IMPLEMENTATION_PLAN.md`), `CLAUDE.md`, the `family-tree-dev` Claude skill, and this README and changelog.
