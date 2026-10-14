package main.java.trashtalk.wastemonitoring.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import main.java.trashtalk.wastemonitoring.database.BinDataLoader;
import main.java.trashtalk.wastemonitoring.dto.TriBinResponse;
import main.java.trashtalk.wastemonitoring.model.TriBin;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Handles requests for TriBin information.
 *
 * The /api/tribins endpoint returns all TriBins in the
 * response format expected by the frontend.
 */
public class TriBinController implements HttpHandler {

    // Converts Java response objects into JSON
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {

        // Allow the frontend to request data from the backend
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

        // Handle browser CORS checks
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        // Only allow GET requests for this endpoint
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendResponse(
                    exchange,
                    405,
                    "Method not allowed"
            );
            return;
        }

        try {

            // Load the current TriBin data
            List<TriBin> triBins = BinDataLoader.loadTriBins();

            // Convert backend TriBins into the format expected by the frontend
            List<TriBinResponse> responses = new ArrayList<>();

            for (TriBin triBin : triBins) {
                responses.add(
                        TriBinResponse.fromTriBin(triBin)
                );
            }

            // Convert the response list into JSON
            String jsonResponse =
                    objectMapper.writeValueAsString(responses);

            byte[] responseBytes =
                    jsonResponse.getBytes(StandardCharsets.UTF_8);

            // Tell the browser that the response contains JSON
            exchange.getResponseHeaders().set(
                    "Content-Type",
                    "application/json; charset=UTF-8"
            );

            exchange.sendResponseHeaders(
                    200,
                    responseBytes.length
            );

            // Send the JSON response back to the frontend
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(responseBytes);
            }

        } catch (Exception e) {

            e.printStackTrace();

            sendResponse(
                    exchange,
                    500,
                    "Error loading TriBin data"
            );
        }
    }

    /**
     * Sends a simple text response back to the client.
     */
    private void sendResponse(
            HttpExchange exchange,
            int statusCode,
            String message) throws IOException {

        byte[] responseBytes =
                message.getBytes(StandardCharsets.UTF_8);

        exchange.sendResponseHeaders(
                statusCode,
                responseBytes.length
        );

        try (OutputStream output = exchange.getResponseBody()) {
            output.write(responseBytes);
        }
    }
}
