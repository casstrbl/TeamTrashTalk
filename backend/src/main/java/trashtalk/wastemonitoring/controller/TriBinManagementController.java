package main.java.trashtalk.wastemonitoring.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import main.java.trashtalk.wastemonitoring.repository.TriBinManagementRepository;
import main.java.trashtalk.wastemonitoring.service.LoginService;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Handles editor-only requests for adding,
 * editing, and relocating TriBin stations.
 */
public class TriBinManagementController implements HttpHandler {

    // Finds a TriBin ID in the edit route.
    private static final Pattern EDIT_ROUTE =
            Pattern.compile(
                    "^/api/admin/tribins/([0-9]+)/?$"
            );

    // Finds a TriBin ID in the relocate route.
    private static final Pattern LOCATION_ROUTE =
            Pattern.compile(
                    "^/api/admin/tribins/([0-9]+)/location/?$"
            );

    // Handles database changes for TriBins.
    private final TriBinManagementRepository repository =
            new TriBinManagementRepository();

    // Uses the same login sessions as the rest of the backend.
    private final LoginService loginService;

    // Converts JSON requests and responses.
    private final ObjectMapper objectMapper =
            new ObjectMapper();

    /**
     * Data needed when adding a new TriBin.
     */
    private record AddTriBinRequest(
            Integer triBinID,
            String zone,
            String location,
            Double latitude,
            Double longitude) {
    }

    /**
     * Data that can be edited for an existing TriBin.
     */
    private record EditTriBinRequest(
            String zone,
            String location) {
    }

    /**
     * New GPS coordinates for relocating a TriBin.
     */
    private record RelocateTriBinRequest(
            Double latitude,
            Double longitude) {
    }

    /**
     * Uses the shared LoginService from Application.
     */
    public TriBinManagementController(
            LoginService loginService) {

        this.loginService = loginService;
    }

