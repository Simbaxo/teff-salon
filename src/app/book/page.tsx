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

export default function BookPage() {
    // State
    const { language } = useLanguage();
    
    // Customers choose a service category before viewing the full service list
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    // Separates service browsing from appointment configuration
    const [servicesConfirmed, setServicesConfirmed] = useState(false);
    // Tracks when the customer has finished choosing optional add-ons
    const [addonsConfirmed, setAddonsConfirmed] = useState(false);
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
    // "any" lets the salon automatically assign an available qualified technician
    const [selectedEmployee, setSelectedEmployee] = 
        useState<number | "any" | null>(null);
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
    const [assignedEmployeeName, setAssignedEmployeeName] = useState("");
    const [bookedAppointments, setBookedAppointments] =
        useState<Appointment[]>([]);

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

    // Get the appointments from API
    useEffect(() => {
        async function loadAppointments() {
            // Only load appointments that should block booking availability
            const response = await fetch("/api/appointments?mode=availability");
            const data = await response.json();

            setBookedAppointments(data);
        }

        loadAppointments();
    }, []);
    
    // Functions
    const availableAddonIds = serviceAddons
        .filter((relation) => 
            selectedServices.includes(relation.serviceId)
        )
        .map((relation) => relation.addonId);

    // Remove invalid add-ons automatically
    useEffect(() => {
        const validAddonIds = serviceAddons
            .filter((relation) => 
                selectedServices.includes(relation.serviceId)
            )
            .map((relation) => relation.addonId)

        setSelectedAddons((current) =>
            current.filter((addonId) => validAddonIds.includes(addonId))
        );
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

    // Add-on Selection State
    function toggleAddon(addonId: number) {
        setSelectedAddons((current) =>
            current.includes(addonId)
                ? current.filter((id) => id !== addonId)
                : [...current, addonId]
        );
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
        const startTime = timeToMinutes(time);
        const endTime = startTime + totalDuration;

        // Hide time slots that have already passed today in Medellin.
        if (
            selectedDate === getTeffToday() &&
            startTime <= getTeffCurrentMinutes()
        ) {
            return false;
        }

        // Hide slots where the service would run past closing
        if (endTime > closingTime) {
            return false;
        }

        // Check whether one technician is free for eht entire requested time
        const isEmployeeAvailable = (employeeId: number) => {
            const hasConflict = bookedAppointments.some((appointment) => {
                if (
                    appointment.employeeId !== selectedEmployee ||
                    appointment.date.slice(0, 10) !== selectedDate
                ) {
                    return false;
                }

                const bookedStart = timeToMinutes(appointment.startTime);
                const bookedEnd = bookedStart + appointment.duration;

                return startTime < bookedEnd && endTime > bookedStart;
        });

        return !hasConflict;
    };

    // "Any Technician" only needs one qualified technician to be free
    // A named technician must personally be available
    if (selectedEmployee === "any") {
        return qualifiedEmployees.some((employee) =>
            isEmployeeAvailable(employee.id)
        );
    }

    if (typeof selectedEmployee === "number") {
        return isEmployeeAvailable(selectedEmployee);
    }

    return false;
    });

    // Find The Selected Technician Details
    const selectedEmployeeDetails = employees.find(
        (employee) => employee.id === selectedEmployee
    );

    // Show the full phone number without duplicating a country code
    const displayCustomerPhone = customerPhone.trim().startsWith("+")
        ? customerPhone
        : `${countryCode} ${customerPhone}`;

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
                    employeeId: selectedEmployee,
                    date: selectedDate,
                    startTime: selectedTime,
                    serviceIds: selectedServices,
                    addonIds: selectedAddons,
                }),
            });

            const data = await response.json();

            if(!response.ok) {
                throw new Error(data.error || "Booking failed");
            }

            // The server returns the technician actually assigned to the appointment
            setAssignedEmployeeName(data.employee?.name || "");

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

    return (
        <main className="min-h-screen bg-neutral-100 px-6 py-12">
            {bookingSuccess && (
                <div className="mx-auto mt-12 max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm">
                    <h2 className="text-2xl font-bold text-black">
                        {language === "es"
                            ? "¡Cita creada exitosamente!"
                            : "Appointment created successfully!"}
                    </h2>

                    <p className="mt-3 text-neutral-600">
                        {language === "es"
                            ? "Tu cita ha sido registrada."
                            : "Your appointment has been registered."}
                    </p>
                    
                    {assignedEmployeeName && (
                    <p className="mt-4 font-semibold text-black">
                        {language === "es"
                            ? `Técnica asignada: ${assignedEmployeeName}`
                            : `Assigned technician: ${assignedEmployeeName}`}
                    </p>
                )}
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
                    {servicesConfirmed && (
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

                    {servicesConfirmed && availableAddons.length > 0 && (
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
                                {availableAddons.map((addon) => (
                                    <button
                                        key={addon.id}
                                        onClick={() => toggleAddon(addon.id)}
                                        className={`w-full rounded-xl border p-4 text-left ${
                                            selectedAddons.includes(addon.id)
                                            ? "border-black bg-neutral-200"
                                            : "border-neutral-200 bg-white"
                                        }`}
                                    >

                                        <h3 className="font-semibold text-black">
                                            {language === "es" ? addon.nameEs : addon.nameEn}
                                        </h3>

                                        <p className="mt-1 text-sm text-neutral-600">
                                            +${addon.price.toLocaleString("es-CO")} COP
                                        </p>

                                        <p className="text-sm text-neutral-500">
                                            +{addon.estimatedDuration} min
                                        </p>
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => setAddonsConfirmed(true)}
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

                    {/* Render Technician Options */}
                    {servicesConfirmed &&
                        (availableAddons.length === 0 || addonsConfirmed) &&
                        qualifiedEmployees.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-xl font-semibold text-black">
                                {language === "es" ? "Elige tu técnica" : "Choose your technician"}
                            </h2>

                            <div className="mt-4 space-y-3">
                                <button
                                    onClick={() => setSelectedEmployee("any")}
                                    className={`w-full rounded-xl border p-4 text-left ${
                                    selectedEmployee === "any"
                                        ? "border-black bg-neutral-200"
                                        : "border-neutral-200 bg-white"
                                    }`}
                                >
                                    <span className="font-semibold text-black">
                                        {language === "es"
                                            ? "Cualquier técnica — Recomendado"
                                            : "Any Technician — Recommended"}
                                    </span>

                                    <p className="mt-1 text-sm text-neutral-500">
                                        {language === "es"
                                            ? "Te asignaremos una técnica disponible para tu cita."
                                            : "We'll assign an available technician for your appointment."}
                                    </p>
                                </button>
                                
                                {qualifiedEmployees.map((employee) => (
                                    <button
                                        key={employee.id}
                                        onClick={() => setSelectedEmployee(employee.id)}
                                        className={`w-full rounded-xl border p-4 text-left ${
                                            selectedEmployee === employee.id
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
                        </div>
                    )}

                    {/* Date Selector */}
                    {servicesConfirmed &&
                        (availableAddons.length === 0 || addonsConfirmed) &&
                        selectedEmployee !== null && (
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
                    {servicesConfirmed &&
                        (availableAddons.length === 0 || addonsConfirmed) &&
                        selectedEmployee &&
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
                                        {time}
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
                                        {selectedDate} · {selectedTime}
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