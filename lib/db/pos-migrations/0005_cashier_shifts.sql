CREATE TABLE pos_shifts (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
 opening_minor integer NOT NULL CHECK (opening_minor >= 0),
 opened_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 counted_minor integer CHECK (counted_minor >= 0),
 expected_minor integer CHECK (expected_minor >= 0),
 variance_minor integer,
 closing_note text NOT NULL DEFAULT '',
 closing_summary jsonb,
 CHECK ((closed_at IS NULL AND counted_minor IS NULL AND expected_minor IS NULL AND variance_minor IS NULL AND closing_summary IS NULL) OR (closed_at IS NOT NULL AND counted_minor IS NOT NULL AND expected_minor IS NOT NULL AND variance_minor IS NOT NULL AND variance_minor = counted_minor - expected_minor AND closing_summary IS NOT NULL))
);
CREATE UNIQUE INDEX pos_shifts_one_active ON pos_shifts(restaurant_id,user_id) WHERE closed_at IS NULL;
CREATE INDEX pos_shifts_restaurant_time ON pos_shifts(restaurant_id,opened_at);
ALTER TABLE pos_shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_shifts FROM anon, authenticated;
ALTER TABLE pos_orders ADD COLUMN shift_id uuid REFERENCES pos_shifts(id) ON DELETE RESTRICT;
CREATE INDEX pos_orders_shift ON pos_orders(shift_id);
