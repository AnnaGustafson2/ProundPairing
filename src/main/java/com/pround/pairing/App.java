package com.pround.pairing;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import io.javalin.Javalin;
import io.javalin.http.Context;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.lang.reflect.Type;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;

public class App {

    static final Gson gson = new Gson();
    public static final int CURRENT_YEAR = 2026;

    public static void main(String[] args) {

        Javalin app = Javalin.create(config -> {
            config.staticFiles.add(staticFiles -> {
                staticFiles.directory = ".";
                staticFiles.location = io.javalin.http.staticfiles.Location.EXTERNAL;
            });
        }).start(7070);

        app.exception(Exception.class, (e, ctx) -> {
            e.printStackTrace();
            ctx.status(500).json(new HealthResponse("error", e.toString()));
        });

        // Confirms Javalin + SQLite are wired up correctly.
        app.get("/api/health", ctx -> {
            try (Connection conn = Database.connect()) {
                ctx.json(new HealthResponse("ok", "database connected"));
            } catch (SQLException e) {
                ctx.status(500).json(new HealthResponse("error", e.getMessage()));
            }
        });

        app.get("/api/members/search", ctx -> {
            String q = ctx.queryParam("q");
            if (q == null || q.isBlank()) {
                ctx.json(List.of());
                return;
            }

            String sql = "SELECT name FROM members WHERE name LIKE ? ORDER BY name LIMIT 5";
            List<String> matches = new ArrayList<>();
            try (Connection conn = Database.connect();
                 PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, q + "%");
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        matches.add(rs.getString("name"));
                    }
                }
            } catch (SQLException e) {
                ctx.status(500).json(new HealthResponse("error", e.getMessage()));
                return;
            }
            ctx.json(matches);
        });

        app.get("/api/members", ctx -> {
            String sql = "SELECT id, name, experience_level, start_year FROM members ORDER BY name";
            List<MemberDTO> members = new ArrayList<>();
            try (Connection conn = Database.connect();
                 PreparedStatement stmt = conn.prepareStatement(sql);
                 ResultSet rs = stmt.executeQuery()) {

                while (rs.next()) {
                    MemberDTO m = new MemberDTO();
                    m.id = rs.getInt("id");
                    m.name = rs.getString("name");
                    m.experience_level = rs.getString("experience_level");
                    int sy = rs.getInt("start_year");
                    if (!rs.wasNull()) {
                        m.start_year = sy;
                        m.years_on_team = CURRENT_YEAR - sy + 1;
                    }
                    members.add(m);
                }
                ctx.json(members);

            } catch (SQLException e) {
                ctx.status(500).json(new HealthResponse("error", e.getMessage()));
            }
        });

        app.get("/api/attendance", App::getSessions);
        app.get("/api/attendance/{id}", App::getSessionDetails);
        app.post("/api/attendance", App::saveAttendance);

        // Tournament endpoints
        app.get("/api/tournaments", App::getTournaments);
        app.get("/api/tournaments/{id}", App::getTournamentDetails);
        app.post("/api/tournaments", App::saveTournament);

        // Statistics endpoints
        app.get("/api/statistics/attendance", App::getAttendanceStats);
        app.get("/api/statistics/tournament-attendance", App::getTournamentAttendanceStats);
        app.get("/api/statistics/pairings", App::getPairingsStats);

        System.out.println("Server running at http://localhost:7070");
    }
    static void getSessions(Context ctx) {
    String sql = """
        SELECT s.id, s.session_date, s.label,
               (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS attendee_count
        FROM sessions s
        ORDER BY s.session_date DESC, s.id DESC
    """;
    List<SessionSummaryDTO> list = new ArrayList<>();
    try (Connection conn = Database.connect();
         PreparedStatement stmt = conn.prepareStatement(sql);
         ResultSet rs = stmt.executeQuery()) {
        while (rs.next()) {
            SessionSummaryDTO item = new SessionSummaryDTO();
            item.id = rs.getLong("id");
            item.date = rs.getString("session_date");
            item.label = rs.getString("label");
            item.attendeeCount = rs.getInt("attendee_count");
            list.add(item);
        }
        ctx.json(list);
    } catch (SQLException e) {
        ctx.status(500).json(new HealthResponse("error", e.getMessage()));
    }
}

