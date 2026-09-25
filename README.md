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
| 10 | Inventory Management | 🚧 Next |

**MVP completion: 100% — deployed and production smoke-tested September 15, 2026.**

*The live MVP supports the complete workflow from customer booking through scheduling, staff operations, checkout, payments, commissions, customer history, and owner reporting. The first Post-MVP enhancement, “Any Technician,” has also been completed.*

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

### Next Operational Setup

- Enter the complete TEFF service menu and prices
- Enter all production add-ons and compatibility rules
- Confirm every employee's service qualifications and active status
- Verify production users and roles before daily salon use

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

#### Booking Alerts

- [x] Automatic appointment refresh every 30 seconds
- [x] Detect newly created customer bookings without refreshing the page
- [x] Display `Nueva reserva` alert
- [x] Multi-service bookings count as one reservation alert
- [x] Dismiss alerts with `Marcar como visto`
- [x] Background refresh failures do not erase already-loaded dashboard data

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
- Inventory management accessible to OWNER and RECEPTIONIST
- Owner/receptionist tools for managing services, add-ons, employees, qualifications, prices, and active status
- WhatsApp notifications to reception when appointments are created

### 🚧 Inventory Management — Next Active Phase

Inventory Management is the next major development phase.

Planned v1 scope:

- OWNER and RECEPTIONIST access
- Inventory item catalog
- Current quantity on hand
- Low-stock thresholds
- Low-stock indicators and alerts
- Restocking / quantity adjustments
- Shopping list for items requiring replenishment
- iPad-friendly operational interface

Future inventory expansion:

- Product usage tracking
- Supply purchase history
- Inventory cost reporting
- Consumption trends
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

- Employee-specific commission rates and pay structures
- Payroll period tracking
- Commission payout tracking
- Tip payout tracking
- Employee deductions and loans
- Payroll summaries and reports

### Integrations & Automation

- Google Calendar integration
- Color-coded appointments by technician
- Automatic WhatsApp appointment confirmations
- Automatic WhatsApp appointment reminders
- WhatsApp notifications to reception when appointments are created
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