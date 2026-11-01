public class DemandArea {

    protected String areaId;
    protected String name;
    protected int dailyDemand;
    protected String priority;
    protected int allocatedWater;
    protected int unmetWater;

    public DemandArea(String areaId, String name,
                      int dailyDemand, String priority) {

        this.areaId = areaId;
        this.name = name;
        this.dailyDemand = dailyDemand;
        this.priority = priority;
        this.allocatedWater = 0;
        this.unmetWater = dailyDemand;
    }

    public String getAreaId() {
        return areaId;
    }

    public String getName() {
        return name;
    }

    public int getDailyDemand() {
        return dailyDemand;
    }

    public String getPriority() {
        return priority;
    }

    public int getAllocatedWater() {
        return allocatedWater;
    }

    public int getUnmetWater() {
        return unmetWater;
    }

    public void allocateWater(int amount) {

        if (amount <= 0) {
            return;
        }

        if (amount > unmetWater) {
            amount = unmetWater;
        }

        allocatedWater = allocatedWater + amount;
        unmetWater = unmetWater - amount;
    }

    public void resetDailyAllocation() {
        allocatedWater = 0;
        unmetWater = dailyDemand;
    }

    public int allocationPriority() {
        return 1;
    }

    public String getAreaType() {
        return "residential";
    }

    @Override
    public String toString() {
        return areaId + " - " + name
                + " | Demand: " + dailyDemand + " L"
                + " | Priority: " + priority
                + " | Allocated: " + allocatedWater + " L"
                + " | Unmet: " + unmetWater + " L";
    }
}