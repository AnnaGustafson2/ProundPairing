package com.pround.pairing;

import com.google.gson.Gson;
import io.javalin.Javalin;
import io.javalin.http.Context;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

import java.util.List;
import java.util.ArrayList;

public class App {

    static final Gson gson = new Gson();

    public static void main(String[] args) {

        Javalin app = Javalin.create(config -> {
            config.staticFiles.add(staticFiles -> {
                staticFiles.directory = "web";
                staticFiles.location = io.javalin.http.staticfiles.Location.EXTERNAL;
            });
        }).start(7070);

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
            }
            ctx.json(matches);
        });

        app.post("/api/attendance", App::saveAttendance);

        System.out.println("Server running at http://localhost:7070");
    }

    static void saveAttendance(Context ctx) {
        AttendanceRequest body = gson.fromJson(ctx.body(), AttendanceRequest.class);

        if (body == null || body.date == null || body.names == null || body.names.isEmpty()) {
            ctx.status(400).json(new HealthResponse("error", "date and names are required"));
            return;
        }

        try (Connection conn = Database.connect()) {
            conn.setAutoCommit(false);

            List<Integer> matchedIds = new ArrayList<>();
            List<String> notFound = new ArrayList<>();

            String lookupSql = "SELECT id FROM members WHERE name = ?";
            try (PreparedStatement stmt = conn.prepareStatement(lookupSql)) {
                for (String name : body.names) {
                    stmt.setString(1, name.trim());
                    try (ResultSet rs = stmt.executeQuery()) {
                        if (rs.next()) {
                            matchedIds.add(rs.getInt("id"));
                        } else {
                            notFound.add(name);
                        }
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
                for (int memberId : matchedIds) {
                    stmt.setLong(1, sessionId);
                    stmt.setInt(2, memberId);
                    stmt.addBatch();
                }
                stmt.executeBatch();
            }

            conn.commit();

            AttendanceResponse response = new AttendanceResponse();
            response.sessionId = sessionId;
            ctx.status(201).json(response);

        } catch (SQLException e) {
            ctx.status(500).json(new HealthResponse("error", e.getMessage()));
        }
    }

    static class HealthResponse {
        public String status;
        public String message;

        public HealthResponse(String status, String message) {
            this.status = status;
            this.message = message;
        }
    }

    static class AttendanceRequest {
        String date;
        String label;
        List<String> names;
    }

    static class AttendanceResponse {
        public Long sessionId;
        public List<String> notFound;
    }
}