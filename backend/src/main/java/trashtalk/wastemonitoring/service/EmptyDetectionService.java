package main.java.trashtalk.wastemonitoring.service;

import java.util.HashMap;
import java.util.Map;

import main.java.trashtalk.wastemonitoring.model.Bin;

public class EmptyDetectionService {

    private static final double MIN_PREVIOUS_PERCENT = 30.0;
    private static final double EMPTY_PERCENT = 10.0;
    private static final int REQUIRED_CONFIRMATIONS = 2;

    private final Map<Integer, Integer> pendingConfirmations =
            new HashMap<>();

    /**
     * Call once for each newer accepted reading.
     *
     * @return true only when an emptying is confirmed
     */
    public synchronized boolean detectEmpty(
            int binID,
            double previousHeight,
            double currentHeight) {

        double previousPercent =
                previousHeight / Bin.BIN_HEIGHT * 100.0;

        double currentPercent =
                currentHeight / Bin.BIN_HEIGHT * 100.0;

        // A reading above the empty threshold cancels confirmation.
        if (currentPercent > EMPTY_PERCENT) {
            pendingConfirmations.remove(binID);
            return false;
        }

        Integer confirmations = pendingConfirmations.get(binID);

        if (confirmations == null) {

            // Low readings alone do not mean a collection occurred.
            if (previousPercent < MIN_PREVIOUS_PERCENT) {
                return false;
            }

            confirmations = 1;

        } else {
            confirmations++;
        }

        if (confirmations >= REQUIRED_CONFIRMATIONS) {
            pendingConfirmations.remove(binID);
            return true;
        }

        pendingConfirmations.put(binID, confirmations);
        return false;
    }
}