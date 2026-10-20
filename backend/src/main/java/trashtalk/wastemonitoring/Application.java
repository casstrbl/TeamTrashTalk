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
			// Default port is 8080; PORT can override it for local testing.
            int serverPort = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
			HttpServer server = HttpServer.create(
					new InetSocketAddress(serverPort),
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

            // Optional Sprint 3 demo. Disabled unless explicitly enabled.
            var fakeSensorScheduler =
                    main.java.trashtalk.wastemonitoring.service.FakeSensorScheduler.startIfEnabled();
            if (fakeSensorScheduler != null) {
                Runtime.getRuntime().addShutdownHook(new Thread(fakeSensorScheduler::close));
            }

			System.out.println("Health: http://localhost:" + serverPort + "/api/health");
			System.out.println("TriBins: http://localhost:" + serverPort + "/api/tribins");
			System.out.println("History: http://localhost:" + serverPort + "/api/tribins/TB-2/history");
			System.out.println("Pickups: http://localhost:" + serverPort + "/api/pickups");

		} catch (IOException e) {
			e.printStackTrace();
		}

	}

}
