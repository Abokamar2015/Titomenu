ALTER TABLE pos_orders ADD COLUMN subtotal_minor integer CHECK (subtotal_minor >= 0);
ALTER TABLE pos_orders ADD COLUMN discount_minor integer NOT NULL DEFAULT 0 CHECK (discount_minor >= 0);
ALTER TABLE pos_orders ADD COLUMN discount_reason text NOT NULL DEFAULT '';
ALTER TABLE pos_orders ADD COLUMN cash_received_minor integer CHECK (cash_received_minor >= 0);
ALTER TABLE pos_orders ADD CONSTRAINT pos_discount_within_subtotal CHECK (subtotal_minor IS NULL OR total_minor = subtotal_minor - discount_minor);
ALTER TABLE pos_orders ADD CONSTRAINT pos_cash_covers_total CHECK (cash_received_minor IS NULL OR (payment = 'cash' AND cash_received_minor >= total_minor));
