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


	// a blank zone comes back as the empty char
	private static char toZone(String zone) {
		if (zone == null || zone.isBlank()) {
			return '\0';
		}
		return zone.trim().charAt(0);
	}
}
