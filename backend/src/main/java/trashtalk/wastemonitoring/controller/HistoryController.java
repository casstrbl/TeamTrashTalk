package main.java.trashtalk.wastemonitoring.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import main.java.trashtalk.wastemonitoring.service.HistoryService;
import main.java.trashtalk.wastemonitoring.service.HistoryCsvService;
import main.java.trashtalk.wastemonitoring.service.LoginService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;

/** GET /api/tribins/TB-2/history returns saved readings for TriBin 2. */
public class HistoryController implements HttpHandler {
    private final HistoryService historyService;
    private final HistoryCsvService csvService;
    private final LoginService loginService;
    private final ObjectMapper mapper = new ObjectMapper();

    public HistoryController(HistoryService historyService, HistoryCsvService csvService,
                             LoginService loginService) {
        this.historyService = historyService;
        this.csvService = csvService;
        this.loginService = loginService;
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
            respond(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String path = exchange.getRequestURI().getPath();
        // Accept both TB-2 (frontend display ID) and 2 (numeric database ID).
        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("^/api/tribins/(?:TB-)?([0-9]+)/history(/export)?/?$").matcher(path);
        if (!matcher.matches()) {
            respond(exchange, 404, "{\"error\":\"History route not found\"}");
            return;
        }
        try {
            int triBinId = Integer.parseInt(matcher.group(1));
            if (matcher.group(2) != null) {
                String authorization = exchange.getRequestHeaders().getFirst("Authorization");
                if (authorization == null || !authorization.startsWith("Bearer ")
                        || authorization.substring("Bearer ".length()).isBlank()) {
                    respond(exchange, 401, "{\"error\":\"Login required\"}");
                    return;
                }
                LoginService.Profile staff;
                try {
                    staff = loginService.authenticate(
                            authorization.substring("Bearer ".length()).trim());
                } catch (SQLException e) {
                    respond(exchange, 500, "{\"error\":\"Unable to verify login\"}");
                    return;
                }
                if (staff == null) {
                    respond(exchange, 401, "{\"error\":\"Invalid or expired login\"}");
                    return;
                }
                if (!"editor".equals(staff.role())) {
                    respond(exchange, 403, "{\"error\":\"Editor access required\"}");
                    return;
                }
                byte[] csv = csvService.exportTriBinHistory(triBinId).getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/csv; charset=utf-8");
                exchange.getResponseHeaders().set("Content-Disposition",
                        "attachment; filename=tribin-" + triBinId + "-history.csv");
                exchange.sendResponseHeaders(200, csv.length);
                try (var output = exchange.getResponseBody()) {
                    output.write(csv);
                }
                return;
            }
            String json = mapper.writeValueAsString(historyService.getHistoryDetailsForTriBin(triBinId));
            respond(exchange, 200, json);
        } catch (NumberFormatException e) {
            respond(exchange, 400, "{\"error\":\"Invalid TriBin ID\"}");
        } catch (IllegalStateException e) {
            respond(exchange, 500, "{\"error\":\"History unavailable\"}");
        }
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }
}
