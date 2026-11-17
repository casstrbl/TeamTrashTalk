package main.java.trashtalk.wastemonitoring.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.service.LoginService;

// POST /api/admin/zones/assign {"zone": "C", "triBinIDs": [12, 13, 14]}
// puts every listed bin in one zone at once (the zones map draws an area and sends what's inside). editors only
public class ZoneController implements HttpHandler {

    static final int MAX_BINS = 1000;

    private final LoginService loginService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private record AssignRequest(String zone, List<Integer> triBinIDs) {
    }

    public ZoneController(LoginService loginService) {
        this.loginService = loginService;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }
        String path = exchange.getRequestURI().getPath().replaceAll("/+$", "");
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()) || !"/api/admin/zones/assign".equals(path)) {
            send(exchange, 404, Map.of("error", "Zone route not found"));
            return;
        }
        if (!isEditor(exchange)) {
            return;
        }

        AssignRequest request;
        try {
            request = objectMapper.readValue(exchange.getRequestBody(), AssignRequest.class);
        } catch (IOException e) {
            send(exchange, 400, Map.of("error", "Invalid request body"));
            return;
        }

        String zone = cleanZone(request.zone());
        if (zone == null) {
            send(exchange, 400, Map.of("error", "Zone must be one letter, A to Z"));
            return;
        }
        Set<Integer> ids = new LinkedHashSet<>();
        if (request.triBinIDs() != null) {
            for (Integer id : request.triBinIDs()) {
                if (id != null && id > 0) {
                    ids.add(id);
                }
            }
        }
        if (ids.isEmpty() || ids.size() > MAX_BINS) {
            send(exchange, 400, Map.of("error", "Pick between 1 and " + MAX_BINS + " bins"));
            return;
        }

        try {
            int updated = assign(zone, ids);
            send(exchange, 200, Map.of("message", "Moved " + updated + " bins to Zone " + zone, "zone", zone, "updated", updated));
        } catch (SQLException e) {
            send(exchange, 500, Map.of("error", "Could not update zones"));
        }
    }

    // one letter, upper case, or null if it isn't one
    static String cleanZone(String zone) {
        if (zone == null) {
            return null;
        }
        String clean = zone.trim().replaceFirst("(?i)^zone\\s*", "").toUpperCase(Locale.ROOT);
        return clean.matches("[A-Z]") ? clean : null;
    }

    private int assign(String zone, Set<Integer> ids) throws SQLException {
        try (Connection connection = DatabaseConfig.getConnection()) {
            connection.setAutoCommit(false);
            try (PreparedStatement statement = connection.prepareStatement("UPDATE triBins SET zone = ? WHERE triBinID = ?")) {
                for (int id : ids) {
                    statement.setString(1, zone);
                    statement.setInt(2, id);
                    statement.addBatch();
                }
                int updated = 0;
                for (int count : statement.executeBatch()) {
                    // some drivers report SUCCESS_NO_INFO (-2) instead of a count
                    updated += count > 0 ? count : count == java.sql.Statement.SUCCESS_NO_INFO ? 1 : 0;
                }
                connection.commit();
                return updated;
            } catch (SQLException e) {
                connection.rollback();
                throw e;
            }
        }
    }

    private boolean isEditor(HttpExchange exchange) throws IOException {
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            send(exchange, 401, Map.of("error", "Login required"));
            return false;
        }
        try {
            if (loginService.editorForToken(authorization.substring("Bearer ".length()).trim()) == null) {
                send(exchange, 403, Map.of("error", "Editor access required"));
                return false;
            }
            return true;
        } catch (SQLException e) {
            send(exchange, 500, Map.of("error", "Unable to verify login"));
            return false;
        }
    }

    private void send(HttpExchange exchange, int status, Object body) throws IOException {
        byte[] bytes = objectMapper.writeValueAsString(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }
}
