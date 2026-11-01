public class Reservoir {

    private final String reservoirId;
    private final String name;
    private final int dailySupply;
    private int remainingSupply;

    public Reservoir(String reservoirId, String name, int dailySupply) {
        this.reservoirId = reservoirId;
        this.name = name;
        this.dailySupply = dailySupply;
        this.remainingSupply = dailySupply;
    }

    public String getReservoirId() {
        return reservoirId;
    }

    public String getName() {
        return name;
    }

    public int getDailySupply() {
        return dailySupply;
    }

    public int getRemainingSupply() {
        return remainingSupply;
    }

    public void allocateWater(int amount) {

        if (amount <= 0) {
            return;
        }

        if (amount <= remainingSupply) {
            remainingSupply = remainingSupply - amount;
        }
    }

    public void resetDailySupply() {
        remainingSupply = dailySupply;
    }

    @Override
    public String toString() {
        return reservoirId + " - " + name
                + " | Daily Supply: " + dailySupply + " L"
                + " | Remaining: " + remainingSupply + " L";
    }
}