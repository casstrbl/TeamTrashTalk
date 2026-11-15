package main.java.trashtalk.wastemonitoring.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import main.java.trashtalk.wastemonitoring.dto.TriBinResponse;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.repository.BinRepository;
import main.java.trashtalk.wastemonitoring.service.BinService;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import main.java.trashtalk.wastemonitoring.service.LoginService;
import main.java.trashtalk.wastemonitoring.repository.PickupRepository;
import java.time.LocalDateTime;
/**
 * Handles GET /api/pickups requests.
 *
 * Returns online TriBins that need pickup,
 * ordered from fullest to least full.
 */
public class PickupController implements HttpHandler {

    // A TriBin needs pickup when one compartment reaches 80% full.
    private static final double PICKUP_THRESHOLD = 80.0;

    // Reuse the existing project database and fill-percentage logic.
    private final BinRepository binRepository = new BinRepository();
    private final BinService binService = new BinService();
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Handles saving completed pickups.
    private final PickupRepository pickupRepository =
            new PickupRepository();

    // Checks the logged-in staff member and their role.
    private final LoginService loginService;

    private record PickupRequest(int triBinID) {
    }

    public PickupController(LoginService loginService) {
        this.loginService = loginService;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {

        // Allow the frontend to request pickup data from the backend.
        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Origin",
                "*"
        );

        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Methods",
                "GET, POST, OPTIONS"
        );

        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization"
        );

        // Handle completed pickup requests.
        if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            handleCompletedPickup(exchange);
            return;
        }

        // Only GET and POST requests are supported.
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendResponse(
                    exchange,
                    405,
                    "{\"error\":\"Method not allowed\"}"
            );
            return;
        }

        try {

            // Load the latest TriBin data from the database.
            List<TriBin> triBins =
                    binRepository.findAllTriBins();

            // Keep online TriBins that have at least one
            // compartment at or above the pickup threshold.
            List<TriBin> pickupTriBins = triBins.stream()
                    .filter(triBin ->
                            "online".equalsIgnoreCase(
                                    triBin.getSensorStatus()
                            )
                    )
                    .filter(triBin ->
                            getHighestFill(triBin)
                                    >= PICKUP_THRESHOLD
                    )
                    .sorted(
                            Comparator
                                    .comparingDouble(this::getHighestFill)
                                    .reversed()
                    )
                    .toList();

            // Use the same response format as /api/tribins
            // so the frontend can reuse its existing Tribin type.
            List<TriBinResponse> responses =
                    new ArrayList<>();

            for (TriBin triBin : pickupTriBins) {
                responses.add(
                        TriBinResponse.fromTriBin(triBin)
                );
            }

            String json =
                    objectMapper.writeValueAsString(responses);

            sendResponse(
                    exchange,
                    200,
                    json
            );

        } catch (Exception e) {
            sendResponse(
                    exchange,
                    500,
                    "{\"error\":\"Unable to load pickup list\"}"
            );
            return;
        }
    }

    /**
     * Finds the highest fill percentage
     * among the compartments in one TriBin.
     */
    private double getHighestFill(TriBin triBin) {

        double highestFill = 0.0;

        for (Bin bin : triBin.getBins()) {

            highestFill = Math.max(
                    highestFill,
                    binService.getPercentage(bin)
            );
        }

        return highestFill;
    }

    // Read the TriBin ID sent by the frontend.
    private void handleCompletedPickup(
            HttpExchange exchange) throws IOException {

        // Read the TriBin ID sent by the frontend.
        PickupRequest request;

        try {
            request = objectMapper.readValue(
                    exchange.getRequestBody(),
                    PickupRequest.class
            );
        } catch (Exception e) {
            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Invalid request body\"}"
            );
            return;
        }

        // Get the login token from the request.
        String authorization =
                exchange.getRequestHeaders().getFirst("Authorization");

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
                authorization.substring("Bearer ".length());

        // Make sure the logged-in staff member is an editor.
        LoginService.Profile staff;

        try {
            staff = loginService.editorForToken(token);
        } catch (Exception e) {
            sendResponse(
                    exchange,
                    500,
                    "{\"error\":\"Unable to verify login\"}"
            );
            return;
        }

        if (staff == null) {
            sendResponse(
                    exchange,
                    403,
                    "{\"error\":\"Editor access required\"}"
            );
            return;
        }

        // Save the completed pickup with the logged-in staff member.
        try {
            pickupRepository.saveCompletedPickup(
                    request.triBinID(),
                    staff.id(),
                    LocalDateTime.now()
            );
        } catch (Exception e) {
            sendResponse(
                    exchange,
                    500,
                    "{\"error\":\"Unable to save completed pickup\"}"
            );
            return;
        }

        // Tell the frontend the pickup was saved successfully.
        sendResponse(
                exchange,
                200,
                "{\"message\":\"Pickup marked complete\"}"
        );
    }

    /**
     * Sends a JSON response to the frontend.
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