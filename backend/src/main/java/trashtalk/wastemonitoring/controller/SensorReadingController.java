package main.java.trashtalk.wastemonitoring.controller;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.Objects;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import main.java.trashtalk.wastemonitoring.dto.SensorReadingRequest;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.repository.BinRepository;
import main.java.trashtalk.wastemonitoring.service.GatewayDataService;

/**
 * Accepts decoded ultrasonic reports forwarded by a LoRaWAN integration.
 * The JSON fields are sensorID, distanceCM, measuredAt, and optional batteryLevel.
 * The controller uses the sensor's configured assignment to find its bin and convert the measured distance to waste height.
 *
 * The converted reading is passed to GatewayDataService for processing. 
 * The endpoint returns HTTP 204 when the service call returns normally.
 */
public final class SensorReadingController implements HttpHandler {

	/** Endpoint path used to register this handler with the HTTP server. */
    public static final String PATH = "/api/sensor-readings";
    
    private static final int MAX_BODY_BYTES = 8 * 1024;					// Maximum request body size, in bytes, before JSON parsing.
    private static final System.Logger LOGGER =
            System.getLogger(SensorReadingController.class.getName());

    private final ObjectMapper mapper = new ObjectMapper()				// Reject extra JSON tokens after the first parsed value.
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private final GatewayDataService gatewayDataService;
    private final BinRepository binRepository;
    private final Map<String, SensorAssignment> assignments;			// Maps external sensor IDs to backend identifiers and calibration values.
    private final byte[] authorizationHeader;							// UTF-8 bytes of the complete expected Authorization header value.
    
    
    /**
     * Binds a LoRaWAN sensor to its backend sensor ID, bin, and the distance measured in that bin when it's empty.
     */
    public record SensorAssignment(
            int sensorID, int triBinID, int binID, double sensorToBottomCm) {

    	// Validates the identifiers and calibration when an assignment is created.
        public SensorAssignment {
            if (sensorID <= 0 || triBinID <= 0 || binID <= 0
                    || !Double.isFinite(sensorToBottomCm) || sensorToBottomCm <= 0) {
                throw new IllegalArgumentException("Invalid sensor assignment.");
            }
        }
    }

    
    /**
     * Creates a controller with the services and configuration needed to authenticate, translate, and forward incoming sensor reports.
     *
     * @param gatewayDataService service that processes the converted readings
     * @param binRepository repository used to load the assigned TriBin and bin
     * @param assignments sensor IDs mapped to backend sensor assignments
     * @param webhookToken token configured in the forwarding integration, supplied without the Bearer prefix any map key or value is null
     * @throws IllegalArgumentException if the webhook token is null, blank, or contains whitespace
     */
    public SensorReadingController(
            GatewayDataService gatewayDataService,
            BinRepository binRepository,
            Map<String, SensorAssignment> assignments,
            String webhookToken) {
        this.gatewayDataService = Objects.requireNonNull(gatewayDataService);
        this.binRepository = Objects.requireNonNull(binRepository);
        this.assignments = Map.copyOf(assignments);			// Take a snapshot so later changes to the caller's map cannot change how this handler routes incoming reports.

        if (webhookToken == null || webhookToken.isBlank()
                || webhookToken.chars().anyMatch(Character::isWhitespace)) {
            throw new IllegalArgumentException("A webhook token is required.");
        }

        this.authorizationHeader = ("Bearer " + webhookToken)
                .getBytes(StandardCharsets.UTF_8);
    }

    
    /**
     * Handles one HTTP exchange and closes it even if processing or writing the response fails.
     */
    @Override
    public void handle(HttpExchange exchange) throws IOException {
        try {
            handleReport(exchange);
        } finally {
            exchange.close();
        }
    }

    
    /**
     * Validates the request, looks up the assigned bin, and forwards the calibrated reading to the gateway service. 
     * Each validation failure sends an error response and ends processing for that request.
     */
    private void handleReport(HttpExchange exchange) throws IOException {
    	
    	// Require the exact endpoint path because the HTTP server can dispatch requests whose paths start with the registered context.
        if (!PATH.equals(exchange.getRequestURI().getPath())) {			
            sendError(exchange, 404, "Route not found.");
            return;
        }

        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Allow", "POST");
            sendError(exchange, 405, "Use POST.");
            return;
        }
        
        // Authenticate the webhook before reading/parsing.
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        if (authorization == null || !MessageDigest.isEqual(
                authorizationHeader, authorization.getBytes(StandardCharsets.UTF_8))) {
            exchange.getResponseHeaders().set("WWW-Authenticate", "Bearer");
            sendError(exchange, 401, "Valid webhook credentials are required.");
            return;
        }

        
     // Read one extra byte to distinguish a body at the limit from an oversized body without loading the entire oversized request.
        byte[] body = exchange.getRequestBody().readNBytes(MAX_BODY_BYTES + 1);
        if (body.length > MAX_BODY_BYTES) {
            sendError(exchange, 413, "Sensor report is too large.");
            return;
        }

