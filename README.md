# 🗺️ TEFF Salon App Roadmap

TEFF Salon is a full salon management and customer booking application being built for real-world use at TEFF Beauty Salon.

The goal of the MVP is to manage the complete salon workflow:

**Customer Booking → Scheduling → Staff Operations → Service → Checkout → Payments → Commissions → Basic Owner Reporting**

---

## 📍 Current Progress

| Phase | Area | Status |
|---|---|---|
| 1 | Project Foundation | ✅ Complete |
| 2 | Database & Salon Data | ✅ Core Complete |
| 3 | Customer Booking | ✅ Core Complete |
| 4 | Scheduling & Availability | ✅ Core Complete |
| 5 | Staff Operations & Authentication | ✅ MVP Complete |
| 6 | Checkout, Payments & Commissions | ✅ MVP Complete |
| 7 | Owner Dashboard & Reporting | ✅ v1 Complete |
| 8 | Production Readiness & Deployment | ✅ Complete |
| 9 | Receptionist Dashboard | ✅ v1 Complete |
| 10 | Post-MVP Operations & Scheduling | ✅ Active Features Deployed |
| 11 | Inventory Management | 🚧 Next Major Phase |

**MVP completion: 100% — deployed and production smoke-tested September 15, 2026.**

*The live application now extends beyond the original MVP with Receptionist Dashboard v1, Any Technician assignment, historical appointment/sale entry, technician schedule blocking, checkout price adjustments, technician activity reporting, upcoming appointment views, multi-service reservation grouping, and an enhanced customer booking confirmation experience.*

---

# ✅ Phase 1 — Project Foundation

*Core development environment and application architecture.*

### Completed

- Next.js
- React
- TypeScript
- Tailwind CSS
- Next.js App Router
- Git / GitHub
- PostgreSQL
- Neon database hosting
- Prisma ORM
- Prisma migrations
- Prisma Studio
- Shared language context
- Spanish / English customer interface
- `/book` customer route
- `/staff` internal staff route
- API route structure

---

# ✅ Phase 2 — Database & Salon Data

*The application now uses real relational salon data rather than hard-coded frontend data.*

### Implemented Models

- Customer
- Employee
- Service
- Addon
- EmployeeService
- ServiceAddon
- Appointment
- AppointmentService
- AppointmentAddon
- User
- Sale
- SaleAppointment
- SaleLineItem
- Payment
- Commission
- Tip
- SalonSettings
- EmployeeScheduleBlock
- PushSubscription

### Implemented Relationships

- Employees ↔ Services
- Services ↔ Add-ons
- Customers → Appointments
- Employees → Appointments
- Appointments → Services
- Appointments → Add-ons
- Appointments → Sales
- Sales → Payments
- Sales → Commissions
- Sales → Tips
- Users → optional Employee account
- Employees → Schedule Blocks
- Users → Push Subscriptions

Appointment services and add-ons store price and duration snapshots so historical bookings are not affected if menu prices change later.

---

# ✅ Phase 3 — Customer Booking

*Customers can complete a real appointment booking flow.*

### Current Booking Flow

1. Select one or more services
2. Select available add-ons
3. Select a qualified technician
4. Select appointment date
5. Select available time
6. Enter customer information
7. Review appointment
8. Confirm booking
9. Appointment is saved to PostgreSQL

### Implemented Features

- Multiple services per appointment
- Service add-ons
- Technician filtering by selected services
- Dynamic appointment duration
- Dynamic pricing
- Spanish / English interface
- Customer information collection
- Booking review screen
- Booking confirmation screen
- Real database appointment creation
- `BOOKED` appointment status
- `REQUESTED` status for services requiring approval
- Repeat customers are matched by normalized phone number instead of creating duplicate Customer records.
- New appointments reuse the existing customer profile and keep the customer's name/email current.
- Customer phone numbers are normalized into a consistent international format.
- Colombian mobile numbers default to the +57 country code.
- International customers can select their country code during booking.
- Full international numbers entered manually are supported without duplicating the selected country code.
- Enhanced customer booking confirmation receipt
- Confirmation shows the complete multi-service itinerary
- Confirmation shows actual assigned technician and start time for each service
- Confirmation shows service and add-on prices plus the complete booking total
- Fully confirmed bookings display `¡Tu cita está confirmada!`
- Approval-required bookings display `Solicitud recibida` instead of incorrectly implying confirmation
- Multi-technician bookings display the correct technician for each individual service
- `Reservar otra cita` action available after successful booking


