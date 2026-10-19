CREATE TABLE pos_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 request_id uuid NOT NULL,
 items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
 total_minor integer NOT NULL CHECK (total_minor >= 0),
 payment text NOT NULL CHECK (payment IN ('cash','card')),
 service text NOT NULL CHECK (service IN ('takeaway','dinein')),
 note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pos_orders_request_unique ON pos_orders(restaurant_id,request_id);
CREATE INDEX pos_orders_tenant_created ON pos_orders(restaurant_id,created_at);

-- Access is only through the authenticated Express API.
ALTER TABLE pos_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_orders FROM anon, authenticated;
