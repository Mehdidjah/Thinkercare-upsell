import type { ItemSnapshot, Product, OrderItem } from '@touche/domain';
import { isPack, quantityOf } from '@touche/domain';
import { asc } from 'drizzle-orm';
import type { Db, Tx } from '../db/schema.js';
import { tcProducts } from '../db/schema.js';

export async function loadProducts(db: Db | Tx): Promise<Product[]> {
  const rows = await db
    .select({ data: tcProducts.data })
    .from(tcProducts)
    .orderBy(asc(tcProducts.position));
  return rows.map((r) => r.data);
}

export function snapshot(p: OrderItem, all: Product[]): ItemSnapshot {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    quantity: quantityOf(p),
    category: p.category,
    components: isPack(p)
      ? (p.components || [])
          .map((id) => all.find((x) => x.id === id))
          .filter((x): x is Product => !!x)
          .map((x) => ({
            id: x.id,
            name: x.name,
            price: x.price,
            quantity: 1,
            category: x.category,
          }))
      : [],
  };
}
