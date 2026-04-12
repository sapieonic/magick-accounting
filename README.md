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
│   └── currency.ts                       # Currency formatting (Intl.NumberFormat)
├── models/
│   ├── User.ts                           # email, name, role, firebaseUid
│   ├── Department.ts                     # name, description, isDefault
│   ├── Expense.ts                        # title, amount, currency, amountInBaseCurrency, receipt
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

All API routes require a Firebase ID token in the `Authorization: Bearer <token>` header (except `/api/seed` and `/api/auth/verify`).

| Method   | Endpoint                  | Access       | Description                        |
|----------|---------------------------|--------------|------------------------------------|
| `POST`   | `/api/auth/verify`        | Public       | Verify token, create user if new   |
| `GET`    | `/api/auth/me`            | Authenticated| Get current user                   |
| `GET`    | `/api/expenses`           | Authenticated| List expenses (filtered by role)   |
| `POST`   | `/api/expenses`           | Authenticated| Create expense                     |
| `GET`    | `/api/expenses/:id`       | Authenticated| Get expense by ID                  |
| `PUT`    | `/api/expenses/:id`       | Authenticated| Update expense                     |
| `DELETE` | `/api/expenses/:id`       | Authenticated| Delete expense                     |
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

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```

## Deployment

The app can be deployed to any platform that supports Next.js:

- **Vercel** — zero config, connect your repo
- **AWS** (EC2 / ECS / Lambda) — use `npm run build && npm run start`
- **Docker** — add a Dockerfile with `node:18-alpine`, build, and serve

Set all environment variables from `.env.example` in your deployment platform.

## License

Private — internal use only.
