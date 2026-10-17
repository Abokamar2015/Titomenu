export interface ShiftOrder {
  status: string;
  payment: string;
  totalMinor: number;
  cardPaidMinor: number | null;
  discountMinor: number;
}
export function summarizeShift(openingMinor: number, orders: ShiftOrder[]) {
  if (!Number.isSafeInteger(openingMinor) || openingMinor < 0)
    throw Error("رصيد البداية غير صالح");
  let salesMinor = 0,
    cashMinor = 0,
    cardMinor = 0,
    discountMinor = 0,
    paidCount = 0,
    voidedCount = 0;
  for (const o of orders) {
    if (o.status === "voided") {
      voidedCount++;
      continue;
    }
    const card =
      o.payment === "card"
        ? o.totalMinor
        : o.payment === "mixed"
          ? (o.cardPaidMinor ?? 0)
          : 0;
    if (
      !Number.isSafeInteger(o.totalMinor) ||
      o.totalMinor < 0 ||
      !Number.isSafeInteger(card) ||
      card < 0 ||
      card > o.totalMinor
    )
      throw Error("بيانات الدفع غير متسقة");
    salesMinor += o.totalMinor;
    cardMinor += card;
    cashMinor += o.totalMinor - card;
    discountMinor += o.discountMinor || 0;
    paidCount++;
  }
  const expectedMinor = openingMinor + cashMinor;
  if (!Number.isSafeInteger(expectedMinor) || expectedMinor > 2000000000)
    throw Error("رصيد الصندوق يتجاوز الحد");
  return {
    salesMinor,
    cashMinor,
    cardMinor,
    discountMinor,
    paidCount,
    voidedCount,
    expectedMinor,
  };
}
export function reconcileShift(
  expectedMinor: number,
  countedMinor: number,
  note: string,
) {
  if (
    !Number.isSafeInteger(countedMinor) ||
    countedMinor < 0 ||
    countedMinor > 2000000000
  )
    throw Error("المبلغ المعدود غير صالح");
  const varianceMinor = countedMinor - expectedMinor;
  if (varianceMinor !== 0 && note.trim().length < 3)
    throw Error("أدخل تفسيرًا لفرق الصندوق (3 أحرف على الأقل)");
  return {
    countedMinor,
    expectedMinor,
    varianceMinor,
    closingNote: note.trim(),
  };
}
