package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.SensorReading;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/** Stores every accepted reading in the database instead of losing it on restart. */
public class HistoryService {
    public void addReading(SensorReading reading, Bin bin) {
        String sql = "INSERT INTO sensor_history (triBinID, binID, sensorID, readingValue, unit, readingTime) VALUES (?, ?, ?, ?, ?, ?)";
        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, bin.getTriBinID());
            statement.setInt(2, bin.getBinID());
            statement.setInt(3, reading.getSensorID());
            statement.setDouble(4, reading.getValue());
            statement.setString(5, reading.getUnit());
            statement.setTimestamp(6, Timestamp.valueOf(reading.getTimestamp()));
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("Could not save sensor history", e);
        }
    }

    /** Retained for older callers that don't supply a bin. */
    public void addReading(SensorReading reading) {
        String sql = "INSERT INTO sensor_history (sensorID, readingValue, unit, readingTime) VALUES (?, ?, ?, ?)";
        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, reading.getSensorID());
            statement.setDouble(2, reading.getValue());
            statement.setString(3, reading.getUnit());
            statement.setTimestamp(4, Timestamp.valueOf(reading.getTimestamp()));
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("Could not save sensor history", e);
        }
    }

    public List<SensorReading> getHistory() {
        return readHistory("SELECT sensorID, readingValue, unit, readingTime FROM sensor_history ORDER BY readingTime, id", null);
    }

    public List<SensorReading> getHistoryForTriBin(int triBinId) {
        return readHistory("SELECT sensorID, readingValue, unit, readingTime FROM sensor_history WHERE triBinID = ? ORDER BY readingTime, id", triBinId);
    }

    /** Returns the IDs and measurements required by the dashboard history API. */
    public List<java.util.Map<String, Object>> getHistoryDetailsForTriBin(int triBinId) {
        List<java.util.Map<String, Object>> result = new ArrayList<>();
        String sql = "SELECT binID, sensorID, readingValue, unit, readingTime FROM sensor_history WHERE triBinID = ? ORDER BY readingTime, id";
        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, triBinId);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    java.util.Map<String, Object> item = new java.util.LinkedHashMap<>();
                    item.put("binID", rows.getInt("binID"));
                    item.put("sensorID", rows.getInt("sensorID"));
                    item.put("value", rows.getDouble("readingValue"));
                    item.put("unit", rows.getString("unit"));
                    item.put("timestamp", rows.getTimestamp("readingTime").toLocalDateTime().toString());
                    result.add(item);
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Could not load sensor history", e);
        }
        return result;
    }

    private List<SensorReading> readHistory(String sql, Integer triBinId) {
        List<SensorReading> result = new ArrayList<>();
        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            if (triBinId != null) statement.setInt(1, triBinId);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    result.add(new SensorReading(rows.getInt("sensorID"), rows.getDouble("readingValue"),
                            rows.getString("unit"), rows.getTimestamp("readingTime").toLocalDateTime()));
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Could not load sensor history", e);
        }
        return result;
    }

    public void clearHistory() {
        try (Connection connection = DatabaseConfig.getConnection();
             Statement statement = connection.createStatement()) {
            statement.executeUpdate("DELETE FROM sensor_history");
        } catch (SQLException e) {
            throw new IllegalStateException("Could not clear sensor history", e);
        }
    }
}
