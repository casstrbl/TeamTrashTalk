package main.java.trashtalk.wastemonitoring.repository;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Locale;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.model.StaffMember;

/**
 * Handles database lookups for staff members.
 */
public class StaffRepository {

    /**
     * Stores the staff member together with the password hash
     * used during login.
     */
    public record Credentials(
            StaffMember staff,
            String passwordHash) {
    }

    /**
     * Finds a staff member using their email address.
     *
     * @param email the email entered during login
     * @return the matching staff account and password hash,
     *         or null if no unique account is found
     */
    public Credentials findByEmail(String email) throws SQLException {

        // Read the staff profile and password hash from the database.
        String sql = """
                SELECT id, name, role, zone, email, password_hash
                FROM staff
                WHERE LOWER(TRIM(email)) = ?
                """;

        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement =
                     connection.prepareStatement(sql)) {

            // Ignore differences in capitalization or extra spaces.
            statement.setString(
                    1,
                    email.trim().toLowerCase(Locale.ROOT)
            );

            try (ResultSet rows = statement.executeQuery()) {

                // No matching staff account was found.
                if (!rows.next()) {
                    return null;
                }

                // Build the staff account and keep the password
                // hash separate from the StaffMember model.
                Credentials match =
                        new Credentials(
                                readStaff(rows),
                                rows.getString("password_hash")
                        );

                // If more than one account has the same email,
                // do not choose one automatically.
                return rows.next() ? null : match;
            }
        }
    }

    /**
     * Finds a staff member using their staff ID.
     *
     * This will later be used when checking the role
     * of an authenticated user.
     */
    public StaffMember findById(int id) throws SQLException {

        String sql =
                "SELECT id, name, role, zone, email "
                        + "FROM staff WHERE id = ?";

        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement =
                     connection.prepareStatement(sql)) {

            statement.setInt(1, id);

            try (ResultSet rows = statement.executeQuery()) {

                // Return the matching staff member if one exists.
                return rows.next()
                        ? readStaff(rows)
                        : null;
            }
        }
    }

    /**
     * Converts one database row into a StaffMember object.
     */
    private StaffMember readStaff(ResultSet row)
            throws SQLException {

        String zone = row.getString("zone");

        // Keep compatibility with the existing StaffMember
        // constructor and handle staff members with no zone.
        return new StaffMember(
                row.getInt("id"),
                row.getString("name"),
                row.getString("role"),
                zone == null
                        ? new char[0]
                        : zone.trim().toCharArray(),
                row.getString("email")
        );
    }
}