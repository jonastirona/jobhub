-- Create career_preferences table
-- Stores target roles, location preferences, work mode, and salary range per user.
-- One row per user (enforced by UNIQUE on user_id).

CREATE TABLE IF NOT EXISTS career_preferences (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  target_roles        TEXT,
  preferred_locations TEXT,
  work_mode           TEXT CHECK (work_mode IN ('remote', 'hybrid', 'onsite', 'any')),
  salary_min          INTEGER CHECK (salary_min IS NULL OR salary_min >= 0),
  salary_max          INTEGER CHECK (salary_max IS NULL OR salary_max >= 0),
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE career_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own career preferences" ON career_preferences;
CREATE POLICY "Users can manage their own career preferences"
  ON career_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS career_preferences_updated_at ON career_preferences;
CREATE TRIGGER career_preferences_updated_at
  BEFORE UPDATE ON career_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
