package main.java.trashtalk.wastemonitoring.model;

import java.util.List;

public class TriBin {

	// Bin information
	private int triBinID;
	private List<Bin> bins;
	private char zone;
	private String location;
	private double binCoordinatesX;
	private double binCoordinatesY;
	
	/**
	 * Creates a new TriBin.
	 * 
	 * @param triBinID
	 * @param bins
	 * @param zone
	 * @param location
	 * @param binCoordinatesX
	 * @param binCoordinatesY
	 */
	public TriBin(int triBinID, char zone, String location, double binCoordinatesX, double binCoordinatesY, List<Bin> bins) {
		this.triBinID = triBinID;
		this.zone = zone;
		this.location = location;
		this.binCoordinatesX = binCoordinatesX;
		this.binCoordinatesY = binCoordinatesY;
		this.bins = bins;
	}
	
	public TriBin() {
		// Empty constructor
	}
	
	
	/**
	 * Retrieves tri-bin ID number
	 */
	public int getTriBinID() {
		return triBinID;
	}
	
	
	/**
	 * Retrieves the tri-bin's zone
	 */
	public char getZone() {
		return zone;
	}
	
	
	/**
	 * Retrieves the tri-bin's location description
	 */
	public String getBinLocation( ){
		return location;
	}
	
	
	/**
	 * Retrieves the GPS X coordinates of the bin
	 */
	public double getBinCoordinatesX() {
		return binCoordinatesX;
	}
	
	
	/**
	 * Retrieves the GPS Y coordinates of the bin
	 */
	public double getBinCoordinatesY() {
		return binCoordinatesY;
	}
	
	
	/**
	 * Retrieves the list of bins associated with the tri-bin
	 */
	public List<Bin> getBins() {
		return bins;
	}
}
