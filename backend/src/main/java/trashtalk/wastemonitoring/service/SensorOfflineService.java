package main.java.trashtalk.wastemonitoring.service;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.model.Alert;
import main.java.trashtalk.wastemonitoring.repository.AlertRepository;

public class SensorOfflineService {

	private final AlertRepository alerts = new AlertRepository();
	private final LocalDateTime startedAt = LocalDateTime.now();
	private final Duration timeout;
	
	public SensorOfflineService(Duration timeout) {
		if (timeout.isZero() || timeout.isNegative()) {
			throw new IllegalArgumentException("Offline timeout must be positive");
		}
		
		this.timeout = timeout;
	}
	
	
	public void check() throws SQLException {
		LocalDateTime cutoff = LocalDateTime.now().minus(timeout);
		List<Integer> triBinIDs = new ArrayList<>();
		
		try (Connection connection = DatabaseConfig.getConnection();
				PreparedStatement statement = connection.prepareStatement("""
						SELECT triBinID
						FROM triBins
						WHERE LOWER(sensorStatus) = 'online'
						ORDER BY triBinID
						""");
				ResultSet rows = statement.executeQuery()) {
			
			while (rows.next()) {
				triBinIDs.add(rows.getInt("triBinID"));
			}
		}
		
		for (int triBinID : triBinIDs) {
			checkTriBin(triBinID, cutoff);
		}
	}
	
	private void checkTriBin(int triBinID, LocalDateTime cutoff) throws SQLException {
		
		try (Connection connection = DatabaseConfig.getConnection()) {
			connection.setAutoCommit(false);
			
			try {
				try (PreparedStatement triBin = connection.prepareStatement("""
						SELECT zone, sensorStatus
						FROM triBins
						WHERE triBinID = ?
						FOR UPDATE
						""");
						
						PreparedStatement bins = connection.prepareStatement("""
								SELECT binID, last_sensor_contact
								FROM bins
								WHERE triBinID = ?
								""")) {
					
					triBin.setInt(1,  triBinID);
					try (ResultSet row = triBin.executeQuery()) {
						if (row.next() && "online".equalsIgnoreCase(row.getString("sensorStatus"))) {
							
							String storedZone = row.getString("zone");
							char zone = storedZone == null || storedZone.isBlank() ? '\0' : storedZone.charAt(0);
							
							bins.setInt(1, triBinID);
							
							try (ResultSet b = bins.executeQuery()) {
								while (b.next()) {
									Timestamp contact = b.getTimestamp("last_sensor_contact");
									LocalDateTime lastSeen = contact == null ? startedAt : contact.toLocalDateTime();
									
									
									if (!lastSeen.isAfter(cutoff)) {
										int binID = b.getInt("binID");
										alerts.setCondition(connection, new Alert(triBinID, 
																					binID, 
																					zone, 
																					Alert.Severity.CRITICAL, 
																					"Sensor stopped reporting for bin " + binID + " in tribin " + triBinID + ".", 
																					Alert.Kind.OFFLINE), true);
									}
								}
							}
						}
					}
			}
				
				connection.commit();
			} catch (SQLException | RuntimeException error) {
				try {
					connection.rollback();
				} catch (SQLException rollbackError) {
					error.addSuppressed(rollbackError);
				}
				
			throw error;
			}
		}
	}
}
