package main.java.trashtalk.wastemonitoring.dto;

import java.util.List;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.TriBin;

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
            List<CompartmentResponse> compartments) {

        this.id = id;
        this.name = name;
        this.zone = zone;
        this.location = location;
        this.lat = lat;
        this.lng = lng;
        this.compartments = compartments;
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

    /**
     * Converts a backend TriBin into the response format expected by the frontend.
     */
    public static TriBinResponse fromTriBin(TriBin triBin) {

        return new TriBinResponse(
                "TB-" + triBin.getTriBinID(),
                "Bin " + triBin.getTriBinID(),
                triBin.getZone() == '\0' ? "" : String.valueOf(triBin.getZone()),
                triBin.getBinLocation(),
                triBin.getBinCoordinatesY(),
                triBin.getBinCoordinatesX(),
                triBin.getBins()
                        .stream()
                        .map(TriBinResponse::createCompartment)
                        .toList()
        );
    }

    /**
     * Converts a backend Bin into the compartment format expected by the frontend.
     */
    private static CompartmentResponse createCompartment(Bin bin) {
        return new CompartmentResponse(
                formatBinType(bin.getBinType().name()),
                bin.getWasteHeight()
        );
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

        // Current fill level for the compartment
        private double fill;

        /**
         * Creates a compartment response for one waste stream.
         */
        public CompartmentResponse(String label, double fill) {
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
        public double getFill() {
            return fill;
        }
    }
}