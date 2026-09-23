package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.model.Bin;
import main.java.trashtalk.wastemonitoring.service.BinService;

class BinServiceTest {

    @Test
    void testNewBinPercentageIsZero() {
        Bin bin = new Bin(1, "Library", Bin.BinType.LANDFILL);
        BinService binService = new BinService();

        double percentage = binService.getPercentage(bin);

        assertEquals(0.0, percentage);
    }

    @Test
    void testNewBinStatusIsGreen() {
        Bin bin = new Bin(1, "Library", Bin.BinType.LANDFILL);
        BinService binService = new BinService();

        Bin.BinStatus status = binService.getStatus(bin);

        assertEquals(Bin.BinStatus.GREEN, status);
    }
}