static void getSessionDetails(Context ctx) {
    long id;
    try {
        id = Long.parseLong(ctx.pathParam("id"));
    } catch (NumberFormatException e) {
        ctx.status(400).json(new HealthResponse("error", "Invalid session id"));
        return;
    }

    try (Connection conn = Database.connect()) {
        SessionDetailDTO detail = new SessionDetailDTO();

        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT id, session_date, label FROM sessions WHERE id = ?")) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    ctx.status(404).json(new HealthResponse("error", "Practice not found"));
                    return;
                }
                detail.id = rs.getLong("id");
                detail.date = rs.getString("session_date");
                detail.label = rs.getString("label");
            }
        }

        // member id -> name for everyone who attended
        Map<Integer, String> nameById = new LinkedHashMap<>();
        String attSql = """
            SELECT m.id, m.name
            FROM attendance a
            JOIN members m ON m.id = a.member_id
            WHERE a.session_id = ?
            ORDER BY m.name
        """;
        try (PreparedStatement ps = conn.prepareStatement(attSql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) nameById.put(rs.getInt("id"), rs.getString("name"));
            }
        }

        // round id -> judge member ids, in the order they were saved
        Map<Long, List<Integer>> judgesByRound = new HashMap<>();
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT round_id, judge_id FROM round_judges WHERE session_id = ? ORDER BY rowid")) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    judgesByRound.computeIfAbsent(rs.getLong("round_id"), k -> new ArrayList<>())
                                 .add(rs.getInt("judge_id"));
                }
            }
        }

        String roundSql = """
            SELECT r.id,
                t1.partner_one_id AS a1, t1.partner_two_id AS a2,
                t2.partner_one_id AS b1, t2.partner_two_id AS b2
            FROM rounds r
            LEFT JOIN partners t1 ON t1.id = r.team_one_id
            LEFT JOIN partners t2 ON t2.id = r.team_two_id
            WHERE r.session_id = ?
            ORDER BY r.id
        """;
        Set<Integer> judgeIds = new HashSet<>();
        try (PreparedStatement ps = conn.prepareStatement(roundSql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    RoundDTO r = new RoundDTO();
                    addName(r.side1, nameById, rs, "a1");
                    addName(r.side1, nameById, rs, "a2");
                    addName(r.side2, nameById, rs, "b1");
                    addName(r.side2, nameById, rs, "b2");

                    for (int judgeId : judgesByRound.getOrDefault(rs.getLong("id"), List.of())) {
                        judgeIds.add(judgeId);
                        r.judges.add(nameById.get(judgeId));
                    }
                    detail.rounds.add(r);
                }
            }
        }

        for (Map.Entry<Integer, String> e : nameById.entrySet()) {
            SessionAttendeeDTO a = new SessionAttendeeDTO();
            a.name = e.getValue();
            a.role = judgeIds.contains(e.getKey()) ? "Judge" : "Debate";
            detail.attendees.add(a);
        }

        ctx.json(detail);
    } catch (SQLException e) {
        ctx.status(500).json(new HealthResponse("error", e.getMessage()));
    }
}

