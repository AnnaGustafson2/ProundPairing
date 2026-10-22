import sqlite3, json

QUERY = """
SELECT m.id, m.name, m.experience_level, m.years_on_team,
       COUNT(a.session_id) AS attended
FROM members m
LEFT JOIN attendance a ON a.member_id = m.id
GROUP BY m.id
ORDER BY attended DESC, m.name
"""

conn = sqlite3.connect("roster.db")
conn.row_factory = sqlite3.Row
total = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
rows = [dict(r) for r in conn.execute(QUERY)]

# Reuse gender from the graph's nodes, matched on a normalized name.
norm = lambda s: " ".join(s.lower().split())
with open("web/data/pairings.json") as f:
    gender = {norm(n["name"]): n["gender"] for n in json.load(f)["nodes"]}

missing = []
for r in rows:
    r["gender"] = gender.get(norm(r["name"]))
    r["total_sessions"] = total
    r["rate"] = r["attended"] / total if total else 0
    if r["gender"] is None:
        missing.append(r["name"])

with open("web/data/attendance.json", "w") as f:
    json.dump(rows, f, indent=2)

print(f"Exported {len(rows)} members, {total} sessions.")
if missing:
    print("No gender match for:", ", ".join(missing))