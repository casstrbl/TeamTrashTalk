package main.java.trashtalk.wastemonitoring.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Random;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.respository.BinRepository;

/**
 * Sprint 3 demo: pretend that each online ultrasonic sensor sends a reading
 * at a configurable interval. This is NOT the physical sensor driver.
 *
 * Disabled by default so shared/real databases are not changed accidentally.
 * Set FAKE_SENSOR_ENABLED=true for a local demo and optionally set
 * SENSOR_INTERVAL_SECONDS (default: 5; accepted range: 1 to 3600).
 *
 * The backend currently treats readings in cm as waste height, not
 * ultrasonic sensor-to-trash distance. Hardware calibration is future work.
 */
public final class FakeSensorScheduler implements AutoCloseable {

    public static final int DEFAULT_INTERVAL_SECONDS = 5;

    private final int intervalSeconds;
    private final BinRepository binRepository;
    private final FakeSensorService fakeSensorService;
    private final Random random;
    private final ScheduledExecutorService executor;

    public FakeSensorScheduler(int intervalSeconds) {
        this(intervalSeconds, new BinRepository(), new FakeSensorService(), new Random());
    }

    // Package-private for deterministic tests without changing production code.
    FakeSensorScheduler(int intervalSeconds, BinRepository binRepository,
            FakeSensorService fakeSensorService, Random random) {
        if (intervalSeconds < 1 || intervalSeconds > 3600) {
            throw new IllegalArgumentException("Sensor interval must be 1-3600 seconds");
        }
        this.intervalSeconds = intervalSeconds;
        this.binRepository = binRepository;
        this.fakeSensorService = fakeSensorService;
        this.random = random;
        this.executor = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "fake-sensor-timer");
            thread.setDaemon(true);
            return thread;
        });
    }

    public static FakeSensorScheduler startIfEnabled() {
        if (!"true".equalsIgnoreCase(System.getenv("FAKE_SENSOR_ENABLED"))) {
            System.out.println("Fake sensors disabled (set FAKE_SENSOR_ENABLED=true to demo)");
            return null;
        }
        int seconds = parseIntervalSeconds(System.getenv("SENSOR_INTERVAL_SECONDS"));
        FakeSensorScheduler scheduler = new FakeSensorScheduler(seconds);
        scheduler.start();
        return scheduler;
    }

    public static int parseIntervalSeconds(String value) {
        if (value == null || value.isBlank()) {
            return DEFAULT_INTERVAL_SECONDS;
        }
        try {
            int seconds = Integer.parseInt(value.trim());
            if (seconds >= 1 && seconds <= 3600) {
                return seconds;
            }
        } catch (NumberFormatException ignored) {
            // Throw a descriptive error below instead of silently overloading the server.
        }
        throw new IllegalArgumentException("SENSOR_INTERVAL_SECONDS must be 1-3600");
    }

    public void start() {
        executor.scheduleWithFixedDelay(this::tickSafely, 0, intervalSeconds, TimeUnit.SECONDS);
        System.out.println("Fake sensor timer started: every " + intervalSeconds + " seconds");
    }

    private void tickSafely() {
        try {
            generateOnce();
        } catch (Exception exception) {
            // Don't let a transient database failure permanently stop the timer.
            System.err.println("Fake sensor tick failed: " + exception.getMessage());
        }
    }

    /** Runs one fake reading round; also useful for an integration test. */
    public int generateOnce() {
        List<TriBin> triBins = binRepository.findAllTriBins();
        int count = 0;
        LocalDateTime now = LocalDateTime.now();

        for (TriBin triBin : triBins) {
            if (!"online".equalsIgnoreCase(triBin.getSensorStatus())) {
                continue; // Leave deliberately offline sensors alone.
            }
            for (Bin bin : triBin.getBins()) {
                Sensor sensor = new Sensor(bin.getBinID(), Sensor.SensorType.ULTRASONIC);
                sensor.assignToBin(bin);
                double simulatedHeightCm = nextSimulatedHeight(bin.getWasteHeight(), random);

                // Reuse the team's existing simulated reading / gateway path.
                fakeSensorService.sendFakeReading(sensor, bin,
                        simulatedHeightCm, "cm", triBin.getBattery());
                count++;
            }
            triBin.setLastUpdated(now);
        }

        // GatewayDataService updates Bin objects in memory, but the API reads
        // from the database. Persist those results so the dashboard sees them.
        binRepository.saveSimulatedReadings(triBins);
        System.out.println("Fake sensor tick: " + count + " readings at " + now);
        return count;
    }

    /** Gently increases simulated fullness until the bin is full. */
    public static double nextSimulatedHeight(double currentHeightCm, Random random) {
        // 1.0-3.0 cm/reading makes changes visible in a short classroom demo.
        double increase = 1.0 + random.nextDouble() * 2.0;
        return Math.min(Bin.BIN_HEIGHT, Math.max(0.0, currentHeightCm) + increase);
    }

    @Override
    public void close() {
        executor.shutdownNow();
    }
}
