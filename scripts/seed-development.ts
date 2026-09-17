import "dotenv/config";
import { prisma } from "../src/lib/prisma";

type ServiceSeed = {
    nameEs: string;
    nameEn: string;
    category: string;
    price: number;
    estimatedDuration: number;
    requiresApproval: boolean;
}

const services: ServiceSeed[] = [
    {
        nameEs: "Manicura Tradicional",
        nameEn: "Traditional Manicure",
        category: "NAILS",
        price: 45000,
        estimatedDuration: 30,
        requiresApproval: false,
    },
    {
        nameEs: "Pedicura Tradicional",
        nameEn: "Traditional Pedicure",
        category: "NAILS",
        price: 45000,
        estimatedDuration: 30,
        requiresApproval: false,
    },
    {
        nameEs: "Solo Limpieza Manos",
        nameEn: "Hands Cleaning Only",
        category: "NAILS",
        price: 40000,
        estimatedDuration: 20,
        requiresApproval: false,
    },
    {
        nameEs: "Solo limpieza Pies",
        nameEn: "Feet Cleaning Only",
        category: "NAILS",
        price: 40000,
        estimatedDuration: 20,
        requiresApproval: false,
    },
    {
        nameEs: "Manicura Gel",
        nameEn: "Gel Manicure",
        category: "NAILS",
        price: 60000,
        estimatedDuration: 80,
        requiresApproval: false,
    },
    {
        nameEs: "Pedicura Gel",
        nameEn: "Gel Pedicure",
        category: "NAILS",
        price: 60000,
        estimatedDuration: 80,
        requiresApproval: false,
    },
    {
        nameEs: "Manicura Gel Hombre",
        nameEn: "Men's Gel Manicure",
        category: "NAILS",
        price: 50000,
        estimatedDuration: 40,
        requiresApproval: false,
    },
    {
        nameEs: "Pedicura Gel Hombre",
        nameEn: "Men's Gel Pedicure",
        category: "NAILS",
        price: 50000,
        estimatedDuration: 40,
        requiresApproval: false,
    },
    {
        nameEs: "Acrílico Esculpido",
        nameEn: "Sculpted Acrylic",
        category: "NAILS",
        price: 130000,
        estimatedDuration: 180,
        requiresApproval: false,
    },
    {
        nameEs: "Base Rubber",
        nameEn: "Rubber Base",
        category: "NAILS",
        price: 100000,
        estimatedDuration: 90,
        requiresApproval: false,
    },
    {
        nameEs: "PolyGel Esculpido",
        nameEn: "Sculpted PolyGel",
        category: "NAILS",
        price: 130000,
        estimatedDuration: 180,
        requiresApproval: false,
    },
    {
        nameEs: "Jelly Tips / Press-On",
        nameEn: "Jelly Tips / Press-On",
        category: "NAILS",
        price: 120000,
        estimatedDuration: 120,
        requiresApproval: false,
    },
    {
        nameEs: "Forrado Acrílico o PolyGel",
        nameEn: "Acrylic or PolyGel Overlay",
        category: "NAILS",
        price: 110000,
        estimatedDuration: 90,
        requiresApproval: false,
    },
    {
        nameEs: "Dip Powder",
        nameEn: "Dip Powder",
        category: "NAILS",
        price: 110000,
        estimatedDuration: 90,
        requiresApproval: false,
    },
    {
        nameEs: "Retiro de Semipermanente",
        nameEn: "Gel Polish Removal",
        category: "NAILS",
        price: 10000,
        estimatedDuration: 10,
        requiresApproval: false,
    },
    {
        nameEs: "Retiro de Acrílico / Extensión",
        nameEn: "Acrylic / Extension Removal",
        category: "NAILS",
        price: 20000,
        estimatedDuration: 30,
        requiresApproval: false,
    },
    {
        nameEs: "Mantenimiento / Retoque",
        nameEn: "Maintenance / Fill",
        category: "NAILS",
        price: 100000,
        estimatedDuration: 120,
        requiresApproval: false,
    },
    {
        nameEs: "Pedi Spa",
        nameEn: "Pedi Spa",
        category: "NAILS",
        price: 100000,
        estimatedDuration: 40,
        requiresApproval: false,
    },

    // Lashes — temporary 60-minute durations.
    // These require approval because the lash technician works off-site.
    {
        nameEs: "Clásico / Natural",
        nameEn: "Classic / Natural",
        category: "LASHES",
        price: 150000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Retoque Clásico / Natural",
        nameEn: "Classic / Natural Fill",
        category: "LASHES",
        price: 75000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Húmedo / Pestañina",
        nameEn: "Wet / Mascara Effect",
        category: "LASHES",
        price: 150000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Retoque Húmedo / Pestañina",
        nameEn: "Wet / Mascara Effect Fill",
        category: "LASHES",
        price: 75000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "3D Natural",
        nameEn: "3D Natural",
        category: "LASHES",
        price: 160000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Retoque 3D Natural",
        nameEn: "3D Natural Fill",
        category: "LASHES",
        price: 85000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Semi Volumen 4D o 5D",
        nameEn: "Semi Volume 4D or 5D",
        category: "LASHES",
        price: 200000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Retoque Semi Volumen 4D o 5D",
        nameEn: "Semi Volume 4D or 5D Fill",
        category: "LASHES",
        price: 105000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Mega Volumen 7D",
        nameEn: "Mega Volume 7D",
        category: "LASHES",
        price: 220000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Retoque Mega Volumen 7D",
        nameEn: "Mega Volume 7D Fill",
        category: "LASHES",
        price: 115000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Tecnorimel o Lami U",
        nameEn: "Tecnorimel or Lami U",
        category: "LASHES",
        price: 160000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Hawaiano",
        nameEn: "Hawaiian",
        category: "LASHES",
        price: 160000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Retoque Fibras Tecnológicas",
        nameEn: "Technological Fibers Fill",
        category: "LASHES",
        price: 85000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Volumen Egipcio / Griego",
        nameEn: "Egyptian / Greek Volume",
        category: "LASHES",
        price: 180000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Retoque Volumen Egipcio / Griego",
        nameEn: "Egyptian / Greek Volume Fill",
        category: "LASHES",
        price: 95000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Wispy / Kim K",
        nameEn: "Wispy / Kim K",
        category: "LASHES",
        price: 200000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Set Anime",
        nameEn: "Anime Set",
        category: "LASHES",
        price: 180000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Híbrido",
        nameEn: "Hybrid",
        category: "LASHES",
        price: 180000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Lifting de pestañas",
        nameEn: "Lash Lift",
        category: "LASHES",
        price: 130000,
        estimatedDuration: 60,
        requiresApproval: true,
    },

    // Brows & waxing — initial estimated durations.
    {
        nameEs: "Laminado de Cejas Completo",
        nameEn: "Complete Brow Lamination",
        category: "BROWS",
        price: 130000,
        estimatedDuration: 60,
        requiresApproval: false,
    },
    {
        nameEs: "Laminado de Cejas",
        nameEn: "Brow Lamination",
        category: "BROWS",
        price: 100000,
        estimatedDuration: 45,
        requiresApproval: false,
    },
    {
        nameEs: "Depilación de Cejas",
        nameEn: "Brow Waxing",
        category: "BROWS",
        price: 40000,
        estimatedDuration: 20,
        requiresApproval: false,
    },
    {
        nameEs: "Depilación de Cejas + Henna",
        nameEn: "Brow Waxing + Henna",
        category: "BROWS",
        price: 55000,
        estimatedDuration: 30,
        requiresApproval: false,
    },
    {
        nameEs: "Depilación de Bigote",
        nameEn: "Mustache Waxing",
        category: "BROWS",
        price: 20000,
        estimatedDuration: 15,
        requiresApproval: false,
    },
    {
        nameEs: "Depilación de Bozo",
        nameEn: "Upper Lip Waxing",
        category: "BROWS",
        price: 20000,
        estimatedDuration: 15,
        requiresApproval: false,
    },
    {
        nameEs: "Depilación de Nariz",
        nameEn: "Nose Waxing",
        category: "BROWS",
        price: 20000,
        estimatedDuration: 15,
        requiresApproval: false,
    },
    {
        nameEs: "Depilación de Patillas",
        nameEn: "Sideburn Waxing",
        category: "BROWS",
        price: 20000,
        estimatedDuration: 15,
        requiresApproval: false,
    },
    {
        nameEs: "Depilación de Axilas",
        nameEn: "Underarm Waxing",
        category: "BROWS",
        price: 40000,
        estimatedDuration: 20,
        requiresApproval: false,
    },

    // Estética — initial estimated durations.
    // Requires approval because the estética specialist works off-site.
    {
        nameEs: "Limpieza facial profunda",
        nameEn: "Deep Facial Cleansing",
        category: "ESTHETICS",
        price: 180000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Dermapen",
        nameEn: "Dermapen",
        category: "ESTHETICS",
        price: 180000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Sueroterapia",
        nameEn: "IV Therapy",
        category: "ESTHETICS",
        price: 180000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
    {
        nameEs: "Hydralips",
        nameEn: "Hydralips",
        category: "ESTHETICS",
        price: 150000,
        estimatedDuration: 60,
        requiresApproval: true,
    },
];

type AddonSeed = {
    nameEs: string;
    nameEn: string;
    price: number;
    estimatedDuration: number;
};

const addons: AddonSeed[] = [
    {
        nameEs: "Francés",
        nameEn: "French",
        price: 15000,
        estimatedDuration: 15,
    },
    {
        nameEs: "Diseño Sencillo",
        nameEn: "Simple Nail Art",
        price: 10000,
        estimatedDuration: 15,
    },
    {
        nameEs: "Diseño Elaborado",
        nameEn: "Detailed Nail Art",
        price: 20000,
        estimatedDuration: 30,
    },
    {
        nameEs: "Reparación / Alargamiento de Uña",
        nameEn: "Nail Repair / Extension",
        price: 10000,
        estimatedDuration: 15,
    },
    {
        nameEs: "Largo Adicional",
        nameEn: "Additional Length",
        price: 20000,
        estimatedDuration: 20,
    },
];

// Defines which add-ons are available for each service.
// We use service/add-on names instead of database IDs because IDs can
// differ between development and production databases.
const serviceAddonMap: Record<string, string[]> = {
    "Manicura Gel": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
        "Reparación / Alargamiento de Uña",
    ],

    "Pedicura Gel": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
    ],

    "Manicura Gel Hombre": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
        "Reparación / Alargamiento de Uña",
    ],

    "Pedicura Gel Hombre": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
    ],

    "Acrílico Esculpido": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
        "Reparación / Alargamiento de Uña",
        "Largo Adicional",
    ],

    "Base Rubber": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
        "Reparación / Alargamiento de Uña",
    ],

    "PolyGel Esculpido": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
        "Reparación / Alargamiento de Uña",
        "Largo Adicional",
    ],

    "Jelly Tips / Press-On": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
        "Reparación / Alargamiento de Uña",
    ],

    "Forrado Acrílico o PolyGel": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
        "Reparación / Alargamiento de Uña",
    ],

    "Dip Powder": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
        "Reparación / Alargamiento de Uña",
    ],

    "Mantenimiento / Retoque": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
        "Reparación / Alargamiento de Uña",
    ],

    "Pedi Spa": [
        "Francés",
        "Diseño Sencillo",
        "Diseño Elaborado",
    ],
};

