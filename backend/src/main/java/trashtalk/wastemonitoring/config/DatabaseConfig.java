package main.java.trashtalk.wastemonitoring.config;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;

public class DatabaseConfig {

	// local h2 database, used when no supabase settings are found
	private static final String H2_URL = "jdbc:h2:./data/wastemonitoring";
	private static final String H2_USER = "sa";
	private static final String H2_PASSWORD = "";

	// places to look for db.properties, it never gets committed
	private static final Path[] PROPERTY_FILES = {
		Path.of("db.properties"),
		Path.of("backend", "db.properties")
	};

	private static final String URL;
	private static final String USER;
	private static final String PASSWORD;

	static {
		Properties fileSettings = loadPropertiesFile();

		// environment variables win over db.properties
		String url = pick("DB_URL", "db.url", fileSettings);
		String user = pick("DB_USER", "db.user", fileSettings);
		String password = pick("DB_PASSWORD", "db.password", fileSettings);

		if (url == null || url.isBlank()) {
			URL = H2_URL;
			USER = H2_USER;
			PASSWORD = H2_PASSWORD;
			System.out.println("Database: local H2 (no db.properties or DB_URL found)");
		} else {
			URL = url;
			USER = user;
			PASSWORD = password;
			System.out.println("Database: " + url);
		}
	}

	/**
     * Creates a connection to the database.
     *
     * @return a connection to the database
     * @throws SQLException if a database connection cannot be established
     */
	public static Connection getConnection() throws SQLException {
		return DriverManager.getConnection(URL, USER, PASSWORD);
	}


	// reads an environment variable, then falls back to db.properties
	private static String pick(String envName, String propertyName, Properties fileSettings) {
		String value = System.getenv(envName);
		if (value != null && !value.isBlank()) {
			return value;
		}
		return fileSettings.getProperty(propertyName);
	}


	// loads the first db.properties file it finds
	private static Properties loadPropertiesFile() {
		Properties properties = new Properties();

		for (Path path : PROPERTY_FILES) {
			if (Files.exists(path)) {
				try (InputStream input = Files.newInputStream(path)) {
					properties.load(input);
					return properties;
				} catch (IOException e) {
					throw new RuntimeException("Error reading " + path, e);
				}
			}
		}

		return properties;
	}
}
