import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * Demand Forecasting Engine for the Smart Water Distribution System.
 *
 * Uses a combination of:
 * 1. Simple Moving Average (SMA) — averages demand over the last N days
 * 2. Trend Detection — compares recent average to older average
 * 3. Weighted Forecast — adjusts prediction based on trend direction
 *
 * Data Structure: HashMap of area IDs to ArrayDeque (FIFO history per area)
 *
 * This class demonstrates:
 * - HashMap for O(1) area lookup
 * - ArrayDeque as a sliding window (bounded FIFO queue)
 * - Simple statistical analysis (mean, trend, confidence)
 */
public class DemandForecaster {

    // Maximum number of days to keep in history per area
    private static final int MAX_HISTORY_DAYS = 30;

    // Minimum days needed for a meaningful forecast
    private static final int MIN_DAYS_FOR_FORECAST = 2;

    // Number of recent days to use for short-term average
    private static final int SHORT_WINDOW = 3;

    // Trend threshold percentage - below this, trend is "stable"
    private static final double TREND_THRESHOLD = 5.0;

    // Weight given to trend adjustment (0.0 to 1.0)
    private static final double TREND_WEIGHT = 0.3;

    // Stores daily demand history per area: areaId -> FIFO queue of daily totals
    private final HashMap<String, ArrayDeque<Integer>> demandHistory;

    // Stores the day number for tracking simulation days
    private int dayCounter;

    public DemandForecaster() {

        demandHistory = new HashMap<>();
        dayCounter = 0;
    }

    public int getDayCounter() {
        return dayCounter;
    }

    // --------------------------------------------------
    // RECORD DAILY DEMAND
    // --------------------------------------------------

    /**
     * Records the allocated water for an area at the end of a simulation day.
     * Uses ArrayDeque as a bounded sliding window — removes oldest entry
     * when the queue exceeds MAX_HISTORY_DAYS.
     *
     * @param areaId   the demand area identifier
     * @param consumed the total litres allocated/consumed that day
     */
    public void recordDailyDemand(
            String areaId,
            int consumed) {

        // Get or create the history queue for this area
        ArrayDeque<Integer> history =
                demandHistory.get(areaId);

        if (history == null) {

            history = new ArrayDeque<>();
            demandHistory.put(areaId, history);
        }

        // Sliding window: remove oldest if at capacity
        if (history.size() >= MAX_HISTORY_DAYS) {
            history.removeFirst();
        }

        // Add the new daily value at the end
        history.addLast(consumed);
    }

    // --------------------------------------------------
    // RECORD ALL AREAS AT END OF DAY
    // --------------------------------------------------

    /**
     * Records demand data for all areas at the end of a simulation day.
     * Should be called before resetDailySupply().
     *
     * @param areas the list of all demand areas in the network
     */
    public void recordEndOfDay(
            List<DemandArea> areas) {

        dayCounter++;

        for (DemandArea area : areas) {

            int consumed = area.getAllocatedWater();

            // If nothing was allocated, use the demand
            // as the "desired" amount for forecasting
            if (consumed == 0) {
                consumed = area.getDailyDemand();
            }

            recordDailyDemand(
                    area.getAreaId(),
                    consumed
            );
        }
    }

    // --------------------------------------------------
    // CALCULATE SIMPLE MOVING AVERAGE
    // --------------------------------------------------

    /**
     * Calculates the Simple Moving Average (SMA) of the
     * last N entries in the history queue.
     *
     * SMA = (sum of last N values) / N
     *
     * @param history the demand history queue
     * @param window  how many recent days to average
     * @return the moving average as a double
     */
    private double calculateSMA(
            ArrayDeque<Integer> history,
            int window) {

        if (history.isEmpty()) {
            return 0;
        }

        // Convert to list to access by index from the end
        ArrayList<Integer> list =
                new ArrayList<>(history);

        int count = Math.min(window, list.size());
        int startIndex = list.size() - count;

        double sum = 0;

        for (int i = startIndex; i < list.size(); i++) {
            sum = sum + list.get(i);
        }

        return sum / count;
    }

    // --------------------------------------------------
    // DETECT TREND
    // --------------------------------------------------

