package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.repository.AlertRepository;
import main.java.trashtalk.wastemonitoring.repository.BinRepository;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.SensorReading;

import java.sql.Connection;
import java.sql.SQLException;

import java.time.LocalDateTime;
import java.util.IdentityHashMap;
import java.util.Map;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.dto.SensorReadingRequest;

/**
 * Handles sensor data coming from a gateway or simulated gateway source.
 *
 * Current behavior:
 * - Accepts basic sensor data.
 * - Converts that data into a SensorReading object.
 * - Passes the reading to SensorService for processing.
 *  * - Stores accepted readings in the history service.
 *
 * Future work:
 * - Connect this service to an API endpoint such as POST /sensor-readings.
 * - Accept real LoRaWAN gateway data.
 * - Validate incoming gateway payloads.
 * - Add error handling for unknown sensors or bins.
 */

public class GatewayDataService {

    private SensorService sensorService;
    private HistoryService historyService;
    private final BinService binService = new BinService();
    private final TriBinService triBinService = new TriBinService();
    private final AlertService alertService = new AlertService(triBinService, new AlertRepository());
    private final EmptyDetectionService emptyDetectionService = new EmptyDetectionService();
    
    private final BinRepository binRepository = new BinRepository();

    public GatewayDataService() {
        this(new HistoryService());
    }

    /**
     * Creates a gateway data service using the shared history service.
     */
    public GatewayDataService(HistoryService historyService) {
        this.sensorService = new SensorService();
        this.historyService = historyService;
    }

    public void receiveReading(
            int sensorID,
            double value,
            String unit,
            Sensor sensor,
            Bin bin,
            TriBin triBin) {
    	
    	processReading(
    			new SensorReading(sensorID, value, unit),
    			sensor,
    			bin,
    			triBin,
    			null);
    }
    
    
    /**
     * Receives sensor data using the generalized API request format.
     *
     * @param request incoming sensor reading data
     * @param sensor sensor associated with the reading
     * @param bin bin assigned to the sensor
     */
    public void receiveReading(
            SensorReadingRequest request,
            Sensor sensor,
            Bin bin,
            TriBin triBin) {

        if (request == null
        		|| bin == null
        		|| request.getBinID() != bin.getBinID()) {
        	
        	throw new IllegalArgumentException(
        			"The request must identify the assigned bin.");
        }
        
        Double battery = request.getBatteryLevel();
        
        if (battery != null && (!Double.isFinite(battery)
        		|| battery < 0
        		|| battery > 100)) {
        	
        	throw new IllegalArgumentException(
        			"Battery percentage must be between 0 and 100.");
        }
        
        SensorReading reading = new SensorReading(
        		request.getSensorID(),
        		request.getValue(),
        		request.getUnit(),
        		request.getTimestamp());
        
        processReading(reading, sensor, bin, triBin, battery);
    }
    
    
    /**
     * Shared private method to validate readings and preserve request ID, timestamp, and battery level.
     */
    private void processReading(
            SensorReading reading,
            Sensor sensor,
            Bin bin,
            TriBin triBin,
            Double battery) {

        if (bin == null
                || triBin == null
                || triBin.getBins() == null
                || bin.getTriBinID() != triBin.getTriBinID()
                || triBin.getBins().stream().noneMatch(existingBin -> existingBin == bin)) {
            throw new IllegalArgumentException("The bin must belong to the given TriBin.");
        }

        synchronized (triBin) {
            if (!sensorService.isFromAssignedSensor(reading, sensor, bin)) {
                return;
            }

            boolean malfunction = !sensorService.hasValidMeasurement(reading);

            int previousBattery = triBin.getBattery();
            LocalDateTime previousLastUpdated = triBin.getLastUpdated();

            Map<Bin, Double> previousHeights = new IdentityHashMap<>();
            Map<Bin, Bin.BinStatus> previousStatuses = new IdentityHashMap<>();
            
            for (Bin existingBin : triBin.getBins()) {
            	previousHeights.put(existingBin, existingBin.getWasteHeight());
                previousStatuses.put(existingBin, existingBin.getStatus());
            }

            boolean committed = false;
            boolean emptied = false;
            boolean applied = false;
            double heightBeforeReading = 0;
            double heightAfterReading = 0;

            try (Connection connection = DatabaseConfig.getConnection()) {
                connection.setAutoCommit(false);

                try {
                	binRepository.lockAndRefreshTriBin(connection, triBin);
                	LocalDateTime lastApplied = binRepository.lockLastReadingTime(
                	        connection, bin.getBinID(), triBin.getTriBinID());

                	binRepository.updateSensorContact(connection, bin, malfunction);
                	alertService.checkSensorAlerts(connection, bin, triBin, battery, malfunction);

                	if (!malfunction) {
                	    // Preserve valid delayed readings in history.
                	    historyService.addReading(connection, reading, bin);

                	    LocalDateTime measuredAt = reading.getTimestamp();
                	    if (lastApplied == null || measuredAt.isAfter(lastApplied)) {
                	        boolean wasFull = triBinService.isFull(triBin);
                	        heightBeforeReading = bin.getWasteHeight();

                	        if (!sensorService.processReading(reading, sensor, bin)) {
                	            throw new IllegalStateException("Validated reading was rejected.");
                	        }

                	        if (battery != null) {
                	            triBin.setBattery((int) Math.round(battery));
                	        }
                	        if (triBin.getLastUpdated() == null
                	                || measuredAt.isAfter(triBin.getLastUpdated())) {
                	            triBin.setLastUpdated(measuredAt);
                	        }

                	        binRepository.updateReadingState(connection, bin, triBin, measuredAt);
                	        alertService.checkNearFull(connection, bin, triBin);
                	        alertService.resolveIfNoLongerFull(connection, triBin);
                	        alertService.checkTriBin(connection, triBin, wasFull);

                	        heightAfterReading = bin.getWasteHeight();
                	        applied = true;
                	    }
                	}
                	
                	connection.commit();
                    committed = true;
                    
                } catch (SQLException | RuntimeException error) {
                    try {
                    	
                        connection.rollback();
                        
                    } catch (SQLException rollbackError) {
                    	
                        error.addSuppressed(rollbackError);
                        
                    }
                    throw error;
                }
            } catch (SQLException error) {
                throw new IllegalStateException("Could not save sensor report.", error);
            } finally {
                if (!committed) {
                    triBin.setBattery(previousBattery);
                    triBin.setLastUpdated(previousLastUpdated);
                    previousHeights.forEach(Bin::setWasteHeight);
                    previousStatuses.forEach(Bin::setStatus);
                }
            }

            if (applied && emptyDetectionService.detectEmpty(bin.getBinID(), heightBeforeReading, heightAfterReading)) {
                	System.out.println("Emptying detected for bin " + bin.getBinID() + " in tribin " + triBin.getTriBinID());
                }
        }
    }
}