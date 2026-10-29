PRAGMA foreign_keys = ON;

CREATE TABLE
  IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('นักศึกษา', 'อาจารย์', 'เจ้าหน้าที่')),
    code TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT NOT NULL UNIQUE,
    faculty TEXT NOT NULL,
    major TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'APPROVED', 'REJECTED')),
    role TEXT NOT NULL CHECK (role IN ('user', 'staff')),
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

CREATE TABLE
  IF NOT EXISTS workshops (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover TEXT NOT NULL DEFAULT '',
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    place TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    hours REAL NOT NULL CHECK (hours > 0),
    closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
    created_at TEXT NOT NULL
  );

CREATE TABLE
  IF NOT EXISTS registrations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id),
    workshop_id TEXT NOT NULL REFERENCES workshops (id),
    status TEXT NOT NULL CHECK (
      status IN ('PENDING', 'ATTENDED', 'ABSENT', 'CANCELLED')
    ),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, workshop_id)
  );

CREATE TABLE
  IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL UNIQUE REFERENCES registrations (id),
    user_id TEXT NOT NULL REFERENCES users (id),
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
    created_at TEXT NOT NULL
  );

CREATE TABLE
  IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id),
    issue TEXT NOT NULL,
    detail TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REPLIED', 'CLOSED')),
    created_at TEXT NOT NULL
  );

CREATE TABLE
  IF NOT EXISTS complaint_replies (
    id TEXT PRIMARY KEY,
    complaint_id TEXT NOT NULL REFERENCES complaints (id) ON DELETE CASCADE,
    staff_id TEXT NOT NULL REFERENCES users (id),
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

CREATE TABLE
  IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_type TEXT NOT NULL DEFAULT '',
    related_id TEXT NOT NULL DEFAULT '',
    read_at TEXT,
    created_at TEXT NOT NULL
  );

CREATE TABLE
  IF NOT EXISTS otp_challenges (
    id TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'phone')),
    contact TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
  );

CREATE TABLE
  IF NOT EXISTS password_reset_grants (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
  );

CREATE TABLE
  IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

CREATE TABLE
  IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL DEFAULT 0,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_registrations_workshop_status ON registrations (workshop_id, status);

CREATE INDEX IF NOT EXISTS idx_registrations_user ON registrations (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, read_at, created_at);

CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints (user_id, created_at);
CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  identity TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_identity ON login_attempts(identity, created_at);
