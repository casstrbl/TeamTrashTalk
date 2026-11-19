package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.service.EmptyDetectionService;

/**
 * Tests sensor-based emptying detection independently from fullness alert resolution.
 */
class EmptyDetectionServiceTest {

    private EmptyDetectionService service;

    @BeforeEach
    void setUp() {
        service = new EmptyDetectionService();
    }

    /**
     * Converts a fill percentage into waste height.
     */
    private double height(double percentage) {
        return Bin.BIN_HEIGHT * percentage / 100.0;
    }

    @Test
    void firstLowReadingDoesNotConfirmEmptying() {

        boolean emptied = service.detectEmpty(
                101,
                height(90),
                height(5)
        );

        assertFalse(emptied,
                "One low reading should not confirm emptying.");
    }

    @Test
    void secondConsecutiveLowReadingConfirmsEmptying() {

        assertFalse(service.detectEmpty(
                101, height(90), height(5)));

        assertTrue(service.detectEmpty(
                101, height(5), height(4)),
                "Two consecutive low readings should confirm emptying.");
    }

    @Test
    void alreadyEmptyBinDoesNotGenerateEmptyingEvent() {

        assertFalse(service.detectEmpty(
                101, height(8), height(5)));

        assertFalse(service.detectEmpty(
                101, height(5), height(4)));

        assertFalse(service.detectEmpty(
                101, height(4), height(3)));
    }

    @Test
    void previousLevelBelowThirtyPercentDoesNotStartDetection() {

        assertFalse(service.detectEmpty(
                101, height(29), height(5)));

        assertFalse(service.detectEmpty(
                101, height(5), height(4)));
    }

    @Test
    void exactThresholdsAllowEmptyingDetection() {

        assertFalse(service.detectEmpty(
                101, height(30), height(10)));

        assertTrue(service.detectEmpty(
                101, height(10), height(10)),
                "The 30% starting and 10% empty thresholds are inclusive.");
    }

    @Test
    void largeDropAboveEmptyThresholdDoesNotCountAsEmptied() {

        assertFalse(service.detectEmpty(
                101, height(90), height(20)));

        assertFalse(service.detectEmpty(
                101, height(20), height(19)));
    }

    @Test
    void readingAboveEmptyThresholdCancelsPendingConfirmation() {

        // Start a possible emptying.
        assertFalse(service.detectEmpty(
                101, height(90), height(5)));

        // A higher reading cancels the pending confirmation.
        assertFalse(service.detectEmpty(
                101, height(5), height(15)));

        // Returning to low levels cannot confirm the cancelled event.
        assertFalse(service.detectEmpty(
                101, height(15), height(5)));

        assertFalse(service.detectEmpty(
                101, height(5), height(4)));
    }

    @Test
    void confirmationCountsAreIndependentForEachBin() {

        assertFalse(service.detectEmpty(
                101, height(90), height(5)));

        assertFalse(service.detectEmpty(
                102, height(80), height(6)),
                "Another bin must start its own confirmation.");

        assertTrue(service.detectEmpty(
                101, height(5), height(4)));

        assertTrue(service.detectEmpty(
                102, height(6), height(3)));
    }

    @Test
    void confirmedEmptyingIsNotRepeatedForContinuedLowReadings() {

        assertFalse(service.detectEmpty(
                101, height(90), height(5)));

        assertTrue(service.detectEmpty(
                101, height(5), height(4)));

        assertFalse(service.detectEmpty(
                101, height(4), height(3)));

        assertFalse(service.detectEmpty(
                101, height(3), height(0)));
    }

    @Test
    void binCanBeEmptiedAgainAfterRefilling() {

        // First emptying.
        assertFalse(service.detectEmpty(
                101, height(90), height(5)));

        assertTrue(service.detectEmpty(
                101, height(5), height(4)));

        // Refill.
        assertFalse(service.detectEmpty(
                101, height(4), height(70)));

        // Second emptying.
        assertFalse(service.detectEmpty(
                101, height(70), height(6)));

        assertTrue(service.detectEmpty(
                101, height(6), height(2)));
    }
}