export interface PosProduct {
  id: string;
  nameAr: string;
  nameEn: string;
  price: number;
  isAvailable: boolean;
}
export function calculateOrder(
  items: { id: string; qty: number }[],
  products: PosProduct[],
) {
  if (!items.length || items.length > 100) throw Error("أضف أصنافًا للطلب");
  const merged = new Map<string, number>();
  for (const x of items) {
    if (!Number.isInteger(x.qty) || x.qty < 1 || x.qty > 999)
      throw Error("كمية غير صالحة");
    merged.set(x.id, (merged.get(x.id) || 0) + x.qty);
  }
  const lines = [...merged].map(([id, qty]) => {
    const p = products.find((p) => p.id === id && p.isAvailable);
    if (!p || qty > 999) throw Error("أحد الأصناف غير متاح");
    const price = Math.round(p.price * 100);
    if (!Number.isSafeInteger(price) || price < 0)
      throw Error("سعر الصنف غير صالح");
    return {
      id,
      name_ar: p.nameAr,
      name_en: p.nameEn,
      price_minor: price,
      qty,
    };
  });
  const total = lines.reduce((s, x) => s + x.price_minor * x.qty, 0);
  if (!Number.isSafeInteger(total) || total > 100000000)
    throw Error("قيمة الطلب تتجاوز الحد");
  return { lines, total };
}

export function calculateSettlement(
  subtotal: number,
  input: {
    discountMinor: number;
    discountReason: string;
    payment: "cash" | "card";
    cashReceivedMinor: number | null;
  },
  manager: boolean,
) {
  const discount = input.discountMinor;
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || subtotal > 100000000)
    throw Error("قيمة الطلب تتجاوز الحد");
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal)
    throw Error("الخصم يجب ألا يتجاوز قيمة الطلب");
  if (discount > 0 && !manager) throw Error("الخصم متاح للمدير فقط");
  if (discount > 0 && input.discountReason.trim().length < 3)
    throw Error("أدخل سبب الخصم (3 أحرف على الأقل)");
  const total = subtotal - discount;
  const received =
    input.payment === "cash" ? (input.cashReceivedMinor ?? total) : null;
  if (
    received !== null &&
    (!Number.isSafeInteger(received) ||
      received < total ||
      received > 100000000)
  )
    throw Error("المبلغ المستلم أقل من الإجمالي أو غير صالح");
  return {
    subtotalMinor: subtotal,
    discountMinor: discount,
    discountReason: discount > 0 ? input.discountReason.trim() : "",
    totalMinor: total,
    cashReceivedMinor: received,
  };
}
