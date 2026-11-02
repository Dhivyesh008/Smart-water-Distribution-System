import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.PriorityQueue;
import java.util.Queue;

public class WaterNetwork {

    private final ArrayList<Reservoir> reservoirs;
    private final ArrayList<DemandArea> areas;
    private final ArrayList<Pipeline> pipelines;

    // Graph representation using adjacency list
    private final HashMap<String, ArrayList<String>> graph;

    // Priority Queue for water allocation
    private final PriorityQueue<WaterRequest> waterRequests;
    private final ArrayList<WaterRequest> allRequests;

    // FIFO queue for maintenance requests
    private final ArrayDeque<MaintenanceRequest> maintenanceQueue;

    // Stores allocation history
    private final ArrayDeque<String> allocationHistory;
    private final ArrayDeque<AllocationRecord> structuredAllocationHistory;

    // Allocation policy
    private final WaterAllocationPolicy allocationPolicy;

    // Demand forecasting engine
    private final DemandForecaster forecaster;

    private  int requestCounter;
    private  int maintenanceCounter;

    // Constructor
    public WaterNetwork() {

        reservoirs = new ArrayList<>();
        areas = new ArrayList<>();
        pipelines = new ArrayList<>();

        graph = new HashMap<>();

        allocationPolicy = new PriorityWaterAllocationPolicy();

        waterRequests =
                new PriorityQueue<>(
                        allocationPolicy.getComparator()
                );
        allRequests = new ArrayList<>();

        maintenanceQueue = new ArrayDeque<>();

        allocationHistory = new ArrayDeque<>();
        structuredAllocationHistory = new ArrayDeque<>();

        forecaster = new DemandForecaster();

        requestCounter = 0;
        maintenanceCounter = 0;
    }

    public List<Reservoir> getReservoirs() {
        return List.copyOf(reservoirs);
    }

    public List<DemandArea> getAreas() {
        return List.copyOf(areas);
    }

    public List<Pipeline> getPipelines() {
        return List.copyOf(pipelines);
    }

    public List<WaterRequest> getWaterRequests() {
        ArrayList<WaterRequest> requests =
                new ArrayList<>(waterRequests);
        requests.sort(allocationPolicy.getComparator());
        return List.copyOf(requests);
    }

    public List<WaterRequest> getAllRequests() {
        return List.copyOf(allRequests);
    }

    public List<MaintenanceRequest> getMaintenanceRequests() {
        return List.copyOf(maintenanceQueue);
    }

    public List<String> getAllocationHistory() {
        return List.copyOf(allocationHistory);
    }

    public List<AllocationRecord> getStructuredAllocationHistory() {
        ArrayList<AllocationRecord> reversed = new ArrayList<>(structuredAllocationHistory);
        java.util.Collections.reverse(reversed);
        return List.copyOf(reversed);
    }

    public boolean isAreaConnected(String areaId) {
        for (Reservoir r : reservoirs) {
            if (isReachable(r.getReservoirId(), areaId)) {
                return true;
            }
        }
        return false;
    }

    private void recordStructuredAllocation(AllocationRecord record) {
        if (structuredAllocationHistory.size() >= 60) {
            structuredAllocationHistory.removeFirst();
        }
        structuredAllocationHistory.addLast(record);
    }

    // --------------------------------------------------
    // ADD RESERVOIR
    // --------------------------------------------------

    public void addReservoir(Reservoir reservoir) {

        reservoirs.add(reservoir);

        graph.put(
                reservoir.getReservoirId(),
                new ArrayList<>()
        );
    }

    // --------------------------------------------------
    // ADD DEMAND AREA
    // --------------------------------------------------

    public void addArea(DemandArea area) {

        areas.add(area);

        graph.put(
                area.getAreaId(),
                new ArrayList<>()
        );
    }

    // --------------------------------------------------
    // ADD PIPELINE
    // --------------------------------------------------

    public void addPipeline(Pipeline pipeline) {

        pipelines.add(pipeline);

        String from = pipeline.getFrom();
        String to = pipeline.getTo();

        graph.get(from).add(to);
        graph.get(to).add(from);
    }

