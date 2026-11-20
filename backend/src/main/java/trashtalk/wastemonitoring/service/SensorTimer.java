package main.java.trashtalk.wastemonitoring.service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

// one shared fake sensor timer that the test panel can start and stop.
// it stops by itself after a while so it can't run all night on a shared database
public final class SensorTimer {

    public static final int INTERVAL_SECONDS = FakeSensorScheduler.DEFAULT_INTERVAL_SECONDS;
    public static final int SIM_SPEED = FakeSensorScheduler.DEFAULT_SIM_SPEED;
    public static final int AUTO_STOP_MINUTES = 30;

    private static final ScheduledExecutorService STOPPER = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "sensor-timer-auto-stop");
        thread.setDaemon(true);
        return thread;
    });

    private static FakeSensorScheduler running;
    private static Instant startedAt;
    private static Instant stopsAt; // null = started from env vars, runs until the server stops
    private static ScheduledFuture<?> autoStop;

    private SensorTimer() {
    }

    // the timer started with FAKE_SENSOR_ENABLED=true, so the panel can see and stop it
    public static synchronized void adopt(FakeSensorScheduler scheduler) {
        if (scheduler == null) {
            return;
        }
        running = scheduler;
        startedAt = Instant.now();
        stopsAt = null;
    }

    public static synchronized Map<String, Object> start() {
        if (running == null) {
            running = FakeSensorScheduler.forZonedBins(INTERVAL_SECONDS, SIM_SPEED);
            running.start();
            startedAt = Instant.now();
            stopsAt = startedAt.plusSeconds(AUTO_STOP_MINUTES * 60L);
            autoStop = STOPPER.schedule(SensorTimer::stop, AUTO_STOP_MINUTES, TimeUnit.MINUTES);
        }
        return status();
    }

    public static synchronized Map<String, Object> stop() {
        if (running != null) {
            running.close();
            System.out.println("Fake sensor timer stopped");
        }
        if (autoStop != null) {
            autoStop.cancel(false);
        }
        running = null;
        startedAt = null;
        stopsAt = null;
        autoStop = null;
        return status();
    }

    public static synchronized Map<String, Object> status() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("running", running != null);
        body.put("intervalSeconds", running == null ? INTERVAL_SECONDS : running.getIntervalSeconds());
        body.put("simSpeed", running == null ? SIM_SPEED : running.getSimSpeed());
        body.put("startedAt", startedAt == null ? null : startedAt.toString());
        body.put("stopsAt", stopsAt == null ? null : stopsAt.toString());
        return body;
    }
}
