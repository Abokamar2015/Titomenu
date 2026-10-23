CREATE TABLE inv_purchases (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 supplier_id uuid NOT NULL REFERENCES inv_suppliers(id) ON DELETE RESTRICT,
 supplier_name text NOT NULL,
 supplier_code text NOT NULL,
 branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
 location_key text NOT NULL,
 reference text NOT NULL CHECK(char_length(btrim(reference)) BETWEEN 1 AND 100),
 document_date date NOT NULL,
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 50),
 total_minor integer NOT NULL CHECK(total_minor BETWEEN 0 AND 2000000000),
 notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','cancelled')),
 request_hash text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 cancelled_by uuid REFERENCES users(id) ON DELETE RESTRICT,
 cancelled_at timestamptz,
 cancellation_reason text,
 CHECK(location_key=COALESCE(branch_id::text,'none')),
 CHECK((status='posted' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL)
 OR (status='cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancellation_reason IS NOT NULL AND char_length(btrim(cancellation_reason)) BETWEEN 3 AND 500)),
 UNIQUE(restaurant_id,id),
 FOREIGN KEY(restaurant_id,supplier_id) REFERENCES inv_suppliers(restaurant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX inv_purchases_live_reference ON inv_purchases(restaurant_id,supplier_id,reference) WHERE status='posted';
CREATE INDEX inv_purchases_list ON inv_purchases(restaurant_id,created_at,id);
ALTER TABLE inv_movements ADD COLUMN purchase_id uuid REFERENCES inv_purchases(id) ON DELETE RESTRICT;
ALTER TABLE inv_movements ADD CONSTRAINT inv_movements_purchase_tenant FOREIGN KEY(restaurant_id,purchase_id) REFERENCES inv_purchases(restaurant_id,id) ON DELETE RESTRICT;
ALTER TABLE inv_movements ADD CONSTRAINT inv_movements_single_origin CHECK(purchase_id IS NULL OR transfer_id IS NULL);
CREATE UNIQUE INDEX inv_movements_purchase_once ON inv_movements(purchase_id,item_id,kind) WHERE purchase_id IS NOT NULL;
ALTER TABLE inv_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inv_purchases FROM anon,authenticated;
