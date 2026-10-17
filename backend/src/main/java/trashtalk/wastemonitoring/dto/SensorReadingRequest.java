package main.java.trashtalk.wastemonitoring.dto;
import java.time.LocalDateTime;

/**
 * Represents incoming sensor data that can be received by the API.
 *
 * This keeps the input format general so it can work with different
 * sensor or gateway options selected for the project.
 */

public class SensorReadingRequest {

    // Unique ID of the bin associated with the reading.
    private int binID;

    // Time when the sensor reading was created.
    private LocalDateTime timestamp;

    // Unique ID of the sensor that produced the reading
    private int sensorID;

    // Numeric sensor value, such as distance, weight, or fullness
    private double value;

    // Unit for the reading, such as cm, kg, or %
    private String unit;

    // Battery percentage reported by the sensor.
    private double batteryLevel;

    /**
     * Creates a new incoming sensor reading request.
     *
     * @param sensorID ID of the sensor sending the reading
     * @param value numeric value reported by the sensor
     * @param unit unit associated with the value
     */

    public SensorReadingRequest(int sensorID, double value, String unit) {
        this.sensorID = sensorID;
        this.value = value;
        this.unit = unit;
        this.timestamp = LocalDateTime.now();
    }

    /**
     * Creates a new incoming sensor reading request that also
     * includes the sensor battery level.
     *
     * @param sensorID ID of the sensor sending the reading
     * @param value numeric value reported by the sensor
     * @param unit unit associated with the value
     * @param batteryLevel battery percentage reported by the sensor
     */
    public SensorReadingRequest(
            int sensorID,
            double value,
            String unit,
            double batteryLevel) {

        this.sensorID = sensorID;
        this.value = value;
        this.unit = unit;
        this.batteryLevel = batteryLevel;
        this.timestamp = LocalDateTime.now();
    }

    /**
     * Creates a complete simulated sensor reading request.
     *
     * @param binID ID of the bin associated with the reading
     * @param sensorID ID of the sensor sending the reading
     * @param value numeric value reported by the sensor
     * @param unit unit associated with the value
     * @param batteryLevel battery percentage reported by the sensor
     */
    public SensorReadingRequest(
            int binID,
            int sensorID,
            double value,
            String unit,
            double batteryLevel) {

        this.binID = binID;
        this.sensorID = sensorID;
        this.value = value;
        this.unit = unit;
        this.batteryLevel = batteryLevel;
        this.timestamp = LocalDateTime.now();
    }

    // Retrieves the sensor ID.
    public int getSensorID() {
        return sensorID;
    }

    // Retrieves the sensor value.
    public double getValue() {
        return value;
    }

    // Retrieves the unit associated with the value.
    public String getUnit() {
        return unit;
    }

    /**
     * Retrieves the battery percentage reported by the sensor.
     *
     * @return sensor battery percentage
     */
    public double getBatteryLevel() {
        return batteryLevel;
    }

    /**
     * Retrieves the bin ID associated with the reading.
     *
     * @return bin ID
     */
    public int getBinID() {
        return binID;
    }

    /**
     * Retrieves the time when the reading was created.
     *
     * @return reading timestamp
     */
    public LocalDateTime getTimestamp() {
        return timestamp;
    }
}
