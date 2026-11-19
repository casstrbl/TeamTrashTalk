package main.java.trashtalk.wastemonitoring.repository;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.model.Alert;

public class AlertRepository {

	/**
	 * Saves an alert independently.
	 * Retained for callers that do not manage a transaction.
	 */
	public int save(Alert alert) {

	    try (Connection connection = DatabaseConfig.getConnection()) {
	        return save(connection, alert);

	    } catch (SQLException e) {
	        throw new IllegalStateException(
	                "Could not save alert.", e
	        );
	    }
	}
	
	
	/**
	 * Saves an alert using the caller's transaction.
	 * Does not close, commit, or roll back the supplied connection.
	 */
	public int save(Connection connection, Alert alert) throws SQLException {

	    String sql = """
	            INSERT INTO alerts
	                (triBinID, binID, zone, severity,
	                 message, time, kind, acknowledged)
	            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	            """;

	    try (PreparedStatement statement = connection.prepareStatement(
	                 sql, new String[] {"id"})) {

	        statement.setInt(1, alert.getTriBinID());
	        statement.setInt(2, alert.getBinID());
	        statement.setString(3, alert.getZone() == '\0' ? null : String.valueOf(alert.getZone()));
	        statement.setString(4, alert.getSeverity().name());
	        statement.setString(5, alert.getMessage());
	        statement.setTimestamp(6, Timestamp.valueOf(alert.timestamp()));
	        statement.setString(7, alert.getKind().name());
	        statement.setBoolean(8, alert.isAcknowledged());

	        statement.executeUpdate();

	        try (ResultSet keys = statement.getGeneratedKeys()) {
	            if (keys.next()) {
	                return keys.getInt(1);
	            }
	        }

	        throw new SQLException("No alert ID was generated.");

	    } catch (SQLException e) {
	        throw new RuntimeException("Error saving alert.", e);
	    }
	}
	
	
	/**
	 * Retrieve all alerts
	 */
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
	            throw new RuntimeException("Error retrieving alerts.", e);
	        }

	        return alerts;
	    }
	
	
	/**
	 * Retrieve alerts associated with a particular TriBin
	 */
    public List<Alert> findByTriBinID(int triBinID) {

        List<Alert> alerts = new ArrayList<>();

        String sql = """
            SELECT * FROM alerts
            WHERE triBinID = ?
            ORDER BY time DESC
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
            throw new RuntimeException("Error retrieving alerts.", e);
        }

        return alerts;
    }
    
    
 /**
  * Retrieve unresolved alerts that have not been acknowledged
  */
    public List<Alert> findUnacknowledged() {

        List<Alert> alerts = new ArrayList<>();

        String sql = """
            SELECT * FROM alerts
            WHERE acknowledged = FALSE
        		AND resolved = FALSE
            ORDER BY time DESC
            """;

        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet results = statement.executeQuery()) {

            while (results.next()) {
                alerts.add(mapAlert(results));
            }

        } catch (SQLException e) {
            throw new RuntimeException("Error retrieving alerts.", e);
        }

        return alerts;
    }

    
    /**
     * Mark an alert as acknowledged
     */
    public void acknowledge(int alertID) {

        String sql = """
            UPDATE alerts
            SET acknowledged = TRUE
            WHERE id = ?
            """;

        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {

            statement.setInt(1, alertID);
            statement.executeUpdate();

        } catch (SQLException e) {
            throw new RuntimeException("Error retrieving alerts.", e);
        }
    }
    
    
    /**
     * Resolves active fullness alerts for a bin.
     */
    public int resolveFullnessAlerts(Connection connection, int binID) {
    	String resolveAlerts = """
    			UPDATE alerts 
    			SET resolved = TRUE, 
    				resolved_at = CURRENT_TIMESTAMP
    				WHERE binID = ?
    					AND kind = ?
    					AND resolved = FALSE
    			""";
    	
    	try (PreparedStatement statement =
    					connection.prepareStatement(resolveAlerts)) {
    		
    		statement.setInt(1, binID);
    		statement.setString(2, Alert.Kind.FILL.name());
    		
    		return statement.executeUpdate();
    		
    	} catch (SQLException e) {
    		throw new RuntimeException(
    				"Error resolving fullness alerts for bin " + binID, e);
    	}
    }

    
    /**
     * Converts a database row into an Alert, including resolution state.
     */
    private Alert mapAlert(ResultSet results) throws SQLException {

        String storedZone = results.getString("zone");

        char zone = storedZone == null || storedZone.isEmpty()
                ? '\0'
                : storedZone.charAt(0);

        Timestamp resolvedAt = results.getTimestamp("resolved_at");

        return new Alert(
                results.getInt("id"),
                results.getInt("triBinID"),
                results.getInt("binID"),
                zone,
                Alert.Severity.valueOf(results.getString("severity")),
                results.getString("message"),
                results.getTimestamp("time").toLocalDateTime(),
                Alert.Kind.valueOf(results.getString("kind")),
                results.getBoolean("acknowledged"),
                results.getBoolean("resolved"),
                resolvedAt == null ? null : resolvedAt.toLocalDateTime()
        );
    }
}
