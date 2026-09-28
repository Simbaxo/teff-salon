"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  getTeffCurrentMinutes,
  getTeffDayOfWeek,
  getTeffToday,
} from "@/lib/datetime";

// Generate available start times based on TEFF's business hours
function getTimeSlots(date: string) {
    if (!date) return [];

    const bookingDate = new Date(`${date}T12:00:00-05:00`);
    const dayOfWeek = bookingDate.getDay(); // 0 = Sunday

    const openingMinutes =
        dayOfWeek === 0
            ? 10 * 60 + 30 // Sunday: 10:30
            : 9 * 60 + 30; // Monday-Saturday: 9:30
    const closingMinutes =
        dayOfWeek === 0
            ? 17 * 60 + 30 // Sunday: 17:30
            : 18 * 60 + 30; // Monday-Saturday: 18:30
    
    const slots: string[] = [];

    // Create 30-minute start time throughout the day
    for (
        let minutes = openingMinutes;
        minutes < closingMinutes;
        minutes += 30
    ) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        slots.push(
            `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
        );
    }

    return slots;
}

// Create a Service Type
type Service = {
    id: number;
    nameEs: string;
    nameEn: string;
    category: string;
    price: number;
    estimatedDuration: number;
    requiresApproval: boolean;
    active: boolean;
};

// Create Employee Type
type Employee = {
    id: number;
    name: string;
    active: boolean;
};

// Create Employee Services
type EmployeeService = {
    employeeId: number;
    serviceId: number;
}

// Create Addon type
type Addon = {
    id: number;
    nameEs: string;
    nameEn: string;
    price: number;
    estimatedDuration: number;
    active: boolean;
};

// Connects services to the add-ons they support
type ServiceAddon = {
    serviceId: number;
    addonId: number;
}

// Create Appointment Type
type Appointment = {
    id: number;
    employeeId: number;
    date: string;
    startTime: string;
    duration: number;
    status: string;
};

type ScheduleBlock = {
    id: number;
    employeeId: number;
    date: string;
    startTime: string;
    endTime: string;
};

export default function BookPage() {
    // State
    const { language } = useLanguage();
    
    // Customers choose a service category before viewing the full service list
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    // Separates service browsing from appointment configuration
    const [servicesConfirmed, setServicesConfirmed] = useState(false);
    // Tracks when the customer has finished choosing optional add-ons
    const [addonsConfirmed, setAddonsConfirmed] = useState(false);
    // Controls the separate technician, date, and time scheduling stage.
    const [scheduleStarted, setScheduleStarted] = useState(false);
    const serviceCategories = [
        {
        id: "NAILS",
        emoji: "💅",
        nameEs: "Uñas",
        nameEn: "Nails",
        descriptionEs: "Manicure, Pedicure y Extensiones",
        descriptionEn: "Manicure, Pedicure and Extensions",
        },
        {
            id: "LASHES",
            emoji: "👁️",
            nameEs: "Pestañas",
            nameEn: "Lashes",
            descriptionEs: "Sets, Retoques y Lifting",
            descriptionEn: "Sets, Fills and Lifting",
        },
        {
            id: "BROWS",
            emoji: "✨",
            nameEs: "Cejas y Depilación",
            nameEn: "Brows & Waxing",
            descriptionEs: "Laminado, Henna y Depilación",
            descriptionEn: "Lamination, Henna and Waxing",
        },
        {
            id: "ESTHETICS",
            emoji: "🧖‍♀️",
            nameEs: "Estética",
            nameEn: "Esthetics",
            descriptionEs: "Faciales y Tratamientos",
            descriptionEn: "Facials and Treatments",
        },
    ]
    const [selectedServices, setSelectedServices] = useState<number[]>([]);
    const [selectedAddons, setSelectedAddons] = useState<number[]>([]);
    // Tracks which service each selected add-on belongs to.
    const [addonServiceAssignments, setAddonServiceAssignments] =
        useState<Record<number, number>>({});
    // "any" lets the salon automatically assign an available qualified technician
    const [selectedEmployee, setSelectedEmployee] = 
        useState<number | "any" | null>(null);
    // Stores the technician choice for each selected service
    // This allows one booking to contain services from different specialists
    const [selectedEmployeesByService, setSelectedEmployeesByService] =
        useState<Record<number, number | "any">>({});
    const [selectedDate, setSelectedDate] = useState(
        getTeffToday()
    );
    const [selectedTime, setSelectedTime] = useState("");
    const [customerName, setCustomerName] = useState("");
    // Colombia is the default because TEFF is located in Medellin
    const [countryCode, setCountryCode] = useState("+57");
    const [customerPhone, setCustomerPhone] = useState("");
    const [customerEmail, setCustomerEmail] = useState("");
    const [customerNotes, setCustomerNotes] = useState("");
    const [isReviewing, setIsReviewing] = useState(false);
    const [services, setServices] = useState<Service[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [employeeServices, setEmployeeServices] = useState<EmployeeService[]>([]);
    const [addons, setAddons] = useState<Addon[]>([]);
    const [serviceAddons, setServiceAddons] = useState<ServiceAddon[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bookingError, setBookingError] = useState("");
    const [bookingSuccess, setBookingSuccess] = useState(false);
    type BookingConfirmationAppointment = {
        id: number;
        startTime: string;
        status: string;

        employee: {
            id: number;
            name: string;
        };

        appointmentServices: {
            serviceId: number;
            bookedPrice: number;
            bookedDuration: number;
        }[];
    };

    const [
        confirmationAppointments,
        setConfirmationAppointments,
    ] = useState<BookingConfirmationAppointment[]>([]);
    const [bookedAppointments, setBookedAppointments] =
        useState<Appointment[]>([]);
    const [scheduleBlocks, setScheduleBlocks] =
    useState<ScheduleBlock[]>([]);

    // Fetch the services from API
    useEffect(() => {
        async function loadServices() {
            const response = await fetch("/api/services");
            const data = await response.json();

            setServices(data);
        }

        loadServices();
    }, []);

    // Fetch employees from APi
    useEffect(() => {
        async function loadEmployees() {
            const response = await fetch("/api/employees");
            const data = await response.json();

            setEmployees(data);
        }

        loadEmployees()
    }, []);

    // Fetch employee services from API
    useEffect(() => {
        async function loadEmployeeServices() {
            const response = await fetch("/api/employee-services")
            const data = await response.json()

            setEmployeeServices(data);
        }

        loadEmployeeServices()
    }, []);

    // Fetch addon services from API
    useEffect(() => {
        async function loadAddons() {
            const response = await fetch("/api/addons");
            const data = await response.json();

            setAddons(data);
        }

        loadAddons();
    }, []);

    useEffect(() => {
        async function loadServiceAddons() {
            const response = await fetch("/api/service-addons");
            const data = await response.json();

            setServiceAddons(data);
        }

        loadServiceAddons();
    }, []);

    // Load appointments and employee schedule blocks that affect availability.
    useEffect(() => {
        async function loadAvailability() {
            const [
                appointmentsResponse,
                scheduleBlocksResponse,
            ] = await Promise.all([
                fetch("/api/appointments?mode=availability"),
                fetch("/api/schedule-blocks?mode=availability"),
            ]);

            if (
                !appointmentsResponse.ok ||
                !scheduleBlocksResponse.ok
            ) {
                return;
            }

            const [
                appointmentsData,
                scheduleBlocksData,
            ] = await Promise.all([
                appointmentsResponse.json(),
                scheduleBlocksResponse.json(),
            ]);

            setBookedAppointments(appointmentsData);
            setScheduleBlocks(scheduleBlocksData);
        }

        loadAvailability();
    }, []);
        
    // Functions
    const availableAddonIds = serviceAddons
        .filter((relation) => 
            selectedServices.includes(relation.serviceId)
        )
        .map((relation) => relation.addonId);

    // Remove add-ons and assignments that are no longer valid
    // when the customer changes their selected services.
    useEffect(() => {
        const validAddonIds = serviceAddons
            .filter((relation) =>
                selectedServices.includes(relation.serviceId)
            )
            .map((relation) => relation.addonId);

        setSelectedAddons((current) =>
            current.filter((addonId) =>
                validAddonIds.includes(addonId)
            )
        );

        setAddonServiceAssignments((current) => {
            const updated: Record<number, number> = {};

            for (const [addonIdText, serviceId] of Object.entries(current)) {
                const addonId = Number(addonIdText);

                const relationshipStillValid = serviceAddons.some(
                    (relation) =>
                        relation.addonId === addonId &&
                        relation.serviceId === serviceId &&
                        selectedServices.includes(serviceId)
                );

                if (relationshipStillValid) {
                    updated[addonId] = serviceId;
                }
            }

            return updated;
        });
    }, [selectedServices, serviceAddons]);

    const availableAddons = addons.filter((addon) => 
        availableAddonIds.includes(addon.id)
    );

    const selectedAddonDetails = addons.filter((addon) => 
        selectedAddons.includes(addon.id)
    );

    function toggleService(serviceId: number) {
        setSelectedServices((current) =>
            current.includes(serviceId)
                ? current.filter((id) => id !== serviceId)
                : [...current, serviceId]
        );
    }

    // Select or remove an add-on and remember which service it belongs to.
    function toggleAddon(addonId: number) {
        const isSelected = selectedAddons.includes(addonId);

        // Deselect the add-on and remove its service assignment.
        if (isSelected) {
            setSelectedAddons((current) =>
                current.filter((id) => id !== addonId)
            );

            setAddonServiceAssignments((current) => {
                const updated = { ...current };
                delete updated[addonId];
                return updated;
            });

            return;
        }

        // Find selected services that support this add-on.
        const compatibleServiceIds = serviceAddons
            .filter(
                (relation) =>
                    relation.addonId === addonId &&
                    selectedServices.includes(relation.serviceId)
            )
            .map((relation) => relation.serviceId);

        // If there is exactly one possible service, assign it automatically.
        if (compatibleServiceIds.length === 1) {
            setSelectedAddons((current) => [...current, addonId]);

            setAddonServiceAssignments((current) => ({
                ...current,
                [addonId]: compatibleServiceIds[0],
            }));
        }
    }

    // Find Selected Services Data
    const selectedServiceDetails = services.filter((service) =>
        selectedServices.includes(service.id)
    );

    // Calculate Qualified Employees
    const qualifiedEmployees = employees.filter((employee) =>
        selectedServices.every((serviceId) =>
            employeeServices.some(
                (relation) =>
                    relation.employeeId === employee.id &&
                    relation.serviceId === serviceId
            )
        )
    );

    // Find the technicians qualified for each individual selected service
    // This supports bookings that may require different specialist
    const serviceAssignments = selectedServiceDetails.map((service) => {
        const qualifiedForService = employees.filter((employee) => 
            employeeServices.some(
                (relation) =>
                    relation.employeeId === employee.id &&
                    relation.serviceId === service.id
            )
        );

        return {
            service,
            qualifiedEmployees: qualifiedForService,
        };
    });

    // Nail services share one customer-facing technician choice.
    // Staff can split the individual appointments later if needed.
    function selectNailTechnician(employeeId: number | "any") {
        const nailServiceIds = selectedServiceDetails
            .filter((service) => service.category === "NAILS")
            .map((service) => service.id);

        setSelectedEmployeesByService((current) => {
            const updated = { ...current };

            for (const serviceId of nailServiceIds) {
                updated[serviceId] = employeeId;
            }

            return updated;
        });

        // Changing technician availability can change valid time slots.
        setSelectedTime("");
    }

    const selectedNailAssignments = serviceAssignments.filter(
        ({ service }) => service.category === "NAILS"
    );

    const qualifiedNailEmployees =
        selectedNailAssignments.length > 0
            ? selectedNailAssignments[0].qualifiedEmployees.filter(
                (employee) =>
                    selectedNailAssignments.every(({ qualifiedEmployees }) =>
                        qualifiedEmployees.some(
                            (qualifiedEmployee) =>
                                qualifiedEmployee.id === employee.id
                        )
                    )
            )
            : [];

    useEffect(() => {
        setSelectedEmployeesByService((current) => {
            const next: Record<number, number | "any"> = {};

            for (const assignment of serviceAssignments) {
                const serviceId = assignment.service.id;
                const qualified = assignment.qualifiedEmployees;

                // If only one technician can perform this service
                // assign them automatically
                if (qualified.length === 1) {
                    next[serviceId] = qualified[0].id
                    continue;
                }

                // Preserve an existing valid technician choice
                const currentChoice = current[serviceId];

                if (
                    typeof currentChoice === "number" &&
                    qualified.some((employee) => employee.id === currentChoice)
                ) {
                    next[serviceId] = currentChoice;
                    continue;
                }

                // Multiple qualified technicians default to Any Technician
                if (qualified.length > 1) {
                    next[serviceId] = "any";
                }
            }

            return next;
        });
    }, [selectedServices, employees, employeeServices]);

    // Every selected service must have a technician choice before scheduling
    const allServicesHaveTechnicians =
        serviceAssignments.length > 0 &&
        serviceAssignments.every(
            ({ service, qualifiedEmployees }) =>
                qualifiedEmployees.length > 0 &&
                selectedEmployeesByService[service.id] !== undefined
        );

    useEffect(() => {
        // No technician can perform the current service combination
        if (qualifiedEmployees.length === 0) {
            setSelectedEmployee(null);
            return;
        }

        // "Any Technician" is the default for customers
        if (selectedEmployee === null) {
            setSelectedEmployee("any");
            return;
        }

        // Keep "any" selected while qualified technicians are available
        if (selectedEmployee === "any") {
            return;
        }

        // Reset to "any" if a specifically selected technician is no longer
        // qualifed after the customer changes their services
        if (
            !qualifiedEmployees.some(
                (employee) => employee.id == selectedEmployee
            )
        ) {
            setSelectedEmployee("any");
        }
    }, [selectedEmployee, qualifiedEmployees])

    // Calculate Price
    const serviceTotal = selectedServiceDetails.reduce(
        (total, service) => total + service.price,
        0
    );

    const addonTotal = selectedAddonDetails.reduce(
        (total, addon) => total + addon.price,
        0
    );

    const totalPrice = serviceTotal + addonTotal;

    // Calculate Duration
    const serviceDuration = selectedServiceDetails.reduce(
        (total, service) => total + service.estimatedDuration,
        0
    );

    const addonDuration = selectedAddonDetails.reduce(
        (total, addon) => total + addon.estimatedDuration,
        0
    );

    const totalDuration = serviceDuration + addonDuration;

    // Make Time Slots respect Appointment Duration
    function timeToMinutes(time: string) {
        const [hours, minutes] = time.split(":").map(Number);

        return hours * 60 + minutes;
    }

    // Convert stored 24-hour time into a customer-friendly AM/P display
    function formatTime(time: string) {
        const [hours, minutes] = time.split(":").map(Number);

        const period = hours >= 12 ? "PM" : "AM";
        const displayHour = hours % 12 || 12;

        return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
    }

    // Display customer-facing dates in Colombian DD-MM-YYYY format
    function formatDate(date: string) {
        const [year, month, day] = date.split("-");

        return `${day}-${month}-${year}`;
    }

    const timeSlots = getTimeSlots(selectedDate);

    // Get the weekday without depending on the browser's timezone.
    const dayOfWeek = selectedDate
        ? getTeffDayOfWeek(selectedDate)
        : undefined;

    const closingTime =
        dayOfWeek === 0
            ? 17 * 60 + 30 // Sunday: 17:30
            : 18 * 60 + 30; // Monday-Saturday: 18:30

    const availableTimeSlots = timeSlots.filter((time) => {
        const bookingStart = timeToMinutes(time);
        const bookingEnd = bookingStart + totalDuration;

        // Hide time slots that have already passed today in Medellin
        if (
            selectedDate === getTeffToday() &&
            bookingStart <= getTeffCurrentMinutes()
        ) {
            return false;
        }

        // The complete sequence must finish before the salon closes
        if (bookingEnd > closingTime) {
            return false;
        }

        let serviceStart = bookingStart;

        // Every service must have an available qualified technician
        // during its own sequential part of the booking
        for (const assignment of serviceAssignments) {
            const service = assignment.service;
            const serviceEnd =
                serviceStart + service.estimatedDuration;

            const selectedForService =
                selectedEmployeesByService[service.id];
            
            const isEmployeeAvailable = (employeeId: number) => {
                const hasConflict = bookedAppointments.some((appointment) => {
                    if (
                        appointment.employeeId !== employeeId ||
                        appointment.date.slice(0, 10) !== selectedDate
                    ) {
                        return false;
                    }

                    const bookedStart =
                        timeToMinutes(appointment.startTime);
                    const bookedEnd =
                        bookedStart + appointment.duration;

                    return (
                        serviceStart < bookedEnd &&
                        serviceEnd > bookedStart
                    );
                });

                const hasScheduleBlockConflict =
                    scheduleBlocks.some((block) => {
                        if (
                            block.employeeId !== employeeId ||
                            block.date.slice(0, 10) !== selectedDate
                        ) {
                            return false;
                        }

                        const blockedStart =
                            timeToMinutes(block.startTime);

                        const blockedEnd =
                            timeToMinutes(block.endTime);

                        return (
                            serviceStart < blockedEnd &&
                            serviceEnd > blockedStart
                        );
                    });

                return !hasConflict && !hasScheduleBlockConflict;
            }

            let hasAvailableTechnician = false;

            if (selectedForService === "any") {
                hasAvailableTechnician =
                    assignment.qualifiedEmployees.some((employee) =>
                        isEmployeeAvailable(employee.id)
                    );
            } else if (typeof selectedForService === "number") {
                hasAvailableTechnician =
                    isEmployeeAvailable(selectedForService);
            }

            if (!hasAvailableTechnician) {
                return false;
            }

            // The next service begins when this service finishes
            serviceStart = serviceEnd;
        }

        return true;
    })

    // Find The Selected Technician Details
    const selectedEmployeeDetails = employees.find(
        (employee) => employee.id === selectedEmployee
    );

    // Show the full phone number without duplicating a country code
    const displayCustomerPhone = customerPhone.trim().startsWith("+")
        ? customerPhone
        : `${countryCode} ${customerPhone}`;

    // The scheduling stage begin after add-on are completed
    // or immediately when selected services have no add-ons
    const isScheduleStage =
        servicesConfirmed &&
        (scheduleStarted || availableAddons.length === 0);

    // Confirm Booking Details
    async function handleConfirmBooking() {
        try {
            setIsSubmitting(true);
            setBookingError("");

            // If the customer typed an international number themselves,
            // don't add the selected country code a second time.
            const fullCustomerPhone = customerPhone.trim().startsWith("+")
                ? customerPhone
                : `${countryCode}${customerPhone}`

            const response = await fetch("/api/bookings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    customerName,
                    customerPhone: fullCustomerPhone,
                    customerEmail,
                    customerNotes,
                    // Send one technician choice for each selected service.
                    serviceAssignments: serviceAssignments.map(({ service }) => ({
                        serviceId: service.id,
                        employeeId: selectedEmployeesByService[service.id],
                    })),
                    date: selectedDate,
                    startTime: selectedTime,
                    serviceIds: selectedServices,
                    // Tell the API which service each selected add-on belongs to.
                    addonAssignments: selectedAddons.map((addonId) => ({
                        addonId,
                        serviceId: addonServiceAssignments[addonId],
                    })),
                }),
            });

            const data = await response.json();

            if(!response.ok) {
                throw new Error(data.error || "Booking failed");
            }

            // Save the appointments returned by the server so the confirmation
            // shows the technician actually assigned to each service.
            setConfirmationAppointments(
                data.appointments ?? []
            );

            setBookingSuccess(true);
            setIsReviewing(false);
        } catch(error) {
            console.error(error);

            if (error instanceof Error) {
                if (error.message === "This appointment time is no longer available") {
                    setBookingError(
                        language === "es"
                            ? "Este horario acaba de ser reservado. Por favor, selecciona otro horario."
                            : "This time was just booked. Please select another time."
                    );
                } else {
                    setBookingError(
                        language === "es"
                            ? "No se pudo crear la cita. Inténtalo de nuevo"
                            : "the appointment could not be created. Please try again."
                    );
                }
            }
        } finally {
            setIsSubmitting(false);
        }
    }

    // Information used by the customer confirmation screen.
    const confirmationServices = serviceAssignments.map(
        ({ service }) => {
            const addonItems = selectedAddons
                .filter(
                    (addonId) =>
                        addonServiceAssignments[addonId] ===
                        service.id
                )
                .map((addonId) =>
                    addons.find(
                        (addon) => addon.id === addonId
                    )
                )
                .filter(
                    (addon): addon is NonNullable<typeof addon> =>
                        addon !== undefined
                );

            return {
                service,
                addons: addonItems,
            };
        }
    );

    const confirmationTotal =
        confirmationServices.reduce(
            (total, item) =>
                total +
                item.service.price +
                item.addons.reduce(
                    (addonTotal, addon) =>
                        addonTotal + addon.price,
                    0
                ),
            0
        );

    const requiresApproval =
        confirmationServices.some(
            (item) => item.service.requiresApproval
        );

    function formatConfirmationDate(date: string) {
        if (!date) {
            return "";
        }

        return new Intl.DateTimeFormat(
            language === "es" ? "es-CO" : "en-US",
            {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
            }
        ).format(
            new Date(
                `${date}T12:00:00.000Z`
            )
        );
    }

    return (
        <main className="min-h-screen bg-neutral-100 px-6 py-12">
            {bookingSuccess && (
                <div className="mx-auto mt-8 max-w-xl">
                    <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
                        {/* Confirmation status */}
                        <div
                            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold ${
                                requiresApproval
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-green-100 text-green-700"
                            }`}
                        >
                            {requiresApproval ? "⏳" : "✓"}
                        </div>

                        <div className="mt-5 text-center">
                            <h2 className="text-2xl font-bold text-black">
                                {requiresApproval
                                    ? language === "es"
                                        ? "Solicitud recibida"
                                        : "Request received"
                                    : language === "es"
                                    ? "¡Tu cita está confirmada!"
                                    : "Your appointment is confirmed!"}
                            </h2>

                            <p className="mt-2 text-neutral-600">
                                {requiresApproval
                                    ? language === "es"
                                        ? "Te confirmaremos los servicios pendientes lo antes posible."
                                        : "We'll confirm the pending services as soon as possible."
                                    : language === "es"
                                    ? "Tu reserva quedó registrada correctamente."
                                    : "Your booking has been registered successfully."}
                            </p>
                        </div>

                        {/* Date and starting time */}
                        <div className="mt-6 rounded-xl bg-neutral-100 p-4 text-center">
                            <p className="font-semibold capitalize text-black">
                                {formatConfirmationDate(selectedDate)}
                            </p>

                            <p className="mt-1 text-xl font-bold text-black">
                                {formatTime(selectedTime)}
                            </p>
                        </div>

                        {/* Complete booking itinerary */}
                        <div className="mt-6 space-y-4">
                            {confirmationServices.map((item, index) => {
                                const createdAppointment =
                                    confirmationAppointments.find(
                                        (appointment) =>
                                            appointment.appointmentServices.some(
                                                (appointmentService) =>
                                                    appointmentService.serviceId ===
                                                    item.service.id
                                            )
                                    );

                                return (
                                <div
                                    key={item.service.id}
                                    className="border-b border-neutral-200 pb-4 last:border-b-0"
                                >
                                    {confirmationServices.length > 1 && (
                                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                            {language === "es"
                                                ? `Servicio ${index + 1} de ${confirmationServices.length}`
                                                : `Service ${index + 1} of ${confirmationServices.length}`}
                                        </p>
                                    )}

                                    <div className="flex items-start justify-between gap-4">
                                        <p className="font-semibold text-black">
                                            {language === "es"
                                                ? item.service.nameEs
                                                : item.service.nameEn}
                                        </p>

                                        <p className="whitespace-nowrap font-semibold text-black">
                                            $
                                            {item.service.price.toLocaleString(
                                                "es-CO"
                                            )}
                                        </p>
                                    </div>

                                    {createdAppointment && (
                                        <p className="mt-1 text-sm text-neutral-500">
                                            {createdAppointment.employee.name}
                                            {" · "}
                                            {formatTime(createdAppointment.startTime)}
                                        </p>
                                    )}

                                    {item.addons.map((addon) => (
                                        <div
                                            key={addon.id}
                                            className="mt-2 flex items-start justify-between gap-4 text-sm text-neutral-500"
                                        >
                                            <span>
                                                +{" "}
                                                {language === "es"
                                                    ? addon.nameEs
                                                    : addon.nameEn}
                                            </span>

                                            <span>
                                                $
                                                {addon.price.toLocaleString(
                                                    "es-CO"
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                );
                            })}
                        </div>

                        {/* Booking total */}
                        <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-5">
                            <span className="font-bold text-black">
                                Total
                            </span>

                            <span className="text-xl font-bold text-black">
                                $
                                {confirmationTotal.toLocaleString(
                                    "es-CO"
                                )}
                            </span>
                        </div>
                        
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="mt-6 w-full rounded-xl bg-black px-5 py-4 font-semibold text-white hover:bg-neutral-800"
                        >
                            {language === "es"
                                ? "Reservar otra cita"
                                : "Book another appointment"}
                        </button>
                    </div>
                </div>
            )}

            {!bookingSuccess && (
                <div className="mx-auto max-w-2xl">
                    {/* Heading */}
                    <h1 className="text-3xl font-bold text-black">
                        {language === "es"
                            ? "Reserva Tu Cita"
                            : "Book Your Appointment"}
                    </h1>
                    <p className="mt-2 text-neutral-600">
                        {language === "es"
                            ? "Selecciona los servicios que deseas reservar."
                            : "Select the services you would like to book."}
                    </p>
                    
                    {/* Service Browser */}
                    {!servicesConfirmed && (
                        <>
                        {/* Service Category Selection */}
                        <div className="mt-8 grid grid-cols-2 gap-3">
                            {serviceCategories.map((category) => (
                                <button
                                    key={category.id}
                                    onClick={() => setSelectedCategory(category.id)}
                                    className={`rounded-xl border p-4 text-left transition ${
                                        selectedCategory === category.id
                                            ? "border-black bg-neutral-200"
                                            : "border-neutral-200 bg-white hover:border-neutral-400"
                                    }`}
                                > 
                                    <div className="text-2xl">{category.emoji}</div>

                                    <h2 className="mt-2 font-semibold text-black">
                                        {language === "es" ? category.nameEs : category.nameEn}
                                    </h2>
                                </button>
                            ))}
                        </div>

                        {selectedCategory !== null && (
                            <div className="mt-8">
                                <h2 className="mb-4 text-xl font-semibold text-black">
                                    {language === "es"
                                        ? serviceCategories.find(
                                            (category) => category.id === selectedCategory
                                        )?.nameEs
                                        : serviceCategories.find(
                                            (category) => category.id === selectedCategory
                                        )?.nameEn}
                                </h2>

                                <div className="space-y-4">
                                    {services
                                        .filter((service) => service.category === selectedCategory)
                                        .map((service) => (
                                            <button
                                                key={service.id}
                                                onClick={() => toggleService(service.id)}
                                                className={`w-full rounded-xl border p-4 text-left ${
                                                    selectedServices.includes(service.id)
                                                        ? "border-black bg-neutral-200"
                                                        : "border-neutral-200 bg-white"
                                                }`}
                                            >
                                                <h3 className="font-semibold text-black">
                                                    {language === "es"
                                                        ? service.nameEs
                                                        : service.nameEn}
                                                </h3>

                                                <p className="mt-1 text-sm text-neutral-600">
                                                    ${service.price.toLocaleString("es-CO")} COP
                                                </p>

                                                <p className="text-sm text-neutral-500">
                                                    {service.estimatedDuration} min
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                            </div>
                        )}
                        </>
                    )}

                    {/* Appointment Configuration */}
                    {servicesConfirmed && !scheduleStarted && (
                        <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="font-semibold text-black">
                                        {language === "es"
                                            ? "Tus servicios"
                                            : "Your Services"}
                                    </h2>

                                    <p className="mt-1 text-sm text-neutral-500">
                                        {selectedServices.length}{" "}
                                        {language === "es"
                                            ? selectedServices.length === 1
                                                ? "servicio seleccionado"
                                                : "servicios seleccionados"
                                            : selectedServices.length === 1
                                            ? "service selected"
                                            : "services selected"}
                                    </p>
                                </div>
                                
                                <button
                                    onClick={() => {
                                        setServicesConfirmed(false);
                                        setAddonsConfirmed(false);
                                        setScheduleStarted(false);
                                    }}
                                    className="text-sm font-semibold text-black underline underline-offset-4"
                                >
                                    {language === "es"
                                        ? "Editar servicios"
                                        : "Edit services"}
                                </button>
                        </div>

                        <div className="mt-4 space-y-2">
                            {selectedServiceDetails.map((service) => (
                                <div
                                    key={service.id}
                                    className="flex justify-between gap-4 text-sm"
                                >
                                    <span className="text-neutral-700">
                                        {language === "es"
                                            ? service.nameEs
                                            : service.nameEn}
                                    </span>

                                    <span className="shrink-0 font-medium text-black">
                                        ${service.price.toLocaleString("es-CO")}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                    {servicesConfirmed && 
                        !scheduleStarted &&
                        availableAddons.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-xl font-semibold text-black">
                                {language === "es" ? "Complementos" : "Add-ons"}
                            </h2>

                            <p className="mt-1 text-sm text-neutral-600">
                                {language === "es" 
                                    ? "Selecciona cualquier complemento que desees agregar."
                                    : "Select any add-ons you would like to include."}
                            </p>

                            <div className="mt-4 space-y-3">
                                {availableAddons.map((addon) => {
                                    const compatibleServices = selectedServiceDetails.filter(
                                        (service) =>
                                            serviceAddons.some(
                                                (relation) =>
                                                    relation.addonId === addon.id &&
                                                    relation.serviceId === service.id
                                            )
                                    );

                                    const isSelected = selectedAddons.includes(addon.id);

                                    return (
                                        <div
                                            key={addon.id}
                                            className={`rounded-xl border p-4 ${
                                                isSelected
                                                    ? "border-black bg-neutral-200"
                                                    : "border-neutral-200 bg-white"
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleAddon(addon.id)}
                                                className="w-full text-left"
                                            >
                                                <h3 className="font-semibold text-black">
                                                    {language === "es"
                                                        ? addon.nameEs
                                                        : addon.nameEn}
                                                </h3>

                                                <p className="mt-1 text-sm text-neutral-600">
                                                    +${addon.price.toLocaleString("es-CO")} COP
                                                </p>

                                                <p className="text-sm text-neutral-500">
                                                    +{addon.estimatedDuration} min
                                                </p>
                                            </button>

                                            {compatibleServices.length > 1 && (
                                                <div className="mt-3 border-t border-neutral-300 pt-3">
                                                    <p className="mb-2 text-sm font-medium text-neutral-700">
                                                        {language === "es"
                                                            ? "¿Para cuál servicio?"
                                                            : "Which service is this for?"}
                                                    </p>

                                                    <div className="flex flex-wrap gap-2">
                                                        {compatibleServices.map((service) => (
                                                            <button
                                                                key={service.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedAddons((current) =>
                                                                        current.includes(addon.id)
                                                                            ? current
                                                                            : [...current, addon.id]
                                                                    );

                                                                    setAddonServiceAssignments(
                                                                        (current) => ({
                                                                            ...current,
                                                                            [addon.id]: service.id,
                                                                        })
                                                                    );
                                                                }}
                                                                className={`rounded-lg border px-3 py-2 text-sm ${
                                                                    addonServiceAssignments[addon.id] ===
                                                                    service.id
                                                                        ? "border-black bg-black text-white"
                                                                        : "border-neutral-300 bg-white text-black"
                                                                }`}
                                                            >
                                                                {language === "es"
                                                                    ? service.nameEs
                                                                    : service.nameEn}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => {
                                    setAddonsConfirmed(true);
                                    setScheduleStarted(true);
                                }}
                                className="mt-5 w-full rounded-xl bg-black px-6 py-3 font-semibold text-white"
                            >
                                {language === "es"
                                    ? selectedAddons.length > 0
                                        ? "Continuar"
                                        : "Continuar Sin Complementos"
                                    : selectedAddons.length > 0
                                        ? "Continue"
                                        : "Continue without Add-Ons"}

                            </button>
                        </div>
                    )}

                    {/* Schedule Stage */}
                    {isScheduleStage &&
                        (scheduleStarted || availableAddons.length === 0) && (
                            <div className="mt-8">
                                <button
                                    onClick={() => {
                                        setScheduleStarted(false);
                                        setAddonsConfirmed(false)
                                    }}
                                    className="text-sm font-medium text-neutral-600 hover:text-black"
                                >
                                    ← {language === "es" ? "Volver" : "Back"}
                                </button>

                                <p className="mt-6 text-sm font-medium uppercase tracking-wide text-neutral-500">
                                    {language === "es" ? "Agenda" : "Schedule"}
                                </p>

                                <h2 className="mt-1 text-2xl font-semibold text-black">
                                    {language === "es"
                                        ? "Programa Tu Cita"
                                        : "Schedule Your Appointment"}
                                </h2>
                            </div>
                        )}

                    {/* Render Technician Options */}
                    {isScheduleStage && (
                        <div className="mt-8">
                            <h2 className="text-xl font-semibold text-black">
                                {language === "es"
                                ? "Técnicas para tus servicios"
                                : "Technicians for your services"}
                            </h2>

                            <p className="mt-1 text-sm text-neutral-500">
                                {language === "es"
                                    ? "Puedes elegir una técnica para cada servicio."
                                    : "You can choose a technician for each service."}
                            </p>

                            <div className="mt-5 space-y-6">
                                {/* All selected nail services share one customer-facing technician choice. */}
                                {selectedNailAssignments.length > 0 && (
                                    <div className="rounded-xl border border-neutral-200 bg-white p-4">
                                        <h3 className="font-semibold text-black">
                                            {language === "es"
                                                ? "Servicios de uñas"
                                                : "Nail services"}
                                        </h3>

                                        <p className="mt-1 text-sm text-neutral-500">
                                            {selectedNailAssignments
                                                .map(({ service }) =>
                                                    language === "es"
                                                        ? service.nameEs
                                                        : service.nameEn
                                                )
                                                .join(" + ")}
                                        </p>

                                        {qualifiedNailEmployees.length === 0 ? (
                                            <p className="mt-3 text-sm text-red-600">
                                                {language === "es"
                                                    ? "No hay una técnica que realice todos los servicios de uñas seleccionados."
                                                    : "No technician performs all of the selected nail services."}
                                            </p>
                                        ) : qualifiedNailEmployees.length === 1 ? (
                                            <p className="mt-3 text-sm text-neutral-600">
                                                {language === "es"
                                                    ? `Asignada: ${qualifiedNailEmployees[0].name}`
                                                    : `Assigned: ${qualifiedNailEmployees[0].name}`}
                                            </p>
                                        ) : (
                                            <div className="mt-3 space-y-3">
                                                <button
                                                    type="button"
                                                    onClick={() => selectNailTechnician("any")}
                                                    className={`w-full rounded-xl border p-4 text-left ${
                                                        selectedNailAssignments.every(
                                                            ({ service }) =>
                                                                selectedEmployeesByService[service.id] ===
                                                                "any"
                                                        )
                                                            ? "border-black bg-neutral-200"
                                                            : "border-neutral-200 bg-white"
                                                    }`}
                                                >
                                                    <span className="font-semibold text-black">
                                                        {language === "es"
                                                            ? "Cualquier Técnica — Recomendado"
                                                            : "Any Technician — Recommended"}
                                                    </span>
                                                </button>

                                                {qualifiedNailEmployees.map((employee) => (
                                                    <button
                                                        key={employee.id}
                                                        type="button"
                                                        onClick={() =>
                                                            selectNailTechnician(employee.id)
                                                        }
                                                        className={`w-full rounded-xl border p-4 text-left ${
                                                            selectedNailAssignments.every(
                                                                ({ service }) =>
                                                                    selectedEmployeesByService[
                                                                        service.id
                                                                    ] === employee.id
                                                            )
                                                                ? "border-black bg-neutral-200"
                                                                : "border-neutral-200 bg-white"
                                                        }`}
                                                    >
                                                        <span className="font-semibold text-black">
                                                            {employee.name}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Non-nail specialties keep their own technician assignment. */}
                                {serviceAssignments
                                    .filter(({ service }) => service.category !== "NAILS")
                                    .map(({ service, qualifiedEmployees }) => {
                                        const selectedForService =
                                            selectedEmployeesByService[service.id];

                                        return (
                                            <div
                                                key={service.id}
                                                className="rounded-xl border border-neutral-200 bg-white p-4"
                                            >
                                                <h3 className="font-semibold text-black">
                                                    {language === "es"
                                                        ? service.nameEs
                                                        : service.nameEn}
                                                </h3>

                                                {qualifiedEmployees.length === 0 ? (
                                                    <p className="mt-3 text-sm text-red-600">
                                                        {language === "es"
                                                            ? "No hay una técnica disponible para este servicio."
                                                            : "No technician is available for this service."}
                                                    </p>
                                                ) : qualifiedEmployees.length === 1 ? (
                                                    <p className="mt-3 text-sm text-neutral-600">
                                                        {language === "es"
                                                            ? `Asignada: ${qualifiedEmployees[0].name}`
                                                            : `Assigned: ${qualifiedEmployees[0].name}`}
                                                    </p>
                                                ) : (
                                                    <div className="mt-3 space-y-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedEmployeesByService(
                                                                    (current) => ({
                                                                        ...current,
                                                                        [service.id]: "any",
                                                                    })
                                                                );
                                                                setSelectedTime("");
                                                            }}
                                                            className={`w-full rounded-xl border p-4 text-left ${
                                                                selectedForService === "any"
                                                                    ? "border-black bg-neutral-200"
                                                                    : "border-neutral-200 bg-white"
                                                            }`}
                                                        >
                                                            <span className="font-semibold text-black">
                                                                {language === "es"
                                                                    ? "Cualquier Técnica — Recomendado"
                                                                    : "Any Technician — Recommended"}
                                                            </span>
                                                        </button>

                                                        {qualifiedEmployees.map((employee) => (
                                                            <button
                                                                key={employee.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedEmployeesByService(
                                                                        (current) => ({
                                                                            ...current,
                                                                            [service.id]: employee.id,
                                                                        })
                                                                    );
                                                                    setSelectedTime("");
                                                                }}
                                                                className={`w-full rounded-xl border p-4 text-left ${
                                                                    selectedForService === employee.id
                                                                        ? "border-black bg-neutral-200"
                                                                        : "border-neutral-200 bg-white"
                                                                }`}
                                                            >
                                                                <span className="font-semibold text-black">
                                                                    {employee.name}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}

                    {/* Date Selector */}
                    {isScheduleStage &&
                        (scheduleStarted || availableAddons.length === 0) &&
                        allServicesHaveTechnicians && (
                        <div className="mt-8">
                            <h2 className="text-xl font-semibold text-black">
                                {language === "es" ? "Elige una fecha" : "Choose a date"}
                            </h2>

                            <input 
                                type="date" 
                                value={selectedDate}
                                onChange={(event) => setSelectedDate(event.target.value)}
                                className="mt-4 w-full rounded-xl border border-neutral-300 bg-white p-4 text-black"
                            />
                        </div>
                    )}

                    {/* Temporary Available Time Slots */}
                    {isScheduleStage &&
                        (availableAddons.length === 0 || addonsConfirmed) &&
                        allServicesHaveTechnicians &&
                        selectedDate && (
                        <div className="mt-8">
                            <h2 className="text-xl font-semibold text-black">
                                {language === "es" ? "Elige una hora" : "Choose a time"}
                            </h2>

                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {availableTimeSlots.map((time) => (
                                    <button
                                        key={time}
                                        onClick={() => setSelectedTime(time)}
                                        className={`rounded-xl border p-3 ${
                                            selectedTime === time
                                                ? "border-black bg-neutral-200 text-black"
                                                : "border-neutral-300 bg-white text-black"
                                        }`}
                                    >
                                        {formatTime(time)}
                                    </button>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Customer Information */}
                    {selectedTime && (
                        <div className="mt-8">
                            <h2 className="text-xl font-semibold text-black">
                                {language === "es" ? "Tus datos" : "Your information"}
                            </h2>

                            <div className="mt-4 space-y-4">
                                <input 
                                    type="text"
                                    value={customerName}
                                    onChange={(event) => setCustomerName(event.target.value)}
                                    placeholder={language === "es" ? "Nombre" : "Name"}
                                    className="w-full rounded-xl border border-neutral-300 bg-white p-4 text-black" 
                                />

                                {/* Country code + customer's local phone number */}
                                <div className="flex gap-2">
                                    <select 
                                        value={countryCode}
                                        onChange={(event) => setCountryCode(event.target.value)}
                                        className="rounded-xl border border-neutral-300 bg-white p-4 text-black"
                                        aria-label={language === "es" ? "Código de País" : "Country Code"}
                                    >
                                        <option value="+57">🇨🇴 +57</option>
                                        <option value="+1">🇺🇸/🇨🇦 +1</option>
                                        <option value="+44">🇬🇧 +44</option>
                                        <option value="+34">🇪🇸 +34</option>
                                        <option value="+52">🇲🇽 +52</option>
                                    </select>

                                    <input
                                        type="tel"
                                        value={customerPhone}
                                        onChange={(event) => setCustomerPhone(event.target.value)}
                                        placeholder={
                                        language === "es"
                                            ? "Teléfono / WhatsApp"
                                            : "Phone / WhatsApp"
                                        }
                                        className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white p-4 text-black"
                                    />
                                    </div>
                            </div>

                                <input 
                                    type="email"
                                    value={customerEmail}
                                    onChange={(event) => setCustomerEmail(event.target.value)}
                                    placeholder={
                                        language === "es"
                                            ? "Correo electrónico (opcional)"
                                            : "Email (optional)"
                                    }
                                    className="w-full rounded-xl border border-neutral-300 bg-white p-4 text-black"     
                                />

                                <textarea 
                                    value={customerNotes}
                                    onChange={(event) => setCustomerNotes(event.target.value)}
                                    placeholder={
                                        language === "es"
                                            ? "Notas para el salon (opcional)"
                                            : "Notes for the salon (optional)"
                                    }
                                    className="min-h-28 w-full rounded-xl border border-neutral-300 bg-white p-4 text-black"
                                />
                            </div>
                    )}

                    {/* Continue Button */}
                    {selectedTime && !isReviewing && (
                        <button
                            onClick={() => setIsReviewing(true)}
                            disabled={!customerName || !customerPhone}
                            className={`mt-8 w-full rounded-xl px-6 py-3 font-semibold ${
                                customerName && customerPhone
                                    ? "bg-black text-white"
                                    : "cursor-not-allowed bg-neutral-300 text-neutral-500"
                            }`}
                        >
                            {language === "es" ? "Revisar cita" : "Review Appointment"}
                        </button>
                    )}

                    {/* Review Appointment */}
                    {isReviewing && (
                        <div className="mt-8 rounded-xl bg-white p-6">
                            <h2 className="text-2xl font-semibold text-black">
                                {language === "es" ? "Revisa tu cita" : "Review Your Appointment"}
                            </h2>

                            <div className="mt-6 space-y-5">

                                <div>
                                    <p className="text-sm text-neutral-500">
                                        {language === "es" ? "Cliente" : "Customer"}
                                    </p>
                                    <p className="font-semibold text-black">{customerName}</p>
                                    <p className="text-neutral-600">
                                        {displayCustomerPhone}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-sm text-neutral-500">
                                        {language === "es" ? "Servicios" : "Services"}
                                    </p>

                                    {selectedServiceDetails.map((service) => (
                                        <p key={service.id} className="text-black">
                                            {language === "es" ? service.nameEs : service.nameEn}
                                        </p>
                                    ))}
                                </div>

                                {selectedAddonDetails.length > 0 && (
                                    <div>
                                        <p className="text-sm text-neutral-500">
                                            {language === "es" ? "Complementos" : "Add-ons"}
                                        </p>

                                        {selectedAddonDetails.map((addon) => (
                                            <p key={addon.id} className="text-black">
                                                {language === "es" ? addon.nameEs : addon.nameEn}
                                            </p>
                                        ))}
                                    </div>
                                )}

                                <div>
                                    <p className="text-sm text-neutral-500">
                                        {language === "es" ? "Técnica" : "Technician"}
                                    </p>

                                    <p className="font-semibold text-black">
                                        {selectedEmployee === "any"
                                            ? language === "es"
                                                ? "Cualquier técnica"
                                                : "Any Technician"
                                            : selectedEmployeeDetails?.name}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-sm text-neutral-500">
                                        {language === "es" ? "Fecha y Hora" : "Date and Time"}
                                    </p>

                                    <p className="font-semibold text-black">
                                        {formatDate(selectedDate)} · {formatTime(selectedTime)}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-sm text-neutral-500">
                                        {language === "es" ? "Precio estimado" : "Estimated Price"}
                                    </p>

                                    <p className="font-semibold text-black">
                                        ${totalPrice.toLocaleString("es-CO")} COP
                                    </p>
                                </div>

                                <div>
                                    <p className="text-sm text-neutral-500">
                                        {language === "es" ? "Duración estimada" : "Estimated Duration"}
                                    </p>

                                    <p className="font-semibold text-black">
                                        {totalDuration} min
                                    </p>
                                </div>
                            </div>

                            {/* Add Edit and Confirm Buttons */}
                            <div className="mt-8 flex gap-3">
                                <button
                                    onClick={() => setIsReviewing(false)}
                                    className="flex-1 rounded-xl border border-black px-4 py-3 font-semibold text-black"
                                >
                                    {language === "es" ? "Editar" : "Edit"}
                                </button>

                                <button
                                    onClick={handleConfirmBooking}
                                    disabled={isSubmitting}
                                    className="flex-1 rounded-xl bg-black px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSubmitting
                                        ? language === "es"
                                            ? "Confirmando..."
                                            : "Confirming..."
                                        : language === "es"
                                            ? "Confirmar cita"
                                            : "Confirm Appointment"}
                                </button>

                                {bookingError && (
                                    <p className="mt-4 text-sm text-red-600">
                                        {bookingError}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Service Selection Summary */}
                    {selectedServices.length > 0 && !servicesConfirmed && (
                        <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h2 className="font-semibold text-black">
                                    {language === "es" ? "Tu Selección" : "Your Selection"}
                                </h2>

                                <span className="text-sm text-neutral-500">
                                    {selectedServices.length}{" "}
                                    {language === "es"
                                        ? selectedServices.length === 1
                                            ? "servicio"
                                            : "servicios"
                                        : selectedServices.length === 1
                                            ? "service"
                                            : "services"}
                                </span>
                            </div>

                            {/* Show every selected service */}
                            <div className="mt-4 space-y-3">
                                {selectedServiceDetails.map((service) => (
                                    <div
                                        key={service.id}
                                        className="flex items-center justify-between gap-4"
                                    >
                                        <span className="text-sm text-neutral-700">
                                            {language === "es" ? service.nameEs : service.nameEn}
                                        </span>

                                        <span className="shrink-0 text-sm font-medium text-black">
                                            ${service.price.toLocaleString("es-CO")}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-5 border-t border-neutral-200 pt-4">
                                <div className="flex justify-between">
                                    <span className="text-neutral-600">
                                        {language === "es"
                                            ? "Precio Estimado"
                                            : "Estimated Price"}
                                    </span>
                                        
                                    <span className="font-semibold text-black">
                                        ${totalPrice.toLocaleString("es-CO")} COP
                                    </span>
                                </div>

                                <div className="mt-2 flex justify-between">
                                    <span className="text-neutral-600">
                                        {language === "es"
                                            ? "Duración Estimada"
                                            : "Estimated Time"}
                                    </span>
                                        
                                    <span className="font-semibold text-black">
                                        {totalDuration} min
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => setServicesConfirmed(true)}
                                className="mt-5 w-full rounded-xl bg-black px-6 py-3 font-semibold text-white"
                            >
                                {language === "es" ? "Continuar" : "Continue"}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </main>
    )
}