static void addName(List<String> out, Map<Integer, String> nameById, ResultSet rs, String col)
        throws SQLException {
    int memberId = rs.getInt(col);
    if (!rs.wasNull()) out.add(nameById.get(memberId));
}
static void saveAttendance(Context ctx) {
    AttendanceRequest body = gson.fromJson(ctx.body(), AttendanceRequest.class);

    if (body == null || body.date == null || body.rounds == null || body.rounds.isEmpty()) {
        ctx.status(400).json(new HealthResponse("error", "date and at least one round are required"));
        return;
    }

    // Normalize missing fields, then ignore rounds with nobody in them
    for (RoundDTO r : body.rounds) {
        if (r.side1 == null) r.side1 = new ArrayList<>();
        if (r.side2 == null) r.side2 = new ArrayList<>();
        if (r.judges == null) r.judges = new ArrayList<>();
    }
    body.rounds.removeIf(r -> r.side1.isEmpty() && r.side2.isEmpty() && r.judges.isEmpty());
    if (body.rounds.isEmpty()) {
        ctx.status(400).json(new HealthResponse("error", "Place at least one person in a round"));
        return;
    }

    Set<String> allNames = new LinkedHashSet<>();
    for (int i = 0; i < body.rounds.size(); i++) {
        RoundDTO r = body.rounds.get(i);
        if (r.side1.size() > 2 || r.side2.size() > 2) {
            ctx.status(400).json(new HealthResponse("error", "Round " + (i + 1) + ": each side holds at most 2 debaters"));
            return;
        }
        for (String s : r.side1) allNames.add(s.trim());
        for (String s : r.judges) allNames.add(s.trim());
        for (String s : r.side2) allNames.add(s.trim());
    }

    try (Connection conn = Database.connect()) {
        // Must be set per connection, and BEFORE the transaction starts (it's a no-op inside one)
        try (Statement s = conn.createStatement()) {
            s.execute("PRAGMA foreign_keys = ON");
        }
        conn.setAutoCommit(false);

        try {
            // Resolve names -> member ids
            Map<String, Integer> nameToId = new HashMap<>();
            List<String> notFound = new ArrayList<>();
            try (PreparedStatement stmt = conn.prepareStatement("SELECT id FROM members WHERE name = ?")) {
                for (String name : allNames) {
                    stmt.setString(1, name);
                    try (ResultSet rs = stmt.executeQuery()) {
                        if (rs.next()) nameToId.put(name, rs.getInt("id"));
                        else notFound.add(name);
                    }
                }
            }
            if (!notFound.isEmpty()) {
                conn.rollback();
                AttendanceResponse response = new AttendanceResponse();
                response.notFound = notFound;
                ctx.status(400).json(response);
                return;
            }

            // Session row
            long sessionId;
            boolean updating = body.id != null && body.id > 0;
            if (updating) {
                sessionId = body.id;
                try (PreparedStatement stmt = conn.prepareStatement(
                        "UPDATE sessions SET session_date = ?, label = ? WHERE id = ?")) {
                    stmt.setString(1, body.date);
                    stmt.setString(2, body.label);
                    stmt.setLong(3, sessionId);
                    if (stmt.executeUpdate() == 0) {
                        conn.rollback();
                        ctx.status(404).json(new HealthResponse("error", "Practice not found"));
                        return;
                    }
                }
                // Child-first order because of the foreign keys
                for (String table : new String[] {"round_judges", "rounds", "partners", "attendance"}) {
                    try (PreparedStatement stmt = conn.prepareStatement(
                            "DELETE FROM " + table + " WHERE session_id = ?")) {
                        stmt.setLong(1, sessionId);
                        stmt.executeUpdate();
                    }
                }
            } else {
                try (PreparedStatement stmt = conn.prepareStatement(
                        "INSERT INTO sessions (session_date, label) VALUES (?, ?)")) {
                    stmt.setString(1, body.date);
                    stmt.setString(2, body.label);
                    stmt.executeUpdate();
                }
                sessionId = lastInsertId(conn);
            }

            // Attendance first: partners and rounds reference it
            try (PreparedStatement stmt = conn.prepareStatement(
                    "INSERT INTO attendance (session_id, member_id) VALUES (?, ?)")) {
                for (int memberId : new HashSet<>(nameToId.values())) {
                    stmt.setLong(1, sessionId);
                    stmt.setInt(2, memberId);
                    stmt.addBatch();
                }
                stmt.executeBatch();
            }

            // Teams, rounds and judges, inserted in on-screen order so ORDER BY id restores it
            try (PreparedStatement teamStmt = conn.prepareStatement(
                    "INSERT INTO partners (session_id, partner_one_id, partner_two_id) VALUES (?, ?, ?)");
            PreparedStatement roundStmt = conn.prepareStatement(
                    "INSERT INTO rounds (session_id, team_one_id, team_two_id) VALUES (?, ?, ?)");
            PreparedStatement judgeStmt = conn.prepareStatement(
                    "INSERT INTO round_judges (round_id, session_id, judge_id) VALUES (?, ?, ?)")) {

            for (RoundDTO r : body.rounds) {
                Long team1 = insertTeam(conn, teamStmt, sessionId, nameToId, r.side1);
                Long team2 = insertTeam(conn, teamStmt, sessionId, nameToId, r.side2);

                roundStmt.setLong(1, sessionId);
                if (team1 != null) roundStmt.setLong(2, team1); else roundStmt.setNull(2, java.sql.Types.INTEGER);
                if (team2 != null) roundStmt.setLong(3, team2); else roundStmt.setNull(3, java.sql.Types.INTEGER);
                roundStmt.executeUpdate();
                long roundId = lastInsertId(conn);

                for (String judge : r.judges) {
                    judgeStmt.setLong(1, roundId);
                    judgeStmt.setLong(2, sessionId);
                    judgeStmt.setInt(3, nameToId.get(judge.trim()));
                    judgeStmt.executeUpdate();
                }
            }
        }

            conn.commit();
            syncJsonFiles(conn);

            AttendanceResponse response = new AttendanceResponse();
            response.sessionId = sessionId;
            ctx.status(updating ? 200 : 201).json(response);

        } catch (SQLException e) {
            conn.rollback(); // nothing half-written if a trigger or FK fails
            // The triggers raise readable messages, e.g. "member is already paired in this session"
            ctx.status(400).json(new HealthResponse("error", e.getMessage()));
        }

    } catch (SQLException e) {
        ctx.status(500).json(new HealthResponse("error", e.getMessage()));
    }
}

static Long insertTeam(Connection conn, PreparedStatement stmt, long sessionId,
                       Map<String, Integer> nameToId, List<String> side) throws SQLException {
    if (side.isEmpty()) return null;
    stmt.setLong(1, sessionId);
    stmt.setInt(2, nameToId.get(side.get(0).trim()));
    if (side.size() > 1) {
        stmt.setInt(3, nameToId.get(side.get(1).trim()));
    } else {
        stmt.setNull(3, java.sql.Types.INTEGER);
    }
    stmt.executeUpdate();
    return lastInsertId(conn);
}

