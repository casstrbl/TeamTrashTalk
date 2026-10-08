package test.java.trashtalk.wastemonitoring.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.Sensor.SensorType;

class SensorTest {

    @Test
    void createsUltrasonicSensor() {

        // Create an ultrasonic sensor
        Sensor sensor = new Sensor(
                101,
                SensorType.ULTRASONIC
        );

        // Create a bin and assign the sensor to it
        Bin bin = new Bin(
                1,
                "Library",
                Bin.BinType.RECYCLING
        );

        sensor.assignToBin(bin);

        assertEquals(101, sensor.getSensorID());
        assertEquals(1, sensor.getBinID());
        assertEquals(SensorType.ULTRASONIC, sensor.getSensorType());
        assertTrue(sensor.isActive());
    }

    @Test
    void sensorCanBeDeactivated() {

        // Create a weight sensor
        Sensor sensor = new Sensor(
                102,
                SensorType.WEIGHT
        );

        sensor.setActive(false);

        assertFalse(sensor.isActive());
    }
}