package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.database.DatabaseInitializer;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.SensorReading;
import main.java.trashtalk.wastemonitoring.service.HistoryService;

/**
 * Tests database-backed sensor history.
 */
class HistoryServiceTest {

    private HistoryService historyService;

    @BeforeEach
    void setUp() {

        // Make sure the history table exists before each test.
        DatabaseInitializer.initializeDatabase();

        historyService = new HistoryService();

        // Keep each test independent from previously stored readings.
        historyService.clearHistory();
    }

    /**
     * Confirms that a sensor reading can be saved
     * and retrieved from persistent history.
     */
    @Test
    void savedReadingCanBeRetrieved() {

        Bin bin = new Bin(
                1,
                2,
                Bin.BinType.RECYCLING
        );

        SensorReading reading =
                new SensorReading(
                        101,
                        25.5,
                        "cm"
                );

        historyService.addReading(
                reading,
                bin
        );

        assertEquals(
                1,
                historyService.getHistory().size()
        );

        SensorReading saved =
                historyService.getHistory().get(0);

        assertEquals(
                101,
                saved.getSensorID()
        );

        assertEquals(
                25.5,
                saved.getValue(),
                0.001
        );

        assertEquals(
                "cm",
                saved.getUnit()
        );
    }

    /**
     * Confirms that history can be filtered
     * by a specific TriBin ID.
     */
    @Test
    void historyCanBeRetrievedForSpecificTriBin() {

        Bin bin = new Bin(
                1,
                2,
                Bin.BinType.RECYCLING
        );

        SensorReading reading =
                new SensorReading(
                        101,
                        30.0,
                        "cm"
                );

        historyService.addReading(
                reading,
                bin
        );

        assertEquals(
                1,
                historyService.getHistoryForTriBin(2).size()
        );

        assertEquals(
                0,
                historyService.getHistoryForTriBin(99).size()
        );
    }

    /**
     * Confirms that clearing history removes
     * previously stored sensor readings.
     */
    @Test
    void clearHistoryRemovesStoredReadings() {

        Bin bin = new Bin(
                1,
                2,
                Bin.BinType.RECYCLING
        );

        SensorReading reading =
                new SensorReading(
                        101,
                        25.5,
                        "cm"
                );

        historyService.addReading(
                reading,
                bin
        );

        historyService.clearHistory();

        assertTrue(
                historyService.getHistory().isEmpty()
        );
    }
}
