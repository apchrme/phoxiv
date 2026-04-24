CREATE TABLE olympiads (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    summary             TEXT NOT NULL,
    icon                TEXT NOT NULL DEFAULT '',
    tag                 TEXT NOT NULL CHECK(tag IN ('International', 'Regional', 'National', 'Open')),
    display_order       INTEGER NOT NULL DEFAULT 9999,
    description_md      TEXT,
    description_html    TEXT,
    -- stored as JSON objects: Record<string, { label: string }>
    year_file_types     TEXT NOT NULL DEFAULT '{}',
    problem_file_types  TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE years (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    olympiad_id TEXT    NOT NULL REFERENCES olympiads(id) ON DELETE CASCADE,
    year        INTEGER NOT NULL,
    notes       TEXT    NOT NULL DEFAULT '[]',  -- JSON: string[]
    extra_links TEXT    NOT NULL DEFAULT '[]',  -- JSON: { label: string, url: string }[]
    UNIQUE(olympiad_id, year)
);

CREATE TABLE year_files (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    year_id   INTEGER NOT NULL REFERENCES years(id) ON DELETE CASCADE,
    file_type TEXT    NOT NULL,  -- e.g. 'problems', 'theorySolutions'
    url       TEXT    NOT NULL,
    UNIQUE(year_id, file_type)
);

CREATE TABLE problems (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    year_id INTEGER NOT NULL REFERENCES years(id) ON DELETE CASCADE,
    number  TEXT    NOT NULL,  -- e.g. 'T1', 'E2'
    title   TEXT,
    UNIQUE(year_id, number)
);

CREATE TABLE problem_files (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    file_type  TEXT    NOT NULL,  -- e.g. 'problem', 'solution', 'markingScheme'
    url        TEXT    NOT NULL,
    UNIQUE(problem_id, file_type)
);