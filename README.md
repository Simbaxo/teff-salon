# TEFF Beauty Salon — Management & Booking Platform

Production: https://teffbeauty.com

TEFF is a custom salon-management and online-booking platform developed for TEFF Beauty Salon in El Poblado, Medellín, Colombia.

The application connects customer bookings, technician scheduling, salon operations, checkout, financial records, inventory, payroll, customer history, and operational reporting.

**Status:** Live in Production
**Last documentation update:** November 2026
**Business timezone:** America/Bogota
**Currency:** Colombian pesos (COP)

## Technology Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16.4.6 (App Router) |
| Frontend | React 19.2.8, TypeScript |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL on Neon |
| ORM | Prisma 7.10.0 |
| Authentication | Auth.js / NextAuth |
| Hosting | Vercel |
| Media storage | Vercel Blob |
| Notifications | Web Push |
| Calendar | Google Calendar API |
| Reviews | Google Business Profile integration |
| Messaging infrastructure | WhatsApp / WAIA Connect |

## Application Roles

### OWNER

Full administrative access, including:

- Salon operations and appointments
- Checkout and sales
- Technician and service management
- Inventory and cashbox
- Payroll, commissions, deductions and payments
- Operating expenses and financial reporting
- Customer records and Google Reviews

### RECEPTIONIST

Operational access, including:

- Staff Agenda and appointment management
- Quick Booking
- Customer profiles
- Checkout and sales
- Cashbox operations
- Inventory
- Authorized receptionist reporting

Payroll administration and OWNER-only financial functions remain restricted.

Technicians are represented in the database for scheduling, qualifications, production, commissions and tips. They do not currently require application accounts.

## Implemented Features

### Public Booking

Route: `/book`

- Customer-facing service catalog
- Multiple services and compatible add-ons
- Qualified technician selection
- "Any Technician" automatic assignment
- Availability and conflict validation
- Technician schedule-block enforcement
- Colombian holiday-aware scheduling
- International phone-number handling
- Customer matching using normalized phone numbers
- Booking confirmation with service itinerary, pricing and technician details
- Location information and directions
- Responsive mobile booking interface

### Staff Agenda and Quick Booking

Route: `/staff`

- Daily appointments and technician filtering
- Appointment grouping for multi-service reservations
- Receptionist-created appointments
- Customer check-in and service-status changes
- Technician reassignment
- Appointment rescheduling
- Schedule management and unavailable-time blocks
- Appointment status and service summaries
- Completed appointment and finalized-sale views
- Staff booking confirmation interface

The Staff Agenda was refactored into focused components in November 2026, including `AppointmentCard`, `QuickBookingModal`, `AppointmentManagementControls`, `AppointmentStatusActions`, and `FinalizedSalesSection`.

### Receptionist Operations

Route: `/receptionist`

- Daily operating metrics
- Upcoming and current appointments
- Booking notification management
- Technician production reporting
- Weekly and monthly sales progress
- Technician activity details

The existing Receptionist Dashboard is implemented and deployed. A redesigned daily operating dashboard with consolidated tasks and more advanced workflows is a future enhancement.

### Checkout and Sales

Routes: `/staff/checkout/[id]`, `/sales`, `/staff/historical`

- Editable services and compatible add-ons
- Authorized checkout price adjustments
- Discounts and service promotions
- Cash, Bold/card, bank transfer and split payments
- Technician attribution for completed services
- Commission calculation
- Separate technician-tip accounting
- Final sale line-item snapshots
- Historical appointment and sale entry
- Duplicate-checkout protections
- Sales reporting and finalized-sale visibility

### Payroll

Route: `/admin/payroll`

OWNER-only functionality:

- Monday–Sunday payroll periods
- Technician production and commissions
- Tips, bonuses, loans and deductions
- Fixed compensation where configured
- Draft, review and settlement workflow
- Locked payroll periods and reconciliation
- Manual payment recording
- Zero-balance settlement
- Duplicate-payment and transaction protections

**Important:** TEFF records payments made outside the application. It does not initiate bank transfers or pay employees automatically.

### Cashbox

Route: `/cashbox`

- Cash balance tracking
- Cash movement registration
- Physical cash counts
- Technician loans
- OWNER-authorized cash adjustments and deposits
- Movement history and reconciliation controls

### Inventory

Route: `/inventory`

- Inventory product management
- Categories and stock quantities
- Low-stock and out-of-stock indicators
- Shopping list
- Restock, usage, damage and correction movements
- Movement audit history
- Product archive and restoration
- Inventory images

### Expenses and OWNER Reporting

Routes: `/admin`, `/admin/expenses`

- Daily, weekly and monthly reporting
- Technician production reporting
- Sales goals and progress indicators
- Payment-method summaries
- Expense categories and operating expenses
- Recurring expense management
- Expense receipts and review workflows
- Profit-and-loss calculation infrastructure

Financial reporting should distinguish salon revenue, technician earnings, tips, cash movements and operating expenses.

### Google Calendar

**Status:** Implemented and operationally verified.

- Google authorization and calendar connection
- Appointment synchronization through a job queue
- Calendar event creation and updates
- Cancellation and technician reassignment handling
- Technician-specific event colors
- America/Bogota scheduling

Implementation: `src/lib/google-calendar/`

### Google Reviews

**Status:** Implemented, including review synchronization and Spanish translation.

Route: `/reviews`

- Connected Google Reviews data
- Review synchronization and statistics
- Review sorting and display
- Spanish translation
- Translation caching and quota controls
- Google Reviews connection management

Implementation: `src/lib/google-reviews/`

### Notifications and WhatsApp