    /**
     * Detects the demand trend by comparing:
     * - Recent average (last SHORT_WINDOW days)
     * - Older average (the days before the recent window)
     *
     * Returns the percentage change between them.
     * Positive = rising, Negative = falling.
     *
     * @param history the demand history queue
     * @return trend percentage (positive = rising)
     */
    private double detectTrend(
            ArrayDeque<Integer> history) {

        ArrayList<Integer> list =
                new ArrayList<>(history);

        int size = list.size();

        if (size < MIN_DAYS_FOR_FORECAST * 2) {
            return 0.0;
        }

        // Calculate recent average (last SHORT_WINDOW days)
        int recentCount = Math.min(SHORT_WINDOW, size / 2);
        double recentSum = 0;

        for (int i = size - recentCount; i < size; i++) {
            recentSum = recentSum + list.get(i);
        }

        double recentAvg = recentSum / recentCount;

        // Calculate older average (all days before recent window)
        int olderCount = size - recentCount;
        double olderSum = 0;

        for (int i = 0; i < olderCount; i++) {
            olderSum = olderSum + list.get(i);
        }

        double olderAvg = olderSum / olderCount;

        // Avoid division by zero
        if (olderAvg == 0) {
            return 0.0;
        }

        // Trend percentage: how much recent differs from older
        return ((recentAvg - olderAvg) / olderAvg) * 100.0;
    }

    // --------------------------------------------------
    // DETERMINE CONFIDENCE LEVEL
    // --------------------------------------------------

    /**
     * Determines the confidence level of the forecast
     * based on the amount of historical data available.
     *
     * More data = higher confidence.
     *
     * @param dataPoints number of historical data points
     * @return confidence level string
     */
    private String determineConfidence(
            int dataPoints) {

        if (dataPoints >= 7) {
            return DemandForecast.CONFIDENCE_HIGH;
        }

        if (dataPoints >= 4) {
            return DemandForecast.CONFIDENCE_MEDIUM;
        }

        return DemandForecast.CONFIDENCE_LOW;
    }

    // --------------------------------------------------
    // GENERATE FORECAST FOR ONE AREA
    // --------------------------------------------------

    /**
     * Generates a demand forecast for a specific area.
     *
     * Algorithm:
     * 1. Calculate the SMA as the base prediction
     * 2. Detect the trend (rising/falling/stable)
     * 3. Adjust prediction: predicted = SMA * (1 + trend * TREND_WEIGHT)
     * 4. Determine confidence based on data volume
     * 5. Flag supply risk if predicted demand exceeds available supply
     *
     * @param area         the demand area
     * @param totalSupply  total remaining supply across all reservoirs
     * @param totalAreas   total number of demand areas
     * @return the forecast, or null if insufficient data
     */
    public DemandForecast generateForecast(
            DemandArea area,
            int totalSupply,
            int totalAreas) {

        ArrayDeque<Integer> history =
                demandHistory.get(area.getAreaId());

        if (history == null
                || history.size() < MIN_DAYS_FOR_FORECAST) {

            return null;
        }

        // Step 1: Calculate base prediction using SMA
        double sma = calculateSMA(
                history,
                SHORT_WINDOW
        );

        // Step 2: Detect trend
        double trendPercentage = detectTrend(history);

        // Step 3: Adjust prediction based on trend
        double trendMultiplier =
                1.0 + (trendPercentage / 100.0) * TREND_WEIGHT;

        int predictedDemand =
                (int) Math.round(sma * trendMultiplier);

        // Ensure prediction is at least 0
        if (predictedDemand < 0) {
            predictedDemand = 0;
        }

        // Step 4: Determine trend direction
        String trend;

        if (trendPercentage > TREND_THRESHOLD) {
            trend = DemandForecast.TREND_RISING;
        } else if (trendPercentage < -TREND_THRESHOLD) {
            trend = DemandForecast.TREND_FALLING;
        } else {
            trend = DemandForecast.TREND_STABLE;
        }

        // Step 5: Determine confidence
        String confidence =
                determineConfidence(history.size());

        // Step 6: Check supply risk
        // Fair share = total supply / number of areas
        int fairShare = totalAreas > 0
                ? totalSupply / totalAreas
                : 0;

        boolean supplyRisk =
                predictedDemand > fairShare;

        return new DemandForecast(
                area.getAreaId(),
                area.getName(),
                area.getDailyDemand(),
                predictedDemand,
                trend,
                trendPercentage,
                confidence,
                supplyRisk
        );
    }

    // --------------------------------------------------
    // GENERATE FORECASTS FOR ALL AREAS
    // --------------------------------------------------

