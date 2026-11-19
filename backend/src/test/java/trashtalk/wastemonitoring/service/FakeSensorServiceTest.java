package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.SensorReading;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.service.FakeSensorService;
import main.java.trashtalk.wastemonitoring.service.GatewayDataService;
import main.java.trashtalk.wastemonitoring.service.HistoryService;
import main.java.trashtalk.wastemonitoring.service.SensorFailureService;

/**
 * Tests simulated readings through the gateway flow,
 * using in-memory history instead of the database.
 */
class FakeSensorServiceTest {

    private static final double DELTA = 0.001;

    private Bin bin;
    private TriBin triBin;
    private Sensor sensor;

    private InMemoryHistoryService historyService;
    private FakeSensorService fakeSensorService;

    @BeforeEach
    void setUp() {
        bin = new Bin(102, 1, Bin.BinType.RECYCLING);

        triBin = new TriBin(
                1,
                'A',
                "Test location",
                0.0,
                0.0,
                List.of(
                        new Bin(101, 1, Bin.BinType.LANDFILL),
                        bin,
                        new Bin(103, 1, Bin.BinType.COMPOST)
                )
        );

        sensor = new Sensor(
                101,
                Sensor.SensorType.ULTRASONIC
        );
        sensor.assignToBin(bin);

        historyService = new InMemoryHistoryService();

        GatewayDataService gatewayDataService =
                new GatewayDataService(historyService);

        fakeSensorService = new FakeSensorService(
                gatewayDataService,
                new SensorFailureService()
        );
    }

    @Test
    void fakeSensorDetectsLowBattery() {
        assertTrue(fakeSensorService.hasLowBattery(15.0, 20.0));
    }

    @Test
    void fakeSensorDoesNotFlagBatteryAboveThreshold() {
        assertFalse(fakeSensorService.hasLowBattery(85.0, 20.0));
    }

    @Test
    void fakeReadingUpdatesBinAndStoresHistory() {
        fakeSensorService.sendFakeReading(
                sensor,
                bin,
                triBin,
                25.5
        );

        assertAll(
                () -> assertEquals(25.5, bin.getWasteHeight(), DELTA),
                () -> assertEquals(1, historyService.getHistory().size()),
                () -> assertSame(bin, historyService.lastBin)
        );

        SensorReading stored = historyService.getHistory().get(0);

        assertAll(
                () -> assertEquals(sensor.getSensorID(), stored.getSensorID()),
                () -> assertEquals(25.5, stored.getValue(), DELTA),
                () -> assertEquals("cm", stored.getUnit())
        );
    }

    @Test
    void completeFakeReadingUpdatesBinAndStoresHistory() {
        fakeSensorService.sendFakeReading(
                sensor,
                bin,
                triBin,
                25.5,
                "cm",
                85.0
        );

        assertAll(
                () -> assertEquals(25.5, bin.getWasteHeight(), DELTA),
                () -> assertEquals(1, historyService.getHistory().size()),
                () -> assertSame(bin, historyService.lastBin)
        );

        SensorReading stored = historyService.getHistory().get(0);

        assertAll(
                () -> assertEquals(sensor.getSensorID(), stored.getSensorID()),
                () -> assertEquals(25.5, stored.getValue(), DELTA),
                () -> assertEquals("cm", stored.getUnit())
        );
    }

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