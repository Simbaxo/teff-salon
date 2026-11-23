export const STAFF_SERVICE_CATEGORIES = [
  {
    id: "NAILS",
    label: "Uñas",
    emoji: "💅",
    cardColor: "border-pink-300 bg-pink-50",
    badgeColor: "bg-pink-100 text-pink-800",
  },
  {
    id: "LASHES",
    label: "Pestañas",
    emoji: "👁️",
    cardColor: "border-purple-300 bg-purple-50",
    badgeColor: "bg-purple-100 text-purple-800",
  },
  {
    id: "BROWS",
    label: "Cejas y Depilación",
    emoji: "✨",
    cardColor: "border-amber-300 bg-amber-50",
    badgeColor: "bg-amber-100 text-amber-900",
  },
  {
    id: "ESTHETICS",
    label: "Estética",
    emoji: "🌿",
    cardColor: "border-green-300 bg-green-50",
    badgeColor: "bg-green-100 text-green-800",
  },
] as const;

export function getStaffServiceCategory(category: string) {
  return STAFF_SERVICE_CATEGORIES.find((item) => item.id === category);
}

export function sortStaffServices<
  T extends {
    category: string;
    nameEs: string;
  },
>(services: T[]): T[] {
  return [...services].sort((a, b) => {
    const indexA = STAFF_SERVICE_CATEGORIES.findIndex(
      (category) => category.id === a.category,
    );

    const indexB = STAFF_SERVICE_CATEGORIES.findIndex(
      (category) => category.id === b.category,
    );

    const orderA = indexA === -1 ? 999 : indexA;
    const orderB = indexB === -1 ? 999 : indexB;

    return orderA - orderB || a.nameEs.localeCompare(b.nameEs, "es");
  });
}
