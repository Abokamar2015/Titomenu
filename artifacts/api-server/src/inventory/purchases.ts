import { z } from "zod/v4";
import { quantityMilli } from "./stock";
export const purchaseInput = z.object({
  id: z.uuid(),
  supplierId: z.uuid(),
  branchId: z.uuid().nullable(),
  reference: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^\r\n]+$/)
    .transform((v) => v.toUpperCase()),
  documentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
    ),
  notes: z.string().trim().max(1000).default(""),
  items: z
    .array(
      z.object({
        itemId: z.uuid(),
        expectedUnit: z.enum(["g", "kg", "ml", "l", "pcs", "pack"]),
        quantity: z.string().max(20),
        unitCostMinor: z.number().int().min(0).max(100000000),
      }),
    )
    .min(1)
    .max(50),
});
export function purchaseAmounts(
  lines: { itemId: string; quantity: string; unitCostMinor: number }[],
) {
  const seen = new Set<string>();
  let totalMinor = 0;
  const result = lines.map((l) => {
    if (seen.has(l.itemId))
      throw Error("المادة مكررة؛ اجمع كميتها في سطر واحد");
    seen.add(l.itemId);
    const q = quantityMilli(l.quantity);
    if (!q) throw Error("كمية الشراء يجب أن تكون موجبة");
    if (
      !Number.isSafeInteger(l.unitCostMinor) ||
      l.unitCostMinor < 0 ||
      l.unitCostMinor > 100000000
    )
      throw Error("تكلفة الوحدة غير صالحة");
    const lineTotalMinor = Number(
      (BigInt(q) * BigInt(l.unitCostMinor) + 500n) / 1000n,
    );
    totalMinor += lineTotalMinor;
    if (totalMinor > 2000000000) throw Error("إجمالي المستند يتجاوز الحد");
    return { ...l, quantityMilli: q, lineTotalMinor };
  });
  return { lines: result, totalMinor };
}

export const purchaseListInput = z
  .object({
    search: z.string().trim().max(150).default(""),
    status: z.enum(["all", "posted", "cancelled"]).default("all"),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
    supplierId: z.uuid().optional(),
    from: purchaseInput.shape.documentDate.optional(),
    to: purchaseInput.shape.documentDate.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "Start date must not follow end date",
  });
