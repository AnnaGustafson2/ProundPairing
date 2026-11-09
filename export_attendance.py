import sqlite3, json, os
from datetime import date

DB_PATH = "roster.db"
CURRENT_YEAR = date.today().year

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA foreign_keys = ON;")


def date_to_term(d):
    """Same logic as dateToTerm in App.java."""
    year, month = CURRENT_YEAR, 9
    try:
        y, m, _ = d.split("-")
        year, month = int(y), int(m)
    except (AttributeError, ValueError):
        pass
    season = "Spring" if month <= 5 else "Summer" if month <= 8 else "Fall"
    return f"{season} {year}"


def build(pair_sql, judge_sql, attend_sql):
    """Each query returns (name columns..., event, event_date)."""
    links, judging, attendance = [], [], []
    names = set()

    def entry(**kw):
        d = kw.pop("date")
        return {**kw, "year": date_to_term(d), "date": d}

    # Pairs: a solo debater (partner_two NULL) has no link, but still gets a node
    for r in conn.execute(pair_sql):
        names.add(r["p1"])
        if r["p2"]:
            names.add(r["p2"])
            links.append(entry(source=r["p1"], target=r["p2"],
                               tournament=r["event"], date=r["event_date"]))

    for r in conn.execute(judge_sql) if judge_sql else []:
        names.add(r["name"])
        judging.append(entry(name=r["name"], tournament=r["event"], date=r["event_date"]))

    for r in conn.execute(attend_sql):
        names.add(r["name"])
        attendance.append(entry(name=r["name"], tournament=r["event"], date=r["event_date"]))

    nodes = []
    for m in conn.execute("SELECT name, experience_level, start_year FROM members ORDER BY name"):
        if m["name"] in names:
            nodes.append({
                "name": m["name"],
                "status": m["experience_level"],
                "start_year": m["start_year"],
                "years_on_team": CURRENT_YEAR - m["start_year"] + 1,
            })

    return {"nodes": nodes, "links": links, "judging": judging, "attendance": attendance}


def write(data, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"{path}: {len(data['nodes'])} members, {len(data['links'])} pairs, "
          f"{len(data['judging'])} judgings, {len(data['attendance'])} attendances")


# ---------- Practices: partners + rounds + attendance ----------
practice = build(
    pair_sql="""
        SELECT m1.name AS p1, m2.name AS p2,
               COALESCE(s.label, 'Practice') AS event, s.session_date AS event_date
        FROM partners p
        JOIN sessions s ON s.id = p.session_id
        JOIN members m1 ON m1.id = p.partner_one_id
        LEFT JOIN members m2 ON m2.id = p.partner_two_id
        ORDER BY s.session_date, p.id
    """,
    judge_sql="""
        SELECT m.name AS name,
               COALESCE(s.label, 'Practice') AS event, s.session_date AS event_date
        FROM round_judges rj
        JOIN sessions s ON s.id = rj.session_id
        JOIN members m ON m.id = rj.judge_id
        ORDER BY s.session_date, rj.round_id, rj.rowid
    """,
    attend_sql="""
        SELECT m.name AS name,
               COALESCE(s.label, 'Practice') AS event, s.session_date AS event_date
        FROM attendance a
        JOIN sessions s ON s.id = a.session_id
        JOIN members m ON m.id = a.member_id
        ORDER BY s.session_date, m.name
    """,
)
write(practice, "data/practice-pairings.json")

# ---------- Tournaments: tournament_partners + tournament_attendance ----------
# There is no judge table for tournaments, so "judging" is empty.
tournament = build(
    pair_sql="""
        SELECT m1.name AS p1, m2.name AS p2,
               t.name AS event, t.tournament_date AS event_date
        FROM tournament_partners tp
        JOIN tournaments t ON t.id = tp.tournament_id
        JOIN members m1 ON m1.id = tp.partner_one_id
        LEFT JOIN members m2 ON m2.id = tp.partner_two_id
        ORDER BY t.tournament_date, tp.id
    """,
    judge_sql=None,
    attend_sql="""
        SELECT m.name AS name,
               t.name AS event, t.tournament_date AS event_date
        FROM tournament_attendance ta
        JOIN tournaments t ON t.id = ta.tournament_id
        JOIN members m ON m.id = ta.member_id
        ORDER BY t.tournament_date, m.name
    """,
)
write(tournament, "data/tournament-pairings.json")