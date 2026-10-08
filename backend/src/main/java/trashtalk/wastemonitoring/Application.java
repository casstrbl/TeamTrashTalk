package main.java.trashtalk.wastemonitoring;

import main.java.trashtalk.wastemonitoring.database.DatabaseInitializer;
import main.java.trashtalk.wastemonitoring.database.DatabaseViewer;

public class Application {

	public static void main(String[] args) {

		DatabaseInitializer.initializeDatabase();
		
		DatabaseViewer.viewTriBins();
		DatabaseViewer.viewBins();
		
		
	}

}
