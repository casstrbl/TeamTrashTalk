package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.model.SensorReading;
import java.time.Duration;
import java.time.LocalDateTime;

/**
 * Checks sensor readings for conditions that may indicate a sensor failure.
 */
public class SensorFailureService {

    /**
     * Checks whether a reading is outside the valid distance range.
     */
    public boolean hasImpossibleValue(
            SensorReading reading,
            double binDepth) {

        // A missing sensor reading is considered invalid.
        if (reading == null) {
            return true;
        }

        return reading.getValue() <= 0
                || reading.getValue() > binDepth;
    }

    /**
     * Checks whether a sensor has missed two reporting intervals.
     */
    public boolean hasMissingReading(
            LocalDateTime lastReadingTime,
            int reportingIntervalMinutes) {

        if (lastReadingTime == null) {
            return true;
        }

        long minutesSinceLastReading =
                Duration.between(
                        lastReadingTime,
                        LocalDateTime.now()
                ).toMinutes();

        return minutesSinceLastReading >= reportingIntervalMinutes * 2L;
    }

    /**
     * Checks whether the sensor battery is at or below the allowed threshold.
     */
    public boolean hasLowBattery(
            double batteryPercent,
            double threshold) {

        return batteryPercent <= threshold;
    }

    /**
     * Checks whether any sensor failure condition is present.
     */
    public boolean hasSensorFailure(
            SensorReading reading,
            double binDepth,
            LocalDateTime lastReadingTime,
            int reportingIntervalMinutes,
            double batteryPercent,
            double batteryThreshold) {

        return hasImpossibleValue(reading, binDepth)
                || hasMissingReading(
                        lastReadingTime,
                        reportingIntervalMinutes
                )
                || hasLowBattery(
                        batteryPercent,
                        batteryThreshold
                );
    }
}