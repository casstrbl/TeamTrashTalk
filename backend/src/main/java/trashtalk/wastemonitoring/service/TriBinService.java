package main.java.trashtalk.wastemonitoring.service;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.TriBin;

public class TriBinService {

	/**
	 * Checks for critical fill status in the tribin's bins and returns true if any one of them is full and needs to be emptied
	 */
	public boolean isFull(TriBin t) {
		for (Bin b : t.getBins()) {
			if (b.isFull())
				return true;
		}
		return false;
	}
}
