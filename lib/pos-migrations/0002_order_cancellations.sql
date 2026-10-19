ALTER TABLE pos_orders ADD COLUMN status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','voided'));
ALTER TABLE pos_orders ADD COLUMN void_reason text;
ALTER TABLE pos_orders ADD COLUMN voided_at timestamptz;
ALTER TABLE pos_orders ADD COLUMN voided_by uuid REFERENCES users(id) ON DELETE SET NULL;
