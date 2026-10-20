package main.java.trashtalk.wastemonitoring.model;

/**
 * Represents a sustainability staff member.
 *
 * A Staff object stores its identification, name, role, assigned zones, and email address.
 */
public class StaffMember {
	
	// Staff information
	private int staffID;			// Unique ID of the StaffMember
	private String name;			// Staff member's name
	private String role;			// Staff member's user role in the program
	private char[] zones;			// Staff member's assigned zones
	private String email;			// Staff member's email address
	

	/**
	 * Creates a new StaffMember.
	 * 
	 * @param staffID the unique ID of the staff member
	 * @param name the name of the staff member
	 * @param role the assigned role of the staff member in the program
	 * @param zones the assigned zones of the staff member
	 * @param email the staff member's email
	 */

	public StaffMember(int staffID, String name, String role, char[] zones, String email){
		this.staffID = staffID;
		this.name = name;
		this.role = role;
		this.zones = zones;
		this.email = email;
	}
	
	
	/**
	 * No-argument constructor for loading staff.json and initializing existing bin data into the database
	 */
	public StaffMember() {
		// Empty constructor
	}
	
	
	/**
	 * Retrieves the staff member's ID number.
	 */
	public int getStaffID() {
		return staffID;
	}

	/**
	 * Retrieves the staff member's name.
	 */
	public String getName() {
		return name;
	}

	/**
	 * Retrieves the staff member's assigned role.
	 */
	public String getRole() {
		return role;
	}
	
	
	/**
	 * Retrieves the staff member's assigned zones.
	 */
	public char[] getZone() {
		return zones;
	}
	
	
	/**
	 * Retrieves the staff member's email address.
	 * @return
	 */
	public String getEmail() {
		return email;
	}
	
	
	/**
	 * Sets the staff member's ID number.
	 */
	public void setStaffID(int staffID) {
		this.staffID = staffID;	
	}

	/**
	 * Sets the staff member's assigned role.
	 */
	public void setRole (String role) {
		this.role = role;
	}
	
	/**
	 * Sets the staff member's assigned zones.
	 */
	public void setZone(char[] zones) {
		this.zones = zones;
	}

	/**
	 * Sets the staff member's email address.
	 */
	public void setEmail(String email) {
		this.email = email;
	}
}