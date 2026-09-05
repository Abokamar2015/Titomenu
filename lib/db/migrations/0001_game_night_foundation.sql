-- Applied only by lib/db/scripts/run-game-night-migrations.mjs.
-- The runner owns the transaction, migration ledger, checksum, and advisory lock.

CREATE TABLE game_night_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  slug text NOT NULL, access_code text NOT NULL, title text NOT NULL,
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ready_at timestamptz, started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, id), UNIQUE (restaurant_id, slug), UNIQUE (restaurant_id, access_code),
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), CHECK (access_code ~ '^[A-Z0-9]{4,12}$'),
  CHECK (started_at IS NULL OR ready_at IS NOT NULL), CHECK (started_at IS NULL OR started_at >= ready_at),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL), CHECK (completed_at IS NULL OR completed_at >= started_at),
  CHECK (cancelled_at IS NULL OR cancelled_at >= created_at),
  CHECK (NOT (completed_at IS NOT NULL AND cancelled_at IS NOT NULL))
);

CREATE TABLE game_night_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL, ordinal integer NOT NULL CHECK (ordinal > 0), title text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'open', 'locked', 'scored', 'completed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), opens_at timestamptz, locks_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, event_id, id), UNIQUE (restaurant_id, event_id, ordinal),
  FOREIGN KEY (restaurant_id, event_id) REFERENCES game_night_events(restaurant_id, id) ON DELETE CASCADE,
  CHECK (locks_at IS NULL OR opens_at IS NULL OR locks_at >= opens_at)
);

CREATE TABLE game_night_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  prompt text NOT NULL, question_type text NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false', 'short_text', 'number')),
  choices jsonb, correct_answer jsonb NOT NULL, explanation text, default_points integer NOT NULL DEFAULT 1 CHECK (default_points >= 0),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('draft', 'active', 'archived')), version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (restaurant_id, id),
  CHECK (choices IS NULL OR jsonb_typeof(choices) = 'array'), CHECK (question_type = 'multiple_choice' OR choices IS NULL)
);

CREATE TABLE game_night_event_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL, round_id uuid NOT NULL, source_question_id uuid, ordinal integer NOT NULL CHECK (ordinal > 0),
  prompt_snapshot text NOT NULL, question_type_snapshot text NOT NULL CHECK (question_type_snapshot IN ('multiple_choice', 'true_false', 'short_text', 'number')),
  choices_snapshot jsonb, correct_answer_snapshot jsonb NOT NULL, explanation_snapshot text, points integer NOT NULL DEFAULT 1 CHECK (points >= 0),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'open', 'locked', 'scored', 'void')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), opened_at timestamptz, locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, event_id, id), UNIQUE (restaurant_id, event_id, round_id, ordinal),
  FOREIGN KEY (restaurant_id, event_id) REFERENCES game_night_events(restaurant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id, event_id, round_id) REFERENCES game_night_rounds(restaurant_id, event_id, id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id, source_question_id) REFERENCES game_night_questions(restaurant_id, id) ON DELETE RESTRICT,
  CHECK (choices_snapshot IS NULL OR jsonb_typeof(choices_snapshot) = 'array'),
  CHECK (question_type_snapshot = 'multiple_choice' OR choices_snapshot IS NULL),
  CHECK (locked_at IS NULL OR opened_at IS NOT NULL), CHECK (locked_at IS NULL OR locked_at >= opened_at)
);

CREATE TABLE game_night_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL, name text NOT NULL, join_code text NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'locked', 'disqualified', 'withdrawn')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, event_id, id), UNIQUE (restaurant_id, event_id, name), UNIQUE (restaurant_id, event_id, join_code),
  FOREIGN KEY (restaurant_id, event_id) REFERENCES game_night_events(restaurant_id, id) ON DELETE CASCADE,
  CHECK (join_code ~ '^[A-Z0-9]{4,12}$')
);

CREATE TABLE game_night_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL, team_id uuid NOT NULL, display_name text NOT NULL, is_captain boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'disconnected', 'removed')),
  joined_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, event_id, team_id, id),
  FOREIGN KEY (restaurant_id, event_id) REFERENCES game_night_events(restaurant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id, event_id, team_id) REFERENCES game_night_teams(restaurant_id, event_id, id) ON DELETE CASCADE
);

