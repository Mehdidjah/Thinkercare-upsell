import { BRAND_LABELS, brandOf } from './brands.js';
import type { Product } from './core.js';

/** Lower case, no accents, hyphens and punctuation become spaces, letters and digits split (« spf50 » → « spf 50 »). */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Phrases customers say for one idea, read before the words are split. */
const PHRASES: [RegExp, string][] = [
  [/\b(creme|ecran|protection|lait) (solaire|total)\b/g, 'solaire'],
  [/\bapres (shampooing|shampoing|shampooings|shampoings)\b/g, 'apres'],
  [/\banti (chute|acne|imperfections?|taches?)\b/g, '$1'],
  [/\bvitamine c\b/g, 'vitamine'],
  [/\bgel douche\b/g, 'douche'],
  [/\bfigue de barbarie\b/g, 'figue'],
];

/** Each group lists words that mean the same thing in a product search. */
const SYNONYMS: string[][] = [
  ['solaire', 'spf', 'sunscreen', 'soleil', 'uv', 'ecran', 'protection'],
  ['shampooing', 'shampoing'],
  ['apres', 'conditioner', 'demelant', 'masque'],
  ['creme', 'cream', 'rich', 'hydratant', 'hydratante', 'moisturizer', 'moisturiser'],
  ['bouton', 'acne', 'imperfection', 'imperfections', 'pimple', 'patch'],
  ['chute', 'pousse', 'croissance', 'densite'],
  ['tache', 'marque', 'eclat', 'vitamine'],
  ['nettoyant', 'cleanser', 'cleansing', 'lavant', 'purifiant'],
  ['cheveux', 'capillaire', 'cuir', 'chevelu'],
  ['corps', 'douche', 'body'],
  ['psoriasis', 'pso'],
  ['niacinamide', 'nia', 'zinc'],
  ['salicylique', 'bha'],
  ['hyaluronique', 'hyaluronic'],
  ['huile', 'oil', 'demaquillant', 'demaquillante'],
  ['retinol', 'retinoide'],
  ['centella', 'cica'],
  ['figue', 'barbarie', 'prickly', 'pear', 'opuntia'],
  ['clarifiant', 'clarifying'],
  ['teinte', 'tinted'],
];

function stem(word: string): string {
  return word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word;
}

function alternatives(word: string): string[] {
  const stemmed = stem(word);
  const group = SYNONYMS.find((g) => g.some((w) => w === word || stem(w) === stemmed));
  return [...new Set([word, stemmed, ...(group ?? []).map(stem)])];
}

function queryWords(query: string): string[] {
  let text = normalizeSearch(query);
  for (const [pattern, replacement] of PHRASES) text = text.replace(pattern, replacement);
  return text.split(' ').filter(Boolean);
}

function haystack(p: Product, description: boolean): string {
  const brand = brandOf(p);
  return ' ' + normalizeSearch([p.name, p.short, p.category, brand, BRAND_LABELS[brand], description ? p.description : ''].join(' ')) + ' ';
}

function wordHits(words: string[], text: string): number {
  return words.filter((w) => alternatives(w).some((a) => text.includes(' ' + a) || (a.length > 2 && text.includes(a)))).length;
}

/** Every word of the query (or one of its synonyms) appears in the name, short name and category (plus the description when asked). */
export function productMatches(p: Product, query: string, description = false): boolean {
  const words = queryWords(query);
  if (!words.length) return true;
  return wordHits(words, haystack(p, description)) === words.length;
}

/**
 * The ids a search keeps, for use as a filter: matches on the name, short name or category,
 * or, only when none exists, matches that rely on the description.
 */
export function searchIds(products: Product[], query: string): Set<string> {
  const primary = products.filter((p) => productMatches(p, query));
  return new Set((primary.length ? primary : products.filter((p) => productMatches(p, query, true))).map((p) => p.id));
}

/** When nothing matches every word: the products that match the most words, best first. */
export function closestProducts(products: Product[], query: string, limit = 5): Product[] {
  const words = queryWords(query);
  if (!words.length) return [];
  return products
    .map((p) => ({ p, hits: wordHits(words, haystack(p, true)) }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.p.name.localeCompare(b.p.name, 'fr'))
    .slice(0, limit)
    .map((x) => x.p);
}
