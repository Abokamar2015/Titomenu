import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { restaurantsTable } from "./restaurants";
import { usersTable } from "./users";
const common = () => ({
  id: uuid("id").primaryKey(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurantsTable.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull().default(""),
  notes: text("notes").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const invSuppliersTable = pgTable(
  "inv_suppliers",
  {
    ...common(),
    contactName: text("contact_name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    address: text("address").notNull().default(""),
  },
  (t) => [
    uniqueIndex("inv_suppliers_restaurant_code").on(t.restaurantId, t.code),
  ],
);
export const invItemsTable = pgTable(
  "inv_items",
  {
    ...common(),
    category: text("category").notNull().default(""),
    unit: text("unit").notNull(),
    minimumQuantity: numeric("minimum_quantity", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    referenceCostMinor: integer("reference_cost_minor").notNull().default(0),
    supplierId: uuid("supplier_id").references(() => invSuppliersTable.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [uniqueIndex("inv_items_restaurant_code").on(t.restaurantId, t.code)],
);
export const invMasterEventsTable = pgTable("inv_master_events", {
  id: uuid("id").primaryKey(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurantsTable.id, { onDelete: "restrict" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  beforeData: jsonb("before_data"),
  afterData: jsonb("after_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
