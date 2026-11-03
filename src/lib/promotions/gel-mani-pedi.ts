export const GEL_MANICURE_ID = 1;
export const GEL_PEDICURE_ID = 2;

export const GEL_COMBO_PRICE = 100000;

type GelComboItem = {
  serviceId: number;
  price: number;
};

export function calculateGelComboPrices<T extends GelComboItem>(
  items: T[],
): T[] | null {
  const manicureIndex = items.findIndex(
    (item) => item.serviceId === GEL_MANICURE_ID,
  );

  const pedicureIndex = items.findIndex(
    (item) => item.serviceId === GEL_PEDICURE_ID,
  );

  if (manicureIndex === -1 || pedicureIndex === -1) {
    return null;
  }

  const manicure = items[manicureIndex];
  const pedicure = items[pedicureIndex];

  const originalTotal = manicure.price + pedicure.price;

  if (originalTotal <= 0) {
    return null;
  }

  const manicurePromoPrice = Math.round(
    (GEL_COMBO_PRICE * manicure.price) / originalTotal,
  );

  const pedicurePromoPrice = GEL_COMBO_PRICE - manicurePromoPrice;

  return items.map((item, index) => {
    if (index === manicureIndex) {
      return { ...item, price: manicurePromoPrice };
    }

    if (index === pedicureIndex) {
      return { ...item, price: pedicurePromoPrice };
    }

    return item;
  });
}
