// Ordered schema migrations. Each runs once inside a transaction; PRAGMA user_version tracks progress.

export const migrations: string[] = [
  // 1 — initial schema
  `
  CREATE TABLE student (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT, perm_id TEXT, school TEXT, grade TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE grading_periods (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    idx INTEGER NOT NULL,
    start_date TEXT, end_date TEXT
  );

  CREATE TABLE courses (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    period TEXT, room TEXT, teacher TEXT, teacher_email TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',          -- user grading overrides (JSON), never touched by sync
    updated_at TEXT NOT NULL
  );

  CREATE TABLE course_marks (
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    period_id INTEGER NOT NULL REFERENCES grading_periods(id) ON DELETE CASCADE,
    mark_name TEXT NOT NULL,
    letter TEXT, percent REAL,
    PRIMARY KEY (course_id, period_id)
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    period_id INTEGER NOT NULL REFERENCES grading_periods(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    weight REAL, points REAL, points_possible REAL, mark TEXT,
    UNIQUE (course_id, period_id, name)
  );

  CREATE TABLE assignments (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    period_id INTEGER NOT NULL REFERENCES grading_periods(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT, date TEXT, due_date TEXT,
    earned REAL, possible REAL,
    status TEXT NOT NULL CHECK (status IN ('graded','not_graded','missing','exempt')),
    score_text TEXT, points_text TEXT, notes TEXT, description TEXT,
    first_seen TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (course_id, period_id, source_id)
  );
  CREATE INDEX idx_assignments_course ON assignments(course_id, period_id);
  CREATE INDEX idx_assignments_due ON assignments(due_date);

  CREATE TABLE attendance (
    id INTEGER PRIMARY KEY,
    date TEXT, period TEXT, course TEXT, reason TEXT, note TEXT
  );

  CREATE TABLE snapshots (
    id INTEGER PRIMARY KEY,
    taken_at TEXT NOT NULL,
    source TEXT NOT NULL,
    gpa_unweighted REAL, gpa_weighted REAL
  );
  CREATE TABLE snapshot_courses (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    course_key TEXT NOT NULL,
    course_name TEXT NOT NULL,
    period_name TEXT,
    percent REAL, letter TEXT,
    graded INTEGER NOT NULL, missing INTEGER NOT NULL, total INTEGER NOT NULL,
    PRIMARY KEY (snapshot_id, course_key)
  );

  -- Hypothetical data lives in its own tables and references real rows only by id.
  CREATE TABLE scenarios (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE hypotheticals (
    id INTEGER PRIMARY KEY,
    scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    period_id INTEGER REFERENCES grading_periods(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('add','override')),
    target_assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    earned REAL, possible REAL,
    due_date TEXT
  );

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE sync_log (
    id INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL, finished_at TEXT,
    source TEXT NOT NULL, status TEXT NOT NULL, message TEXT
  );
  `
]
