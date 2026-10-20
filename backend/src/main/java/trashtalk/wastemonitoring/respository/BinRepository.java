package main.java.trashtalk.wastemonitoring.respository;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.TriBin;

public class BinRepository {

	// loads every tribin and its bins from the database
	public List<TriBin> findAllTriBins() {

		String triBinSql = "SELECT * FROM triBins ORDER BY triBinID";
		String binSql = "SELECT * FROM bins ORDER BY triBinID, binID";

		try (Connection connection = DatabaseConfig.getConnection()) {

			// group the bins by the tribin they belong to
			Map<Integer, List<Bin>> binsByTriBin = new HashMap<>();

			try (PreparedStatement statement = connection.prepareStatement(binSql);
					ResultSet resultSet = statement.executeQuery()) {

				while (resultSet.next()) {
					Bin bin = new Bin(
							resultSet.getInt("binID"),
							resultSet.getInt("triBinID"),
							Bin.BinType.valueOf(resultSet.getString("binType"))
					);
					bin.setWasteHeight(resultSet.getDouble("wasteHeight"));

					binsByTriBin
						.computeIfAbsent(bin.getTriBinID(), id -> new ArrayList<>())
						.add(bin);
				}
			}

			List<TriBin> triBins = new ArrayList<>();

			try (PreparedStatement statement = connection.prepareStatement(triBinSql);
					ResultSet resultSet = statement.executeQuery()) {

				while (resultSet.next()) {
					int triBinID = resultSet.getInt("triBinID");

					TriBin triBin = new TriBin(
							triBinID,
							toZone(resultSet.getString("zone")),
							resultSet.getString("location"),
							resultSet.getDouble("binCoordinatesX"),
							resultSet.getDouble("binCoordinatesY"),
							binsByTriBin.getOrDefault(triBinID, new ArrayList<>())
					);

					triBin.setBattery(resultSet.getInt("battery"));
					triBin.setSensorStatus(resultSet.getString("sensorStatus"));

					Timestamp lastUpdated = resultSet.getTimestamp("lastUpdated");
					if (lastUpdated != null) {
						triBin.setLastUpdated(lastUpdated.toLocalDateTime());
					}

					triBins.add(triBin);
				}
			}

			return triBins;

		} catch (SQLException e) {
			throw new RuntimeException("Error loading tribins from the database.", e);
		}
	}


    /**
     * Persists a demo round in one transaction so the /api/tribins endpoint
     * reads the same bin heights the fake sensor gateway just generated.
     * Only online tribins are modified; offline readings remain unchanged.
     */
    public void saveSimulatedReadings(List<TriBin> triBins) {
        String updateBin = "UPDATE bins SET wasteHeight = ? WHERE binID = ? AND triBinID = ?";
        String updateTriBin = "UPDATE triBins SET lastUpdated = ? WHERE triBinID = ?";

        try (Connection connection = DatabaseConfig.getConnection()) {
            connection.setAutoCommit(false);
            try (PreparedStatement binStatement = connection.prepareStatement(updateBin);
                 PreparedStatement triBinStatement = connection.prepareStatement(updateTriBin)) {

                for (TriBin triBin : triBins) {
                    if (!"online".equalsIgnoreCase(triBin.getSensorStatus())) {
                        continue;
                    }
                    for (Bin bin : triBin.getBins()) {
                        binStatement.setDouble(1, bin.getWasteHeight());
                        binStatement.setInt(2, bin.getBinID());
                        binStatement.setInt(3, triBin.getTriBinID());
                        binStatement.addBatch();
                    }
                    if (triBin.getLastUpdated() != null) {
                        triBinStatement.setTimestamp(1, Timestamp.valueOf(triBin.getLastUpdated()));
                        triBinStatement.setInt(2, triBin.getTriBinID());
                        triBinStatement.addBatch();
                    }
                }

                binStatement.executeBatch();
                triBinStatement.executeBatch();
                connection.commit();
            } catch (SQLException error) {
                connection.rollback();
                throw error;
            }
        } catch (SQLException error) {
            throw new RuntimeException("Could not save fake sensor readings", error);
        }
    }


	// a blank zone comes back as the empty char
	private static char toZone(String zone) {
		if (zone == null || zone.isBlank()) {
			return '\0';
		}
		return zone.trim().charAt(0);
	}
}