### Booking Confirmation v2 — October 2026

**Status:** Implemented and tested locally. Production deployment pending.

- [x] Personalized confirmation greeting using the customer's name
- [x] Spanish and English confirmation messages
- [x] Clear distinction between confirmed bookings and approval-required requests
- [x] Correct Spanish date capitalization
- [x] TEFF's verified address: Cra. 43A #11-73, El Poblado, Medellín
- [x] Google Maps Static API preview centered on TEFF
- [x] Clickable map and directions link to the official Google Maps listing
- [x] Responsive map with Google attribution preserved
- [x] Lazy-loaded map image to minimize unnecessary loading
- [x] Restricted Google Maps API key for approved domains
- [x] Google Cloud monthly budget alerts configured at $5 USD
- [x] Local desktop and mobile testing completed
- [x] Existing multi-service confirmation and technician details preserved

**Google Maps configuration:**
- Environment variable: `NEXT_PUBLIC_GOOGLE_MAPS_STATIC_API_KEY`
- API: Google Maps Static API
- Production key configured in Vercel
- Google Cloud budget alerts monitor spending but do not enforce a hard spending limit

**Pending:**
- [ ] Final production deployment
- [ ] Verify Google Maps rendering on teffbeauty.com
- [ ] Complete production confirmation-screen smoke test

---

# ✅ Phase 4 — Scheduling & Availability

*The booking system checks real appointments before displaying available times.*

### Implemented

- Technician-specific availability
- Appointment duration blocking
- Existing appointment conflict detection
- Server-side conflict protection
- `BOOKED`, `REQUESTED`, `CHECKED_IN`, and `IN_PROGRESS` appointments block availability
- HTTP `409` response when a time becomes unavailable
- Customer-facing message when another customer books a selected time
- Real appointment data used for availability
- Public availability API exposes only the scheduling data required by the booking system
- Customer personal information is excluded from public availability responses
- Server-side booking validation now enforces valid IDs, active technicians, Medellín dates, and TEFF business hours.
- Customer booking slots now match TEFF hours: Mon–Sat 9:30–18:30, Sunday 10:30–17:30.
- Fixed server-side opening-hours validation for Monday-Saturday 9:30 AM.

### Technician Schedule Blocking

- OWNER and RECEPTIONIST can block technician availability
- Schedule blocks support date, start time, end time, and an optional operational reason
- Blocks can represent vacation, late arrival, early departure, appointments, or other unavailable periods
- Overlapping schedule blocks for the same technician are rejected
- Schedule blocks are stored separately from appointments
- Public booking availability receives only the scheduling fields required to calculate availability
- Internal schedule-block reasons are not exposed to customers
- Customer booking slots respect technician schedule blocks
- Server-side booking validation respects schedule blocks
- `Any Technician` excludes technicians who are blocked during the requested service
- Appointment rescheduling cannot move a service into blocked time
- Technician reassignment cannot move a service to a technician who is blocked
- Removing a schedule block immediately restores normal availability

### Concurrency Protection

- Database-level Serializable transaction protection
- Automatic retry handling for Prisma transaction conflicts
- Concurrent booking requests cannot reserve the same technician/time slot
- Race-condition protection verified with simultaneous booking requests

---

# ✅ Phase 5 — Staff Operations & Authentication

*The internal staff application manages TEFF's daily appointment workflow.*

### Implemented Staff Interface

