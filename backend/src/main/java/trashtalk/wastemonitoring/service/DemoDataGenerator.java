
package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.SensorReading;

import java.time.LocalDateTime;
import java.util.Random;

/**
 * Generates seven days of historical demo readings
 * for one trash bin.
 */
public class DemoDataGenerator {

    private final HistoryService historyService;

    public DemoDataGenerator() {
        this.historyService = new HistoryService();
    }

    /**
     * Generates 168 hourly readings for one bin.
     * Saves them using the existing database history service.
     */
    public int generateWeekForBin(Bin bin, int sensorID) {

        if (bin == null || sensorID <= 0) {
            throw new IllegalArgumentException(
                "A valid bin and sensor ID are required."
            );
        }

        LocalDateTime start =
                LocalDateTime.now()
                    .withMinute(0)
                    .withSecond(0)
                    .withNano(0)
                    .minusDays(7);

        Random random = new Random(42);
        int saved = 0;

        for (int hour = 0; hour < 168; hour++) {

            // Simulate gradually changing waste levels.
            // Reset periodically to simulate bin emptying.
            double value = 10.0
                    + (hour % 48) * 1.2
                    + random.nextDouble() * 3.0;

            LocalDateTime timestamp =
                    start.plusHours(hour);

            SensorReading reading = new SensorReading(
                    sensorID,
                    value,
                    "cm",
                    timestamp
            );

            // Use the same database storage method
            // used for real sensor history.
            historyService.addReading(reading, bin);

            saved++;
        }

        return saved;
    }
}
