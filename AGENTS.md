# Repository Guidelines

## Project Structure & Module Organization
This is a Next.js 15 App Router project in TypeScript. Routes, layouts, and API handlers live in `src/app`; dashboard pages are under `src/app/dashboard`, and server endpoints use `src/app/api/**/route.ts`. Shared utilities for auth, MongoDB, Firebase, S3, and API calls live in `src/lib`. Mongoose models are in `src/models`, reusable UI in `src/components`, and React context/hooks in `src/contexts` and `src/hooks`. Global styles are in `src/app/globals.css`, and root config lives in `serverless.yaml`, `next.config.ts`, and `tailwind.config.ts`.

## Build, Test, and Development Commands
Use `npm install` to install dependencies. Use `npm run dev` to start the app at `http://localhost:3000`. Use `npm run build` to produce a production build and run type checking; this is the current baseline validation. Use `npm run start` to serve the production build locally. For AWS bucket provisioning, `npx serverless deploy --stage prod` deploys the S3 infrastructure in `serverless.yaml`. The checked-in `npm run lint` script currently opens Next.js ESLint setup because no ESLint config is committed yet.

## Coding Style & Naming Conventions
Follow the existing style: TypeScript with `strict` mode, 2-space indentation, semicolons, and double quotes. Use PascalCase for React components and Mongoose models (`Sidebar.tsx`, `Expense.ts`), camelCase for functions and variables, and route folders that match the URL structure (`src/app/api/expenses/[id]`). Prefer the `@/*` path alias for imports from `src`. Keep route handlers thin and move shared logic into `src/lib` when it can be reused. No formatter config is committed today, so match the surrounding file.

## Testing Guidelines
There is no committed automated test suite and no `tests/` directory. Until one is added, validate changes with `npm run build` plus focused manual checks in auth, expense CRUD, role checks, and receipt uploads. If you add tests, place them close to the feature or under a new `tests/` tree and name them `*.test.ts` or `*.test.tsx`.

## Commit & Pull Request Guidelines
Recent commits use short Conventional Commit prefixes such as `fix:` and `feat:`. Keep commit subjects imperative and specific, for example `fix: validate currency before saving expense`. PRs should include a concise summary, note any env or schema changes, link the related issue when applicable, and attach screenshots for UI changes in the dashboard.

## Security & Configuration Tips
Copy `.env.example` to `.env.local` and never commit secrets. This app depends on MongoDB, Firebase client/admin credentials, AWS S3 keys, and `MASTER_ADMIN_EMAIL`; verify those values before debugging auth or upload failures.
