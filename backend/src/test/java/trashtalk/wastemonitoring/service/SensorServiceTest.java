package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.SensorReading;
import main.java.trashtalk.wastemonitoring.service.SensorService;

class SensorServiceTest {

	@Test
	void processReadingUpdatesMatchingBin() {

		// Create a recycling bin
		Bin bin = new Bin(1, "Library", Bin.BinType.RECYCLING);

		// Create an active ultrasonic sensor
		Sensor sensor = new Sensor(
				101,
				Sensor.SensorType.ULTRASONIC
		);

        // Link the sensor to the recycling bin being tested
		sensor.assignToBin(bin);

		// Simulate a sensor reading
		SensorReading reading = new SensorReading(101, 25.5, "cm");

		// Process the reading
		SensorService sensorService = new SensorService();
		sensorService.processReading(reading, sensor, bin);

		// Confirm the bin was updated
		assertEquals(25.5, bin.getWasteHeight());
	}
}
