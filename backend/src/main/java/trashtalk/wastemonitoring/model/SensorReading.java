package main.java.trashtalk.wastemonitoring.model;

import java.time.LocalDateTime;

/**
 * Stores one measurement received from a physical sensor.
 */
public class SensorReading {

    private int sensorID;
    private double value;
    private String unit;
    private LocalDateTime timestamp;

    /**
     * Creates a new sensor reading using the current date and time.
     *
     * Examples:
     * Ultrasonic sensor: value = 25.5, unit = "cm"
     * Weight sensor: value = 12.4, unit = "kg"
     */
    public SensorReading(int sensorID, double value, String unit) {
        this.sensorID = sensorID;
        this.value = value;
        this.unit = unit;
        this.timestamp = LocalDateTime.now();
    }

    public int getSensorID() {
        return sensorID;
    }

    public double getValue() {
        return value;
    }

    public String getUnit() {
        return unit;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }
}