    @Override
    public void handle(
            HttpExchange exchange) throws IOException {

        // Allow the frontend to call these endpoints.
        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Origin",
                "*"
        );

        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Methods",
                "POST, PUT, OPTIONS"
        );

        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization"
        );

        // Handle browser CORS checks.
        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            exchange.sendResponseHeaders(
                    204,
                    -1
            );
            return;
        }

        /*
         * All bin-management actions require
         * a logged-in editor.
         */
        LoginService.Profile editor =
                getEditor(exchange);

        if (editor == null) {
            return;
        }

        String method =
                exchange.getRequestMethod();

        String path =
                exchange.getRequestURI().getPath();

        /*
         * POST /api/admin/tribins
         * adds a new TriBin.
         */
        if ("POST".equalsIgnoreCase(method)
                && "/api/admin/tribins".equals(path)) {

            handleAdd(exchange);
            return;
        }

        /*
         * PUT /api/admin/tribins/{id}/location
         * changes only the GPS coordinates.
         */
        Matcher locationMatcher =
                LOCATION_ROUTE.matcher(path);

        if ("PUT".equalsIgnoreCase(method)
                && locationMatcher.matches()) {

            int triBinID =
                    Integer.parseInt(
                            locationMatcher.group(1)
                    );

            handleRelocate(
                    exchange,
                    triBinID
            );
            return;
        }

        /*
         * PUT /api/admin/tribins/{id}
         * edits the station's zone and location name.
         */
        Matcher editMatcher =
                EDIT_ROUTE.matcher(path);

        if ("PUT".equalsIgnoreCase(method)
                && editMatcher.matches()) {

            int triBinID =
                    Integer.parseInt(
                            editMatcher.group(1)
                    );

            handleEdit(
                    exchange,
                    triBinID
            );
            return;
        }

        // The route or HTTP method was not supported.
        sendResponse(
                exchange,
                404,
                "{\"error\":\"Bin management route not found\"}"
        );
    }

    /**
     * Makes sure the request has a valid editor token.
     */
    private LoginService.Profile getEditor(
            HttpExchange exchange) throws IOException {

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
            return null;
        }

        String token =
                authorization
                        .substring("Bearer ".length())
                        .trim();

        try {

            LoginService.Profile editor =
                    loginService.editorForToken(token);

            if (editor == null) {

                sendResponse(
                        exchange,
                        403,
                        "{\"error\":\"Editor access required\"}"
                );
                return null;
            }

            return editor;

        } catch (SQLException e) {

            sendResponse(
                    exchange,
                    500,
                    "{\"error\":\"Unable to verify login\"}"
            );
            return null;
        }
    }

    /**
     * Adds a new TriBin and its three compartments.
     */
    private void handleAdd(
            HttpExchange exchange) throws IOException {

        AddTriBinRequest request;

        try {

            // Read the new TriBin information.
            request = objectMapper.readValue(
                    exchange.getRequestBody(),
                    AddTriBinRequest.class
            );

        } catch (Exception e) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Invalid request body\"}"
            );
            return;
        }

        // Make sure all required values were provided.
        if (request.triBinID() == null
                || request.triBinID() <= 0
                || !validZone(request.zone())
                || request.location() == null
                || request.location().isBlank()
                || !validCoordinates(
                request.latitude(),
                request.longitude())) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Valid TriBin details are required\"}"
            );
            return;
        }

        try {

            // Do not allow two stations with the same ID.
            if (repository.exists(
                    request.triBinID())) {

                sendResponse(
                        exchange,
                        409,
                        "{\"error\":\"TriBin already exists\"}"
                );
                return;
            }

            repository.addTriBin(
                    request.triBinID(),
                    request.zone(),
                    request.location().trim(),
                    request.latitude(),
                    request.longitude()
            );

            sendResponse(
                    exchange,
                    201,
                    "{\"message\":\"TriBin added\"}"
            );

        } catch (SQLException e) {

            sendResponse(
                    exchange,
                    500,
                    "{\"error\":\"Unable to add TriBin\"}"
            );
        }
    }

    /**
     * Edits the zone and location name
     * for an existing TriBin.
     */
    private void handleEdit(
            HttpExchange exchange,
            int triBinID) throws IOException {

        EditTriBinRequest request;

        try {

            // Read the updated TriBin details.
            request = objectMapper.readValue(
                    exchange.getRequestBody(),
                    EditTriBinRequest.class
            );

        } catch (Exception e) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Invalid request body\"}"
            );
            return;
        }

        if (!validZone(request.zone())
                || request.location() == null
                || request.location().isBlank()) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Valid zone and location are required\"}"
            );
            return;
        }

        try {

            boolean updated =
                    repository.updateDetails(
                            triBinID,
                            request.zone(),
                            request.location().trim()
                    );

            if (!updated) {

                sendResponse(
                        exchange,
                        404,
                        "{\"error\":\"TriBin not found\"}"
                );
                return;
            }

            sendResponse(
                    exchange,
                    200,
                    "{\"message\":\"TriBin updated\"}"
            );

        } catch (SQLException e) {

            sendResponse(
                    exchange,
                    500,
                    "{\"error\":\"Unable to update TriBin\"}"
            );
        }
    }

    /**
     * Changes the GPS coordinates
     * for an existing TriBin.
     */
    private void handleRelocate(
            HttpExchange exchange,
            int triBinID) throws IOException {

        RelocateTriBinRequest request;

        try {

            // Read the new GPS coordinates.
            request = objectMapper.readValue(
                    exchange.getRequestBody(),
                    RelocateTriBinRequest.class
            );

        } catch (Exception e) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Invalid request body\"}"
            );
            return;
        }

        if (!validCoordinates(
                request.latitude(),
                request.longitude())) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Valid latitude and longitude are required\"}"
            );
            return;
        }

        try {

            boolean updated =
                    repository.relocate(
                            triBinID,
                            request.latitude(),
                            request.longitude()
                    );

            if (!updated) {

                sendResponse(
                        exchange,
                        404,
                        "{\"error\":\"TriBin not found\"}"
                );
                return;
            }

            sendResponse(
                    exchange,
                    200,
                    "{\"message\":\"TriBin relocated\"}"
            );

        } catch (SQLException e) {

            sendResponse(
                    exchange,
                    500,
                    "{\"error\":\"Unable to relocate TriBin\"}"
            );
        }
    }

    /**
     * Makes sure a zone fits the database's
     * single-character zone field.
     */
    private boolean validZone(
            String zone) {

        return zone != null
                && !zone.isBlank()
                && zone.trim().length() == 1;
    }

    /**
     * Makes sure GPS coordinates are present
     * and inside normal latitude/longitude ranges.
     */
    private boolean validCoordinates(
            Double latitude,
            Double longitude) {

        return latitude != null
                && longitude != null
                && latitude >= -90.0
                && latitude <= 90.0
                && longitude >= -180.0
                && longitude <= 180.0;
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