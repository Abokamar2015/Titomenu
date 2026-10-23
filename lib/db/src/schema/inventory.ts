import {
  pgTable,
  date,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { restaurantsTable, branchesTable } from "./restaurants";
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

export const invBalancesTable = pgTable(
  "inv_balances",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => invItemsTable.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id").references(() => branchesTable.id, {
      onDelete: "restrict",
    }),
    locationKey: text("location_key").notNull(),
    quantityMilli: integer("quantity_milli").notNull().default(0),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("inv_balances_location").on(
      t.restaurantId,
      t.itemId,
      t.locationKey,
    ),
  ],
);
export const invTransfersTable = pgTable("inv_transfers", {
  id: uuid("id").primaryKey(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurantsTable.id, { onDelete: "restrict" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => invItemsTable.id, { onDelete: "restrict" }),
  fromBranchId: uuid("from_branch_id").references(() => branchesTable.id, {
    onDelete: "restrict",
  }),
  toBranchId: uuid("to_branch_id").references(() => branchesTable.id, {
    onDelete: "restrict",
  }),
  fromLocationKey: text("from_location_key").notNull(),
  toLocationKey: text("to_location_key").notNull(),
  quantityMilli: integer("quantity_milli").notNull(),
  unit: text("unit").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export interface PurchaseLine {
  itemId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  unit: string;
  quantityMilli: number;
  unitCostMinor: number;
  lineTotalMinor: number;
}
export const invPurchasesTable = pgTable("inv_purchases", {
  id: uuid("id").primaryKey(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurantsTable.id, { onDelete: "restrict" }),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => invSuppliersTable.id, { onDelete: "restrict" }),
  supplierName: text("supplier_name").notNull(),
  supplierCode: text("supplier_code").notNull(),
  branchId: uuid("branch_id").references(() => branchesTable.id, {
    onDelete: "restrict",
  }),
  locationKey: text("location_key").notNull(),
  reference: text("reference").notNull(),
  documentDate: date("document_date").notNull(),
  items: jsonb("items").$type<PurchaseLine[]>().notNull(),
  totalMinor: integer("total_minor").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("posted"),
  requestHash: text("request_hash").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  cancelledBy: uuid("cancelled_by").references(() => usersTable.id, {
    onDelete: "restrict",
  }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
});
export const invMovementsTable = pgTable("inv_movements", {
  id: uuid("id").primaryKey(),
  purchaseId: uuid("purchase_id").references(() => invPurchasesTable.id, {
    onDelete: "restrict",
  }),
  transferId: uuid("transfer_id").references(() => invTransfersTable.id, {
    onDelete: "restrict",
  }),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurantsTable.id, { onDelete: "restrict" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => invItemsTable.id, { onDelete: "restrict" }),
  branchId: uuid("branch_id").references(() => branchesTable.id, {
    onDelete: "restrict",
  }),
  locationKey: text("location_key").notNull(),
  kind: text("kind").notNull(),
  inputQuantityMilli: integer("input_quantity_milli").notNull(),
  deltaMilli: integer("delta_milli").notNull(),
  beforeMilli: integer("before_milli").notNull(),
  afterMilli: integer("after_milli").notNull(),
  unit: text("unit").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
