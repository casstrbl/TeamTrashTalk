package main.java.trashtalk.wastemonitoring.database;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;

/**
 * Temporary class to view database information for backend testing
 */
public class DatabaseViewer {

    public static void viewTriBins() {

        String sql = """
            SELECT *
            FROM triBins
            ORDER BY triBinID
            """;

        try (Connection connection =
                DatabaseConfig.getConnection();

             PreparedStatement statement =
                connection.prepareStatement(sql);

             ResultSet resultSet =
                statement.executeQuery()) {

            System.out.println("\n=== TRI-BINS ===");

            while (resultSet.next()) {

                System.out.println(
                    "TriBin ID: "
                    + resultSet.getInt("triBinID")
                );
                System.out.println(
                        "Zone: "
                        + resultSet.getString("zone")
                    );

                    System.out.println(
                        "Location: "
                        + resultSet.getString("location")
                    );

                    System.out.println(
                        "Coordinates: "
                        + resultSet.getDouble("binCoordinatesX")
                        + ", "
                        + resultSet.getDouble("binCoordinatesY")
                    );

                    System.out.println();
                }

            } catch (SQLException e) {

                throw new RuntimeException(
                    "Error reading TriBin data.",
                    e
                );
            }
        }
    public static void viewBins() {

        String sql = """
            SELECT *
            FROM bins
            ORDER BY triBinID, binID
            """;

        try (Connection connection =
                DatabaseConfig.getConnection();

             PreparedStatement statement =
                connection.prepareStatement(sql);

             ResultSet resultSet =
                statement.executeQuery()) {

            System.out.println("\n=== BINS ===");

            while (resultSet.next()) {

                System.out.println(
                    "Bin ID: "
                    + resultSet.getInt("binID")
                );

                System.out.println(
                    "TriBin ID: "
                    + resultSet.getInt("triBinID")
                );

                System.out.println(
                    "Type: "
                    + resultSet.getString("binType")
                );

                System.out.println(
                    "Waste Height: "
                    + resultSet.getDouble("wasteHeight")
                    + " cm"
                );
                System.out.println();
            }

        } catch (SQLException e) {

            throw new RuntimeException(
                "Error reading Bin data.",
                e
            );
        }
    }
    
    
    public static void viewStaff() {

        String sql = """
            SELECT *
            FROM staff
            ORDER BY name
            """;

        try (Connection connection =
                DatabaseConfig.getConnection();

             PreparedStatement statement =
                connection.prepareStatement(sql);

             ResultSet resultSet =
                statement.executeQuery()) {

            System.out.println("\n=== STAFF ===");

            while (resultSet.next()) {

                System.out.println(
                    "Staff ID: "
                    + resultSet.getInt("id")
                );

                System.out.println(
                    "Name: "
                    + resultSet.getString("name")
                );

                System.out.println(
                    "Role: "
                    + resultSet.getString("role")
                );

                System.out.println(
                    "Zone: "
                    + resultSet.getString("zone")
                );
                
                System.out.println(
                		"Email: "
                		+ resultSet.getString("email")
                		);

                System.out.println();
            }

        } catch (SQLException e) {

            throw new RuntimeException(
                "Error reading Staff data.",
                e
            );
        }
    }

    public static void viewAlerts() {

        String sql = """
            SELECT *
            FROM alerts
            ORDER BY id DESC
            """;

        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {

            System.out.println("\n=== ALERTS ===");

            if (!resultSet.next()) {
                System.out.println("No alerts found.");
                return;
            }

            do {
                System.out.println("Alert ID: " + resultSet.getInt("id"));
                System.out.println("Bin ID: " + resultSet.getInt("binID"));
                System.out.println("TriBin ID: " + resultSet.getInt("triBinID"));
                System.out.println("Zone: " + resultSet.getString("zone"));
                System.out.println("Kind: " + resultSet.getString("kind"));
                System.out.println("Severity: " + resultSet.getString("severity"));
                System.out.println("Message: " + resultSet.getString("message"));
                System.out.println("Time: " + resultSet.getTimestamp("time"));
                System.out.println("Acknowledged: " + resultSet.getBoolean("acknowledged"));
                System.out.println("Resolved: " + resultSet.getBoolean("resolved"));
                if (resultSet.getTimestamp("resolved_at") != null) {
                    System.out.println("Resolved At: " + resultSet.getTimestamp("resolved_at"));
                }
                System.out.println();
            } while (resultSet.next());

        } catch (SQLException e) {
            throw new RuntimeException("Error reading alert data.", e);
        }
    }
}