static long lastInsertId(Connection conn) throws SQLException {
    try (Statement s = conn.createStatement();
         ResultSet rs = s.executeQuery("SELECT last_insert_rowid()")) {
        rs.next();
        return rs.getLong(1);
    }
}
    static void getTournaments(Context ctx) {
        String sql = """
            SELECT t.id, t.name, t.tournament_date,
                (SELECT group_concat(special_description, ', ')
                    FROM tournament_descriptions td WHERE td.tournament_id = t.id) AS descriptions,
                (SELECT COUNT(*) FROM tournament_attendance ta WHERE ta.tournament_id = t.id) AS attendee_count,
                (SELECT COUNT(*) FROM tournament_partners tp WHERE tp.tournament_id = t.id) AS pair_count
            FROM tournaments t
            ORDER BY t.tournament_date DESC, t.name
        """;
        List<TournamentSummaryDTO> list = new ArrayList<>();
        try (Connection conn = Database.connect();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {

            while (rs.next()) {
                TournamentSummaryDTO item = new TournamentSummaryDTO();
                item.id = rs.getLong("id");
                item.name = rs.getString("name");
                item.date = rs.getString("tournament_date");
                item.description = rs.getString("descriptions");
                item.attendeeCount = rs.getInt("attendee_count");
                item.pairCount = rs.getInt("pair_count");
                list.add(item);
            }
            ctx.json(list);
        } catch (SQLException e) {
            ctx.status(500).json(new HealthResponse("error", e.getMessage()));
        }
    }

    static void getTournamentDetails(Context ctx) {
        long id;
        try {
            id = Long.parseLong(ctx.pathParam("id"));
        } catch (NumberFormatException e) {
            ctx.status(400).json(new HealthResponse("error", "Invalid tournament id"));
            return;
        }

        try (Connection conn = Database.connect()) {
            TournamentDetailDTO detail = new TournamentDetailDTO();

            String tourneySql = "SELECT id, name, tournament_date FROM tournaments WHERE id = ?";
            try (PreparedStatement ps = conn.prepareStatement(tourneySql)) {
                ps.setLong(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        detail.id = rs.getLong("id");
                        detail.name = rs.getString("name");
                        detail.date = rs.getString("tournament_date");
                    } else {
                        ctx.status(404).json(new HealthResponse("error", "Tournament not found"));
                        return;
                    }
                }
            }

            String descSql = "SELECT special_description FROM tournament_descriptions WHERE tournament_id = ? ORDER BY rowid";
            try (PreparedStatement ps = conn.prepareStatement(descSql)) {
                ps.setLong(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        detail.descriptions.add(rs.getString("special_description"));
                    }
                }
            }
            detail.description = String.join(", ", detail.descriptions);

            // Attendees
            String attSql = """
                SELECT m.id, m.name, m.experience_level, m.start_year
                FROM tournament_attendance ta
                JOIN members m ON m.id = ta.member_id
                WHERE ta.tournament_id = ?
                ORDER BY m.name
            """;
            try (PreparedStatement ps = conn.prepareStatement(attSql)) {
                ps.setLong(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        MemberDTO m = new MemberDTO();
                        m.id = rs.getInt("id");
                        m.name = rs.getString("name");
                        m.experience_level = rs.getString("experience_level");
                        int sy = rs.getInt("start_year");
                        if (!rs.wasNull()) {
                            m.start_year = sy;
                            m.years_on_team = CURRENT_YEAR - sy + 1;
                        }
                        detail.attendees.add(m);
                    }
                }
            }

            // Pairs
            String pairsSql = """
                SELECT tp.id,
                       m1.id AS p1_id, m1.name AS p1_name, m1.experience_level AS p1_exp, m1.start_year AS p1_sy,
                       m2.id AS p2_id, m2.name AS p2_name, m2.experience_level AS p2_exp, m2.start_year AS p2_sy
                FROM tournament_partners tp
                JOIN members m1 ON m1.id = tp.partner_one_id
                LEFT JOIN members m2 ON m2.id = tp.partner_two_id
                WHERE tp.tournament_id = ?
                ORDER BY tp.id
            """;
            try (PreparedStatement ps = conn.prepareStatement(pairsSql)) {
                ps.setLong(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        PairDetailDTO pair = new PairDetailDTO();

                        MemberDTO p1 = new MemberDTO();
                        p1.id = rs.getInt("p1_id");
                        p1.name = rs.getString("p1_name");
                        p1.experience_level = rs.getString("p1_exp");
                        int sy1 = rs.getInt("p1_sy");
                        if (!rs.wasNull()) {
                            p1.start_year = sy1;
                            p1.years_on_team = CURRENT_YEAR - sy1 + 1;
                        }
                        pair.partner1 = p1;

                        int p2Id = rs.getInt("p2_id");
                        if (!rs.wasNull()) {
                            MemberDTO p2 = new MemberDTO();
                            p2.id = p2Id;
                            p2.name = rs.getString("p2_name");
                            p2.experience_level = rs.getString("p2_exp");
                            int sy2 = rs.getInt("p2_sy");
                            if (!rs.wasNull()) {
                                p2.start_year = sy2;
                                p2.years_on_team = CURRENT_YEAR - sy2 + 1;
                            }
                            pair.partner2 = p2;
                        }
                        detail.pairs.add(pair);
                    }
                }
            }

            ctx.json(detail);

        } catch (SQLException e) {
            ctx.status(500).json(new HealthResponse("error", e.getMessage()));
        }
    }

    static void saveTournament(Context ctx) {
        TournamentRequest body = gson.fromJson(ctx.body(), TournamentRequest.class);

        if (body == null || body.name == null || body.name.isBlank() || body.date == null || body.date.isBlank()) {
            ctx.status(400).json(new HealthResponse("error", "Tournament name and date are required"));
            return;
        }

        try (Connection conn = Database.connect()) {
            conn.setAutoCommit(false);

            // Collect all names mentioned in attendees and pairs
            Set<String> allNames = new HashSet<>();
            if (body.attendees != null) {
                for (String a : body.attendees) {
                    if (a != null && !a.isBlank()) allNames.add(a.trim());
                }
            }

            if (body.pairs != null) {
                Set<String> seenInPairs = new HashSet<>();
                for (PairDTO p : body.pairs) {
                    if (p.partner1 == null || p.partner1.isBlank()) {
                        conn.rollback();
                        ctx.status(400).json(new HealthResponse("error", "Each team must have at least Partner 1"));
                        return;
                    }
                    String p1 = p.partner1.trim();
                    if (seenInPairs.contains(p1)) {
                        conn.rollback();
                        ctx.status(400).json(new HealthResponse("error", "Member is paired more than once in this tournament: " + p1));
                        return;
                    }
                    seenInPairs.add(p1);
                    allNames.add(p1);

                    if (p.partner2 != null && !p.partner2.isBlank()) {
                        String p2 = p.partner2.trim();
                        if (p1.equalsIgnoreCase(p2)) {
                            conn.rollback();
                            ctx.status(400).json(new HealthResponse("error", "A debater cannot be paired with themselves: " + p1));
                            return;
                        }
                        if (seenInPairs.contains(p2)) {
                            conn.rollback();
                            ctx.status(400).json(new HealthResponse("error", "Member is paired more than once in this tournament: " + p2));
                            return;
                        }
                        seenInPairs.add(p2);
                        allNames.add(p2);
                    }
                }
            }

            // Look up all member IDs
            Map<String, Integer> nameToId = new HashMap<>();
            List<String> notFound = new ArrayList<>();

            String lookupSql = "SELECT id, name FROM members WHERE name = ?";
            try (PreparedStatement stmt = conn.prepareStatement(lookupSql)) {
                for (String name : allNames) {
                    stmt.setString(1, name);
                    try (ResultSet rs = stmt.executeQuery()) {
                        if (rs.next()) {
                            nameToId.put(name, rs.getInt("id"));
                        } else {
                            notFound.add(name);
                        }
                    }
                }
            }

            if (!notFound.isEmpty()) {
                conn.rollback();
                TournamentResponse resp = new TournamentResponse();
                resp.notFound = notFound;
                resp.message = "Some members were not found in the roster";
                ctx.status(400).json(resp);
                return;
            }

            // Determine tournament ID
            long tournamentId;
            if (body.id != null && body.id > 0) {
                tournamentId = body.id;
                String updateTourney = "UPDATE tournaments SET name = ?, tournament_date = ? WHERE id = ?";
                try (PreparedStatement stmt = conn.prepareStatement(updateTourney)) {
                    stmt.setString(1, body.name.trim());
                    stmt.setString(2, body.date.trim());
                    stmt.setLong(3, tournamentId);
                    stmt.executeUpdate();
                }
            } else {
                // Check if tournament with identical name and date already exists
                String findSql = "SELECT id FROM tournaments WHERE name = ? AND tournament_date = ?";
                Long existingId = null;
                try (PreparedStatement stmt = conn.prepareStatement(findSql)) {
                    stmt.setString(1, body.name.trim());
                    stmt.setString(2, body.date.trim());
                    try (ResultSet rs = stmt.executeQuery()) {
                        if (rs.next()) {
                            existingId = rs.getLong("id");
                        }
                    }
                }

                if (existingId != null) {
                    tournamentId = existingId;
                } else {
                    String insertTourney = "INSERT INTO tournaments (name, tournament_date) VALUES (?, ?)";
                    try (PreparedStatement stmt = conn.prepareStatement(insertTourney)) {
                        stmt.setString(1, body.name.trim());
                        stmt.setString(2, body.date.trim());
                        stmt.executeUpdate();
                    }
                    try (Statement idStmt = conn.createStatement();
                         ResultSet keys = idStmt.executeQuery("SELECT last_insert_rowid()")) {
                        keys.next();
                        tournamentId = keys.getLong(1);
                    }
                }
            }

            // Handle special description
            Map<String, String> descMap = new LinkedHashMap<>();
            List<String> rawDescs = body.descriptions != null
                    ? body.descriptions
                    : (body.description != null ? List.of(body.description) : List.of());
            for (String raw : rawDescs) {
                if (raw == null) continue;
                for (String part : raw.split(",")) {
                    String d = part.trim();
                    if (!d.isEmpty()) descMap.putIfAbsent(d.toLowerCase(), d);
                }
            }
            
            String delDesc = "DELETE FROM tournament_descriptions WHERE tournament_id = ?";
            try (PreparedStatement stmt = conn.prepareStatement(delDesc)) {
                stmt.setLong(1, tournamentId);
                stmt.executeUpdate();
            }

            String insDesc = "INSERT INTO tournament_descriptions (tournament_id, special_description) VALUES (?, ?)";
            try (PreparedStatement stmt = conn.prepareStatement(insDesc)) {
                for (String d : descMap.values()) {
                    stmt.setLong(1, tournamentId);
                    stmt.setString(2, d);
                    stmt.addBatch();
                }
                stmt.executeBatch();
            }

            // Clear previous pairings & attendance for this tournament to cleanly replace with current submission
            String delPairs = "DELETE FROM tournament_partners WHERE tournament_id = ?";
            try (PreparedStatement stmt = conn.prepareStatement(delPairs)) {
                stmt.setLong(1, tournamentId);
                stmt.executeUpdate();
            }

            String delAtt = "DELETE FROM tournament_attendance WHERE tournament_id = ?";
            try (PreparedStatement stmt = conn.prepareStatement(delAtt)) {
                stmt.setLong(1, tournamentId);
                stmt.executeUpdate();
            }

            // Insert into tournament_attendance (union of all attendees and partners)
            String insAtt = "INSERT OR IGNORE INTO tournament_attendance (tournament_id, member_id) VALUES (?, ?)";
            try (PreparedStatement stmt = conn.prepareStatement(insAtt)) {
                for (String name : allNames) {
                    Integer mid = nameToId.get(name);
                    if (mid != null) {
                        stmt.setLong(1, tournamentId);
                        stmt.setInt(2, mid);
                        stmt.addBatch();
                    }
                }
                stmt.executeBatch();
            }

            // Insert tournament_partners
            if (body.pairs != null && !body.pairs.isEmpty()) {
                String insPairs = "INSERT INTO tournament_partners (tournament_id, partner_one_id, partner_two_id) VALUES (?, ?, ?)";
                try (PreparedStatement stmt = conn.prepareStatement(insPairs)) {
                    for (PairDTO p : body.pairs) {
                        Integer p1Id = nameToId.get(p.partner1.trim());
                        Integer p2Id = (p.partner2 != null && !p.partner2.isBlank()) ? nameToId.get(p.partner2.trim()) : null;

                        stmt.setLong(1, tournamentId);
                        stmt.setInt(2, p1Id);
                        if (p2Id != null) {
                            stmt.setInt(3, p2Id);
                        } else {
                            stmt.setNull(3, java.sql.Types.INTEGER);
                        }
                        stmt.addBatch();
                    }
                    stmt.executeBatch();
                }
            }

            conn.commit();

            // Sync static json files
            syncJsonFiles(conn);

            TournamentResponse resp = new TournamentResponse(tournamentId, "Tournament attendance and pairings saved successfully!");
            ctx.status(201).json(resp);

        } catch (SQLException e) {
            ctx.status(500).json(new HealthResponse("error", e.getMessage()));
        }
    }

    static void getAttendanceStats(Context ctx) {
        try (Connection conn = Database.connect()) {
            List<AttendanceStatDTO> stats = computeAttendanceStats(conn, "sessions", "attendance", "session_id", "total_sessions");
            ctx.json(stats);
        } catch (SQLException e) {
            ctx.status(500).json(new HealthResponse("error", e.getMessage()));
        }
    }

    static void getTournamentAttendanceStats(Context ctx) {
        try (Connection conn = Database.connect()) {
            List<AttendanceStatDTO> stats = computeAttendanceStats(conn, "tournaments", "tournament_attendance", "tournament_id", "total_tournaments");
            ctx.json(stats);
        } catch (SQLException e) {
            ctx.status(500).json(new HealthResponse("error", e.getMessage()));
        }
    }

    static List<AttendanceStatDTO> computeAttendanceStats(Connection conn, String eventTable, String attendTable, String eventCol, String totalKey) throws SQLException {
        int total = 0;
        try (Statement s = conn.createStatement();
             ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM " + eventTable)) {
            if (rs.next()) total = rs.getInt(1);
        }

        String sql = String.format("""
            SELECT m.id, m.name, m.experience_level, m.start_year,
                   (SELECT COUNT(*) FROM tournament_attendance ta WHERE ta.member_id = m.id) AS tournaments_attended,
                   COUNT(a.%s) AS attended
            FROM members m
            LEFT JOIN %s a ON a.member_id = m.id
            GROUP BY m.id
            HAVING COUNT(a.%s) > 0
            ORDER BY attended DESC, m.name
        """, eventCol, attendTable, eventCol);

        List<AttendanceStatDTO> list = new ArrayList<>();
        try (PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            while (rs.next()) {
                AttendanceStatDTO dto = new AttendanceStatDTO();
                dto.id = rs.getInt("id");
                dto.name = rs.getString("name");
                dto.experience_level = rs.getString("experience_level");
                int sy = rs.getInt("start_year");
                dto.start_year = sy;
                dto.years_on_team = CURRENT_YEAR - sy + 1;
                dto.tournaments_attended = rs.getInt("tournaments_attended");
                dto.attended = rs.getInt("attended");
                if (totalKey.equals("total_sessions")) {
                    dto.total_sessions = total;
                } else {
                    dto.total_tournaments = total;
                }
                dto.rate = total > 0 ? (double) dto.attended / total : 0.0;
                list.add(dto);
            }
        }
        return list;
    }

    static void getPairingsStats(Context ctx) {
        PairingsDataDTO data = new PairingsDataDTO();

        // 1. Load pairings.json if present
        File file = new File("data/pairings.json");
        if (file.exists()) {
            try (FileReader fr = new FileReader(file)) {
                Type type = new TypeToken<PairingsDataDTO>() {}.getType();
                PairingsDataDTO fromFile = gson.fromJson(fr, type);
                if (fromFile != null) {
                    if (fromFile.nodes != null) data.nodes.addAll(fromFile.nodes);
                    if (fromFile.links != null) data.links.addAll(fromFile.links);
                    if (fromFile.judging != null) data.judging.addAll(fromFile.judging);
                }
            } catch (IOException e) {
                System.err.println("Error reading pairings.json: " + e.getMessage());
            }
        }

        // 2. Query roster.db to merge existing and new tournament pairings and attendance
        try (Connection conn = Database.connect()) {
            // Map of all members in roster
            Map<String, MemberDTO> rosterMembers = new HashMap<>();
            String memSql = "SELECT id, name, experience_level, start_year FROM members";
            try (Statement s = conn.createStatement();
                 ResultSet rs = s.executeQuery(memSql)) {
                while (rs.next()) {
                    MemberDTO m = new MemberDTO();
                    m.id = rs.getInt("id");
                    m.name = rs.getString("name");
                    m.experience_level = rs.getString("experience_level");
                    int sy = rs.getInt("start_year");
                    if (!rs.wasNull()) {
                        m.start_year = sy;
                        m.years_on_team = CURRENT_YEAR - sy + 1;
                    }
                    rosterMembers.put(m.name, m);
                }
            }

            // Existing node index
            Map<String, PairingNodeDTO> nodeMap = new HashMap<>();
            for (PairingNodeDTO node : data.nodes) {
                nodeMap.put(node.name, node);
            }

            // Ensure every node in pairings has years_on_team and start_year
            for (PairingNodeDTO node : data.nodes) {
                MemberDTO rm = rosterMembers.get(node.name);
                if (rm != null) {
                    node.start_year = rm.start_year;
                    node.years_on_team = rm.years_on_team;
                    if (node.status == null && rm.experience_level != null) {
                        node.status = rm.experience_level;
                    }
                } else if (node.years_on_team == null) {
                    node.years_on_team = 2; // Default for past member
                }
            }

            // Existing links set to avoid duplicates
            Set<String> existingLinkKeys = new HashSet<>();
            for (PairingLinkDTO link : data.links) {
                String key = link.source + "|" + link.target + "|" + link.tournament + "|" + link.year;
                existingLinkKeys.add(key);
            }

            // Add DB tournament pairs to links
            String pairSql = """
                SELECT t.name AS tourney_name, t.tournament_date, m1.name AS p1_name, m2.name AS p2_name
                FROM tournament_partners tp
                JOIN tournaments t ON t.id = tp.tournament_id
                JOIN members m1 ON m1.id = tp.partner_one_id
                JOIN members m2 ON m2.id = tp.partner_two_id
            """;
            try (Statement s = conn.createStatement();
                 ResultSet rs = s.executeQuery(pairSql)) {
                while (rs.next()) {
                    String tourney = rs.getString("tourney_name");
                    String date = rs.getString("tournament_date");
                    String p1 = rs.getString("p1_name");
                    String p2 = rs.getString("p2_name");
                    String term = dateToTerm(date);

                    String key1 = p1 + "|" + p2 + "|" + tourney + "|" + term;
                    String key2 = p2 + "|" + p1 + "|" + tourney + "|" + term;
                    if (!existingLinkKeys.contains(key1) && !existingLinkKeys.contains(key2)) {
                        PairingLinkDTO l = new PairingLinkDTO();
                        l.source = p1;
                        l.target = p2;
                        l.tournament = tourney;
                        l.year = term;
                        data.links.add(l);
                        existingLinkKeys.add(key1);
                    }

                    // Ensure nodes exist for p1 and p2
                    for (String name : List.of(p1, p2)) {
                        if (!nodeMap.containsKey(name)) {
                            PairingNodeDTO newNode = new PairingNodeDTO();
                            newNode.name = name;
                            MemberDTO rm = rosterMembers.get(name);
                            if (rm != null) {
                                newNode.status = rm.experience_level;
                                newNode.start_year = rm.start_year;
                                newNode.years_on_team = rm.years_on_team;
                            }
                            data.nodes.add(newNode);
                            nodeMap.put(name, newNode);
                        }
                    }
                }
            }

            // Add DB tournament attendance
            String attSql = """
                SELECT t.name AS tourney_name, t.tournament_date, m.name AS mem_name
                FROM tournament_attendance ta
                JOIN tournaments t ON t.id = ta.tournament_id
                JOIN members m ON m.id = ta.member_id
            """;
            try (Statement s = conn.createStatement();
                 ResultSet rs = s.executeQuery(attSql)) {
                while (rs.next()) {
                    String tourney = rs.getString("tourney_name");
                    String date = rs.getString("tournament_date");
                    String mem = rs.getString("mem_name");
                    String term = dateToTerm(date);

                    PairingAttendanceDTO att = new PairingAttendanceDTO();
                    att.name = mem;
                    att.tournament = tourney;
                    att.year = term;
                    data.attendance.add(att);

                    if (!nodeMap.containsKey(mem)) {
                        PairingNodeDTO newNode = new PairingNodeDTO();
                        newNode.name = mem;
                        MemberDTO rm = rosterMembers.get(mem);
                        if (rm != null) {
                            newNode.status = rm.experience_level;
                            newNode.start_year = rm.start_year;
                            newNode.years_on_team = rm.years_on_team;
                        }
                        data.nodes.add(newNode);
                        nodeMap.put(mem, newNode);
                    }
                }
            }

        } catch (SQLException e) {
            System.err.println("Error fetching DB pairings: " + e.getMessage());
        }

        ctx.json(data);
    }

    public static String dateToTerm(String date) {
        if (date == null || date.isBlank()) return "Fall " + CURRENT_YEAR;
        int year = CURRENT_YEAR;
        int month = 9;
        try {
            if (date.contains("-")) {
                String[] parts = date.split("-");
                year = Integer.parseInt(parts[0]);
                month = Integer.parseInt(parts[1]);
            } else if (date.contains("/")) {
                String[] parts = date.split("/");
                month = Integer.parseInt(parts[0]);
                year = Integer.parseInt(parts[2]);
            }
        } catch (Exception ignored) {}

        String season;
        if (month >= 1 && month <= 5) {
            season = "Spring";
        } else if (month >= 6 && month <= 8) {
            season = "Summer";
        } else {
            season = "Fall";
        }
        return season + " " + year;
    }

    public static void syncJsonFiles(Connection conn) {
        try {
            List<AttendanceStatDTO> att = computeAttendanceStats(conn, "sessions", "attendance", "session_id", "total_sessions");
            List<AttendanceStatDTO> tourney = computeAttendanceStats(conn, "tournaments", "tournament_attendance", "tournament_id", "total_tournaments");

            File dataDir = new File("data");
            if (!dataDir.exists()) dataDir.mkdirs();

            try (FileWriter fw = new FileWriter("data/attendance.json")) {
                gson.toJson(att, fw);
            }
            try (FileWriter fw = new FileWriter("data/tournament-attendance.json")) {
                gson.toJson(tourney, fw);
            }
        } catch (Exception e) {
            System.err.println("Error syncing JSON files: " + e.getMessage());
        }
    }

    // DTO Classes (public fields for Jackson compatibility)
    public static class HealthResponse {
        public String status;
        public String message;

        public HealthResponse(String status, String message) {
            this.status = status;
            this.message = message;
        }
    }

    public static class AttendanceRequest {
        public Long id;
        public String date;
        public String label;
        public List<RoundDTO> rounds;
    }

    public static class RoundDTO {
        public List<String> side1 = new ArrayList<>();
        public List<String> judges = new ArrayList<>();
        public List<String> side2 = new ArrayList<>();
    }

    public static class SessionDetailDTO {
        public long id;
        public String date;
        public String label;
        public List<RoundDTO> rounds = new ArrayList<>();
        public List<SessionAttendeeDTO> attendees = new ArrayList<>();
    }

    public static class TournamentRequest {
        public Long id;
        public String name;
        public String date;
        public String description;
        public List<String> descriptions;
        public List<String> attendees;
        public List<PairDTO> pairs;
    }

    public static class PairDTO {
        public String partner1;
        public String partner2;
    }

    public static class TournamentResponse {
        public Long tournamentId;
        public String message;
        public List<String> notFound;

        public TournamentResponse() {}
        public TournamentResponse(Long tournamentId, String message) {
            this.tournamentId = tournamentId;
            this.message = message;
        }
    }

    public static class TournamentSummaryDTO {
        public long id;
        public String name;
        public String date;
        public String description;
        public int attendeeCount;
        public int pairCount;
    }

    public static class TournamentDetailDTO {
        public long id;
        public String name;
        public String date;
        public String description;
        public List<String> descriptions = new ArrayList<>();
        public List<MemberDTO> attendees = new ArrayList<>();
        public List<PairDetailDTO> pairs = new ArrayList<>();
    }

    public static class PairDetailDTO {
        public MemberDTO partner1;
        public MemberDTO partner2;
    }

    public static class MemberDTO {
        public int id;
        public String name;
        public String experience_level;
        public Integer start_year;
        public Integer years_on_team;
    }

    public static class AttendanceStatDTO {
        public int id;
        public String name;
        public String experience_level;
        public int start_year;
        public int years_on_team;
        public int tournaments_attended;
        public int attended;
        public int total_sessions;
        public int total_tournaments;
        public double rate;
    }

    public static class PairingsDataDTO {
        public List<PairingNodeDTO> nodes = new ArrayList<>();
        public List<PairingLinkDTO> links = new ArrayList<>();
        public List<PairingJudgingDTO> judging = new ArrayList<>();
        public List<PairingAttendanceDTO> attendance = new ArrayList<>();
    }

    public static class PairingNodeDTO {
        public String name;
        public String status;
        public String gender;
        public Integer start_year;
        public Integer years_on_team;
    }

    public static class PairingLinkDTO {
        public String source;
        public String target;
        public String tournament;
        public String year;
        public String date;
    }

    public static class PairingJudgingDTO {
        public String name;
        public String tournament;
        public String year;
        public String date;
    }

    public static class PairingAttendanceDTO {
        public String name;
        public String tournament;
        public String year;
        public String date;
    }

    public static class SessionSummaryDTO {
        public long id;
        public String date;
        public String label;
        public int attendeeCount;
    }
    public static class AttendanceResponse {
        public Long sessionId;
        public List<String> notFound;
    }

    public static class SessionAttendeeDTO {
        public String name;
        public String role;
    }
}
