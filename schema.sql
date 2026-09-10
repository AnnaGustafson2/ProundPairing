CREATE TABLE members (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	experience_level TEXT NOT NULL CHECK (experience_level IN ('Varsity', 'Novice', 'Dino')),
	years_on_team INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date TEXT NOT NULL,         -- store as 'YYYY-MM-DD'
    label TEXT
);

CREATE TABLE attendance (
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    member_id INTEGER NOT NULL REFERENCES members(id),
    PRIMARY KEY (session_id, member_id)
);