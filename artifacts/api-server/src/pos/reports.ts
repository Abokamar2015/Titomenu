/** Inclusive calendar range in Riyadh, capped to 31 days. */
export function salesRange(from: unknown, to: unknown) {
  function day(value: unknown) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw Error("التاريخ غير صالح");
    return new Date(value + "T00:00:00+03:00");
  }
  const start = day(from),
    last = day(to === undefined ? from : to);
  const days = (last.getTime() - start.getTime()) / 86400000 + 1;
  if (days < 1 || days > 31) throw Error("اختر فترة من يوم إلى 31 يومًا");
  return { start, end: new Date(last.getTime() + 86400000) };
}
