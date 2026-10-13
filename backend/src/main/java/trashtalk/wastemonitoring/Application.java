package main.java.trashtalk.wastemonitoring;

import main.java.trashtalk.wastemonitoring.database.DatabaseInitializer;
import main.java.trashtalk.wastemonitoring.database.DatabaseViewer;
import com.sun.net.httpserver.HttpServer;
import main.java.trashtalk.wastemonitoring.controller.HealthController;

import java.io.IOException;
import java.net.InetSocketAddress;

public class Application {

	public static void main(String[] args) {

		DatabaseInitializer.initializeDatabase();
		
		DatabaseViewer.viewTriBins();
		DatabaseViewer.viewBins();

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

			// Start the server
			server.start();

			System.out.println(
					"http://localhost:8080/api/health"
			);

		} catch (IOException e) {
			e.printStackTrace();
		}
		
		
	}

}
