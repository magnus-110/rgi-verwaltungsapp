# RGI Verwaltungsapp — Project Skill

You are working on **rgi-verwaltungsapp**, a German property management SaaS (Hausverwaltung / WEG-Verwaltung) built by Magnus Gottinger for the company RGI. Read this file fully before touching any code.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui (Radix primitives) + Tailwind CSS |
| Backend | Supabase (Postgres, Auth, Edge Functions, Storage, Realtime) |
| Forms | react-hook-form + zod |
| Data fetching | @tanstack/react-query |
| Routing | react-router-dom v6 |
| PDF | jspdf / jspdf-autotable / react-pdf |
| DOCX | docxtemplater + pizzip |
| Charts | recharts |
| Build platform | Lovable.dev (changes auto-commit to this repo) |
| PWA | vite-plugin-pwa |

---

## App Architecture

### User Roles & Layouts
The app has three distinct user portals, each with its own layout component:

- **Admin** (`AdminLayout.tsx`) — property managers at RGI. Full access to all features.
- **WEG-Owner** (`WegOwnerLayout.tsx`) — apartment owners (Eigentümer) in a WEG. Read-only / self-service portal.
- **Tenant** (`TenantLayout.tsx`) — renters (Mieter). Limited self-service portal.

Role guards are enforced via `RequireMfa.tsx` and the `useAuth` hook (`src/hooks/useAuth.tsx`).

### Routing
All routes are defined in `src/App.tsx`. Pages live in `src/pages/`. Tenant pages are under `src/pages/tenant/`, WEG-owner pages under `src/pages/weg-owner/`.

### Key Pages (Admin)
| Page | File | Description |
|---|---|---|
| Dashboard | `src/pages/Dashboard.tsx` | Overview widgets |
| Buildings | `src/pages/Buildings.tsx` | Building list + detail tabs |
| Finance | `src/pages/Finance.tsx` | Bookings, invoices, billing, bank reconciliation |
| Contacts | `src/pages/Contacts.tsx` | Tenants, owners, service providers |
| Inbox | `src/pages/Inbox.tsx` | Email inbox (IMAP via Supabase Edge Functions) |
| Meetings | `src/pages/Meetings.tsx` | ETV (Eigentümerversammlung) management |
| Calendar | `src/pages/Calendar.tsx` | Calendar / Jahreszyklus |
| Cases | `src/pages/Processes.tsx` | Case / ticket management |
| Todos | `src/pages/Todos.tsx` | Task management |
| Reports | `src/pages/Reports.tsx` | Nebenkostenabrechnung, annual reports |
| Transfers | `src/pages/Transfers.tsx` | Bank transfer review |
| Files | `src/pages/Files.tsx` | Document management system (DMS) |
| Settings | `src/pages/Settings.tsx` | App settings |
| RGI Intern | `src/pages/RgiIntern.tsx` | Internal RGI billing, time tracking, clients |

---

## Component Structure

Components are co-located by feature domain under `src/components/`:

```
src/components/
├── buildings/          # Building detail tabs (overview, finance, documents, keys, maintenance...)
│   ├── keys/           # Key management + signature pad
│   ├── documents/      # DMS folder tree + upload
│   ├── onboarding/     # Building onboarding wizard
│   └── takeover/       # Building takeover checklist
├── finance/            # All finance UI (bookings, invoices, billing, bank, 35a, accruals...)
│   ├── rent/           # Rent-specific accounting
│   └── lib/            # Pure finance calculation helpers
├── meetings/           # ETV / meeting management
├── communication/      # Email campaign wizard, templates, WYSIWYG editor
├── email/              # Inbox UI components
├── cases/              # Case/ticket components
├── contacts/           # Contact list + detail
├── broker/             # Broker (Makler) portal components
├── onboarding/         # New building onboarding wizard (multi-step)
├── rgi-intern/         # Internal RGI tooling (invoices, time, clients, projects)
│   ├── clients/
│   ├── invoices/
│   ├── projects/
│   ├── time/
│   └── timeclock/      # Admin time clock overview
├── timeclock/          # Employee time clock button + popover
├── chat/               # AI chatbot UI
├── calendar/           # Calendar components
├── todos/              # Todo components
├── ui/                 # shadcn/ui base components (do not modify)
├── admin/              # Admin-specific shared components
├── dashboard/          # Dashboard widgets
└── shared/             # Cross-cutting shared components
```

---

## Supabase Integration

### Client
`src/integrations/supabase/client.ts` — import `supabase` from here for all DB/auth calls.

### Types
`src/integrations/supabase/types.ts` — auto-generated DB types. **Never edit manually.** Regenerate with `supabase gen types typescript`.

### Edge Functions
All backend logic lives in `supabase/functions/`. Each function is a Deno TypeScript module with its own `index.ts`. Shared utilities are in `supabase/functions/_shared/`.

Key edge functions:
- `fetch-emails` — IMAP email fetching
- `extract-invoice` — AI-powered invoice OCR
- `analyze-billing` — AI billing analysis
- `generate-billing-document` — PDF generation for Nebenkostenabrechnung
- `etv-render-protocol` — ETV protocol PDF generation
- `chat-with-ai` — AI chatbot
- `send-email` — transactional email sending
- `comm-send-bulk-email` — bulk email campaign dispatch
- `parse-bank-statement` / `parse-bank-statement-pdf` — bank statement import

