CREATE TABLE pos_cash_movements (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
 shift_id uuid NOT NULL REFERENCES pos_shifts(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('in','out','expense')),
 amount_minor integer NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 100000000),
 reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
 reverses_id uuid REFERENCES pos_cash_movements(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (reverses_id IS NULL OR reverses_id <> id)
);
CREATE UNIQUE INDEX pos_cash_movement_one_reversal ON pos_cash_movements(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE INDEX pos_cash_movements_shift ON pos_cash_movements(restaurant_id,shift_id,created_at);
ALTER TABLE pos_cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_cash_movements FROM anon, authenticated;
