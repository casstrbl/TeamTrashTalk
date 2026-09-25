package main.java.trashtalk.wastemonitoring.model;


/**
 * Represents a waste bin in the waste monitoring system.
 *
 * A Bin stores its identification, location, and waste stream.
 * 
 * Bins can belong to one of three waste streams: landfill, recycling,
 * or compost.
 */
public class Bin {
	
	// Height of bin in centimeters
	public static final int BIN_HEIGHT = 77; /* Note: the dimensions used in the client's bin spec sheet encompassed the height of the 
												entire tribin structure, not just the actual trash bin itself. The current value for BIN_HEIGHT is 
												temporary until we get a measurement of the stand-alone bin for accurate sensor readings.*/
	// Bin information
	private  int binID;
	private  String location;
	private	BinType wasteStream;
	
	// Waste level information
	private double wasteHeight;
	

	
	/**
	 * Creates a new Bin.
	 * 
	 * @param binID the unique ID of the bin
	 * @param location the physical location of the bin
	 * @param wasteStream the type of waste collected by the bin
	 */	
	public Bin(int binID, String location, BinType wasteStream){ // Instance of Bin
		this.binID = binID;
		this.location = location;
		this.wasteStream = wasteStream;
		
		// Initial values
		this.wasteHeight = 0;
	}
	
	
	/**
	 * Retrieves the current waste level.
	 */
	public double getWasteHeight() {
		return wasteHeight;
	}
	
	
	
	/*public void setWasteHeight() {	// Will flesh this method out later 
		this.wasteHeight = wasteHeight;
	}*/
	
	
	/**
	 * Represents the different types of waste streams.
	 */
	public enum BinType{ // Declare the bin types/waste streams
		LANDFILL,
		RECYCLING,
		COMPOST
	}
	
	
	/**
	 * Represents the current status of the bin.
	 */
	public enum BinStatus{ // Declare the bin status UI colors
		GREEN, 		// "OK"
		YELLOW,		// "Warning"
		RED			// "Critical"
	}
	
}
