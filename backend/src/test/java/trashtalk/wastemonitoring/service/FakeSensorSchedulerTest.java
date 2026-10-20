package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Random;
import org.junit.jupiter.api.Test;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.service.FakeSensorScheduler;

/** Tests the configurable Sprint 3 sensor reading frequency and fake values. */
class FakeSensorSchedulerTest {

    @Test
    void defaultFrequencyIsFiveSeconds() {
        assertEquals(5, FakeSensorScheduler.parseIntervalSeconds(null));
        assertEquals(5, FakeSensorScheduler.parseIntervalSeconds(""));
        assertEquals(10, FakeSensorScheduler.parseIntervalSeconds(" 10 "));
    }

    @Test
    void invalidFrequencyIsRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> FakeSensorScheduler.parseIntervalSeconds("0"));
        assertThrows(IllegalArgumentException.class,
                () -> FakeSensorScheduler.parseIntervalSeconds("banana"));
        assertThrows(IllegalArgumentException.class,
                () -> FakeSensorScheduler.parseIntervalSeconds("3601"));
    }

    @Test
    void simulatedReadingsGrowAndDoNotOverflow() {
        double next = FakeSensorScheduler.nextSimulatedHeight(20.0, new Random(1));
        assertTrue(next > 20.0);
        assertTrue(next <= Bin.BIN_HEIGHT);
        assertEquals(Bin.BIN_HEIGHT,
                FakeSensorScheduler.nextSimulatedHeight(76.9, new Random(1)));
        assertTrue(FakeSensorScheduler.nextSimulatedHeight(-3.0, new Random(1)) >= 0);
    }
}