    // --------------------------------------------------
    // FIND RESERVOIR
    // --------------------------------------------------

    public Reservoir findReservoir(String id) {

        for (Reservoir r : reservoirs) {

            if (r.getReservoirId().equals(id)) {
                return r;
            }
        }

        return null;
    }

    // --------------------------------------------------
    // FIND AREA
    // --------------------------------------------------

    public DemandArea findArea(String id) {

        for (DemandArea area : areas) {

            if (area.getAreaId().equals(id)) {
                return area;
            }
        }

        return null;
    }

    // --------------------------------------------------
    // FIND PIPELINE
    // --------------------------------------------------

    public Pipeline findPipeline(String id) {

        for (Pipeline p : pipelines) {

            if (p.getPipelineId().equals(id)) {
                return p;
            }
        }

        return null;
    }

    // --------------------------------------------------
    // DISPLAY RESERVOIRS
    // --------------------------------------------------

    public void displayReservoirs() {

        System.out.println();
        System.out.println("===== RESERVOIRS =====");

        for (Reservoir r : reservoirs) {

            System.out.println(r);
        }
    }

    // --------------------------------------------------
    // DISPLAY DEMAND AREAS
    // --------------------------------------------------

    public void displayAreas() {

        System.out.println();
        System.out.println("===== DEMAND AREAS =====");

        for (DemandArea area : areas) {

            System.out.println(area);
        }
    }

    // --------------------------------------------------
    // DISPLAY PIPELINES
    // --------------------------------------------------

    public void displayPipelines() {

        System.out.println();
        System.out.println("===== PIPELINES =====");

        for (Pipeline p : pipelines) {

            System.out.println(p);
        }
    }

    // --------------------------------------------------
    // CHECK WORKING PIPELINE CONNECTION
    // --------------------------------------------------

    private boolean isWorkingConnection(
            String from,
            String to) {

        for (Pipeline p : pipelines) {

            if (!p.isWorking()) {
                continue;
            }

            boolean forward =
                    p.getFrom().equals(from)
                    && p.getTo().equals(to);

            boolean backward =
                    p.getFrom().equals(to)
                    && p.getTo().equals(from);

            if (forward || backward) {
                return true;
            }
        }

        return false;
    }

    // --------------------------------------------------
    // BFS REACHABILITY
    // --------------------------------------------------

    public boolean isReachable(
            String start,
            String target) {

        Queue<String> queue =
                new ArrayDeque<>();

        HashSet<String> visited =
                new HashSet<>();

        queue.add(start);
        visited.add(start);

        while (!queue.isEmpty()) {

            String current = queue.remove();

            if (current.equals(target)) {
                return true;
            }

            ArrayList<String> neighbours =
                    graph.get(current);

            if (neighbours == null) {
                continue;
            }

            for (String next : neighbours) {

                if (!visited.contains(next)
                        && isWorkingConnection(
                                current,
                                next)) {

                    visited.add(next);
                    queue.add(next);
                }
            }
        }

        return false;
    }

    // --------------------------------------------------
    // SHOW CONNECTIVITY
    // --------------------------------------------------

    public void showConnectivity() {

        System.out.println();
        System.out.println("===== CONNECTIVITY STATUS =====");

        for (DemandArea area : areas) {

            boolean connected = false;

            for (Reservoir r : reservoirs) {

                if (isReachable(
                        r.getReservoirId(),
                        area.getAreaId())) {

                    connected = true;
                    break;
                }
            }

            if (connected) {

                System.out.println(
                        area.getAreaId()
                        + " - "
                        + area.getName()
                        + " -> CONNECTED"
                );

            } else {

                System.out.println(
                        area.getAreaId()
                        + " - "
                        + area.getName()
                        + " -> DISCONNECTED"
                );
            }
        }
    }

    // --------------------------------------------------
    // ADD WATER REQUEST
    // --------------------------------------------------

