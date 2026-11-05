package main.java.trashtalk.wastemonitoring.service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.Sensor;
import main.java.trashtalk.wastemonitoring.model.TriBin;
import main.java.trashtalk.wastemonitoring.repository.BinRepository;

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
 *
 * Realistic mode: each compartment fills at its own pace (landfill fastest, compost
 * slowest), busy spots fill faster, readings wobble a little like a real sensor,
 * someone sometimes dumps a big bag, and full bins get emptied after a while.
 * SIM_SPEED sets how much faster than real life it runs (default 60: one real
 * minute = one simulated hour, so a bin takes roughly 15-60 minutes to fill).
 */
public final class FakeSensorScheduler implements AutoCloseable {

    public static final int DEFAULT_INTERVAL_SECONDS = 5;
    public static final int DEFAULT_SIM_SPEED = 60;

    // how fast each stream fills in real life, % of the bin per hour (a typical
    // tribin goes from empty to full in about 1-2 days)
    private static final double LANDFILL_PCT_PER_HOUR = 4.0;
    private static final double RECYCLING_PCT_PER_HOUR = 3.0;
    private static final double COMPOST_PCT_PER_HOUR = 2.0;
    private static final double SENSOR_NOISE_CM = 0.6; // ultrasonic readings wobble a little
    private static final double EMPTY_AT_PCT = 85; // full bins get emptied after a while
    private static final double HOURS_UNTIL_EMPTIED = 2.0; // average wait once a bin is full

    private final int intervalSeconds;
    private final BinRepository binRepository;
    private final FakeSensorService fakeSensorService;
    private final Random random;
    private final ScheduledExecutorService executor;
    private final int simSpeed;
    // the "real" waste level per bin, readings are this plus sensor wobble
    private final Map<Integer, Double> trueHeights = new HashMap<>();

    public FakeSensorScheduler(int intervalSeconds) {
        this(intervalSeconds, DEFAULT_SIM_SPEED);
    }

    public FakeSensorScheduler(int intervalSeconds, int simSpeed) {
        this(intervalSeconds, simSpeed, new BinRepository(), new FakeSensorService(), new Random());
    }

    // Package-private for deterministic tests without changing production code.
    FakeSensorScheduler(int intervalSeconds, BinRepository binRepository,
            FakeSensorService fakeSensorService, Random random) {
        this(intervalSeconds, DEFAULT_SIM_SPEED, binRepository, fakeSensorService, random);
    }

    FakeSensorScheduler(int intervalSeconds, int simSpeed, BinRepository binRepository,
            FakeSensorService fakeSensorService, Random random) {
        if (intervalSeconds < 1 || intervalSeconds > 3600) {
            throw new IllegalArgumentException("Sensor interval must be 1-3600 seconds");
        }
        if (simSpeed < 1 || simSpeed > 3600) {
            throw new IllegalArgumentException("Sim speed must be 1-3600");
        }
        this.simSpeed = simSpeed;
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
        int speed = parseSimSpeed(System.getenv("SIM_SPEED"));
        FakeSensorScheduler scheduler = new FakeSensorScheduler(seconds, speed);
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

    /** SIM_SPEED: how many times faster than real life (1 = real time, 60 = 1 min is 1 hour). */
    public static int parseSimSpeed(String value) {
        if (value == null || value.isBlank()) {
            return DEFAULT_SIM_SPEED;
        }
        try {
            int speed = Integer.parseInt(value.trim());
            if (speed >= 1 && speed <= 3600) {
                return speed;
            }
        } catch (NumberFormatException ignored) {
            // fall through to the error below
        }
        throw new IllegalArgumentException("SIM_SPEED must be 1-3600");
    }

    public void start() {
        executor.scheduleWithFixedDelay(this::tickSafely, 0, intervalSeconds, TimeUnit.SECONDS);
        System.out.println("Fake sensor timer started: every " + intervalSeconds
                + " seconds, " + simSpeed + "x real time");
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
        double simHours = intervalSeconds * (double) simSpeed / 3600.0;

        for (TriBin triBin : triBins) {
            if (!"online".equalsIgnoreCase(triBin.getSensorStatus())) {
                continue; // Leave deliberately offline sensors alone.
            }
            for (Bin bin : triBin.getBins()) {
                Sensor sensor = new Sensor(bin.getBinID(), Sensor.SensorType.ULTRASONIC);
                sensor.assignToBin(bin);
                double trueCm = trueHeights.getOrDefault(bin.getBinID(), bin.getWasteHeight());
                trueCm = nextRealisticHeight(trueCm, bin.getBinType(),
                        busyness(triBin.getTriBinID()), simHours, random);
                trueHeights.put(bin.getBinID(), trueCm);
                double simulatedHeightCm = withSensorNoise(trueCm, random);

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

    /** Gently increases simulated fullness until the bin is full (the original sprint 3 version). */
    public static double nextSimulatedHeight(double currentHeightCm, Random random) {
        // 1.0-3.0 cm/reading makes changes visible in a short classroom demo.
        double increase = 1.0 + random.nextDouble() * 2.0;
        return Math.min(Bin.BIN_HEIGHT, Math.max(0.0, currentHeightCm) + increase);
    }

    /** Busy spots fill faster: a steady 0.6x-1.6x per tribin (same every run). */
    static double busyness(int triBinID) {
        return 0.6 + new Random(triBinID * 7919L).nextDouble();
    }

    /**
     * Realistic fill for one compartment over simHours: its own pace with some
     * wobble, the odd big bag, and a full bin gets emptied after a while.
     */
    public static double nextRealisticHeight(double currentCm, Bin.BinType type,
            double busyness, double simHours, Random random) {
        double cm = Math.max(0.0, Math.min(Bin.BIN_HEIGHT, currentCm));
        double pct = cm / Bin.BIN_HEIGHT * 100.0;

        // full for a while -> someone empties it (chance grows with time passed)
        if (pct >= EMPTY_AT_PCT && random.nextDouble() < Math.min(1.0, simHours / HOURS_UNTIL_EMPTIED)) {
            return random.nextDouble() * 0.04 * Bin.BIN_HEIGHT; // a few scraps left, 0-4%
        }

        double perHour = switch (type) {
            case LANDFILL -> LANDFILL_PCT_PER_HOUR;
            case RECYCLING -> RECYCLING_PCT_PER_HOUR;
            case COMPOST -> COMPOST_PCT_PER_HOUR;
        };
        // some stretches are quiet, some are busy (0.3x-1.7x)
        double addedPct = perHour * busyness * simHours * (0.3 + random.nextDouble() * 1.4);
        // now and then someone dumps a big bag (about twice a day per compartment)
        if (random.nextDouble() < Math.min(1.0, simHours / 12.0)) {
            addedPct += 2.0 + random.nextDouble() * 4.0;
        }
        return Math.min(Bin.BIN_HEIGHT, cm + addedPct / 100.0 * Bin.BIN_HEIGHT);
    }

    /** What the sensor reports: the real level plus a little wobble, kept in range. */
    static double withSensorNoise(double trueCm, Random random) {
        double reading = trueCm + random.nextGaussian() * SENSOR_NOISE_CM;
        return Math.max(0.0, Math.min(Bin.BIN_HEIGHT, reading));
    }

    @Override
    public void close() {
        executor.shutdownNow();
    }
}
