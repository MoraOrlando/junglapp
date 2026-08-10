// Prices are stored IVA-included (see receipt.ts) — neto is "unpacked" from
// the final total rather than the other way around. Centralized here because
// this exact /1.19 formula used to be duplicated in 4 places in store/page.tsx.
export const IVA_RATE = 0.19;

export function netoFromTotal(total: number): number {
  return total / (1 + IVA_RATE);
}

export function ivaFromTotal(total: number): number {
  return total - netoFromTotal(total);
}

export type DiscountType = 'percent' | 'fixed';

export interface CartDiscount {
  scope: 'cart' | 'product';
  // Only set when scope === 'product'.
  productId?: string;
  type: DiscountType;
  value: number;
}

export interface DiscountableLine {
  productId: string;
  price: number;
  qty: number;
}

// Amount in pesos the discount removes from the subtotal — clamped so it
// never exceeds the subtotal it applies to (whole cart, or just the one
// product line), and never goes negative.
export function computeDiscountAmount(lines: DiscountableLine[], discount: CartDiscount | null): number {
  if (!discount || !discount.value || discount.value <= 0) return 0;

  const base = discount.scope === 'cart'
    ? lines.reduce((sum, l) => sum + l.price * l.qty, 0)
    : lines.filter((l) => l.productId === discount.productId).reduce((sum, l) => sum + l.price * l.qty, 0);

  if (base <= 0) return 0;

  const raw = discount.type === 'percent' ? base * (discount.value / 100) : discount.value;
  return Math.min(Math.max(raw, 0), base);
}