    public synchronized void addWaterRequest(
            DemandArea area,
            int litres) {

        if (area == null || litres <= 0) {
            return;
        }

        requestCounter++;
        String id = "REQ-" + String.format("%03d", requestCounter);
        WaterRequest request =
                new WaterRequest(
                        id,
                        area,
                        litres,
                        requestCounter,
                        "System Admin",
                        "Administrative Direct Request",
                        "approved"
                );

        allRequests.add(request);
        waterRequests.add(request);

        System.out.println(
                "Water request added for "
                + area.getName()
                + " - "
                + litres
                + " L"
        );
    }

    public synchronized WaterRequest addPublicRequest(
            DemandArea area,
            int litres,
            String requestedBy,
            String reason) {
        return addPublicRequest(null, area, litres, requestedBy, reason);
    }

    public synchronized WaterRequest addPublicRequest(
            String customId,
            DemandArea area,
            int litres,
            String requestedBy,
            String reason) {

        if (area == null || litres <= 0) {
            return null;
        }

        requestCounter++;
        String id = (customId != null && !customId.trim().isEmpty())
                ? customId.trim()
                : ("REQ-" + String.format("%03d", requestCounter));

        WaterRequest request = new WaterRequest(
                id,
                area,
                litres,
                requestCounter,
                requestedBy,
                reason,
                "pending"
        );

        allRequests.add(request);
        System.out.println(
                "Incoming Public Request ["
                + id
                + "] from "
                + requestedBy
                + " for "
                + area.getName()
                + " ("
                + litres
                + " L)"
        );
        return request;
    }

    public synchronized boolean acceptRequest(String requestId) {
        if (requestId == null) return false;
        for (WaterRequest req : allRequests) {
            if (req.getId().equalsIgnoreCase(requestId.trim())) {
                DemandArea area = req.getArea();
                Reservoir reservoir = findUsableReservoir(area);
                if (reservoir != null && reservoir.getRemainingSupply() > 0) {
                    int allocated = Math.min(req.getRequestedLitres(), reservoir.getRemainingSupply());
                    if (allocated > 0) {
                        reservoir.allocateWater(allocated);
                        area.allocateWater(allocated);
                        req.setStatus("allocated");
                        req.setDecisionNotes("Allocated " + allocated + " L from " + reservoir.getName());
                        waterRequests.remove(req);
                        allocationHistory.add(
                                area.getName()
                                + " <- "
                                + allocated
                                + " L from "
                                + reservoir.getName()
                        );
                        recordStructuredAllocation(new AllocationRecord(
                                area.getAreaId(), area.getName(), allocated, reservoir.getReservoirId(), reservoir.getName(), "allocated"
                        ));
                        System.out.println("Admin ACCEPTED and ALLOCATED " + allocated + " L to Request " + req.getId() + " from " + reservoir.getName());
                        return true;
                    }
                }
                req.setStatus("approved");
                req.setDecisionNotes("Approved by Grid Administrator");
                if (!waterRequests.contains(req)) {
                    waterRequests.add(req);
                }
                System.out.println("Admin ACCEPTED Request " + req.getId() + " for " + req.getArea().getName());
                return true;
            }
        }
        return false;
    }

    public synchronized boolean rejectRequest(String requestId, String reason) {
        if (requestId == null) return false;
        for (WaterRequest req : allRequests) {
            if (req.getId().equalsIgnoreCase(requestId.trim())) {
                req.setStatus("rejected");
                req.setDecisionNotes(reason != null && !reason.trim().isEmpty() ? reason.trim() : "Rejected by Grid Administrator");
                waterRequests.remove(req);
                System.out.println("Admin REJECTED Request " + req.getId() + " - Reason: " + req.getDecisionNotes());
                return true;
            }
        }
        return false;
    }

    // --------------------------------------------------
    // FIND USABLE RESERVOIR
    // --------------------------------------------------

    private Reservoir findUsableReservoir(
            DemandArea area) {

        for (Reservoir r : reservoirs) {

            if (r.getRemainingSupply() > 0
                    && isReachable(
                    r.getReservoirId(),
                    area.getAreaId())) {

                return r;
            }
        }

        return null;
    }

    // --------------------------------------------------
    // ALLOCATE WATER
    // --------------------------------------------------

