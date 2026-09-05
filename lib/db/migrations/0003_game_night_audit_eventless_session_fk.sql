-- Applied only by lib/db/scripts/run-game-night-migrations.mjs.
-- Eventless audit rows still require a session in the same restaurant.

ALTER TABLE game_night_audit_logs
  ADD CONSTRAINT game_night_audit_logs_session_same_restaurant_fkey
  FOREIGN KEY (restaurant_id, actor_session_id)
  REFERENCES game_night_player_sessions (restaurant_id, id)
  ON DELETE NO ACTION;