- Spanish-only staff interface
- Daily appointment view
- Filter appointments by date
- Group appointments by technician
- Sort appointments by time
- Display customer information
- Display services
- Display add-ons
- Display appointment duration
- Display appointment status
- Added protected customer profile API with appointment history.
- Customer history includes technician, services, add-ons, status, date, and duration.
- Customer profile data is restricted to OWNER and RECEPTIONIST roles.
- Added staff-facing customer profile page for OWNER and RECEPTIONIST.
- Customer profiles show contact information, completed visits, no-shows, lifetime spend, and last visit.
- Appointment history shows technician, services, add-ons, duration, Spanish status labels, and actual checkout totals when available.
- Customer names in the staff appointment view link directly to their customer profiles.
- Customer profiles include navigation back to the staff appointment view.
- Shared role-aware navigation between Staff, Reception, and Admin.
- OWNER navigation includes Staff, Reception, and Admin.
- RECEPTIONIST navigation includes Staff and Reception without exposing Admin.
- Appointment status badges use distinct colors for faster operational scanning.
- Workflow actions use distinct colors for check-in, service start, and service completion.
- Multi-service reservations are visually distinguished from standalone appointments
- Multi-service cards show `Servicio X de Y`
- Related service cards show `Misma reserva #X`
- Multi-service reservations use a distinct visual treatment for faster staff scanning
- Added `/staff/upcoming` future-appointments agenda
- Upcoming appointments are grouped chronologically by date
- Upcoming agenda shows customer, technician, service, add-ons, time, and status
- Multi-service reservations retain `Servicio X de Y` and `Misma reserva #X` identification in the upcoming agenda
- Staff page includes a direct `Ver próximas citas` action

### Historical Appointment & Sale Entry

- OWNER and RECEPTIONIST can register services that occurred before they were entered into the live app
- Historical entry creates real Customer, Booking, Appointment, Sale, Payment, Commission, Tip, and line-item records
- Existing customers are reused by normalized phone number
- Multiple services can be entered in one historical visit
- Each historical service can be assigned to the technician who actually performed it
- Compatible add-ons can be attached to historical services
- Historical service and add-on prices can be adjusted to the actual amount charged
- Discounts are supported
- Cash, Bold, transfer, and split payments are supported
- Technician tips are supported
- Historical commissions are generated from actual recorded production
- Historical records feed normal reporting instead of living in a separate reporting system
- Historical appointment timestamps reflect the actual historical service date rather than the date the record was entered

### Appointment Workflow

```text
Reservada

↓

Cliente llegó

↓

En servicio

↓

Finalizar servicio

↓

Checkout
```

### Staff Workflow Features

- Appointment status updates
- `BOOKED` → `CHECKED_IN`
- `CHECKED_IN` → `IN_PROGRESS`
- `BOOKED` → `CANCELLED`
- `BOOKED` → `NO_SHOW`
- Cancellation confirmation prevents accidental cancellations
- No-show confirmation prevents accidental status changes
- No-show action is only available once the appointment start time has arrived
- Checkout available for appointments in progress
- Check-in timestamps
- Service start timestamps
- Completion timestamp recorded after successful checkout
- Completed appointments protected from duplicate checkout

### Authentication & Permissions

- Auth.js authentication
- Email/password login
- Passwords securely hashed with bcrypt
- Authenticated staff sessions
- Logout functionality
- Protected `/staff` route
- Protected checkout route
- Protected appointment status API
- Protected checkout API
- Protected detailed appointment API
- Server-side role authorization
- `401 Unauthorized` protection for unauthenticated requests
- `403 Forbidden` protection for unauthorized roles

### Current Roles

- `OWNER`
- `RECEPTIONIST`
- `TECHNICIAN`

Current access policy:

- OWNER → staff application and checkout
- RECEPTIONIST → staff application and checkout
- TECHNICIAN → no application access yet

Technicians remain Employee records for scheduling, commissions, and tips without requiring login accounts.

### Future Security & Experience Hardening

- Improved loading and error states
- Production-safe date handling
- Password change/reset
- Login rate limiting / lockout protection
- Session revalidation when account roles or active status change

---

# ✅ Phase 6 — Checkout, Payments & Commissions

