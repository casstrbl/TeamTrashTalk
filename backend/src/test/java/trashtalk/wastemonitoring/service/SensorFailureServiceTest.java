package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.SensorReading;
import main.java.trashtalk.wastemonitoring.service.SensorFailureService;

class SensorFailureServiceTest {

    private final SensorFailureService sensorFailureService =
            new SensorFailureService();

    @Test
    void negativeReadingIsImpossible() {

        SensorReading reading =
                new SensorReading(101, -5.0, "cm");

        assertTrue(
                sensorFailureService.hasImpossibleValue(
                        reading,
                        77.0
                )
        );
    }

    @Test
    void readingDeeperThanBinIsImpossible() {

        SensorReading reading =
                new SensorReading(101, 90.0, "cm");

        assertTrue(
                sensorFailureService.hasImpossibleValue(
                        reading,
                        77.0
                )
        );
    }

    @Test
    void validReadingIsNotImpossible() {

        SensorReading reading =
                new SensorReading(101, 25.5, "cm");

        assertFalse(
                sensorFailureService.hasImpossibleValue(
                        reading,
                        77.0
                )
        );
    }

    @Test
    void missingLastReadingCountsAsOffline() {

        assertTrue(
                sensorFailureService.hasMissingReading(
                        null,
                        30
                )
        );
    }

    @Test
    void sensorIsOfflineAfterTwoReportingIntervals() {

        LocalDateTime lastReading =
                LocalDateTime.now().minusMinutes(61);

        assertTrue(
                sensorFailureService.hasMissingReading(
                        lastReading,
                        30
                )
        );
    }

    @Test
    void sensorIsNotOfflineBeforeTwoReportingIntervals() {

        LocalDateTime lastReading =
                LocalDateTime.now().minusMinutes(45);

        assertFalse(
                sensorFailureService.hasMissingReading(
                        lastReading,
                        30
                )
        );
    }

    @Test
    void batteryBelowThresholdCountsAsLowBattery() {

        assertTrue(
                sensorFailureService.hasLowBattery(
                        15.0,
                        20.0
                )
        );
    }

    @Test
    void batteryAboveThresholdIsNotLowBattery() {

        assertFalse(
                sensorFailureService.hasLowBattery(
                        75.0,
                        20.0
                )
        );
    }

    @Test
    void sensorFailureReturnsTrueWhenAnyFailureExists() {

        SensorReading reading =
                new SensorReading(101, 25.5, "cm");

        LocalDateTime lastReading =
                LocalDateTime.now().minusMinutes(61);

        assertTrue(
                sensorFailureService.hasSensorFailure(
                        reading,
                        77.0,
                        lastReading,
                        30,
                        75.0,
                        20.0
                )
        );
    }

    @Test
    void sensorFailureReturnsFalseWhenSensorIsHealthy() {

        SensorReading reading =
                new SensorReading(101, 25.5, "cm");

        LocalDateTime lastReading =
                LocalDateTime.now().minusMinutes(10);

        assertFalse(
                sensorFailureService.hasSensorFailure(
                        reading,
                        77.0,
                        lastReading,
                        30,
                        75.0,
                        20.0
                )
        );
    }
    /**
     * Confirms that a battery exactly at the configured
     * threshold is treated as low battery.
     */
    @Test
    void batteryAtThresholdCountsAsLowBattery() {

        // Simulate a battery exactly at the low-battery threshold.
        assertTrue(
                sensorFailureService.hasLowBattery(
                        20.0,
                        20.0
                )
        );
    }
}
