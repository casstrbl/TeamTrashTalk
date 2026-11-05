package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.repository.*;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.model.Bin;


import main.java.trashtalk.wastemonitoring.model.Alert;

public class AlertService {

	private TriBinService triBinService;
    private AlertRepository alertRepository;

    public AlertService(TriBinService triBinService,
                        AlertRepository alertRepository) {

        this.triBinService = triBinService;
        this.alertRepository = alertRepository;
    }

    public void checkTriBin(TriBin triBin, boolean wasFull) {

        boolean isFull = triBinService.isFull(triBin);

        // Only generate an alert when it first becomes full
        if (!wasFull && isFull) {

            for (Bin bin : triBin.getBins()) {

                if (bin.isFull()) {

                    Alert alert = new Alert(
                        0,
                        triBin.getTriBinID(),
                        bin.getBinID(),
                        "TriBin " + triBin.getTriBinID()
                        + " is full. Bin " + bin.getBinID()
                        + " requires collection."
                    );

                    alertRepository.save(alert);
                }
            }
        }
    }
}
