package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.repository.*;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.model.Bin;

import java.sql.Connection;
import java.sql.SQLException;


import main.java.trashtalk.wastemonitoring.model.Alert;


/**
 * Evaluates bin and sensor conditions and pushes alerts to AlertRepository.
 *
 * Fullness alerts are created when a TriBin enters the full state.
 * Near-full, offline, battery, and malfunction alerts are updated according
 * to whether each condition is currently active for a bin.
 *
 * Database operations use the JDBC connection supplied by the caller,
 * allowing alert updates to participate in the caller's transaction.
 */
public class AlertService {

	private TriBinService triBinService;			// Determines whether at least one bin in the TriBin is full.
    private AlertRepository alertRepository;		// Saves alerts and updates their resolution state in the database.
    
    private static final double LOW_BATTERY_PERCENT = 20.0;		// A battery level at or below this percentage triggers a warning.
    private static final double NEAR_FULL_PERCENT = 70.0;		// A bin enters the near-full range at this percentage.
    
    
    /**
     * Creates the service with the dependencies used to evaluate TriBin
     * fullness and persist alerts.
     *
     * @param triBinService service that determines whether a TriBin is full
     * @param alertRepository repository that saves and resolves alerts
     */
    public AlertService(TriBinService triBinService,
                        AlertRepository alertRepository) {

        this.triBinService = triBinService;
        this.alertRepository = alertRepository;
    }

    
    /**
     * Creates a critical fullness alert for each currently full bin when its TriBin first enters the full state.
     *
     * Check if the TriBin was full before applying the reading, then call this method after updating the affected bin's status. 
     * If the TriBin was already full, later readings and additional bins becoming full do not generate another collection alert.
     *
     * @param connection JDBC connection used to save the alerts
     * @param triBin TriBin containing the bins to check
     * @param wasFull whether the TriBin was full before the status update
     * @throws SQLException if an alert cannot be saved
     */
    public void checkTriBin(Connection connection, TriBin triBin, boolean wasFull) throws SQLException {

        boolean isFull = triBinService.isFull(triBin);

        // Only generate an alert when it first becomes full
        if (!wasFull && isFull) {

            for (Bin bin : triBin.getBins()) {

                if (bin.isFull()) {
                	// Store the bin ID to show which bin triggered the alert.
                	Alert alert = new Alert(
                	        triBin.getTriBinID(),
                	        bin.getBinID(),
                	        triBin.getZone(),
                	        Alert.Severity.CRITICAL,
                	        "TriBin " + triBin.getTriBinID()
                	                + " requires collection. Bin " + bin.getBinID()
                	                + " is full.",
                	        Alert.Kind.FULL
                	);

                	alertRepository.save(connection, alert);
                }
            }
        }
    }
    
    
    /**
     * Updates sensor alerts after receiving a report from the bin's assigned sensor. 
     * The caller verifies the sensor assignment before calling this method.
     *
     * Receipt of the report clears the offline condition. 
     * The malfunction flag separately records whether the reported waste height was invalid. 
     * A missing battery value leaves the previous battery alert state in place.
     *
     * @param connection JDBC connection used to update the alerts
     * @param bin bin assigned to the reporting sensor
     * @param triBin TriBin that contains the bin
     * @param battery reported battery percentage, or {@code null} if omitted
     * @param malfunction whether the report contained an invalid waste height
     * @throws SQLException if a sensor alert cannot be updated
     */
    public void checkSensorAlerts(Connection connection, Bin bin, TriBin triBin, Double battery, boolean malfunction) throws SQLException {
    	
    	 // A report from the assigned sensor confirms contact even if the height is invalid.
    	setAlert(connection, bin, triBin, Alert.Kind.OFFLINE, Alert.Severity.CRITICAL, false, "Sensor stopped reporting.");
    	
    	if (battery != null) {
    		// Round only for display. The threshold check uses the reported value.
    		int displayedBattery = (int) Math.round(battery);
    		
    		setAlert(connection, bin, triBin, Alert.Kind.BATTERY, Alert.Severity.WARN, battery <= LOW_BATTERY_PERCENT, "Sensor battery is " + displayedBattery + "%.");
    	}
    	
    	setAlert(connection, bin, triBin, Alert.Kind.MALFUNCTION, Alert.Severity.CRITICAL, malfunction, "Sensor reported an invalid waste height.");
    }
    
    
    /**
     * Updates the near-full warning after the bin's waste height and status have been updated for the current reading.
     *
     * The warning is active when the un-rounded fill percentage is at least 70% and the bin's status is anything other than RED.
     * The warning condition clears when the level falls below 70% or the bin reaches RED.
     *
     * @param connection JDBC connection used to update the alert
     * @param bin bin whose current waste height and status are checked
     * @param triBin TriBin that contains the bin
     * @throws SQLException if the near-full alert cannot be updated
     */
    public void checkNearFull(Connection connection, Bin bin, TriBin triBin) throws SQLException {
    	
    	// Convert waste height to a percentage of the bin's configured height.
    	double fillPercent = bin.getWasteHeight() / Bin.BIN_HEIGHT * 100.0;
    	boolean nearFull = fillPercent >= NEAR_FULL_PERCENT && bin.getStatus() != Bin.BinStatus.RED;
    	
    	
    	setAlert(connection, bin, triBin, Alert.Kind.NEAR_FULL, Alert.Severity.WARN, nearFull, "Bin " + bin.getBinID() + " in TriBin " + triBin.getTriBinID() + " is almost full.");
    }
    
    
    /**
     * Passes the current state of a bin's alert condition to the repository.
     * The temporary Alert gives the bin and TriBin IDs, zone, severity, kind, and message. 
     * The repository uses the active flag to decide how to update the stored alert.
     *
     * @param connection JDBC connection used to update the alert
     * @param bin bin associated with the condition
     * @param triBin TriBin that contains the bin
     * @param kind type of condition being tracked
     * @param severity urgency level assigned to the alert
     * @param active whether the condition is currently present
     * @param message description to store if a new alert is created
     * @throws SQLException if the alert condition cannot be updated
     */
    public void setAlert(Connection connection, Bin bin, TriBin triBin, Alert.Kind kind, Alert.Severity severity, boolean active, String message) throws SQLException {
    	Alert alert = new Alert(triBin.getTriBinID(), bin.getBinID(), triBin.getZone(), severity, message, kind);
    	
    	alertRepository.setCondition(connection, alert, active);
    }


    /**
     * Resolves fullness alerts for the TriBin once all of its bins are below full status.
     *
     * Call this after updating the affected bin's status. 
     * A fullness alert can remain open after the bin that triggered it has been emptied if another bin in the same TriBin is still full. 
     * Once the TriBin clears, check every bin because the original alerts are associated with individual bin IDs.
     *
     * @param connection JDBC connection used to resolve the alerts
     * @param triBin TriBin whose current fullness state is checked
     * @throws SQLException if a fullness alert cannot be resolved
     */
    public void resolveIfNoLongerFull(Connection connection, TriBin triBin) throws SQLException {

        if (!triBinService.isFull(triBin)) {

            for (Bin bin : triBin.getBins()) {
                alertRepository.resolveFullnessAlerts(connection, bin.getBinID()
                );
            }
        }
    }
}
