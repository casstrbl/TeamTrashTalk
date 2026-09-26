package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.service.GatewayDataService;

class GatewayDataServiceTest {

    @Test
    void receiveReadingUpdatesMatchingBin() {

        // Create a recycling bin
        Bin bin = new Bin(1, "Library", Bin.BinType.RECYCLING);

        // Create a sensor assigned to that bin
        Sensor sensor = new Sensor(
                101,
                1,
                Sensor.SensorType.ULTRASONIC
        );

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
}
