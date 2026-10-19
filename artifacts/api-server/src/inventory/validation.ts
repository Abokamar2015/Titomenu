import { z } from "zod/v4";
const base = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{1,40}$/),
  nameAr: z.string().trim().min(1).max(150),
  nameEn: z.string().trim().max(150).default(""),
  notes: z.string().trim().max(1000).default(""),
  isActive: z.boolean().default(true),
};
export const supplierInput = z.object({
  ...base,
  contactName: z.string().trim().max(150).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.union([z.literal(""), z.email()]).default(""),
  address: z.string().trim().max(500).default(""),
});
export const itemInput = z.object({
  ...base,
  category: z.string().trim().max(100).default(""),
  unit: z.enum(["g", "kg", "ml", "l", "pcs", "pack"]),
  minimumQuantity: z
    .string()
    .regex(/^\d{1,7}(\.\d{1,3})?$/)
    .refine((v) => Number(v) <= 1000000)
    .transform((v) => Number(v).toFixed(3)),
  referenceCostMinor: z.number().int().min(0).max(100000000),
  supplierId: z.uuid().nullable().default(null),
});
export const listInput = z.object({
  status: z.enum(["all", "active", "archived"]).default("active"),
  search: z.string().trim().max(150).default(""),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export function literalSearch(s: string) {
  return "%" + s.replace(/[\\%_]/g, "\\$&") + "%";
}