// Employee qualification groups.
// These determine which technicians can be selected or automatically
// assigned for each service.

const allNailServices = services
    .filter((service) => service.category === "NAILS")
    .map((service) => service.nameEs);

const nailsWithoutAcrylic = allNailServices.filter(
    (serviceName) => serviceName !== "Acrílico Esculpido"
);

const allLashServices = services
    .filter((service) => service.category === "LASHES")
    .map((service) => service.nameEs);

const allBrowServices = services
    .filter((service) => service.category === "BROWS")
    .map((service) => service.nameEs);

const allEstheticsServices = services
    .filter((service) => service.category === "ESTHETICS")
    .map((service) => service.nameEs);

    const employeeServiceMap: Record<string, string[]> = {
    "Maria Jose": allNailServices,

    Rocelys: [
        ...nailsWithoutAcrylic,
        ...allBrowServices,
    ],

    Yenifer: [
        ...nailsWithoutAcrylic,
        ...allBrowServices,
    ],

    Dani: [
        ...allLashServices,
        ...allBrowServices,
    ],

    Natalia: allEstheticsServices,
};

// Legacy development service names that should be reused instead of
// creating duplicate service records.
const legacyServiceNames: Record<string, string> = {
    "Manicura Gel": "Manicure Semipermanente",
    "Pedicura Gel": "Pedicure Semipermanente",
};

