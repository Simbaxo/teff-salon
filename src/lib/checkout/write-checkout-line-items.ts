
import type { Prisma } from "@/generated/prisma/client";

import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "./types";

import { createAttributedLineItems } from "./create-attributed-line-items";

type CatalogItem = {
    id: number;
    nameEs: string;
};

type LegacyLineItem = {
    itemType: string;
    itemId: number;
    itemName: string;
    unitPrice: number;
};

type CheckoutLineItemInput =
    | {
          mode: "legacy";
          saleId: number;
          items: LegacyLineItem[];
      }
    | {
          mode: "attributed";
          saleId: number;
          services: CheckoutServiceAssignment[];
          addons: CheckoutAddonAssignment[];
          catalogServices: CatalogItem[];
          catalogAddons: CatalogItem[];
      };

// Save line items using the selected checkout mode.
// The caller owns the transaction and must validate all inputs first.
export async function writeCheckoutLineItems(
    tx: Prisma.TransactionClient,
    input: CheckoutLineItemInput
): Promise<void> {
    if (input.mode === "attributed") {
        // Preserve service-level technician and add-on ownership.
        await createAttributedLineItems(tx, {
            saleId: input.saleId,
            services: input.services,
            addons: input.addons,
            catalogServices: input.catalogServices,
            catalogAddons: input.catalogAddons,
        });

        return;
    }

    // Preserve the existing checkout line-item behavior.
    await tx.saleLineItem.createMany({
        data: input.items.map((item) => ({
            saleId: input.saleId,
            itemType: item.itemType,
            itemId: item.itemId,
            itemName: item.itemName,
            unitPrice: item.unitPrice,
        })),
    });
}