    public synchronized void allocateWater() {

        System.out.println();
        System.out.println("===== WATER ALLOCATION =====");

        if (waterRequests.isEmpty()) {

            System.out.println(
                    "No water requests available."
            );

            return;
        }

        while (!waterRequests.isEmpty()) {

            WaterRequest request =
                    waterRequests.poll();

            DemandArea area =
                    request.getArea();

            Reservoir reservoir =
                    findUsableReservoir(area);

            // No reachable reservoir
            if (reservoir == null) {

                System.out.println(
                        area.getName()
                        + " -> No usable reservoir."
                );

                allocationHistory.add(
                        area.getName()
                        + " : 0 L allocated - DISCONNECTED"
                );

                boolean hasPhysicalConnection = false;
                for (Reservoir r : reservoirs) {
                    if (isReachable(r.getReservoirId(), area.getAreaId())) {
                        hasPhysicalConnection = true;
                        break;
                    }
                }
                String failResult = hasPhysicalConnection ? "no_supply" : "disconnected";
                recordStructuredAllocation(new AllocationRecord(
                        area.getAreaId(), area.getName(), 0, null, "—", failResult
                ));

                continue;
            }

            int required =
                    Math.min(
                            request.getRequestedLitres(),
                            area.getUnmetWater()
                    );

            if (required == 0) {
                recordStructuredAllocation(new AllocationRecord(
                        area.getAreaId(), area.getName(), 0, reservoir.getReservoirId(), reservoir.getName(), "demand_met"
                ));
                continue;
            }

            int available =
                    reservoir.getRemainingSupply();

            int allocated =
                    Math.min(
                            required,
                            available
                    );

            // Allocate water
            if (allocated > 0) {

                request.setStatus("allocated");
                request.setDecisionNotes("Allocated " + allocated + " L from " + reservoir.getName());

                reservoir.allocateWater(
                        allocated
                );

                area.allocateWater(
                        allocated
                );

                allocationHistory.add(
                        area.getName()
                        + " <- "
                        + allocated
                        + " L from "
                        + reservoir.getName()
                );

                recordStructuredAllocation(new AllocationRecord(
                        area.getAreaId(), area.getName(), allocated, reservoir.getReservoirId(), reservoir.getName(), "allocated"
                ));

                System.out.println(
                        area.getName()
                        + " received "
                        + allocated
                        + " L from "
                        + reservoir.getName()
                );
            } else {
                recordStructuredAllocation(new AllocationRecord(
                        area.getAreaId(), area.getName(), 0, reservoir.getReservoirId(), reservoir.getName(), "no_supply"
                ));
            }

            // Show unmet demand
            if (area.getUnmetWater() > 0) {

                System.out.println(
                        "Unmet demand for "
                        + area.getName()
                        + ": "
                        + area.getUnmetWater()
                        + " L"
                );
            }
        }
    }

    // --------------------------------------------------
    // FAIL PIPELINE
    // --------------------------------------------------

    public synchronized void failPipeline(
            String pipelineId) {

        Pipeline pipeline =
                findPipeline(pipelineId);

        if (pipeline == null) {

            System.out.println(
                    "Pipeline not found."
            );

            return;
        }

        if (!pipeline.isWorking()) {

            System.out.println(
                    pipelineId
                    + " is already failed."
            );

            return;
        }

        pipeline.markFailed();

        System.out.println(
                pipelineId
                + " has been marked FAILED."
        );

        addMaintenanceRequest(
                pipelineId,
                "Pipeline failure"
        );
    }

    // --------------------------------------------------
    // REPAIR PIPELINE
    // --------------------------------------------------

    public synchronized void repairPipeline(
            String pipelineId) {

        Pipeline pipeline =
                findPipeline(pipelineId);

        if (pipeline == null) {

            System.out.println(
                    "Pipeline not found."
            );

            return;
        }

        if (pipeline.isWorking()) {

            System.out.println(
                    pipelineId
                    + " is already working."
            );

            return;
        }

        pipeline.repair();

        System.out.println(
                pipelineId
                + " has been repaired."
        );
    }

    // --------------------------------------------------
    // ADD MAINTENANCE REQUEST
    // --------------------------------------------------

