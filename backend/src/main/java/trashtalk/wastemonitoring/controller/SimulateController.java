package main.java.trashtalk.wastemonitoring.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import main.java.trashtalk.wastemonitoring.database.BinDataLoader;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.repository.BinRepository;
import main.java.trashtalk.wastemonitoring.repository.SimulationRepository;
import main.java.trashtalk.wastemonitoring.service.BinService;
import main.java.trashtalk.wastemonitoring.service.DemoDataGenerator;
import main.java.trashtalk.wastemonitoring.service.FakeSensorService;
import main.java.trashtalk.wastemonitoring.service.LoginService;
import main.java.trashtalk.wastemonitoring.service.SensorTimer;

// editor-only endpoints behind the test panel buttons, so the client can test without real sensors
// POST /api/simulate/fill       {"triBinID": 12, "stream": "recycling", "percent": 85}
// POST /api/simulate/empty      {"triBinID": 12}
// POST /api/simulate/offline    {"triBinID": 12}
// POST /api/simulate/demo-week  {"triBinID": 12}
// POST /api/simulate/reset      {}
// GET  /api/simulate/timer, POST /api/simulate/timer-start, POST /api/simulate/timer-stop  (live fake sensors)
// fill and empty go through the same gateway path a real sensor uses, so history, alerts and pickups react for real
public class SimulateController implements HttpHandler {

    // how long ago an "offline" sensor last checked in
    static final int OFFLINE_HOURS = 6;

    // what's left in a bin right after it's emptied
    static final double EMPTY_PERCENT = 2.0;

    private final LoginService loginService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final BinRepository binRepository = new BinRepository();
    private final SimulationRepository simulationRepository = new SimulationRepository();
    private final FakeSensorService fakeSensorService = new FakeSensorService();
    private final BinService binService = new BinService();

    // request body for every route (reset ignores it)
    private record SimulateRequest(Integer triBinID, String stream, Double percent) {
    }

    public SimulateController(LoginService loginService) {
        this.loginService = loginService;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }
        String action = exchange.getRequestURI().getPath()
                .replaceFirst("^/api/simulate/?", "")
                .replaceAll("/+$", "");

        // only the timer status is a GET, everything else changes data
        boolean isGet = "GET".equalsIgnoreCase(exchange.getRequestMethod());
        if (!(isGet && "timer".equals(action)) && !"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            send(exchange, 405, Map.of("error", "Method not allowed"));
            return;
        }
        if (!isEditor(exchange)) {
            return;
        }
        if (isGet) {
            send(exchange, 200, SensorTimer.status());
            return;
        }

        SimulateRequest request;
        try {
            request = readBody(exchange.getRequestBody());
        } catch (IOException e) {
            send(exchange, 400, Map.of("error", "Invalid request body"));
            return;
        }