- Web Push support for new customer reservations
- Authorized staff device subscriptions
- Background notifications
- WhatsApp notification models, queue, templates, validation and worker infrastructure

**WhatsApp sending availability is configuration-dependent.** The presence of the integration code does not mean automated sending is enabled in Production.

## Branding and User Experience

TEFF uses a premium green brand palette:

- Primary green: `#1F5A43`
- Dark green hover: `#174632`
- Pale green highlight: `#EDF6F0`

The November 2026 branding release replaced the former rose-gold interface accents while preserving the existing layouts.

Service-category colors remain distinct:

- Uñas — Pink
- Pestañas — Purple
- Cejas y Depilación — Amber
- Estética — Green

The internal interface is designed primarily in Spanish and supports desktop, mobile and the salon's iPad.

## Application Structure

```text
src/
  app/
    admin/           OWNER administration
    api/             Protected and public API routes
    book/            Customer booking
    cashbox/         Cash operations
    catalog/         Service catalog
    inventory/       Inventory management
    receptionist/    Receptionist operations
    reviews/         Google Reviews
    sales/           Sales reporting
    staff/           Appointments, customers and checkout
  components/        Shared UI components
  lib/               Business logic and integrations
  generated/prisma/  Generated Prisma client

prisma/
  migrations/        Database migration history
  schema.prisma      Database models

scripts/             Development, testing and maintenance utilities
```

The Prisma schema includes models for bookings, appointments, sales, commissions, payroll, inventory, expenses, cashbox movements, Google integrations, WhatsApp notifications and more.

## Development and Database Safety

**CRITICAL: Never assume local commands use the Development database.**

The existing `DATABASE_URL` configuration can point to Neon Production. Prisma commands and the standard `npm run dev` script do not automatically switch to an isolated database.

Before executing database writes, migration commands, seed scripts, cleanup commands or operational tests, verify the active database environment.

### Approved Booking Development Server

```bash
node scripts/start-booking-test-server.cjs
```

Local URL: http://127.0.0.1:3102

This script:

- Validates approved Production and Development endpoints
- Uses `TEST_DATABASE_URL` as the running server's database connection
- Rejects unsafe configurations
- Uses a separate Next.js build directory
- Suppresses Web Push notifications during booking tests

### Other Test Servers

Checkout:

```bash
node scripts/start-checkout-test-server.cjs
```

Port: `3101`

**Requires a prepared checkout test fixture.** Do not run without verifying the fixture and its cleanup requirements.

Cashbox:

```bash
node scripts/start-cashbox-test-server.cjs
```

Port: `49647`

Both scripts validate the expected Neon environment before starting.

These are specialized testing environments, not a substitute for checking the database target before running standalone scripts.

### Code Validation

Run:

```bash
npx tsc --noEmit --incremental false
git --no-pager diff --check
```

Production build verification:

```bash
npm run build
```

The build generates the Prisma client and compiles the Next.js application. A successful build is not a substitute for application workflow testing.

### Database Migrations

Prisma configuration: `prisma7.config.ts`

Migration directory: `prisma/migrations/`

The repository contained 51 migration directories at the November 2026 documentation review.

Do not apply migrations, reset databases, run seeds or clean records without explicitly verifying the target environment and intended changes.

## Environment Configuration

Configuration values are supplied through environment variables and deployment settings.

Key names include:

- `DATABASE_URL`
- `TEST_DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `CRON_SECRET`
- `NEXT_PUBLIC_GOOGLE_MAPS_STATIC_API_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `TEFF_GOOGLE_CALENDAR_*`
- `TEFF_GOOGLE_REVIEWS_*`
- `TEFF_WHATSAPP_*`
- `WAIA_*`
- Vercel Blob storage tokens

Some integrations require additional enablement flags, OAuth credentials, encryption keys or scheduled workers.

**Never commit `.env` files, access tokens, passwords, database connection strings or private keys.**

## Deployment

Production website: https://teffbeauty.com

Hosting: Vercel
Source control: GitHub

Recommended release workflow:

1. Create a dedicated feature branch.
2. Inspect the existing implementation before editing.
3. Make focused, reviewed changes.
4. Run TypeScript, Git validation and the Production build.
5. Test relevant workflows against the approved Development environment.
6. Commit and push the verified changes.
7. Merge into `main`.
8. Deploy through the configured Vercel workflow.
9. Verify the live application.
10. Clean up the completed feature branch.

Do not assume a GitHub push does or does not trigger automatic deployment; verify Vercel configuration and deployment status.

## Recent Milestones

| Period | Milestone |
| --- | --- |
| September 2026 | Original production MVP |
| October 2026 | Expanded booking, inventory and payroll capabilities |
| November 2026 | Google integration, staff workflow and operational improvements |
| November 2026 | Staff Agenda component refactoring |
| November 2026 | Green branding deployed and Production-verified |

## Future Enhancements

These are potential improvements, not claims of implemented functionality:

- Expanded Receptionist Daily Dashboard
- More advanced cash reconciliation and financial analytics
- Customer retention and rebooking tools
- Further inventory reporting and cost analysis
- Additional WhatsApp automation after configuration and delivery verification
- Additional payroll and reporting exports
- Improved operational documentation and automated testing

## Maintenance Principles

- Protect Production data.
- Use isolated Development environments for testing.
- Preserve historical financial snapshots.
- Apply authorization checks on the server.
- Avoid changing business logic during styling-only refactors.
- Keep customer and staff information private.
- Verify deployed workflows before closing a release.

---

**TEFF Beauty Salon**
El Poblado, Medellín, Colombia
https://teffbeauty.com

Internal project documentation. Not a public API specification.
