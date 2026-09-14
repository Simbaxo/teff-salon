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
| 5 | Staff Operations & Authentication | 🟡 Core Complete — Hardening |
| 6 | Checkout, Payments & Commissions | 🟡 Core Complete — Hardening |
| 7 | Basic Owner Reporting | ⬜ Not Started |
| 8 | Production Readiness & Deployment | ⬜ Not Started |

**Estimated MVP completion: ~85%**

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

# 🟡 Phase 5 — Staff Operations & Authentication

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

### Remaining Staff Hardening

- Improved loading and error states
- Production-safe date handling
- Password change/reset
- Login rate limiting / lockout protection
- Session revalidation when account roles or active status change

---

# 🟡 Phase 6 — Checkout, Payments & Commissions

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

# 🟨 Phase 7 — Basic Owner Reporting

**Provide the owner with the essential financial information needed to verify salon operations before launch.**

### MVP Scope

- [x] Total sales
- [x] Sales by technician
- [x] Customer count
- [x] Average ticket
- [x] Payment totals by Cash / Bold / Transfer
- [x] Commission totals by technician
- [x] Tip totals
- [x] Basic payment reconciliation

### Current Implementation

- Owner-only `/admin` dashboard
- Financial values formatted in COP
- Active technicians remain visible even when they have zero commissions
- Commission totals separated into pending and paid amounts
- Tips tracked separately from salon revenue
- Payment reconciliation accounts for salon-collected tips

Advanced dashboards, sales goals, payroll management, expense tracking, trends, and performance analytics are planned for Post-MVP.

## 🚀 Post-MVP Roadmap

The following features are intentionally planned for after the first production release of the TEFF Salon app.

### Operations & Reception
- Receptionist dashboard with weekly and monthly salon performance
- Technician production totals and progress toward sales goals
- Alerts when new appointments are created
- Improved appointment management and reassignment between technicians
- Customer defaults to "Any Technician" when booking
- Smart technician assignment based on availability
- Family / group appointment checkout

### Owner Dashboard & Reporting
- Total sales dashboard
- Sales by technician
- Customer count
- Average ticket
- Technician commissions
- Tips and tip payout tracking
- Supply purchases and operating expenses
- Cash / Bold / transfer reconciliation
- Weekly and monthly sales goals
- Historical performance reports

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
- "Any Technician" booking option
- Smarter technician recommendations and assignment
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