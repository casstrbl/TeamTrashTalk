package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.repository.*;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.model.Bin;

import java.sql.Connection;
import java.sql.SQLException;


import main.java.trashtalk.wastemonitoring.model.Alert;

public class AlertService {

	private TriBinService triBinService;
    private AlertRepository alertRepository;

    public AlertService(TriBinService triBinService,
                        AlertRepository alertRepository) {

        this.triBinService = triBinService;
        this.alertRepository = alertRepository;
    }

    /**
     * Created fullness alerts when a TriBin changes from not full to full.
     */
    public void checkTriBin(Connection connection, TriBin triBin, boolean wasFull) throws SQLException {

        boolean isFull = triBinService.isFull(triBin);

        // Only generate an alert when it first becomes full
        if (!wasFull && isFull) {

            for (Bin bin : triBin.getBins()) {

                if (bin.isFull()) {

                	Alert alert = new Alert(
                	        triBin.getTriBinID(),
                	        bin.getBinID(),
                	        triBin.getZone(),
                	        Alert.Severity.CRITICAL,
                	        "TriBin " + triBin.getTriBinID()
                	                + " requires collection. Bin " + bin.getBinID()
                	                + " is full.",
                	        Alert.Kind.FILL
                	);

                	alertRepository.save(connection, alert);
                }
            }
        }
    }
    
    
    /**
     * Resolves fullness alerts only when no bin in the
     * TriBin remains full.
     *
     * Call after updating the affected bin's status.
     */
    public void resolveIfNoLongerFull(Connection connection, TriBin triBin) throws SQLException {

        if (!triBinService.isFull(triBin)) {

            for (Bin bin : triBin.getBins()) {
                alertRepository.resolveFullnessAlerts(connection, bin.getBinID()
                );
            }
        }
    }
}
