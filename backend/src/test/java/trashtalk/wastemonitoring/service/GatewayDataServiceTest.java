package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.dto.SensorReadingRequest;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.SensorReading;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.service.GatewayDataService;
import main.java.trashtalk.wastemonitoring.service.HistoryService;

class GatewayDataServiceTest {

    private static final double DELTA = 0.001;

    private Bin landfill;
    private Bin recycling;
    private Bin compost;
    private TriBin triBin;
    private Sensor sensor;

    private InMemoryHistoryService historyService;
    private GatewayDataService gatewayDataService;

    @BeforeEach
    void setUp() {
        landfill = new Bin(101, 1, Bin.BinType.LANDFILL);
        recycling = new Bin(102, 1, Bin.BinType.RECYCLING);
        compost = new Bin(103, 1, Bin.BinType.COMPOST);

        triBin = new TriBin(
                1,
                'A',
                "Test location",
                0.0,
                0.0,
                List.of(landfill, recycling, compost)
        );

        sensor = new Sensor(
                101,
                Sensor.SensorType.ULTRASONIC
        );
        sensor.assignToBin(recycling);

        historyService = new InMemoryHistoryService();
        gatewayDataService = new GatewayDataService(historyService);
    }

    @Test
    void receiveReadingUpdatesMatchingBinAndStoresHistory() {
        double landfillBefore = landfill.getWasteHeight();
        double compostBefore = compost.getWasteHeight();

        gatewayDataService.receiveReading(
                101,
                25.5,
                "cm",
                sensor,
                recycling,
                triBin
        );

        assertAll(
                () -> assertEquals(
                        25.5, recycling.getWasteHeight(), DELTA),
                () -> assertEquals(
                        landfillBefore, landfill.getWasteHeight(), DELTA),
                () -> assertEquals(
                        compostBefore, compost.getWasteHeight(), DELTA),
                () -> assertEquals(1, historyService.getHistory().size()),
                () -> assertSame(recycling, historyService.lastBin)
        );

        SensorReading stored = historyService.getHistory().get(0);

        assertAll(
                () -> assertEquals(101, stored.getSensorID()),
                () -> assertEquals(25.5, stored.getValue(), DELTA),
                () -> assertEquals("cm", stored.getUnit())
        );
    }

    @Test
    void receiveRequestUpdatesMatchingBinAndStoresHistory() {
        SensorReadingRequest request =
                new SensorReadingRequest(101, 25.5, "cm");

        gatewayDataService.receiveReading(
                request,
                sensor,
                recycling,
                triBin
        );

        assertAll(
                () -> assertEquals(
                        25.5, recycling.getWasteHeight(), DELTA),
                () -> assertEquals(1, historyService.getHistory().size()),
                () -> assertSame(recycling, historyService.lastBin)
        );

        SensorReading stored = historyService.getHistory().get(0);

        assertAll(
                () -> assertEquals(request.getSensorID(), stored.getSensorID()),
                () -> assertEquals(
                        request.getValue(), stored.getValue(), DELTA),
                () -> assertEquals(request.getUnit(), stored.getUnit())
        );
    }

    @Test
    void mismatchedSensorReadingDoesNotUpdateBinOrStoreHistory() {
        double previousHeight = recycling.getWasteHeight();

        gatewayDataService.receiveReading(
                999,
                25.5,
                "cm",
                sensor,
                recycling,
                triBin
        );

        assertAll(
                () -> assertEquals(
                        previousHeight, recycling.getWasteHeight(), DELTA),
                () -> assertTrue(historyService.getHistory().isEmpty()),
                () -> assertNull(historyService.lastBin)
        );
    }

    @Test
    void mismatchedSensorRequestDoesNotUpdateBinOrStoreHistory() {
        double previousHeight = recycling.getWasteHeight();

        SensorReadingRequest request =
                new SensorReadingRequest(999, 25.5, "cm");

        gatewayDataService.receiveReading(
                request,
                sensor,
                recycling,
                triBin
        );

        assertAll(
                () -> assertEquals(
                        previousHeight, recycling.getWasteHeight(), DELTA),
                () -> assertTrue(historyService.getHistory().isEmpty())
        );
    }

    @Test
    void sensorReadingRequestStoresBatteryLevel() {
        SensorReadingRequest request =
                new SensorReadingRequest(101, 25.5, "cm", 85.0);

        assertEquals(85.0, request.getBatteryLevel(), DELTA);
    }

    /**
     * Records history in memory so gateway tests do not access the database.
     */
    private static class InMemoryHistoryService extends HistoryService {

        private final List<SensorReading> readings = new ArrayList<>();
        private Bin lastBin;

        @Override
        public void addReading(SensorReading reading, Bin bin) {
            readings.add(reading);
            lastBin = bin;
        }

        @Override
        public List<SensorReading> getHistory() {
            return List.copyOf(readings);
        }
    }
}