CREATE TABLE inv_transfers (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES inv_items(id) ON DELETE RESTRICT,
 from_branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
 to_branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
 from_location_key text NOT NULL,
 to_location_key text NOT NULL,
 quantity_milli integer NOT NULL CHECK(quantity_milli > 0 AND quantity_milli <= 1000000000),
 unit text NOT NULL CHECK(unit IN ('g','kg','ml','l','pcs','pack')),
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 3 AND 500),
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(from_location_key = COALESCE(from_branch_id::text,'none')),
 CHECK(to_location_key = COALESCE(to_branch_id::text,'none')),
 CHECK(from_location_key <> to_location_key),
 UNIQUE(restaurant_id,id),
 FOREIGN KEY(restaurant_id,item_id) REFERENCES inv_items(restaurant_id,id) ON DELETE RESTRICT
);
CREATE INDEX inv_transfers_item ON inv_transfers(restaurant_id,item_id,created_at);
ALTER TABLE inv_movements ADD COLUMN transfer_id uuid REFERENCES inv_transfers(id) ON DELETE RESTRICT;
ALTER TABLE inv_movements ADD CONSTRAINT inv_movements_transfer_tenant FOREIGN KEY(restaurant_id,transfer_id) REFERENCES inv_transfers(restaurant_id,id) ON DELETE RESTRICT;
CREATE INDEX inv_movements_transfer ON inv_movements(transfer_id) WHERE transfer_id IS NOT NULL;
ALTER TABLE inv_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inv_transfers FROM anon,authenticated;
