package main.java.trashtalk.wastemonitoring.model;

import java.time.LocalDateTime;

public class Alert {

	private int alertID;
	private int triBinID;
	private int binID;
	private char zone;
	private Severity severity;
	private String message;
	private LocalDateTime timestamp;
	private Kind kind;
	private boolean acknowledged;
	private boolean resolved;
	private LocalDateTime resolvedAt;
	
	/**
	 * Creates a new, unacknowledged and unresolved alert.
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
	 * Preserves compatibility with existing callers.
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
	
	
	public int getAlertID() {
		return alertID;
	}
	
	
	public int getTriBinID() {
		return triBinID;
	}
	
	
	public int getBinID() {
		return binID;
	}
	
	
	public char getZone() {
		return zone;
	}
	
	
	public Severity getSeverity() {
		return severity;
	}
	
	
	public String getMessage() {
		return message;
	}
	
	
	public LocalDateTime timestamp() {
		return timestamp;
	}
	
	public Kind getKind() {
		return kind;
	}
	
	public boolean isAcknowledged() {
		return acknowledged;
	}
	
	public void acknowledge() {
		acknowledged = true;
	}
	
	public boolean isResolved() {
		return resolved;
	}
	
	public LocalDateTime getResolvedAt() {
		return resolvedAt;
	}
	
	public enum Severity {
		INFO,
		WARN,
		CRITICAL
	}
	
	public enum Kind {
		FILL,
		OFFLINE,
		BATTERY
	}
}
