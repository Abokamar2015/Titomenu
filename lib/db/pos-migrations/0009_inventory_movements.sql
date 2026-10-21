ALTER TABLE inv_items ADD CONSTRAINT inv_items_restaurant_id UNIQUE(restaurant_id,id);
CREATE TABLE inv_balances (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES inv_items(id) ON DELETE RESTRICT,
 branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
 location_key text NOT NULL,
 quantity_milli integer NOT NULL DEFAULT 0 CHECK(quantity_milli BETWEEN 0 AND 1000000000),
 version integer NOT NULL DEFAULT 0 CHECK(version >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(location_key = COALESCE(branch_id::text,'none')),
 CONSTRAINT inv_balances_location UNIQUE(restaurant_id,item_id,location_key),
 FOREIGN KEY(restaurant_id,item_id) REFERENCES inv_items(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE inv_movements (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES inv_items(id) ON DELETE RESTRICT,
 branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
 location_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('receipt','issue','waste','count')),
 input_quantity_milli integer NOT NULL CHECK(input_quantity_milli BETWEEN 0 AND 1000000000),
 delta_milli integer NOT NULL,
 before_milli integer NOT NULL CHECK(before_milli BETWEEN 0 AND 1000000000),
 after_milli integer NOT NULL CHECK(after_milli BETWEEN 0 AND 1000000000),
 unit text NOT NULL CHECK(unit IN ('g','kg','ml','l','pcs','pack')),
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 3 AND 500),
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(location_key = COALESCE(branch_id::text,'none')),
 CHECK(after_milli - before_milli = delta_milli),
 CHECK((kind='receipt' AND input_quantity_milli > 0 AND delta_milli=input_quantity_milli)
 OR (kind IN ('issue','waste') AND input_quantity_milli > 0 AND delta_milli=-input_quantity_milli)
 OR (kind='count' AND input_quantity_milli=after_milli)),
 FOREIGN KEY(restaurant_id,item_id) REFERENCES inv_items(restaurant_id,id) ON DELETE RESTRICT
);
CREATE INDEX inv_movements_ledger ON inv_movements(restaurant_id,item_id,location_key,created_at,id);
ALTER TABLE inv_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inv_balances,inv_movements FROM anon,authenticated;
