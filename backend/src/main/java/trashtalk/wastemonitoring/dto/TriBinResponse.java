package main.java.trashtalk.wastemonitoring.dto;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.service.BinService;

/**
 * Represents the TriBin information returned by the API.
 *
 * This response format matches the structure expected by the frontend
 * without changing the existing TriBin model.
 */
public class TriBinResponse {

    // Unique ID used by the frontend for the TriBin
    private String id;

    // Display name for the TriBin
    private String name;

    // Campus zone where the TriBin is located
    private String zone;

    // Readable location description
    private String location;

    // Latitude coordinate used by the map
    private double lat;

    // Longitude coordinate used by the map
    private double lng;

    // Individual waste compartments belonging to the TriBin
    private List<CompartmentResponse> compartments;

    // battery level from 0 to 100
    private int battery;

    // "online" or "offline"
    private String sensorStatus;

    // readable time since the last reading, like "2 min ago"
    private String lastUpdated;

    // turns waste height into a fill percent
    private static final BinService binService = new BinService();

    /**
     * Creates a TriBin response in the format expected by the frontend.
     */
    public TriBinResponse(
            String id,
            String name,
            String zone,
            String location,
            double lat,
            double lng,
            List<CompartmentResponse> compartments,
            int battery,
            String sensorStatus,
            String lastUpdated) {

        this.id = id;
        this.name = name;
        this.zone = zone;
        this.location = location;
        this.lat = lat;
        this.lng = lng;
        this.compartments = compartments;
        this.battery = battery;
        this.sensorStatus = sensorStatus;
        this.lastUpdated = lastUpdated;
    }

    /**
     * Retrieves the TriBin ID used by the frontend.
     */
    public String getId() {
        return id;
    }

    /**
     * Retrieves the TriBin display name.
     */
    public String getName() {
        return name;
    }

    /**
     * Retrieves the campus zone for the TriBin.
     */
    public String getZone() {
        return zone;
    }

    /**
     * Retrieves the readable location description.
     */
    public String getLocation() {
        return location;
    }

    /**
     * Retrieves the latitude coordinate used by the map.
     */
    public double getLat() {
        return lat;
    }

    /**
     * Retrieves the longitude coordinate used by the map.
     */
    public double getLng() {
        return lng;
    }

    /**
     * Retrieves the compartments belonging to the TriBin.
     */
    public List<CompartmentResponse> getCompartments() {
        return compartments;
    }

    public int getBattery() {
        return battery;
    }

    public String getSensorStatus() {
        return sensorStatus;
    }

    public String getLastUpdated() {
        return lastUpdated;
    }

    /**
     * Converts a backend TriBin into the response format expected by the frontend.
     */
    public static TriBinResponse fromTriBin(TriBin triBin) {

        return new TriBinResponse(
                "TB-" + triBin.getTriBinID(),
                "Bin " + triBin.getTriBinID(),
                formatZone(triBin.getZone()),
                triBin.getBinLocation(),
                triBin.getBinCoordinatesY(),
                triBin.getBinCoordinatesX(),
                triBin.getBins()
                        .stream()
                        .map(TriBinResponse::createCompartment)
                        .toList(),
                triBin.getBattery(),
                triBin.getSensorStatus() == null ? "offline" : triBin.getSensorStatus(),
                formatLastUpdated(triBin.getLastUpdated(), LocalDateTime.now())
        );
    }

    /**
     * Converts a backend Bin into the compartment format expected by the frontend.
     */
    private static CompartmentResponse createCompartment(Bin bin) {

        // the site wants a percent, not a height in cm
        double percent = binService.getPercentage(bin);
        int fill = (int) Math.max(0, Math.min(100, percent));

        return new CompartmentResponse(
                formatBinType(bin.getBinType().name()),
                fill
        );
    }

    // 'A' becomes "Zone A" to match the site
    public static String formatZone(char zone) {
        if (zone == '\0' || zone == ' ') {
            return "";
        }
        return "Zone " + zone;
    }

    // matches the site's "2 min ago" style
    public static String formatLastUpdated(LocalDateTime lastUpdated, LocalDateTime now) {
        if (lastUpdated == null) {
            return "never";
        }

        long minutes = Math.max(0, Duration.between(lastUpdated, now).toMinutes());

        if (minutes < 1) {
            return "just now";
        }
        if (minutes < 60) {
            return minutes + " min ago";
        }

        long hours = minutes / 60;
        if (hours < 24) {
            return hours == 1 ? "1 hour ago" : hours + " hours ago";
        }

        long days = hours / 24;
        return days == 1 ? "1 day ago" : days + " days ago";
    }

    /**
     * Formats the bin type name to match the frontend display format.
     */
    private static String formatBinType(String binType) {
        return binType.substring(0, 1)
                + binType.substring(1).toLowerCase();
    }

    /**
     * Represents one compartment shown in the frontend.
     */

    public static class CompartmentResponse {

        // Waste stream label, such as Landfill, Recycling, or Compost
        private String label;

        // fill percent from 0 to 100
        private int fill;

        /**
         * Creates a compartment response for one waste stream.
         */
        public CompartmentResponse(String label, int fill) {
            this.label = label;
            this.fill = fill;
        }

        /**
         * Retrieves the waste stream label.
         */
        public String getLabel() {
            return label;
        }

        /**
         * Retrieves the current fill level.
         */
        public int getFill() {
            return fill;
        }
    }
}