*The checkout system converts completed salon services into permanent financial records while keeping payments, commissions, and technician tips separated.*

### Implemented Checkout Flow

1. Load the appointment and its originally booked services and add-ons
2. Review services before checkout
3. Add or remove services
4. Add or remove compatible add-ons
5. Apply a discount
6. Select one or more payment methods
7. Add an optional technician tip
8. Validate the complete transaction
9. Save the sale atomically
10. Mark the appointment as completed

### Services & Add-ons

- Editable services during checkout
- Editable add-ons during checkout
- Add-on compatibility validation
- Technician qualification validation
- Booked-price protection
- Newly added checkout items use the current menu price
- Final sold items stored as permanent sale line-item snapshots
- Originally booked inactive services remain valid at checkout
- Originally booked inactive add-ons remain valid at checkout
- Originally booked services remain valid if technician qualifications later change
- Originally booked add-ons remain valid if service/add-on relationships later change
- Newly added services must satisfy current technician qualifications
- Newly added add-ons must satisfy current compatibility rules
- Checkout-added revenue must be fully attributed to technicians before a sale can complete.
- Single-technician visits automatically attribute newly added checkout items to that technician.
- Multi-technician visits reject ambiguous checkout-added items instead of guessing technician ownership.
- Checkout verifies that attributed pre-discount revenue equals the sale subtotal before commission calculation.
- OWNER and RECEPTIONIST can adjust individual service prices during checkout
- OWNER and RECEPTIONIST can adjust individual add-on prices during checkout
- Checkout subtotal recalculates from the adjusted line-item prices
- Sale line items preserve the actual final price charged
- Commission calculations use the adjusted sale values
- Money-entry fields automatically select an initial `0` so staff can replace it directly on desktop and iPad

### Discounts

- Discounts applied before commission calculation
- Final sale total calculated as:

`finalTotal = subtotal - discountTotal`

- Discounts cannot exceed the subtotal

### Payments

Supported payment methods:

- Cash
- Bold / Card
- Bank transfer
- Split payments across multiple payment methods
- Exact payment-total validation
- Server-side payment validation

### Commissions

- Technician commission automatically created during checkout
- Current commission rate: 50%
- Commission calculated from the final service sale after discounts
- Tips are excluded from commission calculations
- Commission payout status stored for future payroll management

### Technician Tips

Tips are tracked separately from salon service revenue.

**Cash tips**

- Assumed to be given directly to the technician
- Do not increase the amount TEFF must collect
- Stored with `PAID` status
- `paidAt` recorded immediately

**Bold / Transfer tips**

- Collected by TEFF on behalf of the technician
- Increase the amount charged to the customer
- Stored separately from salon revenue
- Stored with `PENDING` status until paid to the technician

Example:

```text
Services                 $100.000
Electronic Tip            $20.000
Customer Pays            $120.000
Sale Revenue             $100.000
Commission Base          $100.000
Technician Tip            $20.000
Payment Collected        $120.000
```

# ✅ Phase 7 — Owner Dashboard & Reporting

**Provide the owner with live operational and financial reporting across daily, weekly, and monthly periods.**

### Owner Access

- Owner-only `/admin` dashboard
- Server-side OWNER role protection
- Financial values formatted consistently in COP

### Today

- [x] Sales
- [x] Unique purchasing customers
- [x] Appointment count
- [x] Average ticket

### This Week

The TEFF reporting week runs Monday through Sunday.

- [x] Weekly sales
- [x] Unique weekly purchasing customers
- [x] Weekly appointment count
- [x] Weekly average ticket
- [x] Sales by active technician
- [x] Technician commissions
- [x] Pending and paid commission totals
- [x] Cash / Bold / transfer payment totals
- [x] Tip totals
- [x] Payment reconciliation

Active technicians remain visible with $0 production when they have no sales during the current week.

### This Month

- [x] Monthly sales
- [x] Unique monthly purchasing customers
- [x] Monthly appointment count
- [x] Monthly average ticket

