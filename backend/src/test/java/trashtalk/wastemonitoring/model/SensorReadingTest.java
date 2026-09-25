package test.java.trashtalk.wastemonitoring.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.SensorReading;

class SensorReadingTest {

    @Test
    void createsUltrasonicReading() {
        SensorReading reading = new SensorReading(101, 25.5, "cm");

        assertEquals(101, reading.getSensorID());
        assertEquals(25.5, reading.getValue(), 0.001);
        assertEquals("cm", reading.getUnit());
        assertNotNull(reading.getTimestamp());
    }

    @Test
    void createsWeightReading() {
        SensorReading reading = new SensorReading(102, 12.4, "kg");

        assertEquals(102, reading.getSensorID());
        assertEquals(12.4, reading.getValue(), 0.001);
        assertEquals("kg", reading.getUnit());
        assertNotNull(reading.getTimestamp());
    }
}
