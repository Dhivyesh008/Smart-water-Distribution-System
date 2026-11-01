import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Represents a recorded water allocation event in the network.
 */
public class AllocationRecord {

    private static final DateTimeFormatter FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final String timestamp;
    private final String areaId;
    private final String areaName;
    private final int allocatedLitres;
    private final String reservoirId;
    private final String reservoirName;
    private final String result; // "allocated", "demand_met", "disconnected", "no_supply"

    public AllocationRecord(
            String areaId,
            String areaName,
            int allocatedLitres,
            String reservoirId,
            String reservoirName,
            String result) {

        this.timestamp = LocalDateTime.now().format(FORMATTER);
        this.areaId = areaId;
        this.areaName = areaName;
        this.allocatedLitres = allocatedLitres;
        this.reservoirId = reservoirId;
        this.reservoirName = reservoirName;
        this.result = result;
    }

    public String getTimestamp() {
        return timestamp;
    }

    public String getAreaId() {
        return areaId;
    }

    public String getAreaName() {
        return areaName;
    }

    public int getAllocatedLitres() {
        return allocatedLitres;
    }

    public String getReservoirId() {
        return reservoirId;
    }

    public String getReservoirName() {
        return reservoirName;
    }

    public String getResult() {
        return result;
    }

    @Override
    public String toString() {
        return timestamp + " | " + areaId + " (" + areaName + ") : "
                + allocatedLitres + " L from " + (reservoirName != null ? reservoirName : "None")
                + " [" + result + "]";
    }
}
