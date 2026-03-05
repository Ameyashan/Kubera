# Personal CFO — AI-Powered Finance Dashboard

Upload your bank and credit card statements (CSV or PDF) and get a comprehensive, interactive dashboard with insights, trends, and actionable recommendations. Multi-user support via Supabase Auth with row-level security.

## Features

- **Drag & drop upload** — supports CSV and PDF statements from Chase, Apple Card, and most banks
- **13 dashboard sections** — KPIs, monthly trends, category breakdown, category trends, top merchants, interest analysis, balance tracker, day-of-week patterns, smart insights, actionable tips, and a full transaction explorer with search/filter/sort/pagination
- **Multi-user** — each user sees only their own data (Supabase RLS)
- **Auth** — email/password and Google OAuth via Supabase Auth
- **Sample data** — one-click demo with 12 months of realistic financial data

## Tech Stack

- **Frontend**: Next.js 15, React 19, Chart.js 4
- **Backend**: Next.js API Routes (serverless)
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **Parsing**: `pdf-parse` for PDFs, `papaparse` for CSVs
- **Deployment**: Vercel

---

## Setup Guide

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Configure Authentication

#### Email/Password (enabled by default)
- Go to **Authentication → Providers → Email** and ensure it's enabled
- For development: disable "Confirm email" under **Authentication → Settings** so you don't need to verify emails

#### Google OAuth (optional)
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Set the authorized redirect URI to: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
4. In Supabase: **Authentication → Providers → Google** — paste your Client ID and Secret

### 3. Clone and Configure

```bash
git clone <your-repo-url>
cd cfo-next
cp .env.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Install and Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to the login page.

### 5. Deploy to Vercel

1. Push the repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**

After deploying, update your Supabase redirect URLs:
- Go to **Authentication → URL Configuration**
- Add your Vercel domain to "Redirect URLs": `https://your-app.vercel.app/auth/callback`

---

## Project Structure

```
cfo-next/
├── app/
│   ├── api/
│   │   ├── dashboard/route.ts   # GET (cached) + POST (build) dashboard
│   │   ├── upload/route.ts      # Parse & store uploaded files
│   │   ├── sample/route.ts      # Generate sample data
│   │   └── reset/route.ts       # Clear all user data
│   ├── auth/
│   │   └── callback/route.ts    # OAuth callback handler
│   ├── login/page.tsx           # Login page
│   ├── signup/page.tsx          # Signup page
│   ├── page.tsx                 # Main app (upload + dashboard)
│   ├── layout.tsx               # Root layout
│   └── globals.css              # All styles
├── lib/
│   ├── supabase/
│   │   ├── server.ts            # Server-side Supabase client
│   │   └── client.ts            # Browser-side Supabase client
│   └── finance/
│       ├── parsers.ts           # CSV/PDF parsing with auto-detection
│       ├── categorize.ts        # Transaction categorization (15 categories)
│       ├── dashboard.ts         # Dashboard payload builder + tips engine
│       └── sample-data.ts       # Sample data generator
├── supabase/
│   └── schema.sql               # Database schema + RLS policies
├── middleware.ts                 # Auth middleware (route protection)
├── package.json
├── tsconfig.json
├── next.config.ts
└── .env.example
```

## Supported Statement Formats

### CSV
- **Chase** — auto-detected by "Transaction Date" + "Post Date" columns
- **Apple Card** — auto-detected by "Transaction Date" + "Clearing Date" columns
- **Generic** — any CSV with date, description, and amount columns

### PDF
- Extracts text and attempts to find transaction-like rows (date + description + amount patterns)
- Works best with text-based PDFs (not scanned images)

## How It Works

1. **Upload**: Files are read as base64 in the browser, sent to `/api/upload` where they're parsed and transactions are inserted into Supabase
2. **Process**: Clicking "Generate Dashboard" calls `POST /api/dashboard` which fetches all transactions, builds the full analytics payload, and caches it
3. **Display**: The React frontend renders 8 Chart.js charts, insight cards, tips, and a paginated transaction table
4. **Security**: Supabase RLS ensures each user can only read/write their own transactions and dashboard cache

---

## Sharing with Friends

Since each user authenticates separately, you can share the deployed URL with anyone. They'll create their own account and upload their own statements — completely isolated from your data.
