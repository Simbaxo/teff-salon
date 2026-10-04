-- Reconcile removal add-ons across development and production.
--
-- Production historically stored the removal options differently.
-- Preserve any legacy "Retiro" records so historical relations remain intact.
-- Create the current removal add-ons only when they do not already exist.

INSERT INTO "Addon" (
    "nameEs",
    "nameEn",
    "price",
    "estimatedDuration",
    "active"
)
SELECT
    'Retiro de Semipermanente',
    'Gel Polish Removal',
    10000,
    10,
    true
WHERE NOT EXISTS (
    SELECT 1
    FROM "Addon"
    WHERE "nameEs" = 'Retiro de Semipermanente'
);

INSERT INTO "Addon" (
    "nameEs",
    "nameEn",
    "price",
    "estimatedDuration",
    "active"
)
SELECT
    'Retiro de Acrílico / Extensiones',
    'Acrylic / Extension Removal',
    20000,
    30,
    true
WHERE NOT EXISTS (
    SELECT 1
    FROM "Addon"
    WHERE "nameEs" = 'Retiro de Acrílico / Extensiones'
);

-- Ensure the current removal add-ons are active and use the current
-- TEFF price/duration configuration.
UPDATE "Addon"
SET
    "nameEn" = 'Gel Polish Removal',
    "price" = 10000,
    "estimatedDuration" = 10,
    "active" = true
WHERE "nameEs" = 'Retiro de Semipermanente';

UPDATE "Addon"
SET
    "nameEn" = 'Acrylic / Extension Removal',
    "price" = 20000,
    "estimatedDuration" = 30,
    "active" = true
WHERE "nameEs" = 'Retiro de Acrílico / Extensiones';

-- Connect both removal add-ons to traditional manicure and pedicure.
-- Name-based matching keeps this migration independent of environment IDs.
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

-- Premium elaborate designs should not be offered with traditional polish.
DELETE FROM "ServiceAddon" sa
USING "Service" s, "Addon" a
WHERE sa."serviceId" = s."id"
  AND sa."addonId" = a."id"
  AND s."nameEs" IN (
      'Manicura Tradicional',
      'Pedicura Tradicional'
  )
  AND a."nameEs" = 'Decorado Premium';