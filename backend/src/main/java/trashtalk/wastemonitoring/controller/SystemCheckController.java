package main.java.trashtalk.wastemonitoring.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.service.HistoryCsvService;
import main.java.trashtalk.wastemonitoring.service.LoginService;
import main.java.trashtalk.wastemonitoring.service.SensorFailureService;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Runs quick backend checks for the Test Panel.
 */
public class SystemCheckController implements HttpHandler {

    // Uses the same login sessions as the rest of the backend.
    private final LoginService loginService;

    // Used to check that CSV export is working.
    private final HistoryCsvService csvService =
            new HistoryCsvService();

    // Used to check the sensor failure logic.
    private final SensorFailureService sensorFailureService =
            new SensorFailureService();

    // Converts the check results into JSON.
    private final ObjectMapper objectMapper =
            new ObjectMapper();

    /**
     * Uses the shared LoginService from Application.
     */
    public SystemCheckController(LoginService loginService) {
        this.loginService = loginService;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {

        // Allow the frontend Test Panel to call this endpoint.
        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Origin",
                "*"
        );

        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Methods",
                "GET, OPTIONS"
        );

        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization"
        );

        // Handle the browser CORS check.
        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            exchange.sendResponseHeaders(204, -1);
            return;
        }

        // Only GET requests are allowed.
        if (!"GET".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            sendResponse(
                    exchange,
                    405,
                    "{\"error\":\"Method not allowed\"}"
            );
            return;
        }

        // Get the login token from the request.
        String authorization =
                exchange.getRequestHeaders()
                        .getFirst("Authorization");

        if (authorization == null
                || !authorization.startsWith("Bearer ")) {

            sendResponse(
                    exchange,
                    401,
                    "{\"error\":\"Login required\"}"
            );
            return;
        }

        String token =
                authorization
                        .substring("Bearer ".length())
                        .trim();

        LoginService.Profile staff;

        try {

            // Check which staff member is logged in.
            staff = loginService.authenticate(token);

        } catch (Exception e) {

            sendResponse(
                    exchange,
                    500,
                    "{\"error\":\"Unable to verify login\"}"
            );
            return;
        }

        // Reject invalid or expired sessions.
        if (staff == null) {

            sendResponse(
                    exchange,
                    401,
                    "{\"error\":\"Invalid or expired login\"}"
            );
            return;
        }

        // Only editors can use the Test Panel.
        if (!"editor".equals(staff.role())) {

            sendResponse(
                    exchange,
                    403,
                    "{\"error\":\"Editor access required\"}"
            );
            return;
        }

        // Store each system check and whether it passed.
        Map<String, Boolean> checks =
                new LinkedHashMap<>();

        checks.put(
                "databaseConnected",
                checkDatabase()
        );

        /*
         * If the request reached this point,
         * the login token worked correctly.
         */
        checks.put(
                "loginWorks",
                true
        );

        checks.put(
                "csvExportWorks",
                checkCsvExport()
        );

        checks.put(
                "sensorFailureFlagWorks",
                checkSensorFailure()
        );

        /*
         * Brooke is still finishing the alert logic,
         * so this check will be connected later.
         */
        checks.put(
                "alertWorks",
                false
        );

        String json =
                objectMapper.writeValueAsString(checks);

        sendResponse(
                exchange,
                200,
                json
        );
    }

    /**
     * Checks that the backend can connect
     * to the configured database.
     */
    private boolean checkDatabase() {

        try (Connection connection =
                     DatabaseConfig.getConnection()) {

            return connection != null
                    && connection.isValid(2);

        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Checks that the CSV export service
     * can generate a CSV response.
     */
    private boolean checkCsvExport() {

        try {

            /*
             * The CSV service still returns its header
             * even when this test ID has no readings.
             */
            String csv =
                    csvService.exportTriBinHistory(0);

            return csv != null
                    && csv.startsWith("bin_id,");

        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Checks that an old sensor reading
     * is correctly detected as missing.
     */
    private boolean checkSensorFailure() {

        try {

            LocalDateTime now =
                    LocalDateTime.now();

            LocalDateTime oldReading =
                    now.minusHours(3);

            return sensorFailureService
                    .hasMissingReadingForHours(
                            oldReading,
                            2,
                            now
                    );

        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Sends a JSON response back to the frontend.
     */
    private void sendResponse(
            HttpExchange exchange,
            int statusCode,
            String body) throws IOException {

        exchange.getResponseHeaders().set(
                "Content-Type",
                "application/json; charset=UTF-8"
        );

        byte[] responseBytes =
                body.getBytes(StandardCharsets.UTF_8);

        exchange.sendResponseHeaders(
                statusCode,
                responseBytes.length
        );

        try (OutputStream output =
                     exchange.getResponseBody()) {

            output.write(responseBytes);
        }
    }
}