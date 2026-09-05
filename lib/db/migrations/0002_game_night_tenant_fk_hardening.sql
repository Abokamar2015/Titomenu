-- Applied only by lib/db/scripts/run-game-night-migrations.mjs.
-- This migration intentionally fails if the expected 0001 constraints are absent.

ALTER TABLE game_night_answers
  ADD CONSTRAINT game_night_answers_rest_event_team_id_key
  UNIQUE (restaurant_id, event_id, team_id, id);

ALTER TABLE game_night_score_ledger
  DROP CONSTRAINT game_night_score_ledger_restaurant_id_event_id_answer_id_fkey;
ALTER TABLE game_night_score_ledger
  ADD CONSTRAINT game_night_score_ledger_answer_same_team_fkey
  FOREIGN KEY (restaurant_id, event_id, team_id, answer_id)
  REFERENCES game_night_answers (restaurant_id, event_id, team_id, id)
  ON DELETE RESTRICT;

ALTER TABLE game_night_player_sessions
  ADD CONSTRAINT game_night_player_sessions_rest_event_id_key
  UNIQUE (restaurant_id, event_id, id);

ALTER TABLE game_night_audit_logs
  DROP CONSTRAINT game_night_audit_logs_restaurant_id_actor_session_id_fkey;
ALTER TABLE game_night_audit_logs
  ADD CONSTRAINT game_night_audit_logs_session_same_event_fkey
  FOREIGN KEY (restaurant_id, event_id, actor_session_id)
  REFERENCES game_night_player_sessions (restaurant_id, event_id, id)
  ON DELETE NO ACTION;