### Sales Goals

Business targets are stored in `SalonSettings` rather than hard-coded into the dashboard.

Current initial targets:

- Weekly sales goal: $5.000.000 COP
- Monthly sales goal: $20.000.000 COP

Implemented goal reporting:

- [x] Configurable weekly sales goal
- [x] Configurable monthly sales goal
- [x] Weekly goal progress percentage
- [x] Monthly goal progress percentage
- [x] Weekly progress bar
- [x] Monthly progress bar
- [x] Amount sold toward each goal
- [x] Remaining amount required to reach each goal

### Financial Reconciliation

Weekly reconciliation compares:

`Payments received - Salon sales - Salon-collected technician tips`

A zero difference indicates that recorded payments reconcile with salon revenue and electronic tips collected on behalf of technicians.

### Current Status

**Owner Dashboard v1 core reporting is complete.**

Remaining owner-dashboard work is primarily UI polish and future advanced reporting rather than core operational reporting.

# ✅ Phase 8 — Production Readiness & Deployment

**Prepare, deploy, and verify the TEFF Salon MVP in a real production environment.**

### Production Infrastructure

- [x] Deploy TEFF Salon to Vercel
- [x] Configure production `DATABASE_URL`
- [x] Configure production `AUTH_SECRET`
- [x] Use `sslmode=verify-full` for PostgreSQL connections
- [x] Verify all required Prisma migrations are applied
- [x] Separate Neon production and development branches
- [x] Keep local development connected to the `development` branch
- [x] Keep Vercel connected to the `production` branch
- [x] Verify production build succeeds
- [x] Configure production Web Push VAPID keys
- [x] Apply `PushSubscription` production migration
- [x] Verify production Web Push delivery
- [x] Verify TEFF installation as an iPad Home Screen web app

### Security & Dependency Hardening

- [x] Update Next.js to 16.3.5
- [x] Resolve critical npm audit findings
- [x] Keep Prisma on 7.10.0 instead of forcing a breaking downgrade/upgrade
- [x] Preserve OWNER and RECEPTIONIST authentication
- [x] Verify production secrets are excluded from Git
- [x] Verify production database connection uses SSL certificate verification

### Production Smoke Test

The complete MVP workflow was tested successfully in production:

- [x] Production home page loads
- [x] Customer booking page loads with salon configuration
- [x] OWNER authentication works
- [x] Staff dashboard loads successfully
- [x] Customer can create an appointment
- [x] New appointment appears correctly in `/staff`
- [x] `BOOKED → CHECKED_IN → IN_PROGRESS` workflow works
- [x] Checkout successfully creates the sale, payment, and commission
- [x] Appointment becomes `COMPLETED`
- [x] Owner dashboard financial reporting is correct
- [x] Payment reconciliation returns zero difference
- [x] Completed appointment cannot be checked out again
- [x] Production smoke-test data removed after verification

### Production Baseline

After the production smoke test, temporary operational data was removed.

Production operational tables were verified at:

- Customers: 0
- Appointments: 0
- Sales: 0
- Payments: 0
- Commissions: 0
- Tips: 0

Salon configuration, employees, services, add-ons, relationships, and authorized staff accounts remain intact.

**MVP production deployment completed September 15, 2026.**

Live production application: `https://teffbeauty.com`

### Current Production Configuration

Production contains the active TEFF employee roster, complete service catalog, add-on catalog, employee/service qualifications, service/add-on compatibility mappings, authorized application users, and salon business settings.

Recent catalog updates include:

- Decorado Premium / Premium Design
- $30.000 COP
- +15 minutes
- Available across active nail services

### Current Operational Focus

- Continue live salon testing with OWNER and RECEPTIONIST workflows
- Validate iPad receptionist alert behavior
- Monitor schedule-blocking behavior during normal salon operations
- Continue entering real appointments through the live system
- Use historical entry when services were completed before being recorded in TEFF
- Collect operational feedback before beginning Inventory Management v1

### September 2026 Post-MVP Production Update

The TEFF application is now being used and tested against real salon workflows.

