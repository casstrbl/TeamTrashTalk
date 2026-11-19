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
        
        double battery = request.getBatteryLevel();
        
        if (!Double.isFinite(battery)
        		|| battery < 0
        		|| battery > 100) {
        	
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
                || triBin.getBins().stream().noneMatch(b -> b == bin)) {

            throw new IllegalArgumentException(
                    "The bin must belong to the given TriBin."
            );
        }

        synchronized (triBin) {

            if (!sensorService.isValidReading(reading, sensor, bin)) {
                return;
            }

            double previousWasteHeight = bin.getWasteHeight();
            int previousBattery = triBin.getBattery();
            LocalDateTime previousLastUpdated = triBin.getLastUpdated();

            Map<Bin, Bin.BinStatus> previousStatuses =
                    new IdentityHashMap<>();

            for (Bin existingBin : triBin.getBins()) {
                previousStatuses.put(
                        existingBin,
                        existingBin.getStatus()
                );
            }

            boolean committed = false;

            try (Connection connection = DatabaseConfig.getConnection()) {

                connection.setAutoCommit(false);

                try {
                    // Lock before checking or updating this bin.
                    LocalDateTime lastReadingTime =
                            binRepository.lockLastReadingTime(
                                    connection,
                                    bin.getBinID(),
                                    triBin.getTriBinID()
                            );

                    // Preserve valid readings even when they arrive late.
                    historyService.addReading(connection, reading, bin);

                    boolean isNewer = lastReadingTime == null
                            || reading.getTimestamp()
                                    .isAfter(lastReadingTime);
                    
                    double heightBeforeReading = bin.getWasteHeight();

                    if (isNewer) {

                        for (Bin existingBin : triBin.getBins()) {
                            binService.setStatus(existingBin);
                        }

                        boolean wasFull =
                                triBinService.isFull(triBin);
                        
                        sensorService.processReading(
                                reading,
                                sensor,
                                bin
                        );

                        // Only update station metadata when this reading is newer than the station's current timestamp.
                        boolean isLatestStationReading =
                                triBin.getLastUpdated() == null
                                || reading.getTimestamp()
                                        .isAfter(triBin.getLastUpdated());

                        if (isLatestStationReading) {

                            if (battery != null) {
                                triBin.setBattery(
                                        (int) Math.round(battery)
                                );
                            }

                            triBin.setLastUpdated(
                                    reading.getTimestamp()
                            );
                        }

                        binRepository.updateReadingState(
                                connection,
                                bin,
                                triBin,
                                reading.getTimestamp()
                        );

                        alertService.resolveIfNoLongerFull(
                                connection,
                                triBin
                        );

                        alertService.checkTriBin(
                                connection,
                                triBin,
                                wasFull
                        );
                    }

                    connection.commit();
                    committed = true;
                    
                    boolean emptied = emptyDetectionService.detectEmpty(
                            bin.getBinID(),
                            heightBeforeReading,
                            bin.getWasteHeight()
                    );

                    if (emptied) {
                        System.out.println(
                                "Bin " + bin.getBinID() + " has been emptied."
                        );
                    }

                } catch (SQLException | RuntimeException e) {

                    try {
                        connection.rollback();
                    } catch (SQLException rollbackError) {
                        e.addSuppressed(rollbackError);
                    }

                    throw e;
                }

            } catch (SQLException e) {

                throw new IllegalStateException(
                        "Could not save sensor reading.",
                        e
                );

            } finally {

                if (!committed) {

                    bin.setWasteHeight(previousWasteHeight);
                    triBin.setBattery(previousBattery);
                    triBin.setLastUpdated(previousLastUpdated);

                    for (Map.Entry<Bin, Bin.BinStatus> entry
                            : previousStatuses.entrySet()) {

                        entry.getKey().setStatus(entry.getValue());
                    }
                }
            }
        }
    }
}