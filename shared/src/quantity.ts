/** A missing quantity is one, including historical saved calls. Prices stay per unit. */
export type WithQuantity = { quantity?: number };
export const MAX_ITEM_QUANTITY = 99;
export function quantityOf(item: WithQuantity): number {
  const quantity = item.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantité invalide');
  return quantity;
}
export const lineTotal = (item: WithQuantity & { price: number }) => item.price * quantityOf(item);
export const itemsTotal = (items: (WithQuantity & { price: number })[]) => items.reduce((sum, item) => sum + lineTotal(item), 0);
export const unitCount = (items: WithQuantity[]) => items.reduce((sum, item) => sum + quantityOf(item), 0);
export const quantityLabel = (item: WithQuantity & { name: string }) => quantityOf(item) > 1 ? `${item.name} × ${quantityOf(item)}` : item.name;
export const orderSignature = (items: (WithQuantity & { id: string })[]) => JSON.stringify(items.map(item => [item.id, quantityOf(item)]));
export function sameOrder(a: (WithQuantity & { id: string })[], b: (WithQuantity & { id: string })[]): boolean {
  return a.length === b.length && a.every(item => b.some(other => other.id === item.id && quantityOf(other) === quantityOf(item)));
}
