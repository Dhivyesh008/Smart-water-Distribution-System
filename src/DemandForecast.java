/**
 * Represents a demand forecast for a specific area.
 * Holds the predicted demand, trend direction, confidence level,
 * and whether the area is at risk of supply shortage.
 */
public class DemandForecast {

    // Trend direction constants
    public static final String TREND_RISING = "RISING";
    public static final String TREND_FALLING = "FALLING";
    public static final String TREND_STABLE = "STABLE";

    // Confidence level constants
    public static final String CONFIDENCE_HIGH = "HIGH";
    public static final String CONFIDENCE_MEDIUM = "MEDIUM";
    public static final String CONFIDENCE_LOW = "LOW";

    private final String areaId;
    private final String areaName;
    private final int currentDemand;
    private final int predictedDemand;
    private final String trend;
    private final double trendPercentage;
    private final String confidence;
    private final boolean supplyRisk;

    public DemandForecast(
            String areaId,
            String areaName,
            int currentDemand,
            int predictedDemand,
            String trend,
            double trendPercentage,
            String confidence,
            boolean supplyRisk) {

        this.areaId = areaId;
        this.areaName = areaName;
        this.currentDemand = currentDemand;
        this.predictedDemand = predictedDemand;
        this.trend = trend;
        this.trendPercentage = trendPercentage;
        this.confidence = confidence;
        this.supplyRisk = supplyRisk;
    }

    public String getAreaId() {
        return areaId;
    }

    public String getAreaName() {
        return areaName;
    }

    public int getCurrentDemand() {
        return currentDemand;
    }

    public int getPredictedDemand() {
        return predictedDemand;
    }

    public String getTrend() {
        return trend;
    }

    public double getTrendPercentage() {
        return trendPercentage;
    }

    public String getConfidence() {
        return confidence;
    }

    public boolean isSupplyRisk() {
        return supplyRisk;
    }

    /**
     * Returns a user-friendly trend arrow symbol.
     */
    public String getTrendSymbol() {

        switch (trend) {
            case TREND_RISING:
                return "↑";
            case TREND_FALLING:
                return "↓";
            default:
                return "→";
        }
    }

    @Override
    public String toString() {

        String riskLabel = supplyRisk ? " ⚠ RISK" : "";

        return areaId + " - " + areaName
                + " | Current: " + currentDemand + " L"
                + " | Predicted: " + predictedDemand + " L"
                + " | Trend: " + getTrendSymbol() + " "
                + String.format("%.1f", trendPercentage) + "%"
                + " | Confidence: " + confidence
                + riskLabel;
    }
}
