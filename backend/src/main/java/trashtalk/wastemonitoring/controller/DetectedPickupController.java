package main.java.trashtalk.wastemonitoring.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.dto.TriBinResponse;
import main.java.trashtalk.wastemonitoring.service.PickupDetector;

// GET /api/pickups/detected?days=7 -> pickups found in the sensor readings, newest first.
// read-only like /api/tribins, so the pickup list needs no buttons
public class DetectedPickupController implements HttpHandler {

    static final int DEFAULT_DAYS = 7;
    static final int MAX_DAYS = 31;
    static final int MAX_PICKUPS = 200;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private record Station(String location, String zone) {
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            send(exchange, 405, Map.of("error", "Method not allowed"));
            return;
        }

        int days = parseDays(exchange.getRequestURI().getQuery());
        try {
            send(exchange, 200, load(days));
        } catch (SQLException | RuntimeException e) {
            System.err.println("Detected pickups failed: " + e.getMessage());
            send(exchange, 500, Map.of("error", "Could not load pickups"));
        }
    }

    private List<Map<String, Object>> load(int days) throws SQLException {
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        List<PickupDetector.Reading> readings = new ArrayList<>();
        Map<Integer, Station> stations = new HashMap<>();

        String readingsSql = """
                SELECT h.triBinID, h.binID, b.binType, h.readingValue, h.readingTime
                FROM sensor_history h
                JOIN bins b ON b.binID = h.binID
                WHERE h.readingTime >= ? AND h.triBinID IS NOT NULL
                ORDER BY h.binID, h.readingTime, h.id
                """;
        String stationsSql = "SELECT triBinID, location, zone FROM triBins";

        try (Connection connection = DatabaseConfig.getConnection()) {
            try (PreparedStatement statement = connection.prepareStatement(readingsSql)) {
                statement.setTimestamp(1, Timestamp.valueOf(since));
                try (ResultSet rows = statement.executeQuery()) {
                    while (rows.next()) {
                        readings.add(new PickupDetector.Reading(
                                rows.getInt("triBinID"),
                                rows.getInt("binID"),
                                rows.getString("binType"),
                                rows.getDouble("readingValue"),
                                rows.getTimestamp("readingTime").toLocalDateTime()));
                    }
                }
            }
            try (PreparedStatement statement = connection.prepareStatement(stationsSql);
                 ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    String zone = rows.getString("zone");
                    char letter = zone == null || zone.isBlank() ? '\0' : zone.trim().charAt(0);
                    stations.put(rows.getInt("triBinID"),
                            new Station(rows.getString("location"), TriBinResponse.formatZone(letter)));
                }
            }
        }

        List<Map<String, Object>> out = new ArrayList<>();
        for (PickupDetector.Pickup pickup : PickupDetector.detect(readings)) {
            if (out.size() >= MAX_PICKUPS) {
                break;
            }
            Station station = stations.getOrDefault(pickup.triBinID(), new Station("", ""));
            List<Map<String, Object>> compartments = new ArrayList<>();
            for (PickupDetector.EmptiedCompartment c : pickup.compartments()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("stream", c.stream());
                row.put("fromPct", c.fromPct());
                row.put("toPct", c.toPct());
                compartments.add(row);
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("binId", "TB-" + pickup.triBinID());
            row.put("binName", "Bin " + pickup.triBinID());
            row.put("location", station.location() == null ? "" : station.location());
            row.put("zone", station.zone());
            row.put("time", pickup.time().toString());
            row.put("fullestPct", pickup.fullestPct());
            row.put("compartments", compartments);
            out.add(row);
        }
        return out;
    }

    static int parseDays(String query) {
        if (query != null) {
            for (String part : query.split("&")) {
                if (part.startsWith("days=")) {
                    try {
                        return Math.max(1, Math.min(MAX_DAYS, Integer.parseInt(part.substring(5))));
                    } catch (NumberFormatException ignored) {
                        // fall back to the default below
                    }
                }
            }
        }
        return DEFAULT_DAYS;
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
