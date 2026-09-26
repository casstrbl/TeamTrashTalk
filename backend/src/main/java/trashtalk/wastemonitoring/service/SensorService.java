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
    public void processReading(SensorReading reading, Sensor sensor, Bin bin) {
        if (reading.getSensorID() == sensor.getSensorID()
                && sensor.getBinID() == bin.getBinID()
                && sensor.isActive()) {

            // Temporary behavior:
            // The reading value is currently treated as waste height.
            // For ultrasonic sensors, this will later need to be converted
            // from sensor-to-trash distance into actual waste height/fullness.
            bin.setWasteHeight(reading.getValue());
        }
    }
}