package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.dto.SensorReadingRequest;

/**
 * Creates simulated sensor readings and sends them through
 * the normal gateway processing flow.
 */
public class FakeSensorService {

    private final GatewayDataService gatewayDataService;
    private final SensorFailureService sensorFailureService;

    /**
     * Creates the services needed for fake sensor testing.
     */
    public FakeSensorService() {
        this(new GatewayDataService(), new SensorFailureService());
    }

    /**
     * Allows the application to supply shared service instances.
     */
    public FakeSensorService(
            GatewayDataService gatewayDataService,
            SensorFailureService sensorFailureService) {

        this.gatewayDataService = gatewayDataService;
        this.sensorFailureService = sensorFailureService;
    }

    /**
     * Sends a simulated distance reading in centimeters.
     *
     * @param sensor sensor producing the reading
     * @param bin bin assigned to the sensor
     * @param triBin parent tribin containing the bin
     * @param distance simulated distance in centimeters
     */
    public void sendFakeReading(
            Sensor sensor,
            Bin bin,
            TriBin triBin,
            double distance) {

        gatewayDataService.receiveReading(
                sensor.getSensorID(),
                distance,
                "cm",
                sensor,
                bin,
                triBin
        );
    }

    /**
     * Creates and sends a simulated sensor request.
     *
     * @param sensor sensor producing the reading
     * @param bin bin assigned to the sensor
     * @param triBin parent tribin containing the bin
     * @param value simulated sensor value
     * @param unit measurement unit
     * @param batteryLevel simulated battery percentage
     */
    public void sendFakeReading(
            Sensor sensor,
            Bin bin,
            TriBin triBin,
            double value,
            String unit,
            double batteryLevel) {

        SensorReadingRequest request = new SensorReadingRequest(
                bin.getBinID(),
                sensor.getSensorID(),
                value,
                unit,
                batteryLevel
        );

        gatewayDataService.receiveReading(
                request,
                sensor,
                bin,
                triBin
        );
    }

    /**
     * Checks whether the simulated battery is below the threshold.
     */
    public boolean hasLowBattery(
            double batteryLevel,
            double lowBatteryThreshold) {

        return sensorFailureService.hasLowBattery(
                batteryLevel,
                lowBatteryThreshold
        );
    }
}