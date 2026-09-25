package test.java.trashtalk.wastemonitoring.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Bin;

class BinTest {

    @Test
    void newBinStartsEmpty() {
        Bin bin = new Bin(1, "Library", Bin.BinType.LANDFILL);

        assertEquals(0.0, bin.getWasteHeight());
    }

    @Test
    void binHeightIs77Centimeters() {
        assertEquals(77, Bin.BIN_HEIGHT);
    }

    @Test
    void binTypesAreAvailable() {
        assertEquals(3, Bin.BinType.values().length);
        assertNotNull(Bin.BinType.LANDFILL);
        assertNotNull(Bin.BinType.RECYCLING);
        assertNotNull(Bin.BinType.COMPOST);
    }

    @Test
    void binStatusesAreAvailable() {
        assertEquals(3, Bin.BinStatus.values().length);
        assertNotNull(Bin.BinStatus.GREEN);
        assertNotNull(Bin.BinStatus.YELLOW);
        assertNotNull(Bin.BinStatus.RED);
    }
}
