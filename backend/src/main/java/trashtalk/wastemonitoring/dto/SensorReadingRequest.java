package main.java.trashtalk.wastemonitoring.dto;

/**
 * Represents incoming sensor data that can be received by the API.
 *
 * This keeps the input format general so it can work with different
 * sensor or gateway options selected for the project.
 */

public class SensorReadingRequest {
    // Unique ID of the sensor that produced the reading
    private int sensorID;

    // Numeric sensor value, such as distance, weight, or fullness
    private double value;

    // Unit for the reading, such as cm, kg, or %
    private String unit;

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
}
