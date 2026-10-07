package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.service.GatewayDataService;
import main.java.trashtalk.wastemonitoring.dto.SensorReadingRequest;

class GatewayDataServiceTest {

    @Test
    void receiveReadingUpdatesMatchingBin() {

        // Create a recycling bin
        Bin bin = new Bin(1, "Library", Bin.BinType.RECYCLING);

        // Create an ultrasonic sensor for the recycling bin
        Sensor sensor = new Sensor(
                101,
                Sensor.SensorType.ULTRASONIC
        );

        // Assign the sensor to the recycling bin
        sensor.assignToBin(bin);

        // Simulate gateway data being received
        GatewayDataService gatewayDataService = new GatewayDataService();

        gatewayDataService.receiveReading(
                101,
                25.5,
                "cm",
                sensor,
                bin
        );

        // Confirm that the reading reached the bin
        assertEquals(25.5, bin.getWasteHeight());
    }
    @Test
    void receiveRequestUpdatesMatchingBin() {

        // Create a recycling bin
        Bin bin = new Bin(1, "Library", Bin.BinType.RECYCLING);

        // Create and assign an ultrasonic sensor
        Sensor sensor = new Sensor(
                101,
                Sensor.SensorType.ULTRASONIC
        );
        sensor.assignToBin(bin);

        // Create a generalized sensor reading request
        SensorReadingRequest request =
                new SensorReadingRequest(101, 25.5, "cm");

        // Send the request through the gateway data service
        GatewayDataService gatewayDataService =
                new GatewayDataService();

        gatewayDataService.receiveReading(
                request,
                sensor,
                bin
        );

        // Confirm that the reading reached the bin
        assertEquals(25.5, bin.getWasteHeight());
    }
}
