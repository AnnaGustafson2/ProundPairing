import sqlite3, json
from datetime import date

conn = sqlite3.connect("roster.db")
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA foreign_keys = ON;")

CURRENT_YEAR = date.today().year

def export(event_table, attend_table, event_col, total_key, out_path):
    total = conn.execute(f"SELECT COUNT(*) FROM {event_table}").fetchone()[0]
    rows = [
        dict(r)
        for r in conn.execute(f"""
            SELECT m.id, m.name, m.experience_level, m.start_year,
                   COUNT(a.{event_col}) AS attended
            FROM members m
            LEFT JOIN {attend_table} a ON a.member_id = m.id
            GROUP BY m.id
            HAVING COUNT(a.{event_col}) > 0
            ORDER BY attended DESC, m.name
        """)
    ]
    for r in rows:
        r[total_key] = total
        r["rate"] = r["attended"] / total if total else 0
        r["years_on_team"] = CURRENT_YEAR - r["start_year"] + 1

    with open(out_path, "w") as f:
        json.dump(rows, f, indent=2)
    print(f"{out_path}: {len(rows)} members, {total} {event_table}.")