Recently completed and deployed:

- [x] Receptionist Dashboard v1
- [x] Any Technician automatic assignment
- [x] Appointment reassignment and rescheduling
- [x] Historical appointment and sale entry
- [x] Checkout line-item price adjustments
- [x] Technician schedule blocking
- [x] Schedule-block enforcement across all scheduling paths
- [x] Technician daily/monthly activity drill-down
- [x] Multi-service reservation visual grouping
- [x] Future appointment agenda
- [x] Enhanced customer booking confirmation receipt
- [x] Multi-technician confirmation details
- [x] Improved financial input behavior for staff
- [x] Web Push notifications for new customer reservations

Production notification status:

- [x] iPad Web Push notifications production-verified
- [x] OWNER notification delivery verified
- [x] RECEPTIONIST notification delivery verified
- [x] Real customer booking → background iPad notification verified

Next major planned operational feature:

- [ ] Inventory Management v1

## 🚀 Post-MVP Roadmap

The following features are intentionally planned for after the first production release of the TEFF Salon app.

### ✅ Receptionist Dashboard v1

Receptionist Dashboard v1 is complete and deployed to production.

#### Access & Navigation

- [x] Protected `/receptionist` route
- [x] OWNER and RECEPTIONIST access
- [x] Spanish-only receptionist interface
- [x] Shared Staff / Reception / Admin navigation
- [x] Role-aware navigation hides Admin from RECEPTIONIST accounts

#### Daily Operations

- [x] Today's appointment count
- [x] Clients attended
- [x] Clients currently in service
- [x] Today's sales
- [x] Chronological daily appointment view
- [x] Customer profile links
- [x] Technician, service, time, and appointment status visibility
- [x] Spanish-friendly current-date display

#### Appointment Management

- [x] Confirm requested appointments
- [x] Customer check-in
- [x] Start service
- [x] Send in-progress appointments to checkout
- [x] Cancel appointments with confirmation
- [x] Mark no-shows after the appointment start time
- [x] Reassign appointments between qualified technicians
- [x] Change appointment date and time
- [x] Preserve conflict and technician-qualification validation
- [x] Support existing appointment times outside standard 30-minute options
- [x] Block technician schedules for unavailable periods
- [x] Delete schedule blocks to restore availability
- [x] Schedule blocks are enforced by customer booking and internal appointment-management APIs

#### Performance Reporting

- [x] Weekly salon sales
- [x] Weekly $5.000.000 sales goal
- [x] Weekly goal progress
- [x] Weekly production by technician
- [x] Weekly customer count by technician
- [x] Monthly salon sales
- [x] Monthly $20.000.000 sales goal
- [x] Monthly goal progress
- [x] Monthly production by technician
- [x] Monthly customer count by technician
- [x] Commission/payroll information remains restricted to the Owner Dashboard
- [x] Technician names link to detailed activity views
- [x] Technician activity page shows today's production and completed appointments
- [x] Technician activity page shows current-month production and completed appointments
- [x] Technician detail uses attributed production rather than exposing commission payout amounts

#### Web Push Notifications

New-booking Web Push Notifications v1 is complete and production-verified.

- [x] Standards-based Web Push notifications
- [x] Service worker handles background notifications
- [x] PWA manifest and TEFF Home Screen app support
- [x] TEFF-branded Home Screen and notification icons
- [x] OWNER and RECEPTIONIST devices can enable notifications
- [x] Push subscriptions are stored securely in PostgreSQL
- [x] Multiple authorized staff devices are supported
- [x] New customer bookings automatically trigger push notifications
- [x] Multi-service bookings generate one notification per reservation rather than one per service
- [x] Notifications include customer, service summary, date, and starting time
- [x] Tapping a notification opens `/receptionist`
- [x] Background delivery works while the TEFF web app is not open
- [x] Production delivery verified on the salon iPad
- [x] OWNER notification delivery verified
- [x] RECEPTIONIST notification delivery verified
- [x] Expired push subscriptions are automatically removed after `404` / `410` provider responses
- [x] Push-delivery failures cannot cause an otherwise valid customer booking to fail
- [x] Protected `/api/push/test` endpoint retained for device diagnostics
- [x] Legacy 30-second appointment polling and in-app booking alert removed

