package main.java.trashtalk.wastemonitoring.model;

/**
 * Represents an individual bin within a tribin in the waste monitoring system.
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
	private int binID;			// Unique ID of the Bin
	private int triBinID;		// ID of the TriBin the Bin belongs to
	private	BinType binType;	// Type of waste collected by the Bin
	
	// Waste level information
	private double wasteHeight; // Current waste level measured by height
	

	
	/**
	 * Creates a new Bin.
	 * 
	 * @param binID the unique ID of the bin
	 * @param triBinID the unique ID of the tribin housing the individual bin
	 * @param binType the type of waste collected by the bin
	 */	
	public Bin(int binID, int triBinID, BinType binType){
		this.binID = binID;
		this.triBinID = triBinID;
		this.binType = binType;
		this.wasteHeight = 0;
	}
	
	
	/**
	 * No-argument constructor for loading tribins.json and initializing existing bin data into the database
	 */
	public Bin() {
		// Empty constructor
	}
	
	
	/**
	 * Retrieves the current waste level.
	 */
	public double getWasteHeight() {
		return wasteHeight;
	}
	
	
	/**
	 * Retrieves the bin ID number
	 */
	public int getBinID() {
		return binID;
	}
	
	
	/**
	 * Retrieves the parent tri-bin's ID number
	 */
	public int getTriBinID() {
		return triBinID;
	}
	
	
	/**
	 * Retrieves the bin's waste stream
	 */
	public BinType getBinType() {
		return binType;
	}
	
	
	/**
	 * Sets the waste height according to the sensor reading
	 */
	public void setWasteHeight(SensorReading sensorReading) {
		this.wasteHeight = sensorReading.getValue();	
	}
	
	
	/**
	 * Represents the different types of waste streams.
	 */
	public enum BinType{
		LANDFILL,
		RECYCLING,
		COMPOST
	}
	
	
	/**
	 * Represents the current status of the bin.
	 */
	public enum BinStatus{
		GREEN, 		// "OK"
		YELLOW,		// "Warning"
		RED			// "Critical"
	}
	
}
