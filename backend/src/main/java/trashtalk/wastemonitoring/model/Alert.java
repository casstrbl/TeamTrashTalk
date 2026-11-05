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
	
	
	public Alert(int alertID, int triBinID, int binID, String message) {
		this.alertID = alertID;
		this.triBinID = triBinID;
		this.binID = binID;
		this.message = message;
		this.timestamp = LocalDateTime.now();
		this.acknowledged = false;
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
