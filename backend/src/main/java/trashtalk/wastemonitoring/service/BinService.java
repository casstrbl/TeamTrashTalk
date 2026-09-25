package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Bin.BinStatus;

public class BinService {
	/**
	 * Calculates the percentage of the bin that is filled with waste.
	 * 
	 * @return the percentage of the bin that is full
	 */
	public double getPercentage(Bin b) {		// Calculates the Bin's percentage of fullness
		double percentFull = b.getWasteHeight() / Bin.BIN_HEIGHT * 100; // Current waste level divided by BIN_HEIGHT and multiplied by 100 to get percentage
		percentFull = (Math.round(percentFull));	// Round the percentage to the nearest whole number
		return percentFull;
	}
	
	
	
	/**
	 * Evaluates the bin's fullness percentage and assigns a status.
	 * 
	 * @return the current status of the bin
	 */
	public BinStatus getStatus(Bin b){
		double percentFull = getPercentage(b);
		if (percentFull < 50)		// If the Bin is less than 50% full, its status is GREEN.
			return Bin.BinStatus.GREEN;
		else if (percentFull < 80)		// If the Bin is less than 80% but more than 50%, its status is YELLOW.
			return Bin.BinStatus.YELLOW;
		else
			return Bin.BinStatus.RED;		//If the Bin is 80% or greater, its status is RED.
	}

}
