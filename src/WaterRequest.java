import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class WaterRequest {

    private static final DateTimeFormatter FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final String id;
    private final DemandArea area;
    private final int requestedLitres;
    private final int arrivalOrder;
    private final String requestedBy;
    private final String reason;
    private final String createdAt;
    private String status; // "pending", "approved", "rejected", "allocated"
    private String decisionNotes;

    public WaterRequest(
            DemandArea area,
            int requestedLitres,
            int arrivalOrder) {
        this("REQ-" + arrivalOrder, area, requestedLitres, arrivalOrder, "System Admin", "Direct Demand Request", "approved");
    }

    public WaterRequest(
            String id,
            DemandArea area,
            int requestedLitres,
            int arrivalOrder,
            String requestedBy,
            String reason,
            String status) {

        this.id = id != null ? id : ("REQ-" + arrivalOrder);
        this.area = area;
        this.requestedLitres = requestedLitres;
        this.arrivalOrder = arrivalOrder;
        this.requestedBy = (requestedBy != null && !requestedBy.trim().isEmpty()) ? requestedBy.trim() : "Public Citizen";
        this.reason = (reason != null && !reason.trim().isEmpty()) ? reason.trim() : "General Water Supply";
        this.status = (status != null && !status.trim().isEmpty()) ? status.trim().toLowerCase() : "pending";
        this.createdAt = LocalDateTime.now().format(FORMATTER);
        this.decisionNotes = "";
    }

    public String getId() {
        return id;
    }

    public DemandArea getArea() {
        return area;
    }

    public int getRequestedLitres() {
        return requestedLitres;
    }

    public int getArrivalOrder() {
        return arrivalOrder;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public String getReason() {
        return reason;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getDecisionNotes() {
        return decisionNotes;
    }

    public void setDecisionNotes(String decisionNotes) {
        this.decisionNotes = decisionNotes;
    }

    @Override
    public String toString() {
        return "[" + status.toUpperCase() + "] "
                + area.getName()
                + " requested "
                + requestedLitres
                + " L by "
                + requestedBy
                + " (order #"
                + arrivalOrder
                + ")";
    }
}