CREATE TABLE game_night_player_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL, team_id uuid NOT NULL, player_id uuid NOT NULL, token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, last_seen_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, id), FOREIGN KEY (restaurant_id, event_id) REFERENCES game_night_events(restaurant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id, event_id, team_id, player_id) REFERENCES game_night_players(restaurant_id, event_id, team_id, id) ON DELETE CASCADE,
  CHECK (expires_at > created_at), CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE game_night_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL, event_question_id uuid NOT NULL, team_id uuid NOT NULL, submitted_by_player_id uuid NOT NULL, answer jsonb NOT NULL,
  state text NOT NULL DEFAULT 'submitted' CHECK (state IN ('submitted', 'correct', 'incorrect', 'void')),
  submitted_at timestamptz NOT NULL DEFAULT now(), graded_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (restaurant_id, event_id, id), UNIQUE (restaurant_id, event_question_id, team_id),
  FOREIGN KEY (restaurant_id, event_id) REFERENCES game_night_events(restaurant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id, event_id, event_question_id) REFERENCES game_night_event_questions(restaurant_id, event_id, id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id, event_id, team_id, submitted_by_player_id) REFERENCES game_night_players(restaurant_id, event_id, team_id, id) ON DELETE RESTRICT,
  CHECK (graded_at IS NULL OR graded_at >= submitted_at)
);

CREATE TABLE game_night_score_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL, team_id uuid NOT NULL, answer_id uuid, action text NOT NULL, reason text NOT NULL,
  points_delta integer NOT NULL CHECK (points_delta <> 0), idempotency_key text NOT NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, event_id, id), UNIQUE (restaurant_id, event_id, idempotency_key),
  FOREIGN KEY (restaurant_id, event_id) REFERENCES game_night_events(restaurant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id, event_id, team_id) REFERENCES game_night_teams(restaurant_id, event_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (restaurant_id, event_id, answer_id) REFERENCES game_night_answers(restaurant_id, event_id, id) ON DELETE RESTRICT
);

CREATE TABLE game_night_state_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL, version integer NOT NULL CHECK (version > 0),
  event_state text NOT NULL CHECK (event_state IN ('DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, event_id, version), FOREIGN KEY (restaurant_id, event_id) REFERENCES game_night_events(restaurant_id, id) ON DELETE CASCADE
);

CREATE TABLE game_night_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_id uuid, actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL, actor_session_id uuid,
  action text NOT NULL, entity_type text NOT NULL, entity_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id, event_id) REFERENCES game_night_events(restaurant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id, actor_session_id) REFERENCES game_night_player_sessions(restaurant_id, id) ON DELETE NO ACTION
);

CREATE INDEX game_night_events_state_idx ON game_night_events (restaurant_id, state, ready_at);
CREATE INDEX game_night_rounds_state_idx ON game_night_rounds (restaurant_id, event_id, state);
CREATE INDEX game_night_questions_state_idx ON game_night_questions (restaurant_id, state);
CREATE INDEX game_night_event_questions_state_idx ON game_night_event_questions (restaurant_id, event_id, state);
CREATE UNIQUE INDEX game_night_one_captain_per_team_idx ON game_night_players (restaurant_id, event_id, team_id) WHERE is_captain;
CREATE INDEX game_night_teams_state_idx ON game_night_teams (restaurant_id, event_id, state);
CREATE INDEX game_night_players_state_idx ON game_night_players (restaurant_id, event_id, team_id, state);
CREATE INDEX game_night_player_sessions_expiry_idx ON game_night_player_sessions (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX game_night_answers_team_idx ON game_night_answers (restaurant_id, event_id, team_id);
CREATE INDEX game_night_answers_state_idx ON game_night_answers (restaurant_id, event_id, state);
CREATE INDEX game_night_score_ledger_team_idx ON game_night_score_ledger (restaurant_id, event_id, team_id, created_at);
CREATE INDEX game_night_audit_logs_event_idx ON game_night_audit_logs (restaurant_id, event_id, created_at);

CREATE FUNCTION game_night_reject_score_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'game_night_score_ledger is append-only'; END;
$$;
CREATE TRIGGER game_night_score_ledger_append_only BEFORE UPDATE OR DELETE ON game_night_score_ledger
FOR EACH ROW EXECUTE FUNCTION game_night_reject_score_ledger_mutation();

ALTER TABLE game_night_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_night_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_night_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_night_event_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_night_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_night_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_night_player_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_night_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_night_score_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_night_state_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_night_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE role_name text; table_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH table_name IN ARRAY ARRAY[
        'game_night_events', 'game_night_rounds', 'game_night_questions', 'game_night_event_questions',
        'game_night_teams', 'game_night_players', 'game_night_player_sessions', 'game_night_answers',
        'game_night_score_ledger', 'game_night_state_snapshots', 'game_night_audit_logs'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;