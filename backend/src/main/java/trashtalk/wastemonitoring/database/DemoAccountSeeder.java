package main.java.trashtalk.wastemonitoring.database;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Locale;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.service.PasswordService;

// creates (or updates) test logins from environment variables, so passwords never live in the repo
// DEMO_EDITOR_EMAIL + DEMO_EDITOR_PASSWORD -> an editor account
// DEMO_VIEWER_EMAIL + DEMO_VIEWER_PASSWORD -> a viewer account
// leave them unset and nothing happens
public class DemoAccountSeeder {

    private DemoAccountSeeder() {
    }

    public static void seedFromEnvironment() {
        seed("editor", System.getenv("DEMO_EDITOR_EMAIL"), System.getenv("DEMO_EDITOR_PASSWORD"));
        seed("viewer", System.getenv("DEMO_VIEWER_EMAIL"), System.getenv("DEMO_VIEWER_PASSWORD"));
    }

    static void seed(String role, String email, String password) {
        if (email == null || email.isBlank() || password == null || password.isBlank()) {
            return;
        }
        String cleanEmail = email.trim().toLowerCase(Locale.ROOT);
        String hash = new PasswordService().hashPassword(password.toCharArray());

        try (Connection connection = DatabaseConfig.getConnection()) {
            if (update(connection, cleanEmail, role, hash) == 0) {
                insert(connection, nextId(connection), cleanEmail, role, hash);
            }
            System.out.println("Test " + role + " login ready: " + cleanEmail);
        } catch (SQLException e) {
            // a bad seed shouldn't stop the server
            System.err.println("Could not set up the test " + role + " login: " + e.getMessage());
        }
    }

    private static int update(Connection connection, String email, String role, String hash) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "UPDATE staff SET role = ?, password_hash = ? WHERE LOWER(TRIM(email)) = ?")) {
            statement.setString(1, role);
            statement.setString(2, hash);
            statement.setString(3, email);
            return statement.executeUpdate();
        }
    }

    private static void insert(Connection connection, int id, String email, String role, String hash) throws SQLException {
        String name = "Test " + Character.toUpperCase(role.charAt(0)) + role.substring(1);
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO staff (id, name, role, zone, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)")) {
            statement.setInt(1, id);
            statement.setString(2, name);
            statement.setString(3, role);
            statement.setString(4, "A");
            statement.setString(5, email);
            statement.setString(6, hash);
            statement.executeUpdate();
        }
    }

    // staff ids aren't auto-numbered, so take the next free one
    private static int nextId(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT COALESCE(MAX(id), 0) + 1 FROM staff");
             ResultSet rows = statement.executeQuery()) {
            rows.next();
            return rows.getInt(1);
        }
    }
}
