package main.java.trashtalk.wastemonitoring.repository;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.TriBin;

// database changes behind the test panel buttons
public class SimulationRepository {

    // a reading came in, so the station and its compartments are talking again
    public void markOnline(int triBinID) throws SQLException {
        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement station = connection.prepareStatement(
                     "UPDATE triBins SET sensorStatus = 'online' WHERE triBinID = ?");
             PreparedStatement compartments = connection.prepareStatement(
                     "UPDATE bins SET sensorStatus = 'online' WHERE triBinID = ?")) {
            station.setInt(1, triBinID);
            station.executeUpdate();
            compartments.setInt(1, triBinID);
            compartments.executeUpdate();
        }
    }

    // the sensor goes quiet: last contact is pushed back so it looks like it stopped hours ago
    public void markOffline(int triBinID, LocalDateTime lastContact) throws SQLException {
        try (Connection connection = DatabaseConfig.getConnection();
             PreparedStatement station = connection.prepareStatement(
                     "UPDATE triBins SET sensorStatus = 'offline', lastUpdated = ? WHERE triBinID = ?");
             PreparedStatement compartments = connection.prepareStatement(
                     "UPDATE bins SET sensorStatus = 'failed' WHERE triBinID = ?")) {
            station.setTimestamp(1, Timestamp.valueOf(lastContact));
            station.setInt(2, triBinID);
            station.executeUpdate();
            compartments.setInt(1, triBinID);
            compartments.executeUpdate();
        }
    }

    // puts every seeded bin back to its starting fill, battery and status. history rows are kept
    public int resetToSeed(List<TriBin> seed) throws SQLException {
        String updateStation = """
                UPDATE triBins SET battery = ?, sensorStatus = ?, lastUpdated = ?
                WHERE triBinID = ?
                """;
        String updateCompartment =
                "UPDATE bins SET wasteHeight = ?, sensorStatus = 'online' WHERE binID = ? AND triBinID = ?";
        int stations = 0;

        try (Connection connection = DatabaseConfig.getConnection()) {
            connection.setAutoCommit(false);
            try (PreparedStatement station = connection.prepareStatement(updateStation);
                 PreparedStatement compartment = connection.prepareStatement(updateCompartment)) {

                for (TriBin triBin : seed) {
                    station.setInt(1, triBin.getBattery());
                    station.setString(2, triBin.getSensorStatus() == null ? "online" : triBin.getSensorStatus());
                    station.setTimestamp(3, triBin.getLastUpdated() == null
                            ? null
                            : Timestamp.valueOf(triBin.getLastUpdated()));
                    station.setInt(4, triBin.getTriBinID());
                    station.addBatch();
                    stations++;

                    for (Bin bin : triBin.getBins()) {
                        compartment.setDouble(1, bin.getWasteHeight());
                        compartment.setInt(2, bin.getBinID());
                        compartment.setInt(3, triBin.getTriBinID());
                        compartment.addBatch();
                    }
                }

                station.executeBatch();
                compartment.executeBatch();
                connection.commit();
            } catch (SQLException error) {
                connection.rollback();
                throw error;
            }
        }
        return stations;
    }
}
