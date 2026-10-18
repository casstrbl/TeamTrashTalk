package main.java.trashtalk.wastemonitoring.controller;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Handles the health check endpoint for the backend server.
 *
 * When /api/health is requested, this controller returns "ok"
 * to confirm that the backend server is running.
 */
public class HealthController implements HttpHandler {

    @Override
    public void handle(HttpExchange exchange) throws IOException {

        // Response used to confirm that the server is running
        String response = "ok";
        byte[] responseBytes =
                response.getBytes(StandardCharsets.UTF_8);

        // Send a successful HTTP response
        exchange.sendResponseHeaders(200, responseBytes.length);

        // Write "ok" back to the browser
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(responseBytes);
        }
    }
}
