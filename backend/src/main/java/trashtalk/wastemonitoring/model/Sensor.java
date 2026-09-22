package main.java.trashtalk.wastemonitoring.model;

/**
 * Represents a physical sensor installed in a waste bin.
 */
public class Sensor {

    private int sensorID;
    private int binID;
    private SensorType sensorType;
    private boolean active;

    /**
     * Creates a new sensor.
     *
     * @param sensorID unique sensor identification number
     * @param binID ID of the bin containing the sensor
     * @param sensorType type of sensor
     */
    public Sensor(int sensorID, int binID, SensorType sensorType) {
        this.sensorID = sensorID;
        this.binID = binID;
        this.sensorType = sensorType;
        this.active = true;
    }

    public int getSensorID() {
        return sensorID;
    }

    public int getBinID() {
        return binID;
    }

    public SensorType getSensorType() {
        return sensorType;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    /**
     * Types of sensors used by the smart bin.
     */
    public enum SensorType {
        ULTRASONIC,
        WEIGHT
    }
}
