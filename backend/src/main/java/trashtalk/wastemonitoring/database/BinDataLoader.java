package main.java.trashtalk.wastemonitoring.database;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.model.Bin;

public class BinDataLoader {

	/**
	 * Loads TriBin data from the tribins.json file
	 */
	public static List<TriBin> loadTriBins() {
		
		// Open tribins.json from the resources folder
		try (InputStream inputStream =
			BinDataLoader.class
				.getClassLoader()
				.getResourceAsStream("tribins.json")) {
					
			// Check that tribin.json is found
			if (inputStream == null) {
				throw new RuntimeException("tribins.json could not be found.");
			}
			
			// Create an ObjectMapper to read and convert the json data in Java objects
			ObjectMapper objectMapper = new ObjectMapper();
			
			// Read tribins.json and convert it into a list of TriBinData objects
			List<TriBinData> triBinData = objectMapper.readValue(
					inputStream,
					new TypeReference<List<TriBinData>>() {}
					);
			
			// Create a list to store the completed TriBin objects
			List<TriBin> triBins = new ArrayList<>();
			
			// Convert each TriBinData object into a TriBin object
			for (TriBinData data : triBinData) {
				
				// Create a TriBin using the data loaded from the json file
				TriBin triBin = new TriBin(
						data.triBinID,
						data.zone,
						data.location,
						data.binCoordinatesX,
						data.binCoordinatesY,
						data.bins
					);
				
				// Add the completed TriBin to the list
				triBins.add(triBin);
			}
			
			// Return the list of TriBin objects
			return triBins;
			
		} catch (Exception e) {
			
			// Handle errors that occur while loading or converting the json data
			throw new RuntimeException(
					"Error loading tribin.json",
					e
				);
		}
	}
	
	/**
	 * Represents the structure of a Tribin entry in the json file.
	 * Jackson uses this class to map json data to Java fields.
	 */
	private static class TriBinData {
		
		// Unique ID of the TriBin
		public int triBinID;
		
		// Campus zone where the TriBin is located
		public char zone;
		
		// Location description of the TriBin
		public String location;
		
		// X-coordinate of the TriBin's gps location
		public double binCoordinatesX;
		
		// Y-coordinate of the TriBin's gps location
		public double binCoordinatesY;
		
		// List of bins belonging to the TriBin
		public List<Bin> bins;
	}
	
	/**
	 * Represents the structure of an individual bin in the json data
	 */
	private static class BinData {
		
		// Unique ID of the Bin
		public int binID;
		
		// ID of the TriBin that this Bin belongs to
		public int triBinID;
		
		// Type of waste collected by the bin
		public String binType;
		
		// Current amount of waste in the bin measured by height
		public double wasteHeight;
	}
}
