public class ResidentialArea extends DemandArea {

    public ResidentialArea(String areaId, String name,
                           int dailyDemand, String priority) {

        super(areaId, name, dailyDemand, priority);
    }

    @Override
    public int allocationPriority() {

        if (priority.equals("High")) {
            return 2;
        }

        return 1;
    }
}