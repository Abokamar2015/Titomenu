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
