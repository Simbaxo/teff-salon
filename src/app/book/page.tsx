"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

const timeSlots = [
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
];

const bookedAppointments = [
    {
        employeeId: 1,
        date: "2026-08-30",
        startTime: "14:00",
        duration: 60,
    },
];

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

export default function BookPage() {
    // State
    const { language } = useLanguage();
    const [selectedServices, setSelectedServices] = useState<number[]>([]);
    const [selectedAddons, setSelectedAddons] = useState<number[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedTime, setSelectedTime] = useState("");
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [customerEmail, setCustomerEmail] = useState("");
    const [customerNotes, setCustomerNotes] = useState("");
    const [isReviewing, setIsReviewing] = useState(false);
    const [services, setServices] = useState<Service[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [employeeServices, setEmployeeServices] = useState<EmployeeService[]>([]);
    const [addons, setAddons] = useState<Addon[]>([]);
    const [serviceAddons, setServiceAddons] = useState<ServiceAddon[]>([]);

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
            current.filter((addonId) => availableAddonIds.includes(addonId))
        );
    }, [selectedServices]);

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
        if (
            selectedEmployee !== null &&
            !qualifiedEmployees.some(
                (employee) => employee.id == selectedEmployee
            )
        ) {
            setSelectedEmployee(null);
        }
    }, [selectedServices, selectedEmployee, qualifiedEmployees])

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

    const closingTime = 19 * 60;

    const availableTimeSlots = timeSlots.filter((time) => {
        const startTime = timeToMinutes(time);
        const endTime = startTime + totalDuration;

        if (endTime > closingTime) {
            return false;
        }

        const hasConflict = bookedAppointments.some((appointment) => {
            if (
                appointment.employeeId !== selectedEmployee ||
                appointment.date !== selectedDate
            ) {
                return false;
            }

            const bookedStart = timeToMinutes(appointment.startTime);
            const bookedEnd = bookedStart + appointment.duration;

            return startTime < bookedEnd && endTime > bookedStart;
        });

        return !hasConflict;
    })

    // Find The Selected Technician Details
    const selectedEmployeeDetails = employees.find(
        (employee) => employee.id === selectedEmployee
    );

    return (
        <main className="min-h-screen bg-neutral-100 px-6 py-12">
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
                {/* Service Cards */}
                <div className="mt-8 space-y-4">
                    {services.map((service) => (
                        <button
                            key={service.id}
                            onClick={() => toggleService(service.id)}
                            className={`w-full rounded-xl border p-4 text-left ${
                                selectedServices.includes(service.id)
                                    ? "border-black bg-neutral-200"
                                    : "border-neutral-200 bg-white"
                                }`}
                        >
                            <h2 className="font-semibold text-black">
                                {language === "es" ? service.nameEs : service.nameEn}
                            </h2>
                            <p className="mt-1 text-sm text-neutral-600">
                                ${service.price.toLocaleString("es-CO")} COP
                            </p>
                            <p className="text-sm text-neutral-500">
                                {service.estimatedDuration} min
                            </p>
                        </button>
                    ))}
                </div>

                {selectedServices.length > 0 && availableAddons.length > 0 && (
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
                    </div>
                )}

                {/* Render Technician Options */}
                {selectedServices.length > 0 && qualifiedEmployees.length > 0 && (
                    <div className="mt-8">
                        <h2 className="text-xl font-semibold text-black">
                            {language === "es" ? "Elige tu técnica" : "Choose your technician"}
                        </h2>

                        <div className="mt-4 space-y-3">
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
                {selectedEmployee !== null && (
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
                {selectedDate && (
                    <div className="mt-8">
                        <h2 className="text-xl font-semibold text-black">
                            {language === "es" ? "Elige una hora" : "Choose a time"}
                        </h2>

                        <div className="mt-4 grid grid-cols2 gap-3 sm:grid-cols-4">
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

                            <input 
                                type="tel"
                                value={customerPhone}
                                onChange={(event) => setCustomerPhone(event.target.value)}
                                placeholder={
                                    language === "es" 
                                        ? "Teléfono / WhatsApp"
                                        : "Phone / WhatsApp"
                                }
                                className="w-full rounded-xl border border-neutral-300 bg-white p-4 text-black"
                            />

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
                                <p className="text-neutral-600">{customerPhone}</p>
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

                                <p className="text-sm text-neutral-500">
                                    {selectedEmployeeDetails?.name}
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
                                className="flex-1 rounded-xl bg-black px-4 py-3 font-semibold text-white"
                            >
                                {language === "es" ? "Confirmar cita" : "Confirm Appointment"}
                            </button>
                        </div>
                    </div>
                )}

                {/* Summary */}
                {selectedServices.length > 0 && ( // Only show this section if at least one service is selected
                    <div className="mt-8 rounded-xl bg-white p-5">
                        <h2 className="font-semibold text-black">
                            {language === "es" ? "Tu selección" : "Your Selection"}
                        </h2>

                        <div className="mt-4 flex justify-between">
                            <span className="text-neutral-600">
                                {language === "es" ? "Precio estimado" : "Estimated Price"}
                            </span>

                            <span className="font-semibold text-black">
                                ${totalPrice.toLocaleString("es-CO")} COP
                            </span>
                        </div>

                        <div className="mt-2 flex justify-between">
                            <span className="text-neutral-600">
                                {language === "es" ? "Duración estimada" : "Estimated Time"}
                            </span>

                            <span className="font-semibold text-black">
                                {totalDuration} min
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}