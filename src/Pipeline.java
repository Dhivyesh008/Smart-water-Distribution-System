public class Pipeline {

    private final String pipelineId;
    private final String from;
    private final String to;
    private boolean working;

    public Pipeline(String pipelineId, String from, String to) {
        this.pipelineId = pipelineId;
        this.from = from;
        this.to = to;
        this.working = true;
    }

    public String getPipelineId() {
        return pipelineId;
    }

    public String getFrom() {
        return from;
    }

    public String getTo() {
        return to;
    }

    public boolean isWorking() {
        return working;
    }

    public void markFailed() {
        working = false;
    }

    public void repair() {
        working = true;
    }

    @Override
    public String toString() {
        String status;

        if (working) {
            status = "WORKING";
        } else {
            status = "FAILED";
        }

        return pipelineId + " : "
                + from + " <--> " + to
                + " | " + status;
    }
}