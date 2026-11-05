package main.java.trashtalk.wastemonitoring.repository;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;

/**
 * Handles database operations for completed pickups.
 */
public class PickupRepository {

    /**
     * Saves who emptied a TriBin and when it was emptied.
     */
    public void saveCompletedPickup(
            int triBinID,
            int staffID,
            LocalDateTime completedAt) throws SQLException {

        String sql = """
                INSERT INTO pickup_history
                (triBinID, staffID, completedAt)
                VALUES (?, ?, ?)
                """;

        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement =
                     connection.prepareStatement(sql)) {

            // Save the TriBin that was emptied.
            statement.setInt(1, triBinID);

            // Save the logged-in staff member.
            statement.setInt(2, staffID);

            // Save when the pickup was completed.
            statement.setTimestamp(
                    3,
                    Timestamp.valueOf(completedAt)
            );

            statement.executeUpdate();
        }
    }
}