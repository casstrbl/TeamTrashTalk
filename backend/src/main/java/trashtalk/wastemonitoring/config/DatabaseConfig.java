package main.java.trashtalk.wastemonitoring.config;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class DatabaseConfig {
	private static final String URL = "jdbc:h2:./data/wastemonitoring";
	private static final String USER = "sa";
	private static final String PASSWORD = "";
	
	/**
     * Creates a connection to the H2 database.
     *
     * @return a connection to the database
     * @throws SQLException if a database connection cannot be established
     */
	public static Connection getConnection() throws SQLException {
		return DriverManager.getConnection(URL, USER, PASSWORD);
	}
}