        try {
            switch (action) {
                case "fill" -> fill(exchange, request);
                case "empty" -> empty(exchange, request);
                case "offline" -> offline(exchange, request);
                case "demo-week" -> demoWeek(exchange, request);
                case "reset" -> reset(exchange);
                case "timer-start" -> send(exchange, 200, SensorTimer.start());
                case "timer-stop" -> send(exchange, 200, SensorTimer.stop());
                default -> send(exchange, 404, Map.of("error", "Simulate route not found"));
            }
        } catch (SQLException | RuntimeException e) {
            System.err.println("Simulate " + action + " failed: " + e.getMessage());
            send(exchange, 500, Map.of("error", "Could not run the test action"));
        }
    }

    // sets one compartment to any fill %
    private void fill(HttpExchange exchange, SimulateRequest request) throws IOException, SQLException {
        Bin.BinType type = parseStream(request.stream());
        if (type == null || request.percent() == null
                || request.percent() < 0 || request.percent() > 100) {
            send(exchange, 400, Map.of("error", "A stream (landfill, recycling or compost) and a percent from 0 to 100 are required"));
            return;
        }
        TriBin triBin = findTriBin(exchange, request.triBinID());
        if (triBin == null) {
            return;
        }

        simulationRepository.markOnline(triBin.getTriBinID());
        triBin.setSensorStatus("online");
        for (Bin bin : triBin.getBins()) {
            if (bin.getBinType() == type) {
                sendReading(triBin, bin, request.percent());
            }
        }
        saveReadings(triBin);
        send(exchange, 200, result(triBin, "Set " + label(type) + " to " + Math.round(request.percent()) + "%"));
    }

    // every compartment drops to nearly empty, like after a pickup
    private void empty(HttpExchange exchange, SimulateRequest request) throws IOException, SQLException {
        TriBin triBin = findTriBin(exchange, request.triBinID());
        if (triBin == null) {
            return;
        }

        simulationRepository.markOnline(triBin.getTriBinID());
        triBin.setSensorStatus("online");
        for (Bin bin : triBin.getBins()) {
            sendReading(triBin, bin, EMPTY_PERCENT);
        }
        saveReadings(triBin);
        send(exchange, 200, result(triBin, "Emptied all three compartments"));
    }

    // the sensor stops reporting
    private void offline(HttpExchange exchange, SimulateRequest request) throws IOException, SQLException {
        TriBin triBin = findTriBin(exchange, request.triBinID());
        if (triBin == null) {
            return;
        }

        simulationRepository.markOffline(triBin.getTriBinID(), LocalDateTime.now().minusHours(OFFLINE_HOURS));
        triBin.setSensorStatus("offline");
        send(exchange, 200, result(triBin, "Sensor went offline (last contact " + OFFLINE_HOURS + " hours ago)"));
    }

    // a week of hourly readings for each compartment, for the history graph and csv
    private void demoWeek(HttpExchange exchange, SimulateRequest request) throws IOException {
        TriBin triBin = findTriBin(exchange, request.triBinID());
        if (triBin == null) {
            return;
        }

        DemoDataGenerator generator = new DemoDataGenerator();
        int saved = 0;
        for (Bin bin : triBin.getBins()) {
            saved += generator.generateWeekForBin(bin, bin.getBinID());
        }
        Map<String, Object> body = result(triBin, "Added a week of demo readings");
        body.put("readingsAdded", saved);
        send(exchange, 200, body);
    }

    // every bin back to its starting point, past readings stay in history
    private void reset(HttpExchange exchange) throws IOException, SQLException {
        int stations = simulationRepository.resetToSeed(BinDataLoader.loadTriBins());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Reset " + stations + " bins to their starting levels");
        body.put("binsReset", stations);
        send(exchange, 200, body);
    }

    // sends one reading through the normal sensor path
    private void sendReading(TriBin triBin, Bin bin, double percent) {
        Sensor sensor = new Sensor(bin.getBinID(), Sensor.SensorType.ULTRASONIC);
        sensor.assignToBin(bin);
        double heightCm = percent / 100.0 * Bin.BIN_HEIGHT;
        // a bin that never reported has battery 0, so test readings come in with a full battery
        int battery = triBin.getBattery() > 0 ? triBin.getBattery() : 100;
        fakeSensorService.sendFakeReading(sensor, bin, triBin, heightCm, "cm", battery);
    }

    // the gateway updates bins in memory, so save them like the fake sensor timer does
    private void saveReadings(TriBin triBin) {
        triBin.setLastUpdated(LocalDateTime.now());
        binRepository.saveSimulatedReadings(List.of(triBin));
    }

    // looks up the tribin, or answers 400/404 and returns null
    private TriBin findTriBin(HttpExchange exchange, Integer triBinID) throws IOException {
        if (triBinID == null || triBinID <= 0) {
            send(exchange, 400, Map.of("error", "A valid triBinID is required"));
            return null;
        }
        for (TriBin triBin : binRepository.findAllTriBins()) {
            if (triBin.getTriBinID() == triBinID) {
                return triBin;
            }
        }
        send(exchange, 404, Map.of("error", "TriBin not found"));
        return null;
    }

    // what the bin looks like now, so the test panel can describe what happened
    private Map<String, Object> result(TriBin triBin, String message) {
        List<Map<String, Object>> compartments = new ArrayList<>();
        double fullest = 0;
        for (Bin bin : triBin.getBins()) {
            double fill = binService.getPercentage(bin);
            fullest = Math.max(fullest, fill);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("stream", label(bin.getBinType()));
            row.put("fill", (int) fill);
            compartments.add(row);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message);
        body.put("id", "TB-" + triBin.getTriBinID());
        body.put("sensorStatus", triBin.getSensorStatus());
        body.put("fullest", (int) fullest);
        body.put("compartments", compartments);
        return body;
    }

    static Bin.BinType parseStream(String stream) {
        if (stream == null) {
            return null;
        }
        try {
            return Bin.BinType.valueOf(stream.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String label(Bin.BinType type) {
        String name = type.name().toLowerCase(Locale.ROOT);
        return Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }

    // an empty body counts as {} so reset needs nothing
    private SimulateRequest readBody(InputStream body) throws IOException {
        byte[] bytes = body.readAllBytes();
        if (bytes.length == 0) {
            return new SimulateRequest(null, null, null);
        }
        return objectMapper.readValue(bytes, SimulateRequest.class);
    }

    // same bearer token check as the other editor-only routes
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
