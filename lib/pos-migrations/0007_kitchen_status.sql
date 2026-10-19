-- Existing sales are historical, not a preparation backlog.
ALTER TABLE pos_orders ADD COLUMN kitchen_state text NOT NULL DEFAULT 'completed'
 CHECK (kitchen_state IN ('new','preparing','ready','completed'));
ALTER TABLE pos_orders ALTER COLUMN kitchen_state SET DEFAULT 'new';
ALTER TABLE pos_orders ADD COLUMN kitchen_changed_at timestamptz;
ALTER TABLE pos_orders ALTER COLUMN kitchen_changed_at SET DEFAULT now();
CREATE INDEX pos_orders_kitchen_queue ON pos_orders(restaurant_id, kitchen_state, created_at) WHERE status = 'paid';
CREATE TABLE pos_kitchen_events (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 order_id uuid NOT NULL REFERENCES pos_orders(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 from_state text NOT NULL CHECK (from_state IN ('new','preparing','ready')),
 to_state text NOT NULL CHECK (to_state IN ('preparing','ready','completed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pos_kitchen_events_order ON pos_kitchen_events(restaurant_id,order_id,created_at);
ALTER TABLE pos_kitchen_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_kitchen_events FROM anon, authenticated;