    public synchronized void addMaintenanceRequest(
            String pipelineId,
            String issue) {

        maintenanceCounter++;

        MaintenanceRequest request =
                new MaintenanceRequest(
                        pipelineId,
                        issue,
                        maintenanceCounter
                );

        maintenanceQueue.add(request);

        System.out.println(
                "Maintenance request added."
        );
    }

    // --------------------------------------------------
    // DISPLAY MAINTENANCE QUEUE
    // --------------------------------------------------

    public void displayMaintenanceQueue() {

        System.out.println();
        System.out.println(
                "===== MAINTENANCE QUEUE ====="
        );

        if (maintenanceQueue.isEmpty()) {

            System.out.println(
                    "No pending maintenance requests."
            );

            return;
        }

        for (MaintenanceRequest request
                : maintenanceQueue) {

            System.out.println(request);
        }
    }

    // --------------------------------------------------
    // DISPLAY ALLOCATION HISTORY
    // --------------------------------------------------

    public void displayAllocationHistory() {

        System.out.println();
        System.out.println(
                "===== ALLOCATION HISTORY ====="
        );

        if (allocationHistory.isEmpty()) {

            System.out.println(
                    "No allocation history."
            );

            return;
        }

        for (String record
                : allocationHistory) {

            System.out.println(record);
        }
    }

    // --------------------------------------------------
    // RESET DAILY SUPPLY
    // --------------------------------------------------

    public synchronized void resetDailySupply() {

        // Record demand data BEFORE resetting
        forecaster.recordEndOfDay(areas);

        for (Reservoir r : reservoirs) {

            r.resetDailySupply();
        }

        for (DemandArea area : areas) {

            area.resetDailyAllocation();
        }

        waterRequests.clear();

        allocationHistory.clear();

        System.out.println();
        System.out.println(
                "New simulation day started (Day "
                + forecaster.getDayCounter()
                + " recorded)."
        );

        System.out.println(
                "Reservoir supplies and area allocations have been reset."
        );
    }

    // --------------------------------------------------
    // DEMAND FORECASTING
    // --------------------------------------------------

    /**
     * Returns the demand forecaster instance.
     */
    public DemandForecaster getForecaster() {
        return forecaster;
    }

    /**
     * Calculates the total remaining supply across all reservoirs.
     */
    public int getTotalRemainingSupply() {

        int total = 0;

        for (Reservoir r : reservoirs) {
            total = total + r.getRemainingSupply();
        }

        return total;
    }

    /**
     * Generates and displays demand forecasts for all areas.
     */
    public void showDemandForecast() {

        int totalSupply = getTotalRemainingSupply();

        ArrayList<DemandForecast> forecasts =
                forecaster.generateAllForecasts(
                        areas,
                        totalSupply
                );

        forecaster.displayForecasts(forecasts);

        if (!forecasts.isEmpty()) {

            int totalPredicted =
                    forecaster.getTotalPredictedDemand(
                            forecasts
                    );

            int totalDailySupply = 0;

            for (Reservoir r : reservoirs) {
                totalDailySupply =
                        totalDailySupply
                        + r.getDailySupply();
            }

            System.out.println();

            if (totalPredicted > totalDailySupply) {

                System.out.println(
                        "⚠ WARNING: Predicted demand ("
                        + totalPredicted
                        + " L) EXCEEDS total daily supply ("
                        + totalDailySupply
                        + " L)!"
                );

                System.out.println(
                        "Consider increasing reservoir"
                        + " capacity or rationing water."
                );

            } else {

                System.out.println(
                        "✓ Supply is sufficient."
                        + " Daily supply: "
                        + totalDailySupply
                        + " L | Predicted demand: "
                        + totalPredicted + " L"
                );
            }
        }
    }

    /**
     * Displays the demand history for a specific area.
     */
    public void showAreaHistory(String areaId) {

        DemandArea area = findArea(areaId);

        if (area == null) {

            System.out.println(
                    "Area not found."
            );

            return;
        }

        forecaster.displayHistory(
                areaId,
                area.getName()
        );
    }
}