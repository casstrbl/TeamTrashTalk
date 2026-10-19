package main.java.trashtalk.wastemonitoring.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import main.java.trashtalk.wastemonitoring.service.HistoryService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** GET /api/tribins/TB-2/history returns saved readings for TriBin 2. */
public class HistoryController implements HttpHandler {
    private final HistoryService historyService;
    private final ObjectMapper mapper = new ObjectMapper();

    public HistoryController(HistoryService historyService) {
        this.historyService = historyService;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
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
                .compile("^/api/tribins/(?:TB-)?([0-9]+)/history/?$").matcher(path);
        if (!matcher.matches()) {
            respond(exchange, 404, "{\"error\":\"History route not found\"}");
            return;
        }
        try {
            int triBinId = Integer.parseInt(matcher.group(1));
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