    /**
     * Generates forecasts for all demand areas in the network.
     *
     * @param areas       list of all demand areas
     * @param totalSupply total remaining supply across reservoirs
     * @return list of forecasts (areas with insufficient data are skipped)
     */
    public ArrayList<DemandForecast> generateAllForecasts(
            List<DemandArea> areas,
            int totalSupply) {

        ArrayList<DemandForecast> forecasts =
                new ArrayList<>();

        for (DemandArea area : areas) {

            DemandForecast forecast =
                    generateForecast(
                            area,
                            totalSupply,
                            areas.size()
                    );

            if (forecast != null) {
                forecasts.add(forecast);
            }
        }

        return forecasts;
    }

    // --------------------------------------------------
    // GET HISTORY FOR AN AREA
    // --------------------------------------------------

    /**
     * Returns a copy of the demand history for a specific area.
     *
     * @param areaId the area identifier
     * @return list of daily demand values, or empty list
     */
    public List<Integer> getHistory(String areaId) {

        ArrayDeque<Integer> history =
                demandHistory.get(areaId);

        if (history == null) {
            return new ArrayList<>();
        }

        return new ArrayList<>(history);
    }

    // --------------------------------------------------
    // GET TOTAL NETWORK FORECAST
    // --------------------------------------------------

    /**
     * Calculates the total predicted demand across all areas.
     *
     * @param forecasts list of individual area forecasts
     * @return total predicted litres for the next day
     */
    public int getTotalPredictedDemand(
            List<DemandForecast> forecasts) {

        int total = 0;

        for (DemandForecast forecast : forecasts) {
            total = total + forecast.getPredictedDemand();
        }

        return total;
    }

    // --------------------------------------------------
    // DISPLAY FORECASTS
    // --------------------------------------------------

    /**
     * Displays all forecasts in a formatted table.
     *
     * @param forecasts the list of forecasts to display
     */
    public void displayForecasts(
            List<DemandForecast> forecasts) {

        System.out.println();
        System.out.println(
                "===== DEMAND FORECAST (Next Day) ====="
        );

        if (forecasts.isEmpty()) {

            System.out.println(
                    "Insufficient data. Run at least "
                    + MIN_DAYS_FOR_FORECAST
                    + " simulation days first."
            );

            return;
        }

        System.out.println(
                String.format(
                        "%-5s %-22s %10s %12s %8s %12s %6s",
                        "ID", "Area", "Current",
                        "Predicted", "Trend",
                        "Confidence", "Risk"
                )
        );

        System.out.println(
                "-".repeat(77)
        );

        for (DemandForecast f : forecasts) {

            System.out.println(
                    String.format(
                            "%-5s %-22s %8d L %10d L %4s %5.1f%% %10s %6s",
                            f.getAreaId(),
                            f.getAreaName(),
                            f.getCurrentDemand(),
                            f.getPredictedDemand(),
                            f.getTrendSymbol(),
                            f.getTrendPercentage(),
                            f.getConfidence(),
                            f.isSupplyRisk() ? "⚠ YES" : "  No"
                    )
            );
        }

        System.out.println(
                "-".repeat(77)
        );

        int totalPredicted =
                getTotalPredictedDemand(forecasts);

        System.out.println(
                "Total predicted demand: "
                + totalPredicted + " L"
        );
    }

    // --------------------------------------------------
    // DISPLAY HISTORY FOR ONE AREA
    // --------------------------------------------------

    /**
     * Displays the demand history for a specific area.
     *
     * @param areaId   the area identifier
     * @param areaName the area name for display
     */
    public void displayHistory(
            String areaId,
            String areaName) {

        System.out.println();
        System.out.println(
                "===== DEMAND HISTORY: "
                + areaName + " (" + areaId + ") ====="
        );

        List<Integer> history = getHistory(areaId);

        if (history.isEmpty()) {

            System.out.println(
                    "No history recorded yet."
            );

            return;
        }

        int dayNum = dayCounter - history.size() + 1;

        for (int value : history) {

            // Simple bar chart using characters
            int barLength = value / 100;

            StringBuilder bar = new StringBuilder();

            for (int i = 0; i < barLength; i++) {
                bar.append("█");
            }

            System.out.println(
                    String.format(
                            "Day %3d: %6d L  %s",
                            dayNum, value, bar
                    )
            );

            dayNum++;
        }
    }
}
