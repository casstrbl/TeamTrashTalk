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
    public Sensor(int sensorID, SensorType sensorType) {
        this.sensorID = sensorID;
        this.sensorType = sensorType;
        this.active = true;
    }

    
    /**
     * Retrieves the sensor's ID number
     * @return
     */
    public int getSensorID() {
        return sensorID;
    }

    
    /**
     * Retrieves the sensor type
     * @return
     */
    public SensorType getSensorType() {
        return sensorType;
    }
    
    
    /**
     * Retrieves the binID of the bin that the sensor is assigned to
     * @return
     */
    public int getBinID() {
    	return binID;
    }

    
    /**
     * Retrieves the sensor's active status
     * @return
     */
    public boolean isActive() {
        return active;
    }

    
    /**
     * Sets the sensor's active status
     * @param active
     */
    public void setActive(boolean active) {
        this.active = active;
    }

    
    /**
     * Assigns the sensor to a specific bin
     * @param bin
     * (In case the sensor ever needs to be reassigned)
     */
    public void assignToBin(Bin bin) {
    	this.binID = bin.getBinID();
    }
    
    
    /**
     * Types of sensors used by the smart bin.
     */
    public enum SensorType {
        ULTRASONIC,
        WEIGHT
    }
}
