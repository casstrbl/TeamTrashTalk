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
	private int binID;
	private String binLocation;
	private double binCoordinatesX;
	private double binCoordinatesY;
	private	BinType binType;
	
	// Waste level information
	private double wasteHeight;
	

	
	/**
	 * Creates a new Bin.
	 * 
	 * @param binID the unique ID of the bin
	 * @param binLocation the physical location of the bin
	 * @param binType the type of waste collected by the bin
	 */	
	public Bin(int binID, String binLocation, BinType binType){
		this.binID = binID;
		this.binLocation = binLocation;
		this.binType = binType;
		
		// Initial values
		this.wasteHeight = 0;
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
	 * Retrieves the bin location
	 */
	public String getBinLocation( ){
		return binLocation;
	}
	
	
	/**
	 * Retrieves the GPS coordinates of the bin
	 */
	public double getBinCoordinatesX() {
		return binCoordinatesX;
	}
	
	
	public double getBinCoordinatesY() {
		return binCoordinatesY;
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
