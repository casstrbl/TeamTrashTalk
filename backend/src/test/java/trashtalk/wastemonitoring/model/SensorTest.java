package test.java.trashtalk.wastemonitoring.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.Sensor.SensorType;

class SensorTest {

    @Test
    void createsUltrasonicSensor() {
        Sensor sensor = new Sensor(101, 1, SensorType.ULTRASONIC);

        assertEquals(101, sensor.getSensorID());
        assertEquals(1, sensor.getBinID());
        assertEquals(SensorType.ULTRASONIC, sensor.getSensorType());
        assertTrue(sensor.isActive());
    }

    @Test
    void sensorCanBeDeactivated() {
        Sensor sensor = new Sensor(102, 1, SensorType.WEIGHT);

        sensor.setActive(false);

        assertFalse(sensor.isActive());
    }
}
