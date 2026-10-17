package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.dto.SensorReadingRequest;

/**
 * Creates fake sensor readings for Sprint 2 testing.
 *
 * This class acts like a real sensor until physical hardware is available.
 * It sends simulated distance readings through the existing gateway flow
 * and can also check the simulated battery level for sensor failure testing.
 */
public class FakeSensorService {

    // Uses the existing gateway service to process fake distance readings.
    private GatewayDataService gatewayDataService;

    // Uses the existing failure service to check simulated sensor problems.
    private SensorFailureService sensorFailureService;

    /**
     * Creates the services needed for fake sensor testing.
     */
    public FakeSensorService() {
        this.gatewayDataService = new GatewayDataService();
        this.sensorFailureService = new SensorFailureService();
    }

    /**
     * Sends one fake distance reading through the normal backend flow.
     *
     * @param sensor sensor that is sending the reading
     * @param bin bin connected to the sensor
     * @param distance simulated distance measurement in centimeters
     */
    public void sendFakeReading(
            Sensor sensor,
            Bin bin,
            double distance) {

        // Send the fake distance through the same gateway flow
        // that a real sensor reading would use.
        gatewayDataService.receiveReading(
                sensor.getSensorID(),
                distance,
                "cm",
                sensor,
                bin
        );
    }

    /**
     * Creates and sends a complete simulated sensor message.
     *
     * This includes the bin ID, sensor ID, sensor value,
     * unit, battery level, and timestamp used by the request object.
     *
     * @param sensor sensor producing the simulated reading
     * @param bin bin associated with the sensor
     * @param value simulated sensor value
     * @param unit unit associated with the sensor value
     * @param batteryLevel simulated battery percentage
     */
    public void sendFakeReading(
            Sensor sensor,
            Bin bin,
            double value,
            String unit,
            double batteryLevel) {

        // Create a complete simulated sensor request.
        SensorReadingRequest request =
                new SensorReadingRequest(
                        bin.getBinID(),
                        sensor.getSensorID(),
                        value,
                        unit,
                        batteryLevel
                );

        // Send the request through the project's existing gateway flow.
        gatewayDataService.receiveReading(
                request,
                sensor,
                bin
        );
    }

    /**
     * Checks whether a simulated battery level should count as low.
     *
     * @param batteryLevel simulated battery percentage
     * @param lowBatteryThreshold configured low-battery threshold
     * @return true when the battery is below the allowed threshold
     */
    public boolean hasLowBattery(
            double batteryLevel,
            double lowBatteryThreshold) {

        // Reuse the project's existing sensor failure rule.
        return sensorFailureService.hasLowBattery(
                batteryLevel,
                lowBatteryThreshold
        );
    }
}