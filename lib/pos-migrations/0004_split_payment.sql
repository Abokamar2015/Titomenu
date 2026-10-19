ALTER TABLE pos_orders ADD COLUMN card_paid_minor integer;
ALTER TABLE pos_orders DROP CONSTRAINT pos_orders_payment_check;
ALTER TABLE pos_orders ADD CONSTRAINT pos_orders_payment_check CHECK (payment IN ('cash','card','mixed'));
ALTER TABLE pos_orders DROP CONSTRAINT pos_cash_covers_total;
ALTER TABLE pos_orders ADD CONSTRAINT pos_card_matches_payment CHECK (
 card_paid_minor IS NULL OR (
 card_paid_minor >= 0 AND card_paid_minor <= total_minor AND (
 (payment = 'cash' AND card_paid_minor = 0) OR
 (payment = 'card' AND card_paid_minor = total_minor) OR
 (payment = 'mixed' AND card_paid_minor > 0 AND card_paid_minor < total_minor)
 ))
);
ALTER TABLE pos_orders ADD CONSTRAINT pos_mixed_requires_parts CHECK (payment <> 'mixed' OR (card_paid_minor IS NOT NULL AND cash_received_minor IS NOT NULL));
ALTER TABLE pos_orders ADD CONSTRAINT pos_cash_covers_total CHECK (
 cash_received_minor IS NULL OR (payment IN ('cash','mixed') AND cash_received_minor >= total_minor - COALESCE(card_paid_minor,0))
);
