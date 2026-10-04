-- Ensure traditional manicure and pedicure can use the appropriate
-- removal add-ons when those catalog records exist.
--
-- The relationships are resolved by catalog names instead of hard-coded IDs
-- so this migration can also run safely in Prisma's shadow database.

INSERT INTO "ServiceAddon" ("serviceId", "addonId")
SELECT
    s."id",
    a."id"
FROM "Service" s
CROSS JOIN "Addon" a
WHERE s."nameEs" IN (
    'Manicura Tradicional',
    'Pedicura Tradicional'
)
AND a."nameEs" IN (
    'Retiro de Semipermanente',
    'Retiro de Acrílico / Extensiones'
)
ON CONFLICT ("serviceId", "addonId") DO NOTHING;