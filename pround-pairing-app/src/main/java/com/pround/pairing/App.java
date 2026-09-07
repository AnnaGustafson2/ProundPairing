package com.pround.pairing;

import com.google.gson.Gson;
import io.javalin.Javalin;
import io.javalin.http.Context;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class App {

    static final Gson gson = new Gson();

    public static void main(String[] args) {

        Javalin app = Javalin.create(config -> {
            config.staticFiles.add(staticFiles -> {
                staticFiles.directory = "web";
                staticFiles.location = io.javalin.http.staticfiles.Location.EXTERNAL;
            });
        }).start(7070);

        app.get("/api/members", App::getMembers);

        app.post("/api/sessions", App::createSession);
        app.get("/api/sessions/{id}", App::getSession);

        app.post("/api/sessions/{id}/constraints", App::addConstraint);
        app.delete("/api/sessions/{id}/constraints/{constraintId}", App::deleteConstraint);

        app.post("/api/sessions/{id}/generate", App::generateGroups);

        System.out.println("Server running at http://localhost:7070");
    }

    static void getMembers(Context ctx) {
        List<Member> members = new ArrayList<>();
        String sql = "SELECT id, name, experience_level, years_on_team " +
                     "FROM members ORDER BY name";

        try (Connection conn = Database.connect();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {

            while (rs.next()) {
                Member m = new Member();
                m.id = rs.getInt("id");
                m.name = rs.getString("name");
                m.experienceLevel = rs.getString("experience_level");
                m.yearsOnTeam = rs.getInt("years_on_team");
                members.add(m);
            }
            ctx.json(members);

        } catch (SQLException e) {
            ctx.status(500).json(errorBody("Database error: " + e.getMessage()));
        }
    }

    static void createSession(Context ctx) {
        SessionRequest body = gson.fromJson(ctx.body(), SessionRequest.class);

        if (body == null || body.date == null || body.attendeeIds == null || body.attendeeIds.isEmpty()) {
            ctx.status(400).json(errorBody("date and attendeeIds are required"));
            return;
        }

        try (Connection conn = Database.connect()) {
            conn.setAutoCommit(false);

            long sessionId;
            String insertSession = "INSERT INTO sessions (session_date, label) VALUES (?, ?)";
            try (PreparedStatement stmt = conn.prepareStatement(insertSession)) {
                stmt.setString(1, body.date);
                stmt.setString(2, body.label);
                stmt.executeUpdate();
            }
            try (Statement idStmt = conn.createStatement();
                ResultSet keys = idStmt.executeQuery("SELECT last_insert_rowid()")) {
                keys.next();
                sessionId = keys.getLong(1);
            }

            String insertAttendance = "INSERT INTO attendance (session_id, member_id) VALUES (?, ?)";
            try (PreparedStatement stmt = conn.prepareStatement(insertAttendance)) {
                for (int memberId : body.attendeeIds) {
                    stmt.setLong(1, sessionId);
                    stmt.setInt(2, memberId);
                    stmt.addBatch();
                }
                stmt.executeBatch();
            }

            conn.commit();

            SessionCreatedResponse response = new SessionCreatedResponse();
            response.sessionId = sessionId;
            ctx.status(201).json(response);

        } catch (SQLException e) {
            ctx.status(500).json(errorBody("Database error: " + e.getMessage()));
        }
    }

    static void getSession(Context ctx) {
        int sessionId = Integer.parseInt(ctx.pathParam("id"));

        try (Connection conn = Database.connect()) {

            SessionDetail detail = new SessionDetail();

            String sessSql = "SELECT id, session_date, label FROM sessions WHERE id = ?";
            try (PreparedStatement stmt = conn.prepareStatement(sessSql)) {
                stmt.setInt(1, sessionId);
                try (ResultSet rs = stmt.executeQuery()) {
                    if (!rs.next()) {
                        ctx.status(404).json(errorBody("Session not found"));
                        return;
                    }
                    detail.id = rs.getInt("id");
                    detail.date = rs.getString("session_date");
                    detail.label = rs.getString("label");
                }
            }

            List<Member> attendees = new ArrayList<>();
            String attSql = "SELECT m.id, m.name, m.experience_level, m.years_on_team " +
                             "FROM attendance a JOIN members m ON a.member_id = m.id " +
                             "WHERE a.session_id = ? ORDER BY m.name";
            try (PreparedStatement stmt = conn.prepareStatement(attSql)) {
                stmt.setInt(1, sessionId);
                try (ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        Member m = new Member();
                        m.id = rs.getInt("id");
                        m.name = rs.getString("name");
                        m.experienceLevel = rs.getString("experience_level");
                        m.yearsOnTeam = rs.getInt("years_on_team");
                        attendees.add(m);
                    }
                }
            }
            detail.attendees = attendees;

            List<ConstraintDTO> constraints = new ArrayList<>();
            String conSql = "SELECT id, session_id, type, member_a_id, member_b_id " +
                             "FROM constraints WHERE session_id = ? OR session_id IS NULL";
            try (PreparedStatement stmt = conn.prepareStatement(conSql)) {
                stmt.setInt(1, sessionId);
                try (ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        ConstraintDTO c = new ConstraintDTO();
                        c.id = rs.getInt("id");
                        c.sessionId = rs.getObject("session_id") == null ? null : rs.getInt("session_id");
                        c.type = rs.getString("type");
                        c.memberAId = rs.getInt("member_a_id");
                        c.memberBId = rs.getInt("member_b_id");
                        constraints.add(c);
                    }
                }
            }
            detail.constraints = constraints;

            ctx.json(detail);

        } catch (SQLException e) {
            ctx.status(500).json(errorBody("Database error: " + e.getMessage()));
        }
    }

    static void addConstraint(Context ctx) {
        int sessionId = Integer.parseInt(ctx.pathParam("id"));
        ConstraintRequest body = gson.fromJson(ctx.body(), ConstraintRequest.class);

        if (body == null || body.type == null || !(body.type.equals("PAIR") || body.type.equals("AVOID"))) {
            ctx.status(400).json(errorBody("type must be PAIR or AVOID"));
            return;
        }
        if (body.memberAId == body.memberBId) {
            ctx.status(400).json(errorBody("memberAId and memberBId must be different people"));
            return;
        }

        String sql = "INSERT INTO constraints (session_id, type, member_a_id, member_b_id) VALUES (?, ?, ?, ?)";
        try (Connection conn = Database.connect()) {

            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                stmt.setInt(1, sessionId);
                stmt.setString(2, body.type);
                stmt.setInt(3, body.memberAId);
                stmt.setInt(4, body.memberBId);
                stmt.executeUpdate();
            }

            try (Statement idStmt = conn.createStatement();
                ResultSet keys = idStmt.executeQuery("SELECT last_insert_rowid()")) {
                keys.next();
                ConstraintCreatedResponse response = new ConstraintCreatedResponse();
                response.constraintId = keys.getLong(1);
                ctx.status(201).json(response);
            }

        } catch (SQLException e) {
            ctx.status(500).json(errorBody("Database error: " + e.getMessage()));
        }
}

    static void deleteConstraint(Context ctx) {
        int constraintId = Integer.parseInt(ctx.pathParam("constraintId"));

        String sql = "DELETE FROM constraints WHERE id = ?";
        try (Connection conn = Database.connect();
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            stmt.setInt(1, constraintId);
            int rows = stmt.executeUpdate();

            if (rows == 0) {
                ctx.status(404).json(errorBody("Constraint not found"));
            } else {
                ctx.status(204);
            }

        } catch (SQLException e) {
            ctx.status(500).json(errorBody("Database error: " + e.getMessage()));
        }
    }

    static void generateGroups(Context ctx) {
    int sessionId = Integer.parseInt(ctx.pathParam("id"));

    try (Connection conn = Database.connect()) {

        // Load attendees
        List<Member> attendees = new ArrayList<>();
        String attSql = "SELECT m.id, m.name, m.experience_level, m.years_on_team " +
                         "FROM attendance a JOIN members m ON a.member_id = m.id " +
                         "WHERE a.session_id = ? ORDER BY m.name";
        try (PreparedStatement stmt = conn.prepareStatement(attSql)) {
            stmt.setInt(1, sessionId);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    Member m = new Member();
                    m.id = rs.getInt("id");
                    m.name = rs.getString("name");
                    m.experienceLevel = rs.getString("experience_level");
                    m.yearsOnTeam = rs.getInt("years_on_team");
                    attendees.add(m);
                }
            }
        }

        // Load constraints (session-specific + permanent ones)
        List<GroupingEngine.Constraint> constraints = new ArrayList<>();
        String conSql = "SELECT type, member_a_id, member_b_id " +
                         "FROM constraints WHERE session_id = ? OR session_id IS NULL";
        try (PreparedStatement stmt = conn.prepareStatement(conSql)) {
            stmt.setInt(1, sessionId);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    GroupingEngine.Constraint c = new GroupingEngine.Constraint();
                    c.type = rs.getString("type");
                    c.memberAId = rs.getInt("member_a_id");
                    c.memberBId = rs.getInt("member_b_id");
                    constraints.add(c);
                }
            }
        }

        List<GroupingEngine.Group> groups = GroupingEngine.generateGroups(attendees, constraints);
        ctx.json(groups);

    } catch (SQLException e) {
        ctx.status(500).json(errorBody("Database error: " + e.getMessage()));
    }
}
    static Object errorBody(String message) {
        ErrorResponse err = new ErrorResponse();
        err.error = message;
        return err;
    }

    static class SessionRequest {
        String date;
        String label;
        List<Integer> attendeeIds;
    }

    static class SessionCreatedResponse {
        public long sessionId;
    }

    static class SessionDetail {
        public int id;
        public String date;
        public String label;
        public List<Member> attendees;
        public List<ConstraintDTO> constraints;
    }

    static class ConstraintRequest {
        String type;
        int memberAId;
        int memberBId;
    }

    static class ConstraintDTO {
        int id;
        Integer sessionId;
        String type;
        int memberAId;
        int memberBId;
    }

    static class ConstraintCreatedResponse {
        long constraintId;
    }

    static class ErrorResponse {
        String error;
    }
}