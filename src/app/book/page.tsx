"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import { getBookingConfirmationStatus } from "@/lib/booking/confirmation-status";
import {
  getTeffCurrentMinutes,
  getTeffDayOfWeek,
  getTeffToday,
} from "@/lib/datetime";

// Temporary service photos, mapped by database service ID.
// Replace these files with real TEFF photography as it becomes available.
const SERVICE_IMAGES: Record<number, string> = {
    1: "/images/services/semipermanente.webp",
    2: "/images/services/pedicure.webp",
    3: "/images/services/base-rubber.webp",
    10: "/images/services/acrilico.webp",
    12: "/images/services/extensions.webp",
    13: "/images/services/polygel.webp",
    14: "/images/services/dip-powder.webp",
    21: "/images/services/lashes.webp",
    40: "/images/services/brows.webp",
    46: "/images/services/facial.webp",
};
// Generate available start times based on TEFF's business hours
function getTimeSlots(date: string) {
    if (!date) return [];

    const bookingDate = new Date(`${date}T12:00:00-05:00`);
    const dayOfWeek = bookingDate.getDay(); // 0 = Sunday

    const openingMinutes =
        dayOfWeek === 0
            ? 10 * 60 + 30 // Sunday: 10:30
            : 9 * 60 + 30; // Monday-Saturday: 9:30
    // Latest permitted appointment start time.
    const latestStartMinutes =
        dayOfWeek === 0
            ? 17 * 60 // Sunday: 5:00 PM
            : 18 * 60 + 30; // Monday-Saturday: 6:30 PM
    
    const slots: string[] = [];

    // Create 30-minute start time throughout the day
    for (
        let minutes = openingMinutes;
        minutes <= latestStartMinutes;
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

    // Scroll target for booking-stage navigation.
    const bookingStageRef = useRef<HTMLDivElement>(null);

    // Only scroll after an intentional booking-stage transition.
    const pendingStageScrollRef = useRef(false);
    
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
        image: "/images/services/semipermanente.webp",
        nameEs: "Uñas",
        nameEn: "Nails",
        descriptionEs: "Manicure, Pedicure y Extensiones",
        descriptionEn: "Manicure, Pedicure and Extensions",
        },
        {
            id: "LASHES",
            emoji: "👁️",
            image: "/images/services/lashes-cover.webp",
            nameEs: "Pestañas",
            nameEn: "Lashes",
            descriptionEs: "Sets, Retoques y Lifting",
            descriptionEn: "Sets, Fills and Lifting",
        },
        {
            id: "BROWS",
            emoji: "✨",
            image: "/images/services/brows.webp",
            nameEs: "Cejas y Depilación",
            nameEn: "Brows & Waxing",
            descriptionEs: "Laminado, Henna y Depilación",
            descriptionEn: "Lamination, Henna and Waxing",
        },
        {
            id: "ESTHETICS",
            emoji: "🧖‍♀️",
            image: "/images/services/facial.webp",
            nameEs: "Estética",
            nameEn: "Esthetics",
            descriptionEs: "Faciales y Tratamientos",
            descriptionEn: "Facials and Treatments",
        },
    ]
    const [selectedServices, setSelectedServices] = useState<number[]>([]);

    // Each add-on selection belongs to a specific service.
    // This allows the same add-on, such as Retiro, to be used for both hands and feet.
    const [selectedAddons, setSelectedAddons] = useState<
        { addonId: number; serviceId: number }[]
    >([]);
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
    const [noPhone, setNoPhone] = useState(false);

    // Show a confirmation before allowing customers to skip their phone number.
    const [showSkipPhoneConfirmation, setShowSkipPhoneConfirmation] = useState(false);

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

    useEffect(() => {
        if (!pendingStageScrollRef.current) {
            return;
        }

        pendingStageScrollRef.current = false;

        const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        bookingStageRef.current?.scrollIntoView({
            behavior: prefersReducedMotion ? "instant" : "smooth",
            block: "start",
        });
    }, [servicesConfirmed, scheduleStarted, isReviewing]);

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

    // Remove add-on selections that are no longer valid
    // when the customer changes their selected services.
    useEffect(() => {
        setSelectedAddons((current) =>
            current.filter((selection) =>
                selectedServices.includes(selection.serviceId) &&
                serviceAddons.some(
                    (relation) =>
                        relation.addonId === selection.addonId &&
                        relation.serviceId === selection.serviceId
                )
            )
        );
    }, [selectedServices, serviceAddons]);

    const availableAddons = addons.filter((addon) =>
        availableAddonIds.includes(addon.id)
    );

    // Select or remove an add-on for a specific service.
    // The same add-on can be selected once for each service.
    function toggleAddon(addonId: number, serviceId: number) {
        setSelectedAddons((current) => {
            const isSelected = current.some(
                (selection) =>
                    selection.addonId === addonId &&
                    selection.serviceId === serviceId
            );

            if (isSelected) {
                return current.filter(
                    (selection) =>
                        !(
                            selection.addonId === addonId &&
                            selection.serviceId === serviceId
                        )
                );
            }

            return [...current, { addonId, serviceId }];
        });
    }

    // Find Selected Services Data
    const selectedServiceDetails = services.filter((service) =>
        selectedServices.includes(service.id)
    );

    // Build the selected add-on details while preserving duplicate add-ons
    // assigned to different services, such as Retiro for hands and feet.
    const selectedAddonDetails = selectedAddons
        .map((selection) => {
            const addon = addons.find(
                (item) => item.id === selection.addonId
            );

            if (!addon) {
                return null;
            }

            return {
                ...addon,
                serviceId: selection.serviceId,
            };
        })
        .filter(
            (addon): addon is NonNullable<typeof addon> =>
                addon !== null
        );

    function toggleService(serviceId: number) {
        setSelectedServices((current) =>
            current.includes(serviceId)
                ? current.filter((id) => id !== serviceId)
                : [...current, serviceId]
        );
    }

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

    const latestStartTime =
        dayOfWeek === 0
            ? 17 * 60 // Sunday: 5:00 PM
            : 18 * 60 + 30; // Monday-Saturday: 6:30 PM

    const availableTimeSlots = timeSlots.filter((time) => {
        const bookingStart = timeToMinutes(time);

        // Hide time slots that have already passed today in Medellin
        if (
            selectedDate === getTeffToday() &&
            bookingStart <= getTeffCurrentMinutes()
        ) {
            return false;
        }

        // Appointments may finish after closing, but must start
        // no later than the final permitted booking time.
        if (bookingStart > latestStartTime) {
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
    const displayCustomerPhone = noPhone
        ? language === "es"
            ? "Sin teléfono"
            : "No phone"
        : customerPhone.trim().startsWith("+")
            ? customerPhone
            : `${countryCode} ${customerPhone}`;

    // The scheduling stage begin after add-on are completed
    // or immediately when selected services have no add-ons
    const isScheduleStage =
        servicesConfirmed &&
        (scheduleStarted || availableAddons.length === 0);

    // Customer-facing booking progress.
    // Service selection = 1
    // Add-ons, technician, scheduling and contact details = 2
    // Final booking review = 3
    const bookingProgressStep =
        !servicesConfirmed
            ? 1
            : isReviewing
                ? 3
                : 2;

    // Confirm Booking Details
    async function handleConfirmBooking() {
        try {
            setIsSubmitting(true);
            setBookingError("");

            // If the customer typed an international number themselves,
            // don't add the selected country code a second time.
            const fullCustomerPhone = noPhone
                ? ""
                : customerPhone.trim().startsWith("+")
                    ? customerPhone
                    : `${countryCode}${customerPhone}`;

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
                    addonAssignments: selectedAddons.map((selection) => ({
                        addonId: selection.addonId,
                        serviceId: selection.serviceId,
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
                    (selection) =>
                        selection.serviceId === service.id
                )
                .map((selection) =>
                    addons.find(
                        (addon) => addon.id === selection.addonId
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

    // Use the tested helper to determine the actual booking status.
    const bookingConfirmationStatus = getBookingConfirmationStatus(
        confirmationAppointments,
        confirmationServices.length
    );

    const allServicesBooked =
        bookingConfirmationStatus === "CONFIRMED";

    const allServicesRequested =
        bookingConfirmationStatus === "REQUESTED";

    const hasMixedApprovalStatuses =
        bookingConfirmationStatus === "MIXED";

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
                <div className="mx-auto mt-4 max-w-2xl sm:mt-8">
                    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
                        {/* TEFF branding */}
                        <div className="mb-7 flex flex-col items-center text-center sm:mb-9">
                            <div className="font-serif text-4xl font-normal tracking-[0.3em] text-black sm:text-5xl">
                                TEFF
                            </div>

                            <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.35em] text-black">
                                BEAUTY SALON
                            </div>

                            <div
                                aria-hidden="true"
                                className="mt-5 h-px w-16 bg-[#B76E79]/50"
                            />
                        </div>

                        {/* Confirmation status icon */}
                        <div
                            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border ${
                                allServicesBooked
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : allServicesRequested
                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                        : "border-neutral-200 bg-neutral-50 text-neutral-600"
                            }`}
                        >
                            {allServicesBooked ? (
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-9 w-9"
                                    aria-hidden="true"
                                >
                                    <path d="M5 12.5l4.5 4.5L19 7" />
                                </svg>
                            ) : allServicesRequested ? (
                                <span className="text-3xl" aria-hidden="true">
                                    ⏳
                                </span>
                            ) : (
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-8 w-8"
                                    aria-hidden="true"
                                >
                                    <rect x="5" y="4" width="14" height="17" rx="2" />
                                    <path d="M9 4.5h6M9 11h6M9 15h4" />
                                </svg>
                            )}
                        </div>

                        <div className="mt-6 text-center">
                            <h2 className="text-2xl font-semibold leading-tight tracking-tight text-black sm:text-3xl">
                                {allServicesBooked
                                    ? language === "es"
                                        ? "¡Cita confirmada!"
                                        : "Appointment confirmed!"
                                    : allServicesRequested
                                        ? language === "es"
                                            ? "¡Solicitud recibida!"
                                            : "Request received!"
                                        : hasMixedApprovalStatuses
                                            ? language === "es"
                                                ? "¡Reserva recibida!"
                                                : "Booking received!"
                                            : language === "es"
                                                ? "¡Reserva recibida!"
                                                : "Booking received!"}
                            </h2>

                            {/* Show the appropriate message based on booking approval status. */}
                            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-neutral-600 sm:text-base">
                                {allServicesBooked
                                    ? (
                                        <>
                                            <span className="block text-xl font-semibold text-[#B76E79]">
                                                {customerName.trim().split(/\s+/)[0]}{" "}
                                                <span aria-hidden="true">💗</span>
                                            </span>

                                            <span className="mt-2 block text-sm leading-6 text-neutral-600 sm:text-base">
                                                {language === "es"
                                                    ? "¡Gracias por elegir TEFF! Nos encantará recibirte."
                                                    : "Thank you for choosing TEFF! We look forward to welcoming you."}
                                            </span>
                                        </>
                                    )
                                    : allServicesRequested
                                        ? language === "es"
                                            ? "Recibimos tu solicitud. Tus servicios están pendientes de aprobación por TEFF."
                                            : "We received your request. Your services are awaiting approval from TEFF."
                                        : hasMixedApprovalStatuses
                                            ? language === "es"
                                                ? "Algunos servicios están confirmados y otros pendientes de aprobación. Revisa el estado de cada servicio a continuación."
                                                : "Some services are confirmed while others are awaiting approval. Review each service's status below."
                                            : language === "es"
                                                ? "Recibimos tu reserva, pero no pudimos verificar el estado de todos los servicios. Comunícate con TEFF para confirmar los detalles."
                                                : "We received your booking, but couldn't verify every service's status. Please contact TEFF to confirm the details."}
                            </p>
                        </div>

                        {/* Date and starting time */}
                        <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50/50 p-5 text-left sm:mt-8 sm:p-6">
                            {/* Appointment summary heading */}
                            <h3 className="mb-5 text-xl font-semibold tracking-tight text-black sm:text-2xl">
                                {language === "es" ? "Tu próxima cita" : "Your upcoming appointment"}
                            </h3>

                            {/* Appointment date and starting time */}
                            <div className="flex items-start gap-3 text-left">
                                <svg
                                    className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <rect x="3" y="5" width="18" height="16" rx="2" />
                                    <path d="M7 3v4M17 3v4M3 10h18" />
                                </svg>

                                <p className="font-medium leading-6 text-black">
                                    {formatConfirmationDate(selectedDate)}
                                    <span className="mx-2 text-neutral-400">·</span>
                                    {formatTime(selectedTime)}
                                </p>
                            </div>

                            {/* Services, add-ons, and assigned technicians */}
                            <div className="mt-6 space-y-5 border-t border-neutral-200 pt-5 text-left">
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
                                        className="border-b border-neutral-200/70 pb-5 last:border-b-0 last:pb-0"
                                    >
                                        {confirmationServices.length > 1 && (
                                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                                {language === "es"
                                                    ? `Servicio ${index + 1} de ${confirmationServices.length}`
                                                    : `Service ${index + 1} of ${confirmationServices.length}`}
                                            </p>
                                        )}

                                        {/* Individual appointment approval status */}
                                        {createdAppointment && (
                                            <div className="mb-3">
                                                <span
                                                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                                                        createdAppointment.status === "BOOKED"
                                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                            : createdAppointment.status === "REQUESTED"
                                                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                                                : "border-neutral-200 bg-neutral-50 text-neutral-600"
                                                    }`}
                                                >
                                                    {createdAppointment.status === "BOOKED"
                                                        ? language === "es"
                                                            ? "Confirmado"
                                                            : "Confirmed"
                                                        : createdAppointment.status === "REQUESTED"
                                                            ? language === "es"
                                                                ? "Pendiente de aprobación"
                                                                : "Pending approval"
                                                            : language === "es"
                                                                ? "Estado por verificar"
                                                                : "Status to verify"}
                                                </span>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 sm:flex-nowrap">
                                            {/* Service name with decorative icon */}
                                            <div className="flex min-w-0 items-start gap-3">
                                                <svg
                                                    className="mt-0.5 h-5 w-5 shrink-0 text-[#B76E79]"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="1.8"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z" />
                                                </svg>

                                                <p className="font-semibold leading-6 text-neutral-900">
                                                    {language === "es"
                                                        ? item.service.nameEs
                                                        : item.service.nameEn}
                                                </p>
                                            </div>

                                            <p className="shrink-0 whitespace-nowrap text-base font-semibold tracking-tight text-black">
                                                $
                                                {item.service.price.toLocaleString(
                                                    "es-CO"
                                                )}
                                            </p>
                                        </div>

                                        {/* Display the assigned technician and individual service time. */}
                                        {createdAppointment && (
                                            <div className="mt-3 flex items-start gap-3">
                                                <svg
                                                    className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="1.8"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <circle cx="12" cy="8" r="4" />
                                                    <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                                                </svg>

                                                <p className="text-sm leading-6 text-neutral-600">
                                                    {language === "es" ? "Profesional: " : "Professional: "}
                                                    <span className="font-medium text-black">
                                                        {createdAppointment.employee.name}
                                                    </span>
                                                    {/* Keep the individual service time together on narrow screens. */}
                                                    <span
                                                        className={`whitespace-nowrap text-neutral-400 ${
                                                            confirmationServices.length === 1 ? "hidden sm:inline-block" : "inline-block"
                                                        }`}
                                                    >
                                                        {" · "}
                                                        {formatTime(createdAppointment.startTime)}
                                                    </span>
                                                </p>
                                            </div>
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
                            <div className="mt-6 border-t border-neutral-200 pt-5">
                                <p className="text-sm font-medium text-neutral-500">
                                    {language === "es" ? "Total estimado" : "Estimated total"}
                                </p>

                                <p className="mt-1 text-3xl font-bold tracking-tight text-black">
                                    ${confirmationTotal.toLocaleString("es-CO")}
                                    <span className="ml-2 text-sm font-medium text-neutral-500">
                                        COP
                                    </span>
                                </p>
                            </div>
                        </div>

                        {/* Salon location and directions */}
                        <div className="mt-8">
                            {/* Location heading */}
                            <div className="mb-5">
                                <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#B76E79]">
                                    {language === "es" ? "Ubicación" : "Location"}
                                </p>

                                <h3 className="mt-2 text-xl font-semibold tracking-tight text-black sm:text-2xl">
                                    {language === "es"
                                        ? "Te esperamos en TEFF"
                                        : "We look forward to seeing you at TEFF"}
                                </h3>

                                <div className="mt-4 flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                                    <span aria-hidden="true" className="text-xl">
                                        📍
                                    </span>

                                    <div>
                                        <p className="font-semibold text-black">
                                            TEFF Beauty Salon
                                        </p>

                                        <p className="mt-1 text-sm leading-6 text-neutral-600">
                                            Cra. 43A #11-73, El Poblado, Medellín
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Lightweight static map of TEFF's location */}
                            {process.env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_API_KEY && (
                                <a
                                    href="https://maps.app.goo.gl/gWzsFDtvYW3TQ9Rd7"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={
                                        language === "es"
                                            ? "Ver ubicación de TEFF en Google Maps"
                                            : "View TEFF's location on Google Maps"
                                    }
                                    className="mt-5 block overflow-hidden rounded-2xl border border-neutral-200"
                                >
                                    {/* Google serves the map directly with its attribution. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={
                                            "https://maps.googleapis.com/maps/api/staticmap?" +
                                            new URLSearchParams({
                                                center: "6.212023,-75.5703099",
                                                zoom: "16",
                                                size: "600x360",
                                                scale: "2",
                                                maptype: "roadmap",
                                                markers: "color:red|6.212023,-75.5703099",
                                                key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_API_KEY,
                                            }).toString()
                                        }
                                        alt={
                                            language === "es"
                                                ? "Mapa de ubicación de TEFF Beauty Salon"
                                                : "Location map of TEFF Beauty Salon"
                                        }
                                        loading="lazy"
                                        decoding="async"
                                        width={600}
                                        height={360}
                                        className="aspect-5/3 w-full object-cover"
                                    />
                                </a>
                            )}

                            <a
                                href="https://maps.app.goo.gl/gWzsFDtvYW3TQ9Rd7"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 font-semibold text-white transition hover:bg-neutral-800"
                            >
                                {language === "es"
                                    ? "Cómo llegar con Google Maps ↗"
                                    : "Get directions with Google Maps ↗"}
                            </a>
                        </div>
                        
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="mt-3 w-full rounded-2xl border border-neutral-300 bg-white px-5 py-4 font-semibold text-black transition hover:bg-neutral-100"
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
                {/* TEFF branding */}
                <div className="mb-8 flex flex-col items-start">
                    <div className="font-serif text-4xl font-normal tracking-[0.3em] text-black sm:text-5xl">
                        TEFF
                    </div>
                    <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.35em] text-black">
                        BEAUTY SALON
                    </div>
                </div>

                {/* Heading */}
                <h1
                    ref={bookingStageRef}
                    className="scroll-mt-6 text-3xl font-bold text-black"
                >
                        {language === "es"
                            ? "Reserva Tu Cita"
                            : "Book Your Appointment"}
                </h1>

                {/* Customer booking progress */}
                <div
                    className="mt-5"
                    aria-label={
                        language === "es"
                            ? `Paso ${bookingProgressStep} de 3`
                            : `Step ${bookingProgressStep} of 3`
                    }
                >
                    <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#B76E79]">
                            {language === "es"
                                ? `Paso ${bookingProgressStep} de 3`
                                : `Step ${bookingProgressStep} of 3`}
                        </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {[
                            {
                                id: 1,
                                es: "Servicios",
                                en: "Services",
                            },
                            {
                                id: 2,
                                es: "Personaliza y agenda",
                                en: "Customize & Schedule",
                            },
                            {
                                id: 3,
                                es: "Confirmar",
                                en: "Confirm",
                            },
                        ].map((step) => (
                            <div key={step.id} className="min-w-0">
                                <div
                                    className={`h-1.5 rounded-full ${
                                        bookingProgressStep >= step.id
                                            ? "bg-[#B76E79]"
                                            : "bg-neutral-200"
                                    }`}
                                />

                                <p
                                    className={`mt-2 text-center text-[11px] leading-4 ${
                                        bookingProgressStep === step.id
                                            ? "font-semibold text-black"
                                            : "text-neutral-500"
                                    }`}
                                >
                                    {language === "es"
                                        ? step.es
                                        : step.en}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
                    {!servicesConfirmed && (
                        <p className="mt-2 text-neutral-600">
                            {language === "es"
                                ? "Selecciona los servicios que deseas reservar."
                                : "Select the services you would like to book."}
                        </p>
                    )}

                    {/* Hide booking forms during final appointment review */}
                    {!isReviewing && (
                        <>
                    
                    {/* Service Browser */}
                    {!servicesConfirmed && (
                        <>
                        {/* Service Category Selection */}
                        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4">
                            {serviceCategories.map((category) => {
                                const isSelected = selectedCategory === category.id;

                                return (
                                    <button
                                        key={category.id}
                                        type="button"
                                        onClick={() => setSelectedCategory(category.id)}
                                        aria-pressed={isSelected}
                                        className={`group relative aspect-[1.15/1] overflow-hidden rounded-2xl border-2 text-left transition-all duration-200 sm:aspect-[1.6/1] ${
                                            isSelected
                                                ? "border-[#B76E79] ring-2 ring-[#B76E79]/30"
                                                : "border-transparent hover:border-[#B76E79]/50"
                                        }`}
                                    >
                                        {/* Category photo */}
                                        <Image
                                            src={category.image}
                                            alt=""
                                            fill
                                            sizes="(max-width: 640px) 50vw, 320px"
                                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                                        />

                                        {/* Gradient keeps text readable */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />

                                        {/* Category name and description */}
                                        <div className="absolute inset-x-0 bottom-0 pb-5 pl-3 pr-9 pt-3 text-white sm:pb-6 sm:pl-4 sm:pr-10">
                                            <h2 className="text-base font-bold leading-tight sm:text-lg">
                                                {language === "es"
                                                    ? category.nameEs
                                                    : category.nameEn}
                                            </h2>

                                            <p className="mt-1 line-clamp-2 pr-5 text-[11px] leading-snug text-white/90 sm:text-xs">
                                                {language === "es"
                                                    ? category.descriptionEs
                                                    : category.descriptionEn}
                                            </p>
                                        </div>

                                        {/* Directional indicator */}
                                        <span
                                            aria-hidden="true"
                                            className="absolute bottom-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-sm font-semibold text-black shadow-sm sm:bottom-4 sm:right-4"
                                        >
                                            →
                                        </span>
                                    </button>
                                );
                            })}
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

                                <div className="space-y-3">
                                    {services
                                        .filter((service) => service.category === selectedCategory)
                                        .map((service) => {
                                            const isSelected = selectedServices.includes(service.id);

                                            return (
                                                <button
                                                    key={service.id}
                                                    type="button"
                                                    onClick={() => toggleService(service.id)}
                                                    aria-pressed={isSelected}
                                                    className={`w-full overflow-hidden rounded-2xl border text-left transition-colors ${
                                                        isSelected
                                                            ? "border-[#B76E79] bg-[#F9F0F1]"
                                                            : "border-neutral-200 bg-white hover:border-neutral-300"
                                                    }`}
                                                >
                                                    <div className="flex min-h-[112px] items-center gap-3 p-3 sm:gap-4">
                                                        {/* Service photography */}
                                                        {SERVICE_IMAGES[service.id] && (
                                                            <Image
                                                                src={SERVICE_IMAGES[service.id]}
                                                                alt={
                                                                    language === "es"
                                                                        ? `Foto de ${service.nameEs}`
                                                                        : `Photo of ${service.nameEn}`
                                                                }
                                                                width={112}
                                                                height={112}
                                                                sizes="(max-width: 640px) 96px, 112px"
                                                                className="h-24 w-24 shrink-0 rounded-xl object-cover sm:h-28 sm:w-28"
                                                            />
                                                        )}

                                                        {/* Service details */}
                                                        <div className="min-w-0 flex-1">
                                                            <h3 className="text-base font-semibold leading-snug text-black sm:text-lg">
                                                                {language === "es"
                                                                    ? service.nameEs
                                                                    : service.nameEn}
                                                            </h3>

                                                            <p className="mt-1 text-sm text-neutral-600">
                                                                ${service.price.toLocaleString("es-CO")} COP
                                                            </p>

                                                            <div className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500">
                                                                <svg
                                                                    aria-hidden="true"
                                                                    className="h-4 w-4 shrink-0"
                                                                    viewBox="0 0 24 24"
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    strokeWidth="1.8"
                                                                    strokeLinecap="round"
                                                                >
                                                                    <circle cx="12" cy="12" r="9" />
                                                                    <path d="M12 7v5l3 2" />
                                                                </svg>

                                                                <span>{service.estimatedDuration} min</span>
                                                            </div>
                                                        </div>

                                                        {/* Selection indicator */}
                                                        <span
                                                            aria-hidden="true"
                                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
                                                                isSelected
                                                                    ? "bg-[#B76E79] text-white"
                                                                    : "bg-neutral-100 text-neutral-700"
                                                            }`}
                                                        >
                                                            {isSelected ? "✓" : "›"}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                </div>
                            </div>
                        )}
                        </>
                    )}

                    {/* Appointment Configuration */}
                    {servicesConfirmed && !scheduleStarted && (
                        <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-5 sm:px-6">
                                <div className="min-w-0">
                                    <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#B76E79]">
                                        TEFF BEAUTY SALON
                                    </p>

                                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-black">
                                        {language === "es" ? "Tus servicios" : "Your Services"}
                                    </h2>
                                </div>

                                <span className="shrink-0 rounded-full bg-[#F9F0F1] px-3 py-1.5 text-xs font-semibold text-[#9F5663]">
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

                            {/* Selected services */}
                            <div className="px-5 py-5 sm:px-6">
                                <div className="space-y-4">
                                    {selectedServiceDetails.map((service) => (
                                        <div
                                            key={service.id}
                                            className="flex items-start justify-between gap-4"
                                        >
                                            <div className="flex min-w-0 items-start gap-3">
                                                <span
                                                    aria-hidden="true"
                                                    className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F9F0F1] text-xs font-bold text-[#B76E79]"
                                                >
                                                    ✓
                                                </span>

                                                <span className="text-sm font-medium leading-6 text-neutral-800">
                                                    {language === "es"
                                                        ? service.nameEs
                                                        : service.nameEn}
                                                </span>
                                            </div>

                                            <span className="shrink-0 text-sm font-semibold leading-6 text-black">
                                                ${service.price.toLocaleString("es-CO")}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Services subtotal */}
                                <div className="mt-5 flex items-center justify-between gap-3 border-t border-neutral-200 pt-4">
                                    <span className="text-sm text-neutral-600">
                                        {language === "es"
                                            ? "Subtotal servicios"
                                            : "Services subtotal"}
                                    </span>

                                    <span className="text-lg font-bold text-black">
                                        ${selectedServiceDetails
                                            .reduce((sum, service) => sum + service.price, 0)
                                            .toLocaleString("es-CO")}{" "}
                                        <span className="text-xs font-medium text-neutral-500">
                                            COP
                                        </span>
                                    </span>
                                </div>

                                {/* Edit services */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        pendingStageScrollRef.current = true;
                                        setServicesConfirmed(false);
                                        setAddonsConfirmed(false);
                                        setScheduleStarted(false);
                                    }}
                                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 transition-colors hover:border-[#B76E79] hover:bg-[#F9F0F1]"
                                >
                                    <span aria-hidden="true">✎</span>
                                    {language === "es"
                                        ? "Editar servicios"
                                        : "Edit services"}
                                </button>
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

                                    const isSelected = selectedAddons.some(
                                        (selection) => selection.addonId === addon.id
                                    );

                                    return (
                                        <div
                                            key={addon.id}
                                            className={`overflow-hidden rounded-2xl border p-4 transition-colors sm:p-5 ${
                                                isSelected
                                                    ? "border-[#B76E79] bg-[#F9F0F1]"
                                                    : "border-neutral-200 bg-white"
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (compatibleServices.length === 1) {
                                                        toggleAddon(addon.id, compatibleServices[0].id);
                                                    }
                                                }}
                                                className="w-full text-left"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <h3 className="text-base font-semibold text-black sm:text-lg">
                                                        {language === "es"
                                                            ? addon.nameEs
                                                            : addon.nameEn}
                                                    </h3>

                                                    <span
                                                        aria-hidden="true"
                                                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${
                                                            isSelected
                                                                ? "bg-[#B76E79] text-white"
                                                                : "bg-neutral-100 text-neutral-500"
                                                        }`}
                                                    >
                                                        {isSelected ? "✓" : "+"}
                                                    </span>
                                                </div>

                                                <p className="mt-1 text-sm font-medium text-neutral-700">
                                                    +${addon.price.toLocaleString("es-CO")} COP
                                                </p>

                                                <div className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500">
                                                    <svg
                                                        aria-hidden="true"
                                                        className="h-4 w-4 shrink-0 text-[#B76E79]"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="1.8"
                                                        strokeLinecap="round"
                                                    >
                                                        <circle cx="12" cy="12" r="9" />
                                                        <path d="M12 7v5l3 2" />
                                                    </svg>

                                                    <span>+{addon.estimatedDuration} min</span>
                                                </div>
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
                                                                onClick={() => toggleAddon(addon.id, service.id)}
                                                                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                                                                    selectedAddons.some(
                                                                        (selection) =>
                                                                            selection.addonId === addon.id &&
                                                                            selection.serviceId === service.id
                                                                    )
                                                                        ? "border-[#B76E79] bg-[#B76E79] text-white"
                                                                        : "border-neutral-200 bg-white text-neutral-700 hover:border-[#B76E79]"
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
                                type="button"
                                onClick={() => {
                                    pendingStageScrollRef.current = true;
                                    setAddonsConfirmed(true);
                                    setScheduleStarted(true);
                                }}
                                className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-black px-6 py-4 font-semibold text-white transition-colors hover:bg-neutral-800"
                            >
                                {language === "es"
                                    ? selectedAddons.length > 0
                                        ? "Continuar"
                                        : "Continuar Sin Complementos"
                                    : selectedAddons.length > 0
                                        ? "Continue"
                                        : "Continue without Add-Ons"}
                                <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    )}

                    {/* Schedule Stage */}
                    {isScheduleStage &&
                        (scheduleStarted || availableAddons.length === 0) && (
                            <div className="mt-8">
                                <button
                                    type="button"
                                    onClick={() => {
                                        pendingStageScrollRef.current = true;

                                        if (availableAddons.length === 0) {
                                            setServicesConfirmed(false);
                                        }

                                        setScheduleStarted(false);
                                        setAddonsConfirmed(false);
                                    }}
                                    className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-[#B76E79] hover:bg-[#F9F0F1]"
                                >
                                    <span aria-hidden="true">←</span>
                                    {language === "es" ? "Volver" : "Back"}
                                </button>
                            </div>
                        )}

                    {/* Render Technician Options */}
                    {isScheduleStage && (
                        <div className="mt-6">
                            <h2 className="text-xl font-semibold tracking-tight text-black sm:text-2xl">
                                {language === "es"
                                    ? "Elige quién te atenderá"
                                    : "Choose your technician"}
                            </h2>

                            <div className="mt-5 space-y-6">
                                {/* All selected nail services share one customer-facing technician choice. */}
                                {selectedNailAssignments.length > 0 && (
                                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
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
                                                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                                                        selectedNailAssignments.every(
                                                            ({ service }) =>
                                                                selectedEmployeesByService[service.id] === "any"
                                                        )
                                                            ? "border-[#B76E79] bg-[#F9F0F1]"
                                                            : "border-neutral-200 bg-white hover:border-[#B76E79]"
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="font-semibold text-black">
                                                            {language === "es"
                                                                ? "Cualquier Técnica — Recomendado"
                                                                : "Any Technician — Recommended"}
                                                        </span>

                                                        {selectedNailAssignments.every(
                                                            ({ service }) =>
                                                                selectedEmployeesByService[service.id] === "any"
                                                        ) && (
                                                            <span
                                                                aria-hidden="true"
                                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B76E79] text-sm font-bold text-white"
                                                            >
                                                                ✓
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>

                                                {qualifiedNailEmployees.map((employee) => (
                                                    <button
                                                        key={employee.id}
                                                        type="button"
                                                        onClick={() =>
                                                            selectNailTechnician(employee.id)
                                                        }
                                                        className={`w-full rounded-xl border p-4 text-left transition-colors ${
                                                            selectedNailAssignments.every(
                                                                ({ service }) =>
                                                                    selectedEmployeesByService[service.id] === employee.id
                                                            )
                                                                ? "border-[#B76E79] bg-[#F9F0F1]"
                                                                : "border-neutral-200 bg-white hover:border-[#B76E79]"
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span className="font-semibold text-black">
                                                                {employee.name}
                                                            </span>

                                                            {selectedNailAssignments.every(
                                                                ({ service }) =>
                                                                    selectedEmployeesByService[service.id] === employee.id
                                                            ) && (
                                                                <span
                                                                    aria-hidden="true"
                                                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B76E79] text-sm font-bold text-white"
                                                                >
                                                                    ✓
                                                                </span>
                                                            )}
                                                        </div>
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
                                                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
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
                                                            className={`w-full rounded-xl border p-4 text-left transition-colors ${
                                                                selectedForService === "any"
                                                                    ? "border-[#B76E79] bg-[#F9F0F1]"
                                                                    : "border-neutral-200 bg-white hover:border-[#B76E79]"
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="font-semibold text-black">
                                                                    {language === "es"
                                                                        ? "Cualquier Técnica — Recomendado"
                                                                        : "Any Technician — Recommended"}
                                                                </span>

                                                                {selectedForService === "any" && (
                                                                    <span
                                                                        aria-hidden="true"
                                                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B76E79] text-sm font-bold text-white"
                                                                    >
                                                                        ✓
                                                                    </span>
                                                                )}
                                                            </div>
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
                                                                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                                                                    selectedForService === employee.id
                                                                        ? "border-[#B76E79] bg-[#F9F0F1]"
                                                                        : "border-neutral-200 bg-white hover:border-[#B76E79]"
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <span className="font-semibold text-black">
                                                                        {employee.name}
                                                                    </span>

                                                                    {selectedForService === employee.id && (
                                                                        <span
                                                                            aria-hidden="true"
                                                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B76E79] text-sm font-bold text-white"
                                                                        >
                                                                            ✓
                                                                        </span>
                                                                    )}
                                                                </div>
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
                                aria-label={
                                    language === "es"
                                        ? "Fecha de la cita"
                                        : "Appointment date"
                                }
                                className="mt-4 w-full min-w-0 rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-base font-medium text-black shadow-sm outline-none transition-colors focus:border-[#B76E79] focus:ring-2 focus:ring-[#B76E79]/20"
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
                                {availableTimeSlots.map((time) => {
                                    const isSelected = selectedTime === time;

                                    return (
                                        <button
                                            key={time}
                                            type="button"
                                            onClick={() => setSelectedTime(time)}
                                            aria-pressed={isSelected}
                                            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                                                isSelected
                                                    ? "border-[#B76E79] bg-[#F9F0F1] text-[#9F5663] ring-1 ring-[#B76E79]/20"
                                                    : "border-neutral-200 bg-white text-neutral-700 hover:border-[#B76E79]"
                                            }`}
                                        >
                                            {formatTime(time)}

                                            {isSelected && (
                                                <span aria-hidden="true" className="text-[#B76E79]">
                                                    ✓
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Customer Information */}
                    {selectedTime && (
                        <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                            {/* Customer information header */}
                            <div className="border-b border-neutral-100 px-5 py-5 sm:px-6">
                                <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#B76E79]">
                                    TEFF BEAUTY SALON
                                </p>

                                <h2 className="mt-1 text-xl font-semibold tracking-tight text-black">
                                    {language === "es" ? "Tus datos" : "Your information"}
                                </h2>

                                <p className="mt-1 text-sm text-neutral-500">
                                    {language === "es"
                                        ? "Completa tus datos para continuar con la reserva."
                                        : "Enter your information to continue your booking."}
                                </p>
                            </div>

                            <div className="space-y-4 px-5 py-5 sm:px-6">
                                <div>
                                    <label
                                        htmlFor="booking-customer-name"
                                        className="mb-2 block text-sm font-medium text-neutral-700"
                                    >
                                        {language === "es" ? "Nombre completo" : "Full name"}
                                    </label>

                                    <input
                                        id="booking-customer-name"
                                        type="text"
                                        autoComplete="name"
                                        value={customerName}
                                        onChange={(event) => setCustomerName(event.target.value)}
                                        placeholder={
                                            language === "es"
                                                ? "Escribe tu nombre"
                                                : "Enter your name"
                                        }
                                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-base text-black outline-none transition-colors placeholder:text-neutral-400 focus:border-[#B76E79] focus:ring-2 focus:ring-[#B76E79]/20"
                                    />
                                </div>

                                {/* Country code + customer's local phone number */}
                                <div>
                                    <label
                                        htmlFor="booking-customer-phone"
                                        className="mb-2 block text-sm font-medium text-neutral-700"
                                    >
                                        {language === "es" ? "Teléfono / WhatsApp" : "Phone / WhatsApp"}
                                    </label>

                                    <div className="flex min-w-0 gap-2">
                                        <select
                                        value={countryCode}
                                        onChange={(event) => setCountryCode(event.target.value)}
                                        className="w-[116px] shrink-0 rounded-xl border border-neutral-200 bg-white px-2 py-3.5 text-sm text-black outline-none focus:border-[#B76E79] focus:ring-2 focus:ring-[#B76E79]/20 sm:w-[180px]"
                                        aria-label={language === "es" ? "Código de País" : "Country Code"}
                                    >
                                        {/* Colombia remains the default */}
                                        <option value="+57">🇨🇴 Colombia (+57)</option>

                                        {/* North America */}
                                        <option value="+1">🇺🇸🇨🇦 Estados Unidos / Canadá (+1)</option>
                                        <option value="+52">🇲🇽 México (+52)</option>

                                        {/* South America */}
                                        <option value="+54">🇦🇷 Argentina (+54)</option>
                                        <option value="+55">🇧🇷 Brasil (+55)</option>
                                        <option value="+56">🇨🇱 Chile (+56)</option>
                                        <option value="+51">🇵🇪 Perú (+51)</option>
                                        <option value="+593">🇪🇨 Ecuador (+593)</option>
                                        <option value="+58">🇻🇪 Venezuela (+58)</option>
                                        <option value="+591">🇧🇴 Bolivia (+591)</option>
                                        <option value="+595">🇵🇾 Paraguay (+595)</option>
                                        <option value="+598">🇺🇾 Uruguay (+598)</option>

                                        {/* Central America and Caribbean */}
                                        <option value="+507">🇵🇦 Panamá (+507)</option>
                                        <option value="+506">🇨🇷 Costa Rica (+506)</option>
                                        <option value="+502">🇬🇹 Guatemala (+502)</option>
                                        <option value="+503">🇸🇻 El Salvador (+503)</option>
                                        <option value="+504">🇭🇳 Honduras (+504)</option>
                                        <option value="+505">🇳🇮 Nicaragua (+505)</option>
                                        <option value="+53">🇨🇺 Cuba (+53)</option>
                                        <option value="+1">🇩🇴 República Dominicana (+1)</option>

                                        {/* Europe */}
                                        <option value="+34">🇪🇸 España (+34)</option>
                                        <option value="+44">🇬🇧 Reino Unido (+44)</option>
                                        <option value="+33">🇫🇷 Francia (+33)</option>
                                        <option value="+49">🇩🇪 Alemania (+49)</option>
                                        <option value="+39">🇮🇹 Italia (+39)</option>
                                        <option value="+351">🇵🇹 Portugal (+351)</option>
                                        <option value="+31">🇳🇱 Países Bajos (+31)</option>
                                        <option value="+41">🇨🇭 Suiza (+41)</option>

                                        {/* Other international destinations */}
                                        <option value="+61">🇦🇺 Australia (+61)</option>
                                        <option value="+64">🇳🇿 Nueva Zelanda (+64)</option>
                                        <option value="+81">🇯🇵 Japón (+81)</option>
                                        <option value="+82">🇰🇷 Corea del Sur (+82)</option>
                                        <option value="+86">🇨🇳 China (+86)</option>
                                        <option value="+971">🇦🇪 Emiratos Árabes Unidos (+971)</option>
                                    </select>

                                    <input
                                        type="tel"
                                        value={customerPhone}
                                        id="booking-customer-phone"
                                        autoComplete="tel-national"
                                        onChange={(event) => setCustomerPhone(event.target.value)}
                                        placeholder={
                                        language === "es"
                                            ? "Teléfono / WhatsApp"
                                            : "Phone / WhatsApp"
                                        }
                                        className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-3.5 text-base text-black outline-none placeholder:text-neutral-400 focus:border-[#B76E79] focus:ring-2 focus:ring-[#B76E79]/20"
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
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-base text-black outline-none transition-colors placeholder:text-neutral-400 focus:border-[#B76E79] focus:ring-2 focus:ring-[#B76E79]/20"
                                />

                                <textarea 
                                    value={customerNotes}
                                    onChange={(event) => setCustomerNotes(event.target.value)}
                                    placeholder={
                                        language === "es"
                                            ? "Notas para el salon (opcional)"
                                            : "Notes for the salon (optional)"
                                    }
                                    className="min-h-28 w-full resize-y rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-base text-black outline-none transition-colors placeholder:text-neutral-400 focus:border-[#B76E79] focus:ring-2 focus:ring-[#B76E79]/20"
                                />
                            </div>
                        </div>
                    )}

                    {/* Continue Button */}
                    {selectedTime && !isReviewing && (
                        <button
                            type="button"
                            onClick={() => {
                                if (!customerPhone.trim()) {
                                    setShowSkipPhoneConfirmation(true);
                                    return;
                                }

                                setNoPhone(false);
                                setShowSkipPhoneConfirmation(false);
                                pendingStageScrollRef.current = true;
                                setIsReviewing(true);
                            }}
                            disabled={!customerName.trim()}
                            className={`mt-6 flex w-full items-center justify-center gap-3 rounded-xl px-6 py-4 font-semibold transition-colors ${
                                customerName.trim()
                                    ? "bg-black text-white hover:bg-neutral-800"
                                    : "cursor-not-allowed bg-neutral-200 text-neutral-400"
                            }`}
                        >
                            {language === "es" ? "Revisar cita" : "Review Appointment"}
                            <span aria-hidden="true">→</span>
                        </button>
                    )}

                    {/* Confirmation before continuing without a phone number */}
                    {selectedTime && !isReviewing && showSkipPhoneConfirmation && (
                        <div
                            role="alertdialog"
                            aria-modal="false"
                            aria-labelledby="skip-phone-title"
                            aria-describedby="skip-phone-description"
                            className="mt-4 rounded-2xl border border-[#B76E79]/40 bg-white p-5 shadow-sm"
                        >
                            <h3
                                id="skip-phone-title"
                                className="text-lg font-semibold text-black"
                            >
                                {language === "es"
                                    ? "¿Continuar sin número de teléfono?"
                                    : "Continue without a phone number?"}
                            </h3>

                            <p
                                id="skip-phone-description"
                                className="mt-3 text-sm leading-6 text-neutral-600"
                            >
                                {language === "es"
                                    ? "Sin tu número, no podremos contactarte por WhatsApp para informarte sobre cambios o novedades de tu cita."
                                    : "Without your phone number, we won't be able to contact you on WhatsApp about changes or updates to your appointment."}
                            </p>

                            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowSkipPhoneConfirmation(false);
                                        setNoPhone(false);
                                    }}
                                    className="flex-1 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                                >
                                    {language === "es"
                                        ? "Agregar número"
                                        : "Add phone number"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setNoPhone(true);
                                        setCustomerPhone("");
                                        setShowSkipPhoneConfirmation(false);
                                        pendingStageScrollRef.current = true;
                                        setIsReviewing(true);
                                    }}
                                    className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-neutral-50"
                                >
                                    {language === "es"
                                        ? "Continuar sin teléfono"
                                        : "Continue without phone"}
                                </button>
                            </div>
                        </div>
                    )}
                        </>
                    )}

                    {/* Review Appointment */}
                    {isReviewing && (
                        <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                            {/* Review header */}
                            <div className="border-b border-neutral-100 px-5 py-5 sm:px-6">
                                <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#B76E79]">
                                    TEFF BEAUTY SALON
                                </p>

                                <h2 className="mt-1 text-xl font-semibold tracking-tight text-black">
                                    {language === "es"
                                        ? "Revisa tu cita"
                                        : "Review Your Appointment"}
                                </h2>

                                <p className="mt-1 text-sm text-neutral-500">
                                    {language === "es"
                                        ? "Verifica los detalles antes de confirmar tu reserva."
                                        : "Check your appointment details before confirming."}
                                </p>
                            </div>

                            <div className="space-y-5 px-5 py-5 sm:px-6">

                                <div className="rounded-xl bg-neutral-50 p-4">
                                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                                        {language === "es" ? "Cliente" : "Customer"}
                                    </p>

                                    <p className="mt-2 text-base font-semibold text-black">
                                        {customerName}
                                    </p>

                                    <p className="mt-1 text-sm text-neutral-600">
                                        {displayCustomerPhone}
                                    </p>
                                </div>

                                <div>
                                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                        {language === "es" ? "Servicios" : "Services"}
                                    </h3>

                                    <div className="space-y-3">
                                        {selectedServiceDetails.map((service) => (
                                            <div
                                                key={service.id}
                                                className="flex items-start justify-between gap-3"
                                            >
                                                <div className="flex min-w-0 items-start gap-2">
                                                    <span
                                                        aria-hidden="true"
                                                        className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F9F0F1] text-xs font-bold text-[#B76E79]"
                                                    >
                                                        ✓
                                                    </span>

                                                    <span className="text-sm font-medium leading-6 text-neutral-800">
                                                        {language === "es"
                                                            ? service.nameEs
                                                            : service.nameEn}
                                                    </span>
                                                </div>

                                                <span className="shrink-0 text-sm font-semibold leading-6 text-black">
                                                    ${service.price.toLocaleString("es-CO")}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {selectedAddonDetails.length > 0 && (
                                    <div>
                                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                            {language === "es" ? "Complementos" : "Add-ons"}
                                        </h3>

                                        <div className="space-y-3">
                                            {selectedAddonDetails.map((addon) => {
                                                const assignedService = selectedServiceDetails.find(
                                                    (service) => service.id === addon.serviceId
                                                );

                                                return (
                                                    <div
                                                        key={`${addon.id}-${addon.serviceId}`}
                                                        className="flex items-start justify-between gap-3"
                                                    >
                                                        <div className="flex min-w-0 items-start gap-2">
                                                            <span
                                                                aria-hidden="true"
                                                                className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F9F0F1] text-xs font-bold text-[#B76E79]"
                                                            >
                                                                ✓
                                                            </span>

                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium leading-6 text-neutral-800">
                                                                    {language === "es"
                                                                        ? addon.nameEs
                                                                        : addon.nameEn}
                                                                </p>

                                                                {assignedService && (
                                                                    <p className="text-xs text-neutral-500">
                                                                        {language === "es" ? "Para: " : "For: "}
                                                                        {language === "es"
                                                                            ? assignedService.nameEs
                                                                            : assignedService.nameEn}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <span className="shrink-0 text-sm font-semibold leading-6 text-black">
                                                            +${addon.price.toLocaleString("es-CO")}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Technician assignments for each selected service */}
                                <div>
                                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                        {language === "es"
                                            ? "Técnicas para tus servicios"
                                            : "Technicians for your services"}
                                    </h3>

                                    <div className="space-y-3">
                                        {serviceAssignments.map(({ service }) => {
                                            const employeeChoice =
                                                selectedEmployeesByService[service.id];

                                            const technician =
                                                typeof employeeChoice === "number"
                                                    ? employees.find(
                                                        (employee) => employee.id === employeeChoice
                                                    )
                                                    : null;

                                            const technicianName =
                                                employeeChoice === "any"
                                                    ? language === "es"
                                                        ? "Cualquier técnica"
                                                        : "Any Technician"
                                                    : technician?.name ??
                                                        (language === "es"
                                                            ? "Pendiente de asignación"
                                                            : "Pending assignment");

                                            return (
                                                <div
                                                    key={service.id}
                                                    className="flex items-start justify-between gap-3"
                                                >
                                                    <span className="min-w-0 text-sm text-neutral-600">
                                                        {language === "es"
                                                            ? service.nameEs
                                                            : service.nameEn}
                                                    </span>

                                                    <span className="text-right text-sm font-semibold text-black">
                                                        {technicianName}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-sm text-neutral-500">
                                        {language === "es" ? "Fecha y Hora" : "Date and Time"}
                                    </p>

                                    <p className="font-semibold text-black">
                                        {formatDate(selectedDate)} · {formatTime(selectedTime)}
                                    </p>
                                </div>

                                {/* Estimated total and duration */}
                                <div className="border-t border-neutral-200 pt-5">
                                    <p className="text-sm font-medium text-neutral-500">
                                        {language === "es"
                                            ? "Total estimado"
                                            : "Estimated total"}
                                    </p>

                                    <p className="mt-1 text-3xl font-bold tracking-tight text-black">
                                        ${totalPrice.toLocaleString("es-CO")}
                                        <span className="ml-2 text-sm font-medium text-neutral-500">
                                            COP
                                        </span>
                                    </p>

                                    <div className="mt-4 flex items-center gap-2 text-sm text-neutral-600">
                                        <svg
                                            aria-hidden="true"
                                            className="h-4 w-4 shrink-0 text-[#B76E79]"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.8"
                                            strokeLinecap="round"
                                        >
                                            <circle cx="12" cy="12" r="9" />
                                            <path d="M12 7v5l3 2" />
                                        </svg>

                                        <span>
                                            {language === "es"
                                                ? "Duración estimada:"
                                                : "Estimated duration:"}{" "}
                                            <span className="font-semibold text-neutral-800">
                                                {totalDuration} min
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Add Edit and Confirm Buttons */}
                            <div className="mx-5 mb-5 flex flex-col gap-3 sm:mx-6 sm:flex-row">
                                <button
                                    onClick={() => {
                                        pendingStageScrollRef.current = true;
                                        setIsReviewing(false);
                                    }}
                                    className="min-h-12 flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 font-semibold text-neutral-800 transition-colors hover:border-[#B76E79] hover:bg-[#F9F0F1]"
                                >
                                    {language === "es" ? "Editar" : "Edit"}
                                </button>

                                <button
                                    onClick={handleConfirmBooking}
                                    disabled={isSubmitting}
                                    className="min-h-12 flex-1 rounded-xl bg-black px-4 py-3 font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSubmitting
                                        ? language === "es"
                                            ? "Confirmando..."
                                            : "Confirming..."
                                        : language === "es"
                                            ? "Confirmar cita"
                                            : "Confirm Appointment"}
                                </button>

                            </div>

                            {/* Display booking errors below the action buttons */}
                            {bookingError && (
                                <div
                                    role="alert"
                                    className="mx-5 mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6"
                                >
                                    {bookingError}
                                </div>
                            )}
                        </div>
                    )}

                   {/* Service Selection Summary */}
                    {selectedServices.length > 0 && !servicesConfirmed && (
                        <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                            {/* Summary heading */}
                            <div className="border-b border-neutral-100 px-5 py-5 sm:px-6">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#B76E79]">
                                            TEFF BEAUTY SALON
                                        </p>

                                        <h2 className="mt-1 text-xl font-semibold tracking-tight text-black">
                                            {language === "es" ? "Tu Selección" : "Your Selection"}
                                        </h2>
                                    </div>

                                    <span className="shrink-0 rounded-full bg-[#F9F0F1] px-3 py-1.5 text-xs font-semibold text-[#9F5663]">
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
                            </div>

                            {/* Selected services */}
                            <div className="px-5 py-5 sm:px-6">
                                <div className="space-y-4">
                                    {selectedServiceDetails.map((service) => (
                                        <div
                                            key={service.id}
                                            className="flex items-start justify-between gap-4"
                                        >
                                            <div className="flex min-w-0 items-start gap-3">
                                                <span
                                                    aria-hidden="true"
                                                    className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F9F0F1] text-xs font-bold text-[#B76E79]"
                                                >
                                                    ✓
                                                </span>

                                                <span className="text-sm font-medium leading-6 text-neutral-800">
                                                    {language === "es"
                                                        ? service.nameEs
                                                        : service.nameEn}
                                                </span>
                                            </div>

                                            <span className="shrink-0 text-sm font-semibold leading-6 text-black">
                                                ${service.price.toLocaleString("es-CO")}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Estimated total */}
                                <div className="mt-6 border-t border-neutral-200 pt-5">
                                    <p className="text-sm font-medium text-neutral-500">
                                        {language === "es"
                                            ? "Total estimado"
                                            : "Estimated total"}
                                    </p>

                                    <p className="mt-1 text-3xl font-bold tracking-tight text-black">
                                        ${totalPrice.toLocaleString("es-CO")}
                                        <span className="ml-2 text-sm font-medium text-neutral-500">
                                            COP
                                        </span>
                                    </p>

                                    {/* Estimated duration */}
                                    <div className="mt-4 flex items-center gap-2 text-sm text-neutral-600">
                                        <svg
                                            aria-hidden="true"
                                            className="h-4 w-4 shrink-0 text-[#B76E79]"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.8"
                                            strokeLinecap="round"
                                        >
                                            <circle cx="12" cy="12" r="9" />
                                            <path d="M12 7v5l3 2" />
                                        </svg>

                                        <span>
                                            {language === "es"
                                                ? "Duración estimada:"
                                                : "Estimated duration:"}{" "}
                                            <span className="font-semibold text-neutral-800">
                                                {totalDuration} min
                                            </span>
                                        </span>
                                    </div>
                                </div>

                                {/* Continue to appointment configuration */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        pendingStageScrollRef.current = true;
                                        setServicesConfirmed(true);
                                    }}
                                    className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-black px-6 py-4 font-semibold text-white transition-colors hover:bg-neutral-800"
                                >
                                    {language === "es" ? "Continuar" : "Continue"}
                                    <span aria-hidden="true">→</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </main>
    )
}