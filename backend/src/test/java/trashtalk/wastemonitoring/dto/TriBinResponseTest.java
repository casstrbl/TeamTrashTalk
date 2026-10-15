package test.java.trashtalk.wastemonitoring.dto;

import static org.junit.jupiter.api.Assertions.*;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.dto.TriBinResponse;
import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.model.TriBin;

class TriBinResponseTest {

    // builds a tribin with the given waste heights in cm
    private TriBin makeTriBin(double landfill, double recycling, double compost) {
        Bin a = new Bin(14301, 143, Bin.BinType.LANDFILL);
        Bin b = new Bin(14302, 143, Bin.BinType.RECYCLING);
        Bin c = new Bin(14303, 143, Bin.BinType.COMPOST);
        a.setWasteHeight(landfill);
        b.setWasteHeight(recycling);
        c.setWasteHeight(compost);

        TriBin triBin = new TriBin(143, 'A', "Outside Benicia Hall", -121.42, 38.55, List.of(a, b, c));
        triBin.setBattery(88);
        triBin.setSensorStatus("online");
        triBin.setLastUpdated(LocalDateTime.now().minusMinutes(2));
        return triBin;
    }

    @Test
    void sendsFillAsPercent() {
        TriBinResponse response = TriBinResponse.fromTriBin(makeTriBin(26.95, 38.5, 77));

        assertEquals(35, response.getCompartments().get(0).getFill());
        assertEquals(50, response.getCompartments().get(1).getFill());
        assertEquals(100, response.getCompartments().get(2).getFill());
    }

    @Test
    void capsFillAtOneHundred() {
        TriBinResponse response = TriBinResponse.fromTriBin(makeTriBin(90, 0, 0));

        assertEquals(100, response.getCompartments().get(0).getFill());
    }

    @Test
    void matchesFrontendFields() {
        TriBinResponse response = TriBinResponse.fromTriBin(makeTriBin(0, 0, 0));

        assertEquals("TB-143", response.getId());
        assertEquals("Bin 143", response.getName());
        assertEquals("Zone A", response.getZone());
        assertEquals(38.55, response.getLat());
        assertEquals(-121.42, response.getLng());
        assertEquals("Landfill", response.getCompartments().get(0).getLabel());
        assertEquals(88, response.getBattery());
        assertEquals("online", response.getSensorStatus());
        assertEquals("2 min ago", response.getLastUpdated());
    }

    @Test
    void formatsBlankZone() {
        assertEquals("", TriBinResponse.formatZone('\0'));
        assertEquals("Zone B", TriBinResponse.formatZone('B'));
    }

    @Test
    void formatsLastUpdated() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 15, 12, 0);

        assertEquals("just now", TriBinResponse.formatLastUpdated(now, now));
        assertEquals("5 min ago", TriBinResponse.formatLastUpdated(now.minusMinutes(5), now));
        assertEquals("1 hour ago", TriBinResponse.formatLastUpdated(now.minusMinutes(60), now));
        assertEquals("2 hours ago", TriBinResponse.formatLastUpdated(now.minusMinutes(120), now));
        assertEquals("3 days ago", TriBinResponse.formatLastUpdated(now.minusDays(3), now));
        assertEquals("never", TriBinResponse.formatLastUpdated(null, now));
    }
}
