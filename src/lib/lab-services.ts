export const LAB_SERVICE_CATEGORIES = [
  "ALIMENTAIRE",
  "EAU",
  "AMBIANCE",
  "PRESTATION",
] as const;

export type LabServiceCategory = (typeof LAB_SERVICE_CATEGORIES)[number];

export const LAB_SERVICE_CATEGORY_LABELS: Record<LabServiceCategory, string> = {
  ALIMENTAIRE: "Analyses alimentaires",
  EAU: "Analyses eau",
  AMBIANCE: "Analyses ambiance",
  PRESTATION: "Prestations",
};

export type LabServiceOption = {
  id: string;
  name: string;
  category: LabServiceCategory;
  unitPrice: number;
};
