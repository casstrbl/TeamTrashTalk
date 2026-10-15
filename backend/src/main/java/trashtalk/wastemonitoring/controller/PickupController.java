package main.java.trashtalk.wastemonitoring.controller;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;

/**
 * Handles requests for pickup data.
 */
public class PickupController implements HttpHandler {

    @Override
    public void handle(HttpExchange exchange) throws IOException {

        // Allow the frontend to request pickup data from the backend
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
            exchange.sendResponseHeaders(405, -1);
            return;
        }

        String response = "pickup endpoint working";
        byte[] responseBytes = response.getBytes();

        exchange.sendResponseHeaders(200, responseBytes.length);

        exchange.getResponseBody().write(responseBytes);
        exchange.getResponseBody().close();

    }
}