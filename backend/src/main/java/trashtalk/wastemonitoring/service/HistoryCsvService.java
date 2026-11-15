package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.model.Bin;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Locale;

/** Builds a CSV export of every compartment reading belonging to one TriBin. */
public class HistoryCsvService {
    private static final String HEADER = "bin_id,location,waste_stream,fill_percent,date_time\r\n";

    public String exportTriBinHistory(int triBinId) {
        String sql = """
                SELECT h.binID, t.location, b.binType, h.readingValue, h.unit, h.readingTime
                FROM sensor_history h
                LEFT JOIN bins b ON b.binID = h.binID AND b.triBinID = h.triBinID
                LEFT JOIN triBins t ON t.triBinID = h.triBinID
                WHERE h.triBinID = ?
                ORDER BY h.readingTime, h.id
                """;

        StringBuilder csv = new StringBuilder(HEADER);
        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, triBinId);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    double value = rows.getDouble("readingValue");
                    String unit = rows.getString("unit");
                    double percent = "%".equals(unit)
                            ? value
                            : value / Bin.BIN_HEIGHT * 100.0;
                    percent = Math.max(0.0, Math.min(100.0, percent));

                    csv.append(rows.getInt("binID")).append(',')
                            .append(csvCell(rows.getString("location"))).append(',')
                            .append(csvCell(rows.getString("binType"))).append(',')
                            .append(String.format(Locale.ROOT, "%.1f", percent)).append(',')
                            .append(csvCell(rows.getTimestamp("readingTime").toLocalDateTime().toString()))
                            .append("\r\n");
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Could not export sensor history", e);
        }
        return csv.toString();
    }

    private static String csvCell(String value) {
        if (value == null) return "\"\"";
        // Quote CSV values and neutralize spreadsheet formula cells.
        String safe = value;
        if (!safe.isEmpty() && "=+-@".indexOf(safe.charAt(0)) >= 0) safe = "'" + safe;
        return "\"" + safe.replace("\"", "\"\"") + "\"";
    }
}