### Migrations
`supabase/migrations/` — all DB schema changes. Files are named `{timestamp}_{uuid}.sql`. Always create a new migration file; never modify existing ones.

---

## Key Hooks

| Hook | File | Purpose |
|---|---|---|
| `useAuth` | `src/hooks/useAuth.tsx` | Auth state, user profile, role |
| `useTodos` | `src/hooks/useTodos.tsx` | Todo CRUD |
| `useCases` | `src/hooks/useCases.tsx` | Case management |
| `useCalendar` | `src/hooks/useCalendar.tsx` | Calendar events |
| `useTimeClock` | `src/hooks/useTimeClock.ts` | Time clock (clock in/out, entries) |
| `useManagementMode` | `src/hooks/useManagementMode.tsx` | WEG vs. Mietverwaltung mode switch |
| `useBrokerMode` | `src/hooks/useBrokerMode.tsx` | Broker portal toggle |
| `useRgi` | `src/hooks/useRgi.ts` | RGI internal data |
| `useEmailTemplates` | `src/hooks/useEmailTemplates.ts` | Email template management |

---

## Finance Module (Most Complex)

The finance module (`src/components/finance/`) handles:
- **Bookings** — double-entry accounting entries
- **Invoices** — AI-extracted + manual invoices from vendors
- **Bank statements** — imported via CSV or PDF
- **Bank reconciliation** — matching transactions to bookings
- **Billing (Nebenkostenabrechnung)** — annual utility cost settlement per unit
- **Economic plan (Wirtschaftsplan)** — annual budget planning
- **§35a certificates** — tax certificates for homeowners
- **Distribution keys (Verteilerschlüssel)** — cost allocation between units
- **Cash audit (Kassenprüfung)** — cash account audit workflow

Key lib files:
- `src/components/finance/lib/buildBillingPayload.ts` — constructs billing calculation payload
- `src/components/finance/lib/paragraph35aDistribution.ts` — §35a tax distribution
- `src/components/finance/lib/sollstellung.ts` — Sollstellung (debit memo) logic
- `src/lib/services/nebenkosten.ts` — Nebenkosten calculation service

---

## Domains & German Terminology

| German | English |
|---|---|
| Gebäude / Liegenschaft | Building / Property |
| WEG | Wohnungseigentümergemeinschaft (condo association) |
| ETV / ETVProxy | Eigentümerversammlung (owners' meeting) |
| Mieter | Tenant / Renter |
| Eigentümer | Owner |
| Hausverwalter | Property manager |
| Nebenkostenabrechnung | Utility cost settlement |
| Wirtschaftsplan | Economic plan / budget |
| Stempeluhr | Time clock |
| Verteilerschlüssel | Distribution key (cost allocation) |
| Sollstellung | Debit memo / rent demand |
| Kassenprüfung | Cash audit |
| Jahreszyklus | Annual cycle |
| Makler | Broker / Real estate agent |
| Buchung | Booking / accounting entry |
| Kontenplan | Chart of accounts |
| Abrechnung | Settlement / billing |

---

## Common Tasks

### Adding a new building tab
1. Create component in `src/components/buildings/BuildingXyzTab.tsx`
2. Add a `TabsTrigger` + `TabsContent` in `src/components/buildings/BuildingDashboard.tsx`

### Adding a new admin page
1. Create page in `src/pages/MyPage.tsx`
2. Add route in `src/App.tsx`
3. Add nav item in `src/components/AdminSidebar.tsx`

### Adding a new Supabase Edge Function
1. Create `supabase/functions/my-function/index.ts`
2. Use Deno + `@supabase/supabase-js` with the service role key from env
3. Deploy via `supabase functions deploy my-function`

### Adding a DB table
1. Create migration: `supabase/migrations/{timestamp}_{uuid}.sql`
2. Define table, RLS policies, and grants (authenticated + service_role)
3. Regenerate types: `supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts`

### Working with AI features
AI-powered features call Supabase Edge Functions which in turn call OpenAI or Anthropic APIs. See functions like `extract-invoice`, `analyze-billing`, `chat-with-ai`.

---

## Dev Workflow

```sh
npm install          # install dependencies
npm run dev          # start dev server (Vite)
npm run build        # production build
npm run lint         # ESLint check
```

Supabase local dev:
```sh
supabase start       # start local Supabase stack
supabase db reset    # reset DB + run all migrations
supabase functions serve  # serve edge functions locally
```

The project also editable via **Lovable.dev** — commits made there auto-push to this repo. Keep that in mind; changes from Lovable and local edits can conflict.

---

## Important Conventions

- All components use `shadcn/ui` primitives from `src/components/ui/` — never reach for raw HTML elements when a shadcn component exists.
- Toast notifications use `sonner` via `src/lib/inAppToast.tsx`.
- Data fetching uses `@tanstack/react-query` — mutations invalidate relevant query keys after success.
- German is the primary language for all UI text, comments, and domain logic.
- RLS (Row Level Security) is enforced at the DB level; the frontend trusts Supabase to enforce it.
- The `admin` role is checked server-side via `has_role(auth.uid(), 'admin')` in RLS policies.
- MFA is required for admin users — enforced by `RequireMfa.tsx` wrapping protected routes.
