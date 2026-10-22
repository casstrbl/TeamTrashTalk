package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.service.GatewayDataService;
import main.java.trashtalk.wastemonitoring.dto.SensorReadingRequest;
import main.java.trashtalk.wastemonitoring.service.HistoryService;

class GatewayDataServiceTest {

    @Test
    void receiveReadingUpdatesMatchingBin() {

        Bin bin = new Bin(1, 1, Bin.BinType.RECYCLING);

        Sensor sensor = new Sensor(
                101,
                Sensor.SensorType.ULTRASONIC
        );

        sensor.assignToBin(bin);

        HistoryService historyService = new HistoryService();

        // Start this test with an empty history table.
        historyService.clearHistory();

        GatewayDataService gatewayDataService =
                new GatewayDataService(historyService);

        gatewayDataService.receiveReading(
                101,
                25.5,
                "cm",
                sensor,
                bin
        );

        assertEquals(25.5, bin.getWasteHeight());
        assertEquals(1, historyService.getHistory().size());
    }

    @Test
    void receiveRequestUpdatesMatchingBin() {

        // Create a recycling bin
        Bin bin = new Bin(1, 1, Bin.BinType.RECYCLING);

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
    @Test
    void invalidReadingIsNotStoredInHistory() {

        Bin bin = new Bin(1, 1, Bin.BinType.RECYCLING);

        Sensor sensor = new Sensor(
                101,
                Sensor.SensorType.ULTRASONIC
        );

        sensor.assignToBin(bin);

        HistoryService historyService = new HistoryService();

        // Start this test with an empty history table.
        historyService.clearHistory();

        GatewayDataService gatewayDataService =
                new GatewayDataService(historyService);

        gatewayDataService.receiveReading(
                999,
                25.5,
                "cm",
                sensor,
                bin
        );

        assertEquals(0, historyService.getHistory().size());
    }

    /**
     * Confirms that a sensor reading request can include
     * a battery level without changing the existing gateway format.
     */
    @Test
    void sensorReadingRequestStoresBatteryLevel() {

        // Create a simulated sensor request with battery information.
        SensorReadingRequest request =
                new SensorReadingRequest(
                        101,
                        25.5,
                        "cm",
                        85.0
                );

        // Confirm the battery level was stored correctly.
        assertEquals(
                85.0,
                request.getBatteryLevel(),
                0.001
        );
    }
}
