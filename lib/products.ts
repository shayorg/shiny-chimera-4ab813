// Paid product catalog. Prices are in USDC base units (6 decimals).
// Files are never part of the public site: each product's file lives in the
// private "private-products" blob store under its `id` and is uploaded by an admin.

export type Product = {
  id: string;
  name: { en: string; fa: string };
  priceUnits: number;
};

export const USDC_DECIMALS = 6;
export const UNIT = 10 ** USDC_DECIMALS;

export const PRODUCTS: Product[] = [
  { id: "prompts-20", name: { en: "20 AI Freelance Prompts", fa: "۲۰ پرامپت فریلنسری AI" }, priceUnits: 5 * UNIT },
  { id: "mini-course", name: { en: "AI Freelancing Mini-Course", fa: "دوره کوتاه فریلنسری با AI" }, priceUnits: 15 * UNIT },
  { id: "starter-bundle", name: { en: "AI Starter Bundle", fa: "بسته کامل شروع" }, priceUnits: 19 * UNIT },
];

export function getProduct(id: unknown): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function formatUnits(units: number | bigint): string {
  const v = BigInt(units);
  const whole = v / BigInt(UNIT);
  const frac = (v % BigInt(UNIT)).toString().padStart(USDC_DECIMALS, "0");
  return `${whole}.${frac}`;
}
