# 🗺️ TEFF Salon App Roadmap

TEFF Salon is a full salon management and customer booking application being built for real-world use at TEFF Beauty Salon.

The goal of the MVP is to manage the complete salon workflow:

**Customer Booking → Scheduling → Staff Operations → Service → Checkout → Payments → Commissions → Owner Reporting**

---

## 📍 Current Progress

| Phase | Area | Status |
|---|---|---|
| 1 | Project Foundation | ✅ Complete |
| 2 | Database & Salon Data | ✅ Core Complete |
| 3 | Customer Booking | ✅ Core Complete |
| 4 | Scheduling & Availability | ✅ Core Complete |
| 5 | Staff Operations | 🟡 In Progress |
| 6 | Checkout, Payments & Commissions | 🔨 In Progress |
| 7 | Admin / Owner Dashboard | ⬜ Not Started |
| 8 | Production Readiness & Deployment | ⬜ Not Started |

**Estimated MVP completion: ~60–65%**

---

# ✅ Phase 1 — Project Foundation

Core development environment and application architecture.

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
- `/staff` employee route
- API route structure

---

# ✅ Phase 2 — Database & Salon Data

The application now uses real relational salon data rather than hard-coded frontend data.

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

### Implemented Relationships

- Employees ↔ Services
- Services ↔ Add-ons
- Customers → Appointments
- Employees → Appointments
- Appointments → Services
- Appointments → Add-ons

Appointment services and add-ons store price and duration snapshots so historical bookings are not affected if menu prices change later.

---

# ✅ Phase 3 — Customer Booking

Customers can complete a real appointment booking flow.

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

---

# ✅ Phase 4 — Scheduling & Availability

The booking system checks real appointments before displaying available times.

### Implemented

- Technician-specific availability
- Appointment duration blocking
- Existing appointment conflict detection
- Server-side conflict protection
- HTTP `409` response when a time becomes unavailable
- Customer-facing message when another customer books a selected time
- Real appointment data used for availability

### Future Hardening

The current conflict system protects against normal stale-browser booking conflicts.

Before production, stronger database-level concurrency protection should be added for requests that reach the server at almost exactly the same time.

---

# 🟡 Phase 5 — Staff Operations

The staff interface manages the salon's daily appointment workflow.

### Implemented

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
