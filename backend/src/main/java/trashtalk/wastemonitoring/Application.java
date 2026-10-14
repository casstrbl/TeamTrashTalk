package main.java.trashtalk.wastemonitoring;

import main.java.trashtalk.wastemonitoring.database.DatabaseInitializer;
import main.java.trashtalk.wastemonitoring.database.DatabaseViewer;
import com.sun.net.httpserver.HttpServer;
import main.java.trashtalk.wastemonitoring.controller.HealthController;

import java.io.IOException;
import java.net.InetSocketAddress;
import main.java.trashtalk.wastemonitoring.controller.TriBinController;
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

			// Connect /api/tribins to the TriBinController
			server.createContext(
					"/api/tribins",
					new TriBinController()
			);

			// Start the server
			server.start();

			System.out.println("Health: http://localhost:8080/api/health");
			System.out.println("TriBins: http://localhost:8080/api/tribins");

		} catch (IOException e) {
			e.printStackTrace();
		}
		
		
	}

}
