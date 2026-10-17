package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.service.FakeSensorService;

/**
 * Tests the fake sensor service used for Sprint 2.
 *
 * The test confirms that a simulated sensor reading can travel
 * through the normal backend sensor flow and update a bin.
 */
class FakeSensorServiceTest {

    /**
     * Confirms that the fake sensor service can detect
     * a simulated low-battery condition.
     */
    @Test
    void fakeSensorDetectsLowBattery() {

        // Create the fake sensor service used for testing.
        FakeSensorService fakeSensorService =
                new FakeSensorService();

        // Simulate a battery level below the configured threshold.
        boolean isLowBattery =
                fakeSensorService.hasLowBattery(
                        15.0,
                        20.0
                );

        // Confirm that the low-battery condition is detected.
        assertTrue(isLowBattery);
    }

    @Test
    void fakeReadingUpdatesBin() {

        // Create a recycling bin for the fake sensor reading.
        Bin bin = new Bin(
                1,
                1,
                Bin.BinType.RECYCLING
        );

        // Create an ultrasonic sensor.
        Sensor sensor = new Sensor(
                101,
                Sensor.SensorType.ULTRASONIC
        );

        // Connect the sensor to the bin being tested.
        sensor.assignToBin(bin);

        // Create the service that will simulate the sensor.
        FakeSensorService fakeSensorService =
                new FakeSensorService();

        // Send a fake distance reading of 25.5 centimeters.
        fakeSensorService.sendFakeReading(
                sensor,
                bin,
                25.5
        );

        // Confirm that the fake reading reached and updated the bin.
        assertEquals(
                25.5,
                bin.getWasteHeight()
        );
    }

    /**
     * Confirms that a complete fake sensor message can travel
     * through the existing backend flow and update the bin.
     */
    @Test
    void completeFakeReadingUpdatesBin() {

        // Create a recycling bin for the simulated reading.
        Bin bin = new Bin(
                1,
                1,
                Bin.BinType.RECYCLING
        );

        // Create and assign an ultrasonic sensor.
        Sensor sensor = new Sensor(
                101,
                Sensor.SensorType.ULTRASONIC
        );

        sensor.assignToBin(bin);

        // Create the fake sensor service.
        FakeSensorService fakeSensorService =
                new FakeSensorService();

        // Send a complete fake reading with value, unit, and battery level.
        fakeSensorService.sendFakeReading(
                sensor,
                bin,
                25.5,
                "cm",
                85.0
        );

        // Confirm the simulated reading reached the bin.
        assertEquals(
                25.5,
                bin.getWasteHeight()
        );
    }

}
