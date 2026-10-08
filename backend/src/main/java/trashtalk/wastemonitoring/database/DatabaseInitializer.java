package main.java.trashtalk.wastemonitoring.database;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.PreparedStatement;
import java.util.List;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.TriBin;

public class DatabaseInitializer {
	
	/**
     * Creates the database tables if they do not already exist.
     */
	public static void initializeDatabase() {
		
		createTables();
		
		if (isDatabaseEmpty()) {
			loadInitialData();
		}
	}
	
	
	private static void createTables() {
	
		/**
		 * Creates new table for TriBin data if one does not already exist
		 */
		String createTriBinsTable = """
				CREATE TABLE IF NOT EXISTS triBins(
				triBinID INT PRIMARY KEY,
				zone CHAR,
				location VARCHAR(255),
				binCoordinatesX DOUBLE,
				binCoordinatesY DOUBLE
				)
				""";
	
		/**
		 * Creates new table for Bin data if one does not already exist
		 */	
		String createBinsTable = """
				CREATE TABLE IF NOT EXISTS bins (
				binID INT PRIMARY KEY,
				triBinID INT NOT NULL,
				binType VARCHAR(20) NOT NULL,
				wasteHeight DOUBLE,
				
				FOREIGN KEY (triBinID)
					REFERENCES triBins(triBinID)
					)
			""";
	
		try (Connection connection = DatabaseConfig.getConnection();
				
				// Prepare the SQL statement for creating the tri-bins table
				PreparedStatement triBinStatement = connection.prepareStatement(createTriBinsTable);
				
				// Prepare the SQL statement for creating the bins table
				PreparedStatement binStatement = connection.prepareStatement(createBinsTable)) {
		
				// Execute the SQL statement to create the tri-bins table
				triBinStatement.execute();
				
				// Execute the SQL statement to create the bins table
				binStatement.execute();
		
		
		} catch (SQLException e) {
			
			// Handle any database errors that occur while creating the tables
			throw new RuntimeException(
				"Error creating database tables.", e
				);
		}
	}


private static void loadInitialData() {
	
	// Load the initial tri-bin data from the json file
	List<TriBin> triBins = BinDataLoader.loadTriBins();
	
	// SQL statement to insert a TriBin into the triBins table
	String insertTriBin = """
			INSERT INTO triBins
			(triBinID, zone, location, binCoordinatesX, binCoordinatesY)
			VALUES (?, ?, ?, ?, ?)
			""";
	
	// SQL statement to insert an individual bin into the bins table
	String insertBin = """
			INSERT INTO bins
			(binID, triBinID, binType, wasteHeight)
			VALUES (?, ?, ?, ?)
			""";
	
	// Open database connection and prepare the SQL statements
	try (Connection connection = DatabaseConfig.getConnection();
			PreparedStatement triBinStatement = connection.prepareStatement(insertTriBin);
			PreparedStatement binStatement = connection.prepareStatement(insertBin)) {
		
		// Loop through each TriBin loaded from the json file
		for (TriBin triBin : triBins) {
			
			// Set the values for the current TriBin
			triBinStatement.setInt(1, triBin.getTriBinID());
			triBinStatement.setString(2, String.valueOf(triBin.getZone()));
			triBinStatement.setString(3, triBin.getBinLocation());
			triBinStatement.setDouble(4, triBin.getBinCoordinatesX());
			triBinStatement.setDouble(5, triBin.getBinCoordinatesY());
		
			// Insert the TriBin into the database
			triBinStatement.executeUpdate();
			
			
			// Loop through the three bins belonging to the current TriBin
			for (Bin bin : triBin.getBins()) {
				
				// Set the values for the current bin
				binStatement.setInt(1, bin.getBinID());
				binStatement.setInt(2, triBin.getTriBinID());
				binStatement.setString(3, bin.getBinType().name());
				binStatement.setDouble(4, bin.getWasteHeight());
				
				// Insert the bin into the database
				binStatement.executeUpdate();
			}
		}
		
		
	} catch (SQLException e) {
		
		// Handle any database errors that occur while loading the initial data
		throw new RuntimeException(
				"Error loading initial bin data.", e
			);
	}
}

private static boolean isDatabaseEmpty() {

	// SQL statement that counts the number of TriBins currently in the database
    String sql = "SELECT COUNT(*) FROM triBins";

    // Open a database connection and execute the query
    try (Connection connection = DatabaseConfig.getConnection();
         PreparedStatement statement = connection.prepareStatement(sql);
         var resultSet = statement.executeQuery()) {

    	// Move the ResultSet sursor to the first (and only) row
        resultSet.next();

        // Return true if the triBins table contains no data
        return resultSet.getInt(1) == 0;

    } catch (SQLException e) {
    	
    	// Handle any database errors that occur while checking the database
        throw new RuntimeException(
            "Error checking database.",
            e
        );
    }
}
}

