public class MaintenanceRequest {

    private final String pipelineId;
    private final String issue;
    private final int requestNumber;

    public MaintenanceRequest(String pipelineId,
                               String issue,
                               int requestNumber) {

        this.pipelineId = pipelineId;
        this.issue = issue;
        this.requestNumber = requestNumber;
    }

    public String getPipelineId() {
        return pipelineId;
    }

    public String getIssue() {
        return issue;
    }

    public int getRequestNumber() {
        return requestNumber;
    }

    @Override
    public String toString() {
        return "Request #" + requestNumber
                + " | Pipeline: " + pipelineId
                + " | Issue: " + issue;
    }
}