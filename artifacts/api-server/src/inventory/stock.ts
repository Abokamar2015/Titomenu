export function quantityMilli(value: string) {
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(value))
    throw Error("أدخل كمية حتى 3 منازل عشرية");
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  if (result > 1000000000) throw Error("الكمية تتجاوز مليون وحدة");
  return result;
}
export function stockChange(before: number, kind: string, input: number) {
  if (
    !Number.isSafeInteger(before) ||
    before < 0 ||
    before > 1000000000 ||
    !Number.isSafeInteger(input) ||
    input < 0 ||
    input > 1000000000
  )
    throw Error("كمية غير صالحة");
  if (
    !["receipt", "issue", "waste", "count"].includes(kind) ||
    (kind !== "count" && input === 0)
  )
    throw Error("اختر نوع حركة وكمية موجبة");
  const after =
    kind === "count"
      ? input
      : kind === "receipt"
        ? before + input
        : before - input;
  if (after < 0) throw Error("الرصيد لا يكفي للصرف أو الإتلاف");
  if (after > 1000000000) throw Error("رصيد المادة يتجاوز مليون وحدة");
  return { beforeMilli: before, afterMilli: after, deltaMilli: after - before };
}

export function transferChange(
  from: number,
  to: number,
  input: number,
  fromKey: string,
  toKey: string,
) {
  if (fromKey === toKey) throw Error("اختر موقع وجهة يختلف عن المصدر");
  const source = stockChange(from, "issue", input),
    destination = stockChange(to, "receipt", input);
  return { source, destination };
}
