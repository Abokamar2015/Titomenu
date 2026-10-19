CREATE TABLE inv_suppliers (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 code text NOT NULL,
 name_ar text NOT NULL,
 name_en text NOT NULL DEFAULT '',
 contact_name text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '',
 email text NOT NULL DEFAULT '',
 address text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '',
 is_active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT inv_suppliers_restaurant_code UNIQUE(restaurant_id,code),
 UNIQUE(restaurant_id,id),
 CHECK(code ~ '^[A-Z0-9_-]{1,40}$'),
 CHECK(char_length(btrim(name_ar)) BETWEEN 1 AND 150)
);
CREATE INDEX inv_suppliers_list ON inv_suppliers(restaurant_id,is_active,name_ar,id);
CREATE TABLE inv_items (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 code text NOT NULL,
 name_ar text NOT NULL,
 name_en text NOT NULL DEFAULT '',
 category text NOT NULL DEFAULT '',
 unit text NOT NULL CHECK(unit IN ('g','kg','ml','l','pcs','pack')),
 minimum_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(minimum_quantity >= 0 AND minimum_quantity <= 1000000),
 reference_cost_minor integer NOT NULL DEFAULT 0 CHECK(reference_cost_minor >= 0 AND reference_cost_minor <= 100000000),
 supplier_id uuid REFERENCES inv_suppliers(id) ON DELETE RESTRICT,
 notes text NOT NULL DEFAULT '',
 is_active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT inv_items_restaurant_code UNIQUE(restaurant_id,code),
 FOREIGN KEY (restaurant_id,supplier_id) REFERENCES inv_suppliers(restaurant_id,id) ON DELETE RESTRICT,
 CHECK(code ~ '^[A-Z0-9_-]{1,40}$'),
 CHECK(char_length(btrim(name_ar)) BETWEEN 1 AND 150)
);
CREATE INDEX inv_items_list ON inv_items(restaurant_id,is_active,name_ar,id);
CREATE TABLE inv_master_events (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 entity_type text NOT NULL CHECK(entity_type IN ('suppliers','items')),
 entity_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN ('create','update')),
 before_data jsonb,
 after_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inv_master_events_entity ON inv_master_events(restaurant_id,entity_type,entity_id,created_at);
ALTER TABLE inv_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_master_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inv_suppliers,inv_items,inv_master_events FROM anon, authenticated;