        JsonNode report;
        try {
            report = mapper.readTree(body);
        } catch (JsonProcessingException e) {
            sendError(exchange, 400, "Invalid JSON.");
            return;
        }

        // Require a JSON object with the expected types. The numeric check requires a JSON number for distanceCM.
        if (report == null || !report.isObject()
                || !report.path("sensorID").isTextual()
                || report.path("sensorID").textValue().isBlank()
                || !report.path("distanceCM").isNumber()
                || !report.path("measuredAt").isTextual()) {
            sendError(exchange, 400, "Provide sensorID, distanceCM, and measuredAt.");
            return;
        }

        double distanceCM = report.path("distanceCM").doubleValue();
        if (!Double.isFinite(distanceCM)) {
            sendError(exchange, 400, "distanceCM must be finite.");
            return;
        }

        // Both an omitted battery field and an explicit JSON null represent an unavailable reading.
        Double batteryLevel = null;
        JsonNode battery = report.get("batteryLevel");
        if (battery != null && !battery.isNull()) {
            double level = battery.doubleValue();
            if (!battery.isNumber() || !Double.isFinite(level) || level < 0 || level > 100) {
                sendError(exchange, 400, "batteryLevel must be between 0 and 100.");
                return;
            }
            batteryLevel = level;
        }
        
        
        LocalDateTime measuredAt;
        try {
            // Match the server-local timestamps used by the existing reading pipeline.
            measuredAt = OffsetDateTime.parse(report.path("measuredAt").textValue())
                    .atZoneSameInstant(ZoneId.systemDefault())
                    .toLocalDateTime();
        } catch (DateTimeParseException e) {
            sendError(exchange, 400, "measuredAt must include a UTC offset or Z.");
            return;
        }

        // Use the configured sensor assignment to obtain the backend IDs and calibration for this report.
        SensorAssignment assignment = assignments.get(report.path("sensorID").textValue());
        if (assignment == null) {
            sendError(exchange, 404, "Device is not assigned to a bin.");
            return;
        }

        TriBin triBin;
        try {
            triBin = binRepository.findAllTriBins().stream()
                    .filter(candidate -> candidate.getTriBinID() == assignment.triBinID())
                    .findFirst()
                    .orElse(null);
        } catch (RuntimeException e) {
            LOGGER.log(System.Logger.Level.ERROR, "Could not load sensor assignment's TriBin.", e);
            sendError(exchange, 500, "Could not load the assigned TriBin.");
            return;
        }

        // Select the bin from the loaded TriBin so the gateway receives the same Bin instance that is present in the TriBin's collection.
        Bin bin = triBin == null ? null : triBin.getBins().stream()
                .filter(candidate -> candidate.getBinID() == assignment.binID())
                .findFirst()
                .orElse(null);
        if (bin == null) {
            sendError(exchange, 404, "Assigned bin was not found.");
            return;
        }

        // Build the in-memory sensor object that the gateway uses for this report.
        Sensor sensor = new Sensor(assignment.sensorID(), Sensor.SensorType.ULTRASONIC);
        sensor.assignToBin(bin);
        sensor.setActive(true);

        // The sensor measures the gap above the waste. Subtract that gap from the empty-bin distance to calculate the waste height.
        // A negative distance becomes an invalid height so the report can reach the gateway's malfunction handling.
        double wasteHeightCm = distanceCM < 0
                ? -1.0
                : assignment.sensorToBottomCm() - distanceCM;
        SensorReadingRequest request = new SensorReadingRequest(
                bin.getBinID(), sensor.getSensorID(), wasteHeightCm,
                "cm", batteryLevel, measuredAt);

        try {
        	// Confirms the request reached the gateway handoff.
        	System.out.printf("Webhook reached: bin=%d, battery=%s%n",
        	        bin.getBinID(), batteryLevel);
            gatewayDataService.receiveReading(request, sensor, bin, triBin);
        } catch (RuntimeException e) {
            LOGGER.log(System.Logger.Level.ERROR, "Could not process sensor report.", e);
            sendError(exchange, 500, "Could not process the sensor report.");
            return;
        }

        // A normal return from the gateway produces a response with no body.
        // The response contains no details about any reading or alert updates.
        exchange.sendResponseHeaders(204, -1);
    }

    
    /**
     * Sends a JSON error response with a single error field.
     */
    private void sendError(HttpExchange exchange, int status, String message) throws IOException {
        byte[] body = mapper.writeValueAsBytes(Map.of("error", message));
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
    }
}
