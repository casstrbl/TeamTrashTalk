package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.SensorReading;

public class SensorService {

    /**
     * Processes a sensor reading and updates the matching bin.
     *
     * Current behavior:
     * - Confirms the reading came from the expected sensor.
     * - Confirms the sensor belongs to the expected bin.
     * - Confirms the sensor is active.
     * - Updates the bin using the received reading value.
     *
     * Future work:
     * - For ultrasonic sensors, convert the measured distance
     *   into waste height using the actual internal liner depth.
     * - The current tribin spec only gives the overall structure height,
     *   so the liner depth still needs to be measured before final calibration.
     * - Look up sensors and bins automatically instead of passing them in directly.
     * - Add handling for invalid or missing sensor readings.
     * - Connect this method to the future API/gateway data path.
     */

	private final BinService binService = new BinService();
	
	/**
	 * Validates a reading without changing the bin.
	 */
	public boolean isValidReading(
	        SensorReading reading,
	        Sensor sensor,
	        Bin bin) {

	    if (reading == null
	            || sensor == null
	            || bin == null
	            || reading.getTimestamp() == null) {

	        return false;
	    }

	    if (reading.getSensorID() != sensor.getSensorID()
	            || sensor.getBinID() != bin.getBinID()
	            || !sensor.isActive()) {

	        return false;
	    }

	    double height = reading.getValue();

	    return Double.isFinite(height)
	            && height >= 0
	            && height <= Bin.BIN_HEIGHT;
	}

	/**
	 * Applies a valid reading to the bin.
	 * Timestamp ordering is managed by GatewayDataService.
	 */
	public boolean processReading(
	        SensorReading reading,
	        Sensor sensor,
	        Bin bin) {

	    if (!isValidReading(reading, sensor, bin)) {
	        return false;
	    }

	    bin.setWasteHeight(reading.getValue());
	    binService.setStatus(bin);

	    return true;
	}
}