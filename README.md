# DRscore - AWS Disaster Recovery Readiness Scorer

DRscore helps teams assess AWS disaster recovery readiness, track historical assessments, compare against community benchmarks, and share practical DR tips.

## Features

- Checklist-based AWS DR scoring with weighted controls
- User authentication (Supabase Auth)
- Save, load, update, and delete assessments
- Overwrite confirmation for duplicate assessment names
- Community benchmark panel and "most skipped" insights
- Community tips submission and display
- Vercel Analytics integration

## Tech Stack

- Next.js (App Router)
- React
- TypeScript
- Supabase (Auth + Postgres + RPC)
- Vercel (deployment + analytics)

## Local Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Create environment variables

Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3) Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase Requirements

This app expects:

- an `assessments` table
- a `community_tips` table
- an RPC function named `get_community_stats`

The UI currently reads/writes these fields:

- `assessments`: `id`, `user_id`, `name`, `score`, `checked_items`, `company_size`, `created_at`
- `community_tips`: `id`, `item_id`, `tip_text`, `author_label`, `user_id`, `created_at`

Also ensure Row Level Security policies allow authenticated users to perform the intended operations for their own records.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Deployment

Deploy on Vercel:

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Add the same environment variables in Vercel project settings.
4. Deploy.

## Project Structure

- `app/page.tsx` - main DR scorer UI and dashboard/community views
- `app/auth/page.tsx` - sign in/sign up UI
- `app/auth/callback/route.ts` - auth callback handler
- `utils/supabase/client.ts` - browser Supabase client
- `utils/supabase/server.ts` - server Supabase client
- `middleware.ts` - auth/session middleware setup

## Notes

- The app is optimized for authenticated usage (assessment persistence and tip posting).
- Community data has fallback values in UI if live queries fail.
