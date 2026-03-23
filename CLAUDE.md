# VillageClaq - Development Conventions

## Project Overview
Multi-tenant SaaS platform for African community groups (njangis, alumni unions, village associations, church groups). One account, many groups model.

## Tech Stack
- **Framework**: Next.js 15 (App Router, TypeScript, `src/` directory)
- **Database/Auth/Storage**: Supabase (PostgreSQL + Auth + RLS + Realtime + Storage)
- **Styling**: TailwindCSS v4 + shadcn/ui (emerald/slate theme)
- **i18n**: next-intl (EN/FR bilingual, every string through `t()`)
- **Data Fetching**: TanStack Query v5
- **Charts**: Recharts
- **Hosting**: Vercel
- **Icons**: Lucide React

## Critical Rules

### 1. ZERO Hardcoded Strings
Every UI-facing string MUST use `next-intl` translation keys via `t()` or `useTranslations()`. Add keys to both `messages/en.json` and `messages/fr.json` before using them. No exceptions.

### 2. Single Auth Source of Truth
Supabase Auth + Next.js middleware (`src/middleware.ts`). No duplicate auth checks. Use `createClient()` from `@/lib/supabase/server` or `@/lib/supabase/client`.

### 3. Dark Mode from Day 1
Use Tailwind `dark:` variant + CSS variables defined in `globals.css`. Theme toggle uses `next-themes`. All new components must look correct in both light and dark modes.

### 4. Mobile-First
Design for 375px width first. Sidebar collapses to hamburger on mobile. Use responsive Tailwind classes (`sm:`, `md:`, `lg:`).

## Directory Structure
```
src/
├── app/[locale]/
│   ├── (auth)/          # Login, signup (unprotected)
│   ├── (dashboard)/     # Dashboard routes (protected by middleware)
│   └── layout.tsx       # Root locale layout with providers
├── components/
│   ├── layout/          # Sidebar, Header, GroupSwitcher, etc.
│   └── ui/              # shadcn/ui components
├── i18n/
│   ├── request.ts       # Server-side i18n config
│   └── routing.ts       # Locale routing + navigation helpers
├── lib/
│   ├── supabase/        # client.ts, server.ts, middleware.ts
│   ├── providers.tsx    # QueryClient + ThemeProvider + TooltipProvider
│   └── utils.ts         # cn() helper from shadcn
├── middleware.ts        # Combined Supabase auth + next-intl middleware
messages/
├── en.json              # English translations
├── fr.json              # French translations
supabase/
├── migrations/          # SQL migration files
└── seed.sql             # Test data
```

## Database Conventions
- All tables use UUID primary keys
- All tables have `created_at` and `updated_at` (TIMESTAMPTZ, auto-managed)
- RLS enabled on every table
- Memberships table is the core junction: user_id + group_id + role + standing
- Enum types for membership_role, membership_standing, invitation_status, notification_type

## Component Conventions
- Use shadcn/ui components from `@/components/ui/`
- Client components must have `"use client"` directive
- Import navigation from `@/i18n/routing` (Link, useRouter, usePathname, redirect)
- Use `useTranslations()` hook in client components, `useTranslations()` import from `next-intl` in server components

## Supabase Client Usage
- **Server Components / Server Actions**: `import { createClient } from '@/lib/supabase/server'`
- **Client Components**: `import { createClient } from '@/lib/supabase/client'`
- Never import server client in client components or vice versa

## Multi-Tenancy Model
- Users sign up once (Supabase Auth -> profiles table)
- `memberships` table links users to groups (many-to-many)
- Each membership has its own role, standing, display_name, privacy settings
- Group Switcher reads from memberships to show all user's groups
- Position-based permissions (group_positions -> position_permissions)
