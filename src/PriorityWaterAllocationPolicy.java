import java.util.Comparator;

public class PriorityWaterAllocationPolicy
        extends WaterAllocationPolicy {

    @Override
    public Comparator<WaterRequest> getComparator() {

        return (a, b) -> {
            int priorityA = a.getArea().allocationPriority();
            int priorityB = b.getArea().allocationPriority();

            if (priorityA != priorityB) {
            return Integer.compare(priorityB, priorityA);
            }

            return Integer.compare(
                a.getArrivalOrder(),
                b.getArrivalOrder()
            );
        };
    }
}