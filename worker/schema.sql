-- One row per household. `data` is ciphertext (base64); the server cannot read it.
CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS households_updated_at ON households (updated_at);
