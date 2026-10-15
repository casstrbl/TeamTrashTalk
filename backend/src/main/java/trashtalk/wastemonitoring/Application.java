package main.java.trashtalk.wastemonitoring;

import main.java.trashtalk.wastemonitoring.database.DatabaseInitializer;
import main.java.trashtalk.wastemonitoring.database.DatabaseViewer;
import com.sun.net.httpserver.HttpServer;
import main.java.trashtalk.wastemonitoring.controller.HealthController;

import java.io.IOException;
import java.net.InetSocketAddress;
import main.java.trashtalk.wastemonitoring.controller.TriBinController;
import main.java.trashtalk.wastemonitoring.controller.HistoryController;
import main.java.trashtalk.wastemonitoring.controller.PickupController;
import main.java.trashtalk.wastemonitoring.service.HistoryService;

public class Application {

	public static void main(String[] args) {

		DatabaseInitializer.initializeDatabase();
		DatabaseViewer.viewTriBins();
		DatabaseViewer.viewBins();

		HistoryService historyService = new HistoryService();

		try {
			// Start a local web server on port 8080
			HttpServer server = HttpServer.create(
					new InetSocketAddress(8080),
					0
			);

			// Connect /api/health to the HealthController
			server.createContext(
					"/api/health",
					new HealthController()
			);

			// Connect /api/tribins to the TriBinController
			server.createContext(
					"/api/tribins",
					new TriBinController()
			);

			// Connect /api/tribins/{id}/history to the HistoryController
			server.createContext(
					"/api/tribins/",
					new HistoryController(historyService)
			);

			// Connect /api/pickups to the PickupController
			server.createContext(
					"/api/pickups",
					new PickupController()
			);

			// Start the server
			server.start();

			System.out.println("Health: http://localhost:8080/api/health");
			System.out.println("TriBins: http://localhost:8080/api/tribins");
			System.out.println("History: http://localhost:8080/api/tribins/TB-2/history");
			System.out.println("Pickups: http://localhost:8080/api/pickups");

		} catch (IOException e) {
			e.printStackTrace();
		}
		
		
	}

}
