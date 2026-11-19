package main.java.trashtalk.wastemonitoring.repository;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.model.Alert;


/**
 * Reads and writes alert records in the alerts table.
 *
 * Acknowledgment and resolution are tracked independently. 
 * Acknowledging an alert records that staff have seen it. 
 * Resolving an alert records when the condition cleared and preserves the row for alert history.
 *
 * Methods that obtain their own JDBC connection close it when finished.
 * Methods that accept a connection leave transaction management to the caller, so alert changes can participate in the same transaction as other updates.
 */
public class AlertRepository {

	/**
     * Inserts an alert using a connection obtained from DatabaseConfig.
     * Use this overload for a stand-alone insert.
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
	                ("triBinID", "binID", zone, severity,
	                 message, time, kind, acknowledged)
	            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	            """;

	 // Request the generated ID from the ID column after the insert.
	    try (PreparedStatement statement = connection.prepareStatement(
	                 sql, new String[] {"id"})) {

	        statement.setInt(1, alert.getTriBinID());
	        statement.setInt(2, alert.getBinID());
	        statement.setString(3, alert.getZone() == '\0' ? null : String.valueOf(alert.getZone()));	// '\0' represents a missing zone.
	        statement.setString(4, alert.getSeverity().name());		// Store enum names so they can be read back with Enum.valueOf().
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
     * Retrieves the complete alert history, including acknowledged and resolved alerts. 
     * Newest alerts appear first. 
     * If two alerts share a timestamp, the alert with the higher ID appears first.
     */
	public List<Alert> findAll() {
		List<Alert> alerts = new ArrayList<>();
		
		String sql = """
				
				SELECT * FROM alerts 
				ORDER BY time DESC, id DESC
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
	 * Retrieve alerts associated with a particular TriBin
	 */
    public List<Alert> findByTriBinID(int triBinID) {

        List<Alert> alerts = new ArrayList<>();

        String sql = """
            SELECT * FROM alerts
            WHERE "triBinID" = ?
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
     * Retrieves alerts whose acknowledgment and resolution flags are both false. 
     * An alert that clears before staff acknowledge it remains in history and drops out of this list.
     * */
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
     * Sets the stored acknowledgment flag for the alert with the given ID.
     * Repeating the call leaves the flag set to true. 
     * An unknown ID updates zero rows.
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
     * Resolves every unresolved full alert for one bin and stamps each affected row with the database's current time.
     * The caller determines when the TriBin's fullness condition has cleared.
     */
    public int resolveFullnessAlerts(Connection connection, int binID) {
        String sql = """
                UPDATE alerts
                SET resolved = TRUE,
                    resolved_at = CURRENT_TIMESTAMP
                WHERE "binID" = ?
                  AND kind = ?
                  AND resolved = FALSE
                """;

        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, binID);
            statement.setString(2, Alert.Kind.FULL.name());

            return statement.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException(
                    "Error resolving full-bin alerts for bin " + binID, e);
        }
    }
    
    
    /**
     * Opens an alert when its condition is active and no unresolved alert exists for the same bin and alert kind.
     * When the condition clear, any matching open alerts are resolved and preserved in alert history.
     */
    public void setCondition(
            Connection connection, Alert alert, boolean active) throws SQLException {

        String sql = active
                ? """
                  SELECT id FROM alerts
                  WHERE "binID" = ? AND kind = ? AND resolved = FALSE
                  """
                : """
                  UPDATE alerts
                  SET resolved = TRUE, resolved_at = CURRENT_TIMESTAMP
                  WHERE "binID" = ? AND kind = ? AND resolved = FALSE
                  """;

        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, alert.getBinID());
            statement.setString(2, alert.getKind().name());

            if (active) {
                try (ResultSet rows = statement.executeQuery()) {
                    if (rows.next()) {
                        return;
                    }
                }
            } else {
                statement.executeUpdate();
                return;
            }
        }

        save(connection, alert);
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
