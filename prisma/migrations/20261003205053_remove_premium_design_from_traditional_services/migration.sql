-- Traditional manicure and pedicure can include product removal,
-- but should not offer premium elaborate nail designs.
DELETE FROM "ServiceAddon"
WHERE "serviceId" IN (4, 5)
  AND "addonId" = 9;