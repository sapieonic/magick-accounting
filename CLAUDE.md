# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Magick Accounting is a single-tenant expense management app (one organization per deployment). Next.js 15 App Router, TypeScript, MongoDB/Mongoose, Firebase Auth (Google sign-in), AWS S3 for receipts.

## Commands

- `npm run dev` — start dev server at http://localhost:3000
- `npm run build` — production build **and type check**. This is the baseline validation (no test suite exists). Run it after changes.
- `npm run start` — serve the production build
- `npm run seed` — run `src/scripts/seed.ts` via ts-node to seed default data
- `npm run lint` — `next lint`; no ESLint config is committed, so this opens setup
- `npx serverless deploy --stage prod` — provision the S3 receipts bucket from `serverless.yaml`

There is no automated test suite. Validate manually: auth, expense CRUD, role checks, receipt upload, AI auto-fill, invoice generation.

## Architecture

**Request flow:** Client pages use `src/lib/api.ts` (`api.get/post/put/...`), which attaches a Firebase ID token as a `Bearer` header on every request. API route handlers in `src/app/api/**/route.ts` call `verifyAuth(req)` from `src/lib/auth.ts`, which verifies the token with Firebase Admin, loads the Mongoose `User`, and returns an `AuthUser` — or a `NextResponse` error. Handlers must check `if (result instanceof NextResponse) return result;`.

**Auth & roles:** Three roles — `master_admin`, `admin`, `user`. Use `requireAdmin(user)` / `requireMasterAdmin(user)` guards (they return a `NextResponse` to bail on, or `null`). First-ever sign-in seeds `INITIAL_ALLOWED_DOMAIN`; sign-in is blocked unless the email domain is in `AllowedDomain`. The `MASTER_ADMIN_EMAIL` user is auto-promoted to `master_admin` on creation. `verifyAndCreateUser` (in `auth.ts`) handles first-login provisioning. Client-side auth state lives in `src/contexts/AuthContext.tsx`.

**Database:** `connectDB()` in `src/lib/mongodb.ts` caches the Mongoose connection on `global` (survives hot reload / serverless reuse). Every route handler calls it. Models in `src/models` use the `mongoose.models.X || mongoose.model(...)` pattern to avoid recompilation errors.

**Expense queries:** `src/lib/expense-query.ts` centralizes filtering. `buildExpenseFilter` scopes `user` role to their own expenses (admins see all), parses department/category/date/search params, and escapes regex input. Reuse it rather than building filters ad hoc.

**Currency:** Base currency is INR. Each expense stores `amount` + `currency` ref + `amountInBaseCurrency` (converted at entry time using the exchange rate then). Editing a currency's rate does **not** retroactively change existing expenses. Aggregations sum `amountInBaseCurrency` (falling back to `amount`). Format with `formatCurrency` / `formatBaseCurrency` from `src/lib/currency.ts`.

**Receipts (S3):** `src/lib/s3.ts` lazily resolves the bucket region via `GetBucketLocation` and caches the client. Uploads happen server-side through `/api/upload`; downloads use 1-hour presigned URLs. Expenses store `receiptKey` + `receiptFilename`.

**AI auto-fill:** `/api/expenses/extract` sends a receipt image to a Databricks-hosted Claude endpoint via `src/lib/databricks.ts` (OpenAI-compatible chat completions). PDF receipts are first rasterized to PNG by `src/lib/pdf.ts` (`mupdf` WASM) since the vision model is image-only. `parseJsonResponse` strips code fences from model output.

**Invoices:** `/api/invoices/generate/route.tsx` renders a GST invoice PDF with `@react-pdf/renderer` (`src/components/invoice/InvoiceDocument.tsx`). `InvoiceSettings` is a single company-wide document (HSN/SAC, company details). Use `api.postBlob` client-side for PDF downloads.

**Note:** `@react-pdf/renderer` and `mupdf` are listed in `serverExternalPackages` in `next.config.ts` — they must run from `node_modules`, not the bundled output.

## Conventions

- TypeScript strict mode, 2-space indent, semicolons, double quotes
- Import from `src` with the `@/*` alias
- Keep route handlers thin; move reusable logic into `src/lib`
- PascalCase for components and models, camelCase for functions; route folders match the URL
- Conventional Commit prefixes (`feat:`, `fix:`)

## Environment

Copy `.env.example` to `.env.local`. Required: `MONGODB_URI`, Firebase client (`NEXT_PUBLIC_FIREBASE_*`) and admin (`FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`) credentials, AWS S3 keys + `S3_BUCKET_NAME`, `DATABRICKS_TOKEN` (AI auto-fill), `MASTER_ADMIN_EMAIL`, `INITIAL_ALLOWED_DOMAIN`.
