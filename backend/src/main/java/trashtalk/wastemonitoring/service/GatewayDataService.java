package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.SensorReading;

/**
 * Handles sensor data coming from a gateway or simulated gateway source.
 *
 * Current behavior:
 * - Accepts basic sensor data.
 * - Converts that data into a SensorReading object.
 * - Passes the reading to SensorService for processing.
 *
 * Future work:
 * - Connect this service to an API endpoint such as POST /sensor-readings.
 * - Accept real LoRaWAN gateway data.
 * - Validate incoming gateway payloads.
 * - Add error handling for unknown sensors or bins.
 */
public class GatewayDataService {

    private SensorService sensorService;

    public GatewayDataService() {
        this.sensorService = new SensorService();
    }

    public void receiveReading(
            int sensorID,
            double value,
            String unit,
            Sensor sensor,
            Bin bin) {

        SensorReading reading =
                new SensorReading(sensorID, value, unit);

        sensorService.processReading(reading, sensor, bin);
    }
}
