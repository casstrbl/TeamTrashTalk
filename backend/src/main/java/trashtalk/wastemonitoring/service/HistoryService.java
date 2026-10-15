package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.model.SensorReading;

import java.util.ArrayList;
import java.util.List;

/**
 * Stores sensor reading history for the backend.
 */
public class HistoryService {

    private final List<SensorReading> history = new ArrayList<>();

    /**
     * Returns all sensor readings currently stored in history.
     */
    public List<SensorReading> getHistory() {
        return new ArrayList<>(history);
    }

    /**
     * Adds a sensor reading to the history list.
     */
    public void addReading(SensorReading reading) {
        history.add(reading);
    }

    /**
     * Clears all stored sensor reading history.
     */
    public void clearHistory() {
        history.clear();
    }


}