#### UI & Tablet Experience

- [x] Appointment status color badges
- [x] Distinct workflow-action colors
- [x] Responsive KPI layout
- [x] Responsive technician-production grids
- [x] Larger scheduling controls for tablet use
- [x] Improved loading state
- [x] Error state with retry action
- [x] iPad-friendly responsive layout

#### Remaining Operations Roadmap

- Family / group appointment checkout
- Smarter automatic technician assignment using production and workload data
- Owner/receptionist tools for managing services, add-ons, employees, qualifications, prices, and active status
- WhatsApp notifications to reception when appointments are created

### ✅ Inventory Management v1

Inventory Management v1 is complete and ready for production operational testing.

#### Access & Product Management

- [x] OWNER and RECEPTIONIST access
- [x] Inventory item catalog
- [x] Create and edit inventory products
- [x] Controlled inventory categories
- [x] Category and stock-status filtering
- [x] Search by product name or category
- [x] iPad-friendly operational interface
- [x] Archive and reactivate inventory products
- [x] Product removal with confirmation and product-name identification
- [x] OWNER and RECEPTIONIST permission to remove products
- [x] Soft deletion: removed products become inactive instead of being permanently deleted
- [x] One-click product restoration from the inactive inventory view
- [x] Preserve stock quantities and movement history when products are removed or restored

**New inventory categories — implemented and tested in development; production deployment pending:**

- Limpieza Spa
- Herramientas Spa
- Decoración Uñas
- Adicional Uñas
- Papelería

**Removal policy:** "Eliminar producto" requires confirmation and archives the product. It does not permanently erase the product or its inventory history.

**Testing:** Product creation, removal, and restoration were verified using a temporary product while authenticated as RECEPTIONIST against the isolated Neon development database.

#### Stock Management

- [x] Current quantity on hand
- [x] Configurable low-stock thresholds
- [x] Automatic in-stock, low-stock, and out-of-stock indicators
- [x] RESTOCK movements for received inventory
- [x] USAGE movements for consumed inventory
- [x] DAMAGED movements for damaged, lost, or discarded inventory
- [x] CORRECTION movements for physical-count corrections
- [x] Inventory cannot be adjusted below zero
- [x] Stock quantity can only be changed through audited inventory movements

#### Shopping List

- [x] Automatic shopping list for low-stock and out-of-stock products
- [x] Enter purchase/restock quantity directly from the shopping list
- [x] Register received inventory directly from the shopping list
- [x] Shopping-list restocks create normal audited RESTOCK movements
- [x] Products automatically leave the shopping list after sufficient replenishment
- [x] Inactive products are excluded from operational shopping workflows

#### Inventory Audit History

- [x] Complete movement history per inventory item
- [x] Quantity-before and quantity-after snapshots
- [x] Signed quantity changes
- [x] Movement type and optional operational notes
- [x] Authenticated staff user attribution
- [x] Medellín-local movement timestamps
- [x] Movement history remains available when a product is archived

Current testing focus:

- [ ] Enter TEFF's real salon inventory
- [ ] Validate daily inventory workflows with reception on the salon iPad
- [ ] Refine categories, units, and low-stock thresholds using real operational data

Future inventory expansion:

- Supply purchase history and supplier tracking
- Inventory cost and valuation reporting
- Product-consumption trends
- Usage reporting by category and time period
- Integration with operating-expense reporting

### Advanced Owner Dashboard & Reporting

