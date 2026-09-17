package com.pround.pairing;

import io.javalin.Javalin;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import java.util.List;
import java.util.ArrayList;

public class App {

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

        System.out.println("Server running at http://localhost:7070");
    }

    static class HealthResponse {
        public String status;
        public String message;

        public HealthResponse(String status, String message) {
            this.status = status;
            this.message = message;
        }
    }
}