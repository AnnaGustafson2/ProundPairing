PRAGMA foreign_keys = ON;

CREATE TABLE members (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	experience_level TEXT NOT NULL CHECK (experience_level IN ('Varsity', 'Novice', 'Dino')),
	start_year INTEGER NOT NULL
);

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date TEXT NOT NULL,
    label TEXT
);

CREATE TABLE attendance (
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    member_id INTEGER NOT NULL REFERENCES members(id),
    PRIMARY KEY (session_id, member_id)
);

CREATE TABLE tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tournament_date TEXT NOT NULL
);

CREATE TABLE tournament_description (
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
    special_description TEXT,
    PRIMARY KEY (tournament_id, special_description)
);

CREATE TABLE tournament_attendance (
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
    member_id INTEGER NOT NULL REFERENCES members(id),
    PRIMARY KEY (tournament_id, member_id)
);

CREATE TABLE tournament_partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
    partner_one_id INTEGER NOT NULL REFERENCES members(id),
    partner_two_id INTEGER REFERENCES members(id),
    CHECK (partner_two_id IS NULL OR partner_one_id <> partner_two_id),
    UNIQUE (tournament_id, partner_one_id),
    UNIQUE (tournament_id, partner_two_id)
);

CREATE TABLE partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    partner_one_id INTEGER NOT NULL REFERENCES members(id),
    partner_two_id INTEGER REFERENCES members(id),
    CHECK (partner_two_id IS NULL OR partner_one_id <> partner_two_id),
    UNIQUE (session_id, partner_one_id),
    UNIQUE (session_id, partner_two_id)
);

CREATE TABLE rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    team_one_id INTEGER NOT NULL REFERENCES partners(id),
    team_two_id INTEGER NOT NULL REFERENCES partners(id),
    judge_id INTEGER REFERENCES members(id),
    CHECK (team_one_id <> team_two_id)
);