const currentEmployees = [
    "Rocelys",
    "Yenifer",
    "Maria Jose",
    "Dani",
    "Natalia",
];

async function main() {
    console.log("Starting TEFF development seed...");

    // Create new services or update matching existing services
    for (const service of services) {
        const legacyName = legacyServiceNames[service.nameEs];

        const existingService = await prisma.service.findFirst({
            where: {
                nameEs: {
                    in: legacyName
                        ? [service.nameEs, legacyName]
                        : [service.nameEs],
                },
            },
        });

        if (existingService) {
            await prisma.service.update({
                where: {
                    id: existingService.id,
                },
                data: service,
            });

            console.log(`Updated Service: ${service.nameEs}`);
        } else {
            await prisma.service.create({
                data: service,
            });

            console.log(`Created Service: ${service.nameEs}`);
        }
    }

    console.log("Service catalog synchronized.");

    // Create new add-ons or update matching existing add-ons
    for (const addon of addons) {
        const existingAddon = await prisma.addon.findFirst({
            where: {
                nameEs: addon.nameEs,
            },
        });

        if (existingAddon) {
            await prisma.addon.update({
                where: {
                    id: existingAddon.id,
                },
                data: addon,
            });

            console.log(`Updated add-on: ${addon.nameEs}`);
        } else {
            await prisma.addon.create({
                data: addon,
            });

            console.log(`Created add-on: ${addon.nameEs}`);
        }
    }

    console.log("Add-on catalog synchronized.");

    // Connect each service to the add-ons that are valid for it.
    for (const [serviceName, addonNames] of Object.entries(serviceAddonMap)) {
        const service = await prisma.service.findFirst({
            where: {
                nameEs: serviceName,
            },
        });

        if (!service) {
            throw new Error(`Service not found: ${serviceName}`);
        }

        for (const addonName of addonNames) {
            const addon = await prisma.addon.findFirst({
                where: {
                    nameEs: addonName,
                },
            });

            if (!addon) {
                throw new Error(`Add-on not found: ${addonName}`);
            }

            await prisma.serviceAddon.upsert({
                where: {
                    serviceId_addonId: {
                        serviceId: service.id,
                        addonId: addon.id,
                    },
                },
                update: {},
                create: {
                    serviceId: service.id,
                    addonId: addon.id,
                },
            });
        }
    }

    console.log("Service/add-on relationships synchronized.");

    // Ensure all current TEFF service providers exist and are active.
    // Historical employees are preserved rather than deleted.
    for (const employeeName of currentEmployees) {
        const existingEmployee = await prisma.employee.findFirst({
            where: {
                name: employeeName,
            },
        });

        if (existingEmployee) {
            await prisma.employee.update({
                where: {
                    id: existingEmployee.id,
                },
                data: {
                    active: true,
                },
            });

            console.log(`Updated employee: ${employeeName}`);
        } else {
            await prisma.employee.create({
                data: {
                    name: employeeName,
                    active: true,
                },
            });

            console.log(`Created employee: ${employeeName}`);
        }
    }

    console.log("Current employees synchronized.");

    // Synchronize each employee's service qualifications.
    for (const [employeeName, serviceNames] of Object.entries(employeeServiceMap)) {
        const employee = await prisma.employee.findFirst({
            where: {
                name: employeeName,
            },
        });

        if (!employee) {
            throw new Error(`Employee not found: ${employeeName}`);
        }

        // Remove current qualifications before rebuilding them from the 
        // authoritative employeeServiceMap
        await prisma.employeeService.deleteMany({
            where: {
                employeeId: employee.id,
            },
        });

        for (const serviceName of serviceNames) {
            const service = await prisma.service.findFirst({
                where: {
                    nameEs: serviceName,
                },
            });

            if (!service) {
                throw new Error(`Service not found: ${serviceName}`);
            }

            await prisma.employeeService.upsert({
                where: {
                    employeeId_serviceId: {
                        employeeId: employee.id,
                        serviceId: service.id,
                    },
                },
                update: {},
                create: {
                    employeeId: employee.id,
                    serviceId: service.id,
                },
            });
        }
    }

    console.log("Employee qualifications synchronized.");

    // Preserve obsolete services for historical appointments,
    // but prevent them from appearing in new bookings.
    const obsoleteServices = [
        "Diseño de Cejas con Henna",
    ];

    await prisma.service.updateMany({
        where: {
            nameEs: {
                in: obsoleteServices,
            },
        },
        data: {
            active: false,
        },
    });

    console.log("Obsolete services deactivated.");

    // Preserve legacy add-ons for historical appointments
    // but prevent them appearing in new bookings
    const legacyAddons = [
        "French",
        "Retiro",
        "Nail Art",
    ]

    await prisma.addon.updateMany({
        where: {
            nameEs: {
                in: legacyAddons,
            },
        },
        data: {
            active: false,
        },
    });

    console.log("Legacy add-ons deactivated.");
}

main()
    .then(async () => {
        console.log("TEFF development seed completed successfully.");
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.error("TEFF development seed failed:")
        console.error(error)

        await prisma.$disconnect();
        process.exit(1);
    })