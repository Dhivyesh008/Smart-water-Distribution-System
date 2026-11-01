import java.util.Comparator;

public abstract class WaterAllocationPolicy {

    public abstract Comparator<WaterRequest> getComparator();
}