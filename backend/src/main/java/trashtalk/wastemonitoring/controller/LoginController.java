package main.java.trashtalk.wastemonitoring.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import main.java.trashtalk.wastemonitoring.service.LoginService;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;

/**
 * Handles staff login requests.
 */
public class LoginController implements HttpHandler {

    // Handles the actual login and password verification logic.
    private final LoginService loginService;

    // Converts JSON requests and responses.
    private final ObjectMapper mapper =
            new ObjectMapper();

    /**
     * Creates the login controller using
     * the shared login service.
     */
    public LoginController(
            LoginService loginService) {

        this.loginService =
                loginService;
    }

    /**
     * Represents the email and password
     * sent from the frontend during login.
     */
    private record LoginRequest(
            String email,
            String password) {
    }

    @Override
    public void handle(
            HttpExchange exchange) throws IOException {

        // Allow the frontend to call this backend endpoint.
        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Origin",
                "*"
        );

        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Methods",
                "POST, OPTIONS"
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

        // Login should only accept POST requests.
        if (!"POST".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            respond(
                    exchange,
                    405,
                    "{\"error\":\"Method not allowed\"}"
            );

            return;
        }

        try {

            // Read the JSON login information
            // sent by the frontend.
            LoginRequest request =
                    mapper.readValue(
                            exchange.getRequestBody(),
                            LoginRequest.class
                    );

            // Reject incomplete login requests.
            if (request.email() == null
                    || request.password() == null
                    || request.email().isBlank()
                    || request.password().isBlank()) {

                respond(
                        exchange,
                        400,
                        "{\"error\":\"Email and password are required\"}"
                );

                return;
            }

            // Ask the login service to verify
            // the staff member's credentials.
            LoginService.LoginResult result =
                    loginService.login(
                            request.email(),
                            request.password().toCharArray()
                    );

            // Do not reveal whether the email
            // or password was the incorrect value.
            if (result == null) {

                respond(
                        exchange,
                        401,
                        "{\"error\":\"Invalid email or password\"}"
                );

                return;
            }

            // Return the login token and safe staff profile.
            String json =
                    mapper.writeValueAsString(result);

            respond(
                    exchange,
                    200,
                    json
            );

        } catch (com.fasterxml.jackson.core.JacksonException e) {

            // Invalid JSON should return a client error
            // instead of crashing the backend.
            respond(
                    exchange,
                    400,
                    "{\"error\":\"Invalid login request\"}"
            );

        } catch (SQLException e) {

            // Database errors should not expose
            // database details to the frontend.
            respond(
                    exchange,
                    500,
                    "{\"error\":\"Login unavailable\"}"
            );
        }
    }

    /**
     * Sends a JSON response back to the frontend.
     */
    private void respond(
            HttpExchange exchange,
            int status,
            String body) throws IOException {

        exchange.getResponseHeaders().set(
                "Content-Type",
                "application/json; charset=UTF-8"
        );

        byte[] bytes =
                body.getBytes(
                        StandardCharsets.UTF_8
                );

        exchange.sendResponseHeaders(
                status,
                bytes.length
        );

        try (var output =
                     exchange.getResponseBody()) {

            output.write(bytes);
        }
    }
}
