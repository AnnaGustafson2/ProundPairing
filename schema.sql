CREATE TABLE members (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	experience_level TEXT NOT NULL CHECK (experience_level IN ('Varsity', 'Novice', 'Dino')),
	years_on_team INTEGER NOT NULL DEFAULT 1
);
