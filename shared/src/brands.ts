/** The brands sold on the platform. One brand per call; a product or call without a brand is Touché, the way a
 *  product without a domain is a face product, so rows saved before BEL.NCO are never rewritten. */

export type Brand = 'touche' | 'belnco';

export const BRANDS: readonly Brand[] = ['touche', 'belnco'];

export const BRAND_LABELS: Record<Brand, string> = { touche: 'Touché', belnco: 'BEL.NCO' };

/** The EcoManager store letters that start each brand's order references. */
export const BRAND_PREFIXES: Record<Brand, string> = { touche: 'TOU', belnco: 'BEL' };

export const isBrand = (value: unknown): value is Brand => BRANDS.includes(value as Brand);

/** BEL.NCO only when it says so; anything else (missing, empty, unknown) is Touché. */
export const brandOf = (x?: { brand?: string | null } | null): Brand => (x?.brand === 'belnco' ? 'belnco' : 'touche');

/** The brands that have at least one enabled product, in `BRANDS` order. */
export function availableBrands(products: { brand?: string; enabled: boolean }[]): Brand[] {
  const present = new Set(products.filter((p) => p.enabled).map(brandOf));
  return BRANDS.filter((b) => present.has(b));
}
