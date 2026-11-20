package main.java.trashtalk.wastemonitoring.model;

import java.time.LocalDateTime;

/**
 * Represents an alert associated with a bin and its parent TriBin.
 * An alert records the condition that triggered it, its severity, and the
 * time it was recorded.
 *
 * Note: Acknowledgment and resolution track different events. Acknowledgment
 * records that staff have seen the alert. Resolution records that the
 * underlying condition has been marked as addressed.
 */
public class Alert {

	private int alertID;					// Alert identifier. A newly constructed alert starts with an ID of 0
	private int triBinID;					// Identifiers of the affected bin and its parent TriBin
	private int binID;
	private char zone;						// Campus zone associated with the TriBin
	private Severity severity;				// Urgency of the alert.
	private String message;					// Description of the alert condition.
	private LocalDateTime timestamp;		// Time the alert was recorded.
	private Kind kind;						// Condition that triggered the alert, such as a full bin or low battery.
	private boolean acknowledged;			// Whether staff have acknowledged the alert.
	private boolean resolved;				// Whether the alert has been marked as resolved.
	private LocalDateTime resolvedAt;		// Recorded resolution time.
	
	/**
     * Creates a new alert for a detected condition. The alert starts with an ID of 0 and the current local date and time. 
     * It is initially unacknowledged and unresolved, with no resolution timestamp.
     */
	public Alert(
	        int triBinID,
	        int binID,
	        char zone,
	        Severity severity,
	        String message,
	        Kind kind) {

	    this(
	            0,
	            triBinID,
	            binID,
	            zone,
	            severity,
	            message,
	            LocalDateTime.now(),
	            kind,
	            false,
	            false,
	            null
	    );
	}
	
	/**
     * Creates an alert using the original constructor signature for callers that supply acknowledgment status without resolution information.
     */
	public Alert(int alertID,
				int triBinID,
				int binID, 
				char zone, 
				Severity severity, 
				String message, 
				LocalDateTime timestamp,
				Kind kind,
				boolean acknowledged) {

	    this(
	        alertID,
	        triBinID,
	        binID,
	        zone,
	        severity,
	        message,
	        timestamp,
	        kind,
	        acknowledged,
	        false,
	        null
	    );
	}

	/**
	 * Reconstructs an existing alert from the database.
	 */
	public Alert(int alertID, 
				int triBinID, 
				int binID, 
				char zone, 
				Severity severity, 
				String message, 
				LocalDateTime timestamp, 
				Kind kind, 
				boolean acknowledged,
				boolean resolved,
				LocalDateTime resolvedAt) {

	    this.alertID = alertID;
	    this.triBinID = triBinID;
	    this.binID = binID;
	    this.zone = zone;
	    this.severity = java.util.Objects.requireNonNull(severity);
	    this.message = message;
	    this.timestamp = java.util.Objects.requireNonNull(timestamp);
	    this.kind = java.util.Objects.requireNonNull(kind);
	    this.acknowledged = acknowledged;
	    this.resolved = resolved;
	    this.resolvedAt = resolvedAt;
	}
	
	// Returns the alert ID for a newly created alert.
	public int getAlertID() {
		return alertID;
	}
	
	// Returns the ID of the affected bin's parent TriBin.
	public int getTriBinID() {
		return triBinID;
	}
	
	// Returns the ID of the affected bin.
	public int getBinID() {
		return binID;
	}
	
	// Returns the campus zone associated with the TriBin.
	public char getZone() {
		return zone;
	}
	
	// Returns the level of urgency assigned to the alert.
	public Severity getSeverity() {
		return severity;
	}
	
	// Returns an easily readable alert message.
	public String getMessage() {
		return message;
	}
	
	// Returns the local date and time the alert was recorded.
	public LocalDateTime timestamp() {
		return timestamp;
	}
	
	// Returns the condition that triggered the alert.
	public Kind getKind() {
		return kind;
	}
	
	// Returns true if the alert has been acknowledged.
	public boolean isAcknowledged() {
		return acknowledged;
	}
	
	// Marks the alert as acknowledged in memory.
	public void acknowledge() {
		acknowledged = true;
	}
	
	// Returns true if the alert has been marked as resolved.
	public boolean isResolved() {
		return resolved;
	}
	
	// Returns the recorded resolution time.
	public LocalDateTime getResolvedAt() {
		return resolvedAt;
	}
	
	// Describes the urgency of the alert.
	public enum Severity {
		INFO,			// Informational notification.
		WARN,			// Warning about a condition that needs attention.
		CRITICAL		// Highest urgency level for a condition that needs immediate attention.
	}
	
	// Identifies the bin or sensor condition that triggered an alert.
	public enum Kind {
		FULL,				// The bin has reached the full threshold.
		NEAR_FULL,			// The bin is approaching the full threshold.
		OFFLINE,			// The sensor has stopped reporting within the expected time.
		BATTERY,			// The sensor has a low battery level.
		MALFUNCTION			// The system has detected a fault in the sensor.
	}
}
