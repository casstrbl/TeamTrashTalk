package main.java.trashtalk.wastemonitoring.database;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import main.java.trashtalk.wastemonitoring.model.StaffMember;

public class StaffDataLoader {

	/**
	 * Loads StaffMember data from the staff.json file
	 */
	public static List<StaffMember> loadStaffMembers() {
		
		// Open staff.json from the resources folder
		try (InputStream inputStream =
			StaffDataLoader.class
				.getClassLoader()
				.getResourceAsStream("staff.json")) {
					
			// Check that staff.json is found
			if (inputStream == null) {
				throw new RuntimeException("staff.json could not be found.");
			}
			
			// Create an ObjectMapper to read and convert the json data in Java objects
			ObjectMapper objectMapper = new ObjectMapper();
			
			// Read staff.json and convert it into a list of StaffData objects
			List<StaffData> staffData = objectMapper.readValue(
					inputStream,
					new TypeReference<List<StaffData>>() {}
					);
			
			// Create a list to store the completed StaffMember objects
			List<StaffMember> staffMembers = new ArrayList<>();
			
			// Convert each StaffData object into a Staff object
			for (StaffData data : staffData) {
				
				// Create a Staff using the data loaded from the json file
				StaffMember staffMember = new StaffMember(
						data.staffID,
						data.name,
						data.role,
						data.zones,
						data.email
					);

				// Add the completed StaffMember to the list
				staffMembers.add(staffMember);
			}
			
			// Return the list of StaffMember objects
			return staffMembers;
			
		} catch (Exception e) {
			
			// Handle errors that occur while loading or converting the json data
			throw new RuntimeException(
					"Error loading staff.json",
					e
				);
		}
	}
	
	/**
	 * Represents the structure of a StaffMember entry in the json file.
	 * Jackson uses this class to map json data to Java fields.
	 */
	private static class StaffData {
		
		// Unique ID of the StaffMember
		public int staffID;
		
		// Staff member's name
		public String name;
		
		// Staff member's assigned role
		public String role;
		
		// Staff member's assigned zones
		public char[] zones;
		
		// Staff member's email address
		public String email;
	}
}