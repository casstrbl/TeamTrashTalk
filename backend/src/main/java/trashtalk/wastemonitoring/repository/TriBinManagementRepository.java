package main.java.trashtalk.wastemonitoring.repository;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;

/**
 * Handles database changes for adding, editing,
 * and relocating TriBin stations.
 */
public class TriBinManagementRepository {

    /**
     * Checks whether a TriBin already exists.
     */
    public boolean exists(int triBinID) throws SQLException {

        String sql = """
                SELECT 1
                FROM triBins
                WHERE triBinID = ?
                """;

        try (Connection connection =
                     DatabaseConfig.getConnection();

             PreparedStatement statement =
                     connection.prepareStatement(sql)) {

            statement.setInt(1, triBinID);

            try (ResultSet resultSet =
                         statement.executeQuery()) {

                return resultSet.next();
            }
        }
    }

    /**
     * Adds a new TriBin and its three compartments.
     */
    public void addTriBin(
            int triBinID,
            String zone,
            String location,
            double latitude,
            double longitude) throws SQLException {

        String triBinSql = """
                INSERT INTO triBins
                (triBinID, zone, location,
                 binCoordinatesX, binCoordinatesY,
                 battery, sensorStatus, lastUpdated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """;

        String binSql = """
                INSERT INTO bins
                (binID, triBinID, binType, wasteHeight)
                VALUES (?, ?, ?, ?)
                """;

        try (Connection connection =
                     DatabaseConfig.getConnection()) {

            connection.setAutoCommit(false);

            try {

                // Add the main TriBin station.
                try (PreparedStatement statement =
                             connection.prepareStatement(triBinSql)) {

                    statement.setInt(
                            1,
                            triBinID
                    );

                    // A blank zone is stored as NULL.
                    if (zone == null || zone.isBlank()) {
                        statement.setNull(
                                2,
                                Types.CHAR
                        );
                    } else {
                        statement.setString(
                                2,
                                zone.substring(0, 1)
                        );
                    }

                    statement.setString(
                            3,
                            location
                    );

                    /*
                     * The existing database uses X for longitude
                     * and Y for latitude.
                     */
                    statement.setDouble(
                            4,
                            longitude
                    );

                    statement.setDouble(
                            5,
                            latitude
                    );

                    // New stations start without live sensor data.
                    statement.setInt(
                            6,
                            0
                    );

                    statement.setString(
                            7,
                            "offline"
                    );

                    statement.setNull(
                            8,
                            Types.TIMESTAMP
                    );

                    statement.executeUpdate();
                }

                /*
                 * Create the three standard compartments.
                 * Example:
                 * TriBin 143 -> 14301, 14302, 14303.
                 */
                try (PreparedStatement statement =
                             connection.prepareStatement(binSql)) {

                    addCompartment(
                            statement,
                            triBinID * 100 + 1,
                            triBinID,
                            "LANDFILL"
                    );

                    addCompartment(
                            statement,
                            triBinID * 100 + 2,
                            triBinID,
                            "RECYCLING"
                    );

                    addCompartment(
                            statement,
                            triBinID * 100 + 3,
                            triBinID,
                            "COMPOST"
                    );

                    statement.executeBatch();
                }

                connection.commit();

            } catch (SQLException e) {

                // Undo everything if part of the add fails.
                connection.rollback();
                throw e;

            } finally {
                connection.setAutoCommit(true);
            }
        }
    }

    /**
     * Updates the editable details for a TriBin.
     */
    public boolean updateDetails(
            int triBinID,
            String zone,
            String location) throws SQLException {

        String sql = """
                UPDATE triBins
                SET zone = ?,
                    location = ?
                WHERE triBinID = ?
                """;

        try (Connection connection =
                     DatabaseConfig.getConnection();

             PreparedStatement statement =
                     connection.prepareStatement(sql)) {

            if (zone == null || zone.isBlank()) {
                statement.setNull(
                        1,
                        Types.CHAR
                );
            } else {
                statement.setString(
                        1,
                        zone.substring(0, 1)
                );
            }

            statement.setString(
                    2,
                    location
            );

            statement.setInt(
                    3,
                    triBinID
            );

            return statement.executeUpdate() > 0;
        }
    }

    /**
     * Updates the GPS location of an existing TriBin.
     */
    public boolean relocate(
            int triBinID,
            double latitude,
            double longitude) throws SQLException {

        String sql = """
                UPDATE triBins
                SET binCoordinatesX = ?,
                    binCoordinatesY = ?
                WHERE triBinID = ?
                """;

        try (Connection connection =
                     DatabaseConfig.getConnection();

             PreparedStatement statement =
                     connection.prepareStatement(sql)) {

            // X stores longitude in the existing database.
            statement.setDouble(
                    1,
                    longitude
            );

            // Y stores latitude in the existing database.
            statement.setDouble(
                    2,
                    latitude
            );

            statement.setInt(
                    3,
                    triBinID
            );

            return statement.executeUpdate() > 0;
        }
    }

    /**
     * Adds one compartment to the batch insert.
     */
    private void addCompartment(
            PreparedStatement statement,
            int binID,
            int triBinID,
            String binType) throws SQLException {

        statement.setInt(
                1,
                binID
        );

        statement.setInt(
                2,
                triBinID
        );

        statement.setString(
                3,
                binType
        );

        // A newly added bin starts empty.
        statement.setDouble(
                4,
                0.0
        );

        statement.addBatch();
    }
}