- ✅ Daily sales, customers, appointments, and average ticket
- ✅ Weekly sales, customers, appointments, and average ticket
- ✅ Monthly sales, customers, appointments, and average ticket
- ✅ Weekly sales by technician
- ✅ Weekly technician commissions
- ✅ Weekly tip totals and separation from salon revenue
- ✅ Weekly Cash / Bold / transfer reconciliation
- ✅ Configurable weekly sales goal
- ✅ Configurable monthly sales goal
- ✅ Weekly and monthly goal progress tracking
- Supply purchases and operating expenses
- Historical performance reports
- Date-range reporting
- Generate TEFF-branded weekly salon summary images
- Generate individual weekly technician commission/pay images
- Generate TEFF-branded monthly summary images


### Payroll & Commissions

**Nómina v1 — Deployed to production October 15, 2026.**

OWNER-only payroll management, manual payment recording, and zero-balance settlement are available in production. Authorization, database integration, and deployment smoke tests passed.

The first genuine production payroll payment has not yet been verified end-to-end.

- ✅ OWNER-only payroll dashboard, API access, and financial operations. RECEPTIONIST and TECHNICIAN roles cannot access payroll information.
- ✅ Weekly payroll periods: Monday through Sunday, with payday on Monday.
- ✅ Employee-specific payroll statements with production totals, commissions, tips, bonuses, loans, uniform deductions, other deductions, and net pay.
- ✅ Payroll adjustments for bonuses, loans, uniforms, and other deductions.
- ✅ Payroll review and approval, with financial snapshots locked after review.
- ✅ Manual payment confirmation: the Owner pays the technician outside TEFF, confirms the full outstanding amount, and records the payment.
- ✅ Zero-balance settlement: mark a fully reconciled statement PAID without creating a fictitious payment.
- ✅ Server-side outstanding-balance verification and overpayment prevention.
- ✅ Idempotency keys, duplicate-payment protection, payroll-week locking, and transactional settlement.
- ✅ Payroll statements and periods transition to PAID when their settlement requirements are satisfied.
- ✅ Development integration tests for payment recording, duplicate protection, authorization, rollback, and zero-balance settlement.

**Payment policy:** TEFF records payments already delivered by the Owner. The application does not initiate bank transfers or automatically send money to technicians.

**Testing:** Financial integration tests run against a designated isolated Neon development database. A separate Next.js build directory can be enabled using `TEFF_PAYROLL_TEST=true`.

**Production release verification:**
- [x] Production database migrations verified.
- [x] OWNER payroll dashboard verified.
- [x] Unauthenticated payroll API requests return HTTP 401.
- [x] Development authorization and integration tests passed.
- [x] Production deployment completed.
- [ ] Verify the first genuine production payroll payment end-to-end.

**Post-MVP improvements:**
- Recovery and reconciliation for interrupted payment requests.
- Expanded historical payroll reporting and exports.
- Additional employee compensation structures and commission rules.

### Integrations & Automation

- ✅ Web Push notifications for new customer bookings
- ✅ Background notification delivery to authorized staff devices
- ✅ OWNER and RECEPTIONIST push-notification support
- ✅ iPad Home Screen PWA support
- ✅ Notification tap opens the Reception dashboard
- ✅ Protected push-notification test endpoint for device diagnostics
- Google Calendar integration
- Color-coded appointments by technician
- Automatic WhatsApp appointment confirmations
- Automatic WhatsApp appointment reminders
- WhatsApp notifications to reception as an optional secondary channel
- Future integrations with additional payment or communication services

### Customer Experience

- ✅ "Any Technician" booking option with automatic server-side assignment
- Smarter technician recommendations and assignment based on future workload and business rules
- Improved customer history
- Customer preferences and notes
- Potential deposits / booking fees if no-show rates justify them
- Additional automated appointment notifications

### Services & Booking

- Approval workflow for services that require manual confirmation
- Lash technician / off-site service workflow
- Advanced service availability rules
- Technician-specific service availability
- Group / family bookings

### UI & Personalization

- Global Auto / Light / Dark theme
- System theme as default
- Manual Auto / Light / Dark selector
- Persisted theme preference
- Consistent theme across booking, staff, checkout, customer profiles, and admin

### Future Staff Features

- Optional technician accounts
- Technician-specific dashboards
- Individual schedules and performance
- Staff notifications
- Expanded permissions and role management