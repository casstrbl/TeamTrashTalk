package main.java.trashtalk.wastemonitoring;
import main.java.trashtalk.wastemonitoring.controller.SystemCheckController;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import main.java.trashtalk.wastemonitoring.controller.HealthController;
import main.java.trashtalk.wastemonitoring.controller.HistoryController;
import main.java.trashtalk.wastemonitoring.controller.LoginController;
import main.java.trashtalk.wastemonitoring.controller.PickupController;
import main.java.trashtalk.wastemonitoring.controller.TriBinController;
import main.java.trashtalk.wastemonitoring.database.DatabaseInitializer;
import main.java.trashtalk.wastemonitoring.database.DatabaseViewer;
import main.java.trashtalk.wastemonitoring.service.HistoryCsvService;
import main.java.trashtalk.wastemonitoring.service.HistoryService;
import main.java.trashtalk.wastemonitoring.service.LoginService;
import main.java.trashtalk.wastemonitoring.controller.TriBinManagementController;
import main.java.trashtalk.wastemonitoring.controller.SimulateController;
import main.java.trashtalk.wastemonitoring.controller.DetectedPickupController;
import main.java.trashtalk.wastemonitoring.controller.ZoneController;
import main.java.trashtalk.wastemonitoring.database.DemoAccountSeeder;
import main.java.trashtalk.wastemonitoring.controller.SensorReadingController;
import main.java.trashtalk.wastemonitoring.service.GatewayDataService;
import main.java.trashtalk.wastemonitoring.repository.BinRepository;

import java.util.Map;

public class Application {

	public static void main(String[] args) {

		DatabaseInitializer.initializeDatabase();
		DemoAccountSeeder.seedFromEnvironment();
		DatabaseViewer.viewTriBins();
		DatabaseViewer.viewBins();
		DatabaseViewer.viewAlerts();

		HistoryService historyService = new HistoryService();
		HistoryCsvService historyCsvService = new HistoryCsvService();
		LoginService loginService = new LoginService();

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
					new HistoryController(historyService, historyCsvService, loginService)
			);

			// Connect /api/pickups to the PickupController
			server.createContext(
					"/api/pickups",
					new PickupController(loginService)
			);

			// Login sessions are shared by protected backend endpoints.
			server.createContext(
					"/api/login",
					new LoginController(loginService)
			);

			// Connect /api/system-check to the SystemCheckController.
			server.createContext(
					"/api/system-check",
					new SystemCheckController(loginService)
			);

			// Connect editor-only TriBin management endpoints.
			server.createContext(
					"/api/admin/tribins",
					new TriBinManagementController(loginService)
			);

			// pickups found in the sensor readings (no "emptied" button needed)
			server.createContext(
					"/api/pickups/detected",
					new DetectedPickupController()
			);

			// put many bins in one zone at once (editors only)
			server.createContext(
					"/api/admin/zones",
					new ZoneController(loginService)
			);

			// test panel buttons (editors only)
			server.createContext(
					"/api/simulate/",
					new SimulateController(loginService)
			);
			
			// Register the LoRaWAN webhook handler at /api/sensor-readings.
			server.createContext(
			        SensorReadingController.PATH,
			        new SensorReadingController(
			                new GatewayDataService(historyService),
			                new BinRepository(),
			                Map.of("YOUR_DEVICE_ID",
			                        new SensorReadingController.SensorAssignment(
			                                1, 2, 201, 74.5)),
			                System.getenv("SENSOR_WEBHOOK_TOKEN")));
			// Start the server
			server.start();

            // Optional Sprint 3 demo. Disabled unless explicitly enabled.
            var fakeSensorScheduler =
                    main.java.trashtalk.wastemonitoring.service.FakeSensorScheduler.startIfEnabled();
            if (fakeSensorScheduler != null) {
                Runtime.getRuntime().addShutdownHook(new Thread(fakeSensorScheduler::close));
            }
            
         // lets the test panel see and stop it
            main.java.trashtalk.wastemonitoring.service.SensorTimer.adopt(fakeSensorScheduler);

			System.out.println("Health: http://localhost:" + serverPort + "/api/health");
			System.out.println("TriBins: http://localhost:" + serverPort + "/api/tribins");
			System.out.println("History: http://localhost:" + serverPort + "/api/tribins/TB-2/history");
			System.out.println("CSV export: GET /api/tribins/{id}/history/export (editor login required)");
			System.out.println("Login: POST http://localhost:" + serverPort + "/api/login");
			System.out.println("Pickups: http://localhost:" + serverPort + "/api/pickups");

		} catch (IOException e) {
			e.printStackTrace();
		}

	}

}