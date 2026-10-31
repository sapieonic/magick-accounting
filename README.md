# Magick Accounting

Expense management application built for small organizations. Track expenses across departments, manage categories, upload receipts, and control access through email domain whitelisting.

Single-tenant by design — one organization per deployment.

## Tech Stack

| Layer          | Technology                          |
|----------------|-------------------------------------|
| Framework      | Next.js 15 (App Router)             |
| Language       | TypeScript                          |
| Database       | MongoDB (Mongoose ODM)              |
| Authentication | Firebase Auth (Google sign-in)      |
| File Storage   | AWS S3 (presigned URLs)             |
| Styling        | Tailwind CSS                        |
| Icons          | Lucide React                        |

## Features

### Expense Management
- Create, view, edit, and delete expenses
- Attach receipt files (JPEG, PNG, WebP, PDF up to 10MB)
- Assign expenses to departments and categories
- Search and filter by department, category, or keyword
- Responsive table view (desktop) and card view (mobile)

### Add Expenses from Telegram
- An admin connects the organization's Telegram bot once in **Settings → Telegram Bot** (bot token from [@BotFather](https://t.me/BotFather) plus the app's public https URL)
- Each person links their own Telegram account from **Profile** (avatar menu → Profile & Telegram); the one-time link expires after 15 minutes
- Send the bot a receipt photo, an invoice/receipt file (PDF, JPEG, PNG, WebP up to 10MB) or a forwarded message; AI reads it into a draft
- The bot asks for anything missing (amount, category, department), lets you switch who paid (you or the company), and saves the expense once you tap **Save**, with the file attached as its receipt
- Commands: `/help`, `/cancel` (discard the expense you're adding), `/unlink`. Only private chats are accepted

### Business Trips
- Group a trip's flights, trains, stays, food and client meetings under one trip (name, destinations, dates, travelers, purpose, optional budget)
- Tag each trip expense with a travel type; picking one pre-fills the category, and AI auto-fill suggests it
- Add expenses from the trip page, pick a trip on the expense form (it suggests one from the date), or add existing unassigned expenses
- The Expenses list shows each trip as one expandable row (total, travelers, spend by type, missing receipts) that opens into a day-by-day timeline; a toggle switches to the flat list
- Trip page with spend by type, who paid and what is owed to each traveler from their pocket, and the timeline
- Bookings made before or after the trip dates are kept and shown before/after the trip
- Admins see every trip; others see trips they travel on or created, and only their own expenses inside them. Deleting a trip keeps its expenses

### Company Assets
- Create one or more company assets while recording their purchase expense
- Share the expense date, currency, GST, and receipt without duplicate entry
- Track asset tags, serial numbers, assignees, purpose, location, and status
- Allocate purchase value and recoverable GST per asset
- Estimate straight-line or written-down-value depreciation
- Preserve assignment history when assets move between people
- Convert an existing expense into one or more assets without re-entering the purchase
- Close assignments and freeze depreciation when an asset is retired, sold, lost, or disposed
- Reverse mistaken asset entries with an administrator-supplied reason and retained audit event

#### Asset accounting behavior

- The linked Expense is the source of truth for purchase date, currency, invoice total, GST, and receipt.
- Acquisition currency becomes immutable after an asset is linked. The entry exchange rate is stored on the expense so later currency-rate edits do not rewrite historical values.
- Each asset stores its allocated invoice amount, allocated GST, recoverable GST, and capitalized cost (`allocated amount - recoverable GST`).
- Depreciation shown by the register is an estimate calculated using elapsed days on a 365.25-day year. It supports straight-line and written-down-value methods and stops on the effective terminal lifecycle date.
- These estimates do not post accounting journal entries or lock fiscal periods. Confirm the selected method and percentage with the organization’s accountant before treating the register as statutory books.
- Regular assignees can see operational asset details. Purchase financials, depreciation values, receipts, prior-custodian data, and audit events are restricted to administrators or the source-expense owner as applicable.
- Linked expense/asset creation uses MongoDB transactions on replica-set deployments and batch-scoped compensating cleanup for local standalone development. Asset edits and reversals require replica-set transactions so assignment and audit history cannot be partially written.

### Departments
- Organize expenses by department
- Default "General" department created on first run
- Create additional departments as needed
- Protected deletion — departments with expenses cannot be removed

### Categories
- 13 default categories seeded automatically (Office Supplies, Travel, Software & Subscriptions, etc.)
- Add custom categories at any time
- Default categories are protected from deletion

### Multi-Currency Support
- Primary currency is **INR** (Indian Rupee), seeded on first run
- Admins can add additional currencies (USD, EUR, GBP, etc.) from Settings
- Exchange rates are manually entered (e.g. "1 USD = 83.50 INR")
- Each expense records which currency it was entered in
- Amounts are automatically converted to INR using the exchange rate at time of entry
- Dashboard totals are always shown in INR
- Non-INR expenses show the original amount with an INR equivalent below
- Updating an exchange rate only affects future expenses — existing expenses keep their original conversion

### Access Control
- **Domain whitelisting** — only users with approved email domains can sign in (e.g. `@magickvoice.com`)
- **Three roles:**
  - **Master Admin** — full access, can promote/demote other users
  - **Admin** — can manage departments, categories, domains, and view all expenses
  - **User** — can manage their own expenses
- Admins can add or remove allowed email domains from the Settings page

### Dashboard
- Overview with total expenses, total amount, department count, and category count
- Recent expenses at a glance
- Quick navigation to all sections

## Prerequisites

- **Node.js** 18+
- **MongoDB** instance (Atlas or local)
- **Firebase** project with Google sign-in enabled
- **AWS** account with S3 access (for receipt uploads)

## Setup

### 1. Clone and install

```bash
git clone <repository-url>
cd magick-accounting
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in your `.env.local`:

```env
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/magick-accounting?retryWrites=true&w=majority

# Firebase Client (from Firebase Console > Project Settings > General)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (from Firebase Console > Project Settings > Service Accounts > Generate New Private Key)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BUCKET_NAME=magick-accounting-receipts

# Application
MASTER_ADMIN_EMAIL=admin@magickvoice.com
NEXT_PUBLIC_APP_NAME=Magick Accounting
```

### 3. Set up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project (or use an existing one)
2. Enable **Authentication** > **Sign-in method** > **Google**
3. Add your domain to **Authentication** > **Settings** > **Authorized domains**
4. Copy the web app config values into the `NEXT_PUBLIC_FIREBASE_*` variables
5. Go to **Project Settings** > **Service Accounts** > **Generate new private key** and copy the values into the `FIREBASE_*` variables

### 4. Set up S3 bucket

Option A — using the included Serverless config:

```bash
npx serverless deploy --stage prod
```

Option B — create the bucket manually in the AWS Console with:
- Private access (block all public access)
- CORS configured for GET and PUT from your domain
- Server-side encryption (AES256)

Update `S3_BUCKET_NAME` in `.env.local` to match your bucket name.

### 5. Run the application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. First sign-in

1. Sign in with the Google account matching your `MASTER_ADMIN_EMAIL`
2. The application automatically seeds:
   - Default expense categories
   - Default "General" department
   - INR as the base currency
   - Your email domain as the first allowed domain
3. You are assigned the **Master Admin** role

## Project Structure

```
src/
├── app/
│   ├── page.tsx                          # Login page
│   ├── layout.tsx                        # Root layout (AuthProvider, ToastProvider)
│   ├── globals.css                       # Tailwind + custom styles
│   ├── dashboard/
│   │   ├── page.tsx                      # Overview / stats
│   │   ├── layout.tsx                    # Sidebar + header shell
│   │   ├── expenses/
│   │   │   ├── page.tsx                  # Expense list with search/filter
│   │   │   ├── new/page.tsx              # Create expense form
│   │   │   └── [id]/edit/page.tsx        # Edit expense form
│   │   ├── trips/
│   │   │   ├── page.tsx                  # Trips: ongoing, upcoming, past
│   │   │   └── [id]/page.tsx             # Trip detail: totals, who paid, timeline
│   │   ├── assets/
│   │   │   ├── page.tsx                  # Company asset register
│   │   │   └── [id]/page.tsx             # Asset detail, assignment and depreciation
│   │   ├── departments/page.tsx          # Department management
│   │   ├── categories/page.tsx           # Category management
│   │   └── admin/
│   │       ├── users/page.tsx            # User role management
│   │       └── settings/page.tsx         # Domain whitelist management
│   └── api/
│       ├── auth/
│       │   ├── verify/route.ts           # Verify Firebase token + create user
│       │   └── me/route.ts              # Get current user
│       ├── expenses/
│       │   ├── route.ts                  # GET (list) / POST (create)
│       │   └── [id]/route.ts            # GET / PUT / DELETE
│       ├── trips/
│       │   ├── route.ts                  # GET (list) / POST (create)
│       │   ├── [id]/route.ts            # GET (detail + summary) / PUT / DELETE
│       │   ├── [id]/expenses/route.ts   # PATCH (add / remove expenses)
│       │   └── [id]/candidates/route.ts # GET (unassigned expenses around the dates)
│       ├── assets/
│       │   ├── route.ts                 # GET asset register
│       │   └── [id]/route.ts            # GET / PUT / DELETE correction
│       ├── departments/
│       │   ├── route.ts                  # GET / POST
│       │   └── [id]/route.ts            # PUT / DELETE
│       ├── categories/
│       │   ├── route.ts                  # GET / POST
│       │   └── [id]/route.ts            # DELETE
│       ├── currencies/
│       │   ├── route.ts                  # GET / POST
│       │   └── [id]/route.ts            # PUT / DELETE
│       ├── users/
│       │   ├── route.ts                  # GET (admin: list all users)
│       │   └── [id]/role/route.ts       # PATCH (master admin: change role)
│       ├── domains/
│       │   ├── route.ts                  # GET / POST
│       │   └── [id]/route.ts            # DELETE
│       ├── upload/route.ts               # POST (presigned upload URL) / GET (download URL)
│       └── seed/route.ts                # POST (seed defaults)
├── lib/
│   ├── mongodb.ts                        # Mongoose connection (cached)
│   ├── firebase.ts                       # Firebase client SDK (lazy init)
│   ├── firebase-admin.ts                 # Firebase Admin SDK (lazy init)
│   ├── s3.ts                             # S3 presigned URL helpers
│   ├── auth.ts                           # Token verification + role guards
│   ├── api.ts                            # Client-side fetch wrapper with auth
│   ├── currency.ts                       # Currency formatting (Intl.NumberFormat)
│   ├── trip.ts                           # Trip validation, travel types, day grouping (client-safe)
│   ├── trip-server.ts                    # Trip access rules
│   └── trip-query.ts                     # Trip queries, summaries, grouped expense list
├── models/
│   ├── User.ts                           # email, name, role, firebaseUid
│   ├── Department.ts                     # name, description, isDefault
│   ├── Expense.ts                        # title, amount, currency, amountInBaseCurrency, receipt, trip, travelType
│   ├── Trip.ts                           # name, destinations, dates, travelers, department, budget
│   ├── Currency.ts                       # code, name, symbol, rateToBase, isBase
│   ├── Category.ts                       # name, isDefault + DEFAULT_CATEGORIES list
│   └── AllowedDomain.ts                  # domain, addedBy
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                   # Desktop sidebar + mobile drawer
│   │   └── Header.tsx                    # Top bar with user dropdown
│   └── ui/
│       ├── Toast.tsx                     # Toast notification system (context-based)
│       ├── Modal.tsx                     # Accessible modal dialog
│       ├── Spinner.tsx                   # Loading spinner + full-page loader
│       └── EmptyState.tsx                # Empty state placeholder
└── contexts/
    └── AuthContext.tsx                    # Auth state, sign-in/out, role helpers
```

## API Reference

All API routes require a Firebase ID token in the `Authorization: Bearer <token>` header (except `/api/seed`, `/api/auth/verify`, and `/api/telegram/webhook`, which Telegram authenticates with the webhook's secret token).

| Method   | Endpoint                  | Access       | Description                        |
|----------|---------------------------|--------------|------------------------------------|
| `POST`   | `/api/auth/verify`        | Public       | Verify token, create user if new   |
| `GET`    | `/api/auth/me`            | Authenticated| Get current user                   |
| `GET`    | `/api/expenses`           | Authenticated| List expenses (filtered by role; `groupTrips=true` pages by trip) |
| `POST`   | `/api/expenses`           | Authenticated| Create expense                     |
| `GET`    | `/api/expenses/:id`       | Authenticated| Get expense by ID                  |
| `PUT`    | `/api/expenses/:id`       | Authenticated| Update expense                     |
| `DELETE` | `/api/expenses/:id`       | Authenticated| Delete expense                     |
| `GET`    | `/api/trips`              | Authenticated| List visible trips with totals     |
| `POST`   | `/api/trips`              | Authenticated| Create trip                        |
| `GET`    | `/api/trips/:id`          | Traveler/Creator/Admin | Trip, summary and expenses |
| `PUT`    | `/api/trips/:id`          | Creator/Admin| Update trip                        |
| `DELETE` | `/api/trips/:id`          | Creator/Admin| Delete trip (expenses are kept)    |
| `PATCH`  | `/api/trips/:id/expenses` | Traveler/Creator/Admin | Add/remove expenses (users: own only) |
| `GET`    | `/api/trips/:id/candidates` | Traveler/Creator/Admin | Unassigned expenses around the trip |
| `GET`    | `/api/assets`             | Authenticated| List visible company assets        |
| `GET`    | `/api/assets/:id`         | Authenticated| Get asset and assignment history   |
| `PUT`    | `/api/assets/:id`         | Admin        | Update asset and assignment        |
| `DELETE` | `/api/assets/:id`         | Admin        | Reverse asset; JSON reason required|
| `GET`    | `/api/assets/corrections` | Admin        | List paginated asset reversals      |
| `GET`    | `/api/assets/corrections/:eventId` | Admin | View retained reversal snapshot |
| `POST`   | `/api/expenses/:id/assets`| Owner/Admin  | Create assets from existing expense|
| `GET`    | `/api/departments`        | Authenticated| List all departments               |
| `POST`   | `/api/departments`        | Authenticated| Create department                  |
| `PUT`    | `/api/departments/:id`    | Admin        | Update department                  |
| `DELETE` | `/api/departments/:id`    | Admin        | Delete department                  |
| `GET`    | `/api/categories`         | Authenticated| List all categories                |
| `POST`   | `/api/categories`         | Authenticated| Create category                    |
| `DELETE` | `/api/categories/:id`     | Admin        | Delete category                    |
| `GET`    | `/api/currencies`         | Authenticated| List all active currencies         |
| `POST`   | `/api/currencies`         | Admin        | Add currency with exchange rate    |
| `PUT`    | `/api/currencies/:id`     | Admin        | Update currency/exchange rate      |
| `DELETE` | `/api/currencies/:id`     | Admin        | Delete currency (if no expenses)   |
| `GET`    | `/api/users`              | Admin        | List all users                     |
| `PATCH`  | `/api/users/:id/role`     | Master Admin | Change user role                   |
| `GET`    | `/api/domains`            | Admin        | List allowed domains               |
| `POST`   | `/api/domains`            | Admin        | Add allowed domain                 |
| `DELETE` | `/api/domains/:id`        | Admin        | Remove allowed domain              |
| `POST`   | `/api/upload`             | Authenticated| Get presigned upload URL           |
| `GET`    | `/api/upload?key=...`     | Authenticated| Get presigned download URL         |
| `POST`   | `/api/seed`               | Authenticated| Seed default data                  |
| `GET`    | `/api/telegram/settings`  | Admin        | Bot connection and webhook status  |
| `PUT`    | `/api/telegram/settings`  | Admin        | Connect/reconnect the bot (token, App URL) |
| `DELETE` | `/api/telegram/settings`  | Admin        | Disconnect the bot                 |
| `GET`    | `/api/telegram/link`      | Authenticated| Own Telegram link status           |
| `POST`   | `/api/telegram/link`      | Authenticated| Issue a one-time `t.me` link code  |
| `DELETE` | `/api/telegram/link`      | Authenticated| Unlink own Telegram account        |
| `POST`   | `/api/telegram/webhook`   | Telegram (secret header) | Bot updates from Telegram |

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Start production server
npm run migrate:assets # Backfill asset allocation/index data before first asset-feature deploy
npm run lint      # Run ESLint
```

## Development

### Gemini Code Review
This project uses an automated AI code review system powered by Gemini.

- **Automatic Reviews**: Gemini automatically reviews any Pull Request opened against the `main` branch.
- **Manual Trigger**: To request a fresh review at any time, comment `@gemini-cli /review` on your Pull Request.
- **Specific Instructions**: You can provide additional context to the reviewer, for example: `@gemini-cli /review focus on performance and security`.

## Deployment

The app can be deployed to any platform that supports Next.js:

- **Vercel** — zero config, connect your repo
- **AWS** (EC2 / ECS / Lambda) — use `npm run build && npm run start`
- **Docker** — add a Dockerfile with `node:18-alpine`, build, and serve

Set all environment variables from `.env.example` in your deployment platform.

Before the first deployment containing the asset register, take a database backup and run
`npm run migrate:assets` once against the target MongoDB database. The migration backfills
allocation counters and batch identifiers, resolves duplicate open assignments by retaining the
newest as current, and creates the uniqueness indexes required for safe concurrent writes. Run it
during a maintenance window with expense and asset writes paused.

## License

Private — internal use only.
