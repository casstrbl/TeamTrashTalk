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

    @Override
    public void handle(HttpExchange exchange) throws IOException {

        // Allow the frontend to request pickup data from the backend.
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
                "Content-Type"
        );

        // Handle browser CORS checks.
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        // Only GET requests are supported.
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

            e.printStackTrace();

            sendResponse(
                    exchange,
                    500,
                    "{\"error\":\"Unable to load pickup list\"}"
            );
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