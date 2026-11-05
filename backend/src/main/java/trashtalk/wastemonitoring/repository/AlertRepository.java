package main.java.trashtalk.wastemonitoring.repository;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.model.Alert;

public class AlertRepository {

	// Save a new alert
	public int save(Alert alert) {
		
		String sql = """
				INSERT INTO alerts
				(triBinID, binID, zone, severity, message, time, kind, acknowledged)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				""";
		
		try (Connection connection = DatabaseConfig.getConnection();
				PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)){
			
			statement.setInt(1, alert.getTriBinID());
			statement.setInt(2, alert.getBinID());
			statement.setString(3, String.valueOf(alert.getZone()));
			statement.setString(4, alert.getSeverity().name());
			statement.setString(5, alert.getMessage());
			statement.setTimestamp(6, Timestamp.valueOf(alert.timestamp()));
			statement.setString(7, alert.getKind().name());
			statement.setInt(8, alert.getTriBinID());
			statement.setBoolean(9, alert.isAcknowledged());
			
			statement.executeUpdate();
			
			try (ResultSet keys = statement.getGeneratedKeys()) {
				if (keys.next())
					return keys.getInt(1);
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
		
		return -1;
	}
	
	
	// Retrieve all alerts
	public List<Alert> findAll() {
		List<Alert> alerts = new ArrayList<>();
		
		String sql = "SELECT * FROM alerts ORDER BY time DESC";
		
		try (Connection connection = DatabaseConfig.getConnection();
	             PreparedStatement statement = connection.prepareStatement(sql);
	             ResultSet results = statement.executeQuery()) {

	            while (results.next()) {
	                alerts.add(mapAlert(results));
	            }

	        } catch (SQLException e) {
	            e.printStackTrace();
	        }

	        return alerts;
	    }
	
	// Retrieve alerts associated with a particular TriBin
    public List<Alert> findByTriBinID(int triBinID) {

        List<Alert> alerts = new ArrayList<>();

        String sql = """
            SELECT * FROM alerts
            WHERE tri_bin_id = ?
            ORDER BY created_at DESC
            """;

        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {

            statement.setInt(1, triBinID);

            try (ResultSet results = statement.executeQuery()) {
                while (results.next()) {
                    alerts.add(mapAlert(results));
                }
            }

        } catch (SQLException e) {
            e.printStackTrace();
        }

        return alerts;
    }
    
 // Retrieve alerts that have not been acknowledged
    public List<Alert> findUnacknowledged() {

        List<Alert> alerts = new ArrayList<>();

        String sql = """
            SELECT * FROM alerts
            WHERE acknowledged = FALSE
            ORDER BY created_at DESC
            """;

        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet results = statement.executeQuery()) {

            while (results.next()) {
                alerts.add(mapAlert(results));
            }

        } catch (SQLException e) {
            e.printStackTrace();
        }

        return alerts;
    }

    // Mark an alert as acknowledged
    public void acknowledge(int alertID) {

        String sql = """
            UPDATE alerts
            SET acknowledged = TRUE
            WHERE alert_id = ?
            """;

        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {

            statement.setInt(1, alertID);
            statement.executeUpdate();

        } catch (SQLException e) {
            e.printStackTrace();
        }
    }

    // Convert a database row into an Alert object
    private Alert mapAlert(ResultSet results) throws SQLException {

        return new Alert(
        		results.getInt("alertID"),
        		results.getInt("triBinID"),
        		results.getInt("binID"),
        		results.getString("message")
        		);
    }
}
