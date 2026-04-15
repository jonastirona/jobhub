-- Create skills table
-- Stores skills with optional category and proficiency per user.
-- Ordered by position (ascending) for user-defined ordering.

CREATE TABLE IF NOT EXISTS skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  category    TEXT,
  proficiency TEXT CHECK (proficiency IN ('beginner', 'intermediate', 'advanced', 'expert')),
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT skills_user_id_position_key UNIQUE (user_id, position)
);

-- Note: no separate index needed — the UNIQUE (user_id, position) constraint
-- above already creates an implicit index on (user_id, position).

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own skills" ON skills;
CREATE POLICY "Users can manage their own skills"
  ON skills FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS skills_updated_at ON skills;
CREATE TRIGGER skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
