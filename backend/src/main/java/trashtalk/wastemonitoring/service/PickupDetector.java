package main.java.trashtalk.wastemonitoring.service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import main.java.trashtalk.wastemonitoring.model.Bin;

// finds pickups in the sensor readings, so recyclers never tap an "emptied" button.
// a pickup = a compartment that was at least half full and then reads almost empty.
// compartments of the same tribin emptied within a few minutes count as one pickup
public final class PickupDetector {

    public static final double FULL_ENOUGH_PCT = 50;  // was at least this full before
    public static final double EMPTY_PCT = 20;        // and now reads this or less
    public static final double MIN_DROP_PCT = 35;     // and dropped at least this much (ignores sensor wobble)
    public static final Duration SAME_PICKUP = Duration.ofMinutes(15);

    // one saved reading, in time order per compartment
    public record Reading(int triBinID, int binID, String binType, double heightCm, LocalDateTime time) {
    }

    // one compartment that got emptied
    public record EmptiedCompartment(String stream, int fromPct, int toPct) {
    }

    public record Pickup(int triBinID, LocalDateTime time, List<EmptiedCompartment> compartments) {
        public int fullestPct() {
            return compartments.stream().mapToInt(EmptiedCompartment::fromPct).max().orElse(0);
        }
    }

    private PickupDetector() {
    }

    public static double percent(double heightCm) {
        return Math.max(0, Math.min(100, heightCm / Bin.BIN_HEIGHT * 100));
    }

    // readings must be sorted by binID, then time. returns newest pickups first
    public static List<Pickup> detect(List<Reading> readings) {
        record Drop(int triBinID, LocalDateTime time, EmptiedCompartment compartment) {
        }
        List<Drop> drops = new ArrayList<>();
        Reading previous = null;
        for (Reading reading : readings) {
            if (previous != null && previous.binID() == reading.binID()) {
                double before = percent(previous.heightCm());
                double after = percent(reading.heightCm());
                if (before >= FULL_ENOUGH_PCT && after <= EMPTY_PCT && before - after >= MIN_DROP_PCT) {
                    drops.add(new Drop(reading.triBinID(), reading.time(),
                            new EmptiedCompartment(label(reading.binType()), (int) Math.round(before), (int) Math.round(after))));
                }
            }
            previous = reading;
        }

        // group drops per tribin that happen close together
        drops.sort(Comparator.comparingInt(Drop::triBinID).thenComparing(Drop::time));
        List<Pickup> pickups = new ArrayList<>();
        Map<String, EmptiedCompartment> group = new LinkedHashMap<>();
        Drop first = null;
        for (Drop drop : drops) {
            boolean sameGroup = first != null && first.triBinID() == drop.triBinID()
                    && Duration.between(first.time(), drop.time()).compareTo(SAME_PICKUP) <= 0;
            if (!sameGroup) {
                if (first != null) {
                    pickups.add(new Pickup(first.triBinID(), first.time(), new ArrayList<>(group.values())));
                }
                group.clear();
                first = drop;
            }
            group.put(drop.compartment().stream(), drop.compartment());
        }
        if (first != null) {
            pickups.add(new Pickup(first.triBinID(), first.time(), new ArrayList<>(group.values())));
        }

        pickups.sort(Comparator.comparing(Pickup::time).reversed());
        return pickups;
    }

    private static String label(String binType) {
        if (binType == null || binType.isBlank()) {
            return "Unknown";
        }
        String lower = binType.trim().toLowerCase();
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }
}
