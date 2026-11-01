import java.io.File;
import java.util.Scanner;

public class Main {

    public static void createSampleData(WaterNetwork network) {

        // ==========================================
        // RESERVOIRS
        // ==========================================

        network.addReservoir(
                new Reservoir("R1", "North Reservoir", 5000)
        );

        network.addReservoir(
                new Reservoir("R2", "South Reservoir", 3000)
        );


        // ==========================================
        // 10 DEMAND AREAS
        // ==========================================

        network.addArea(
                new ResidentialArea(
                        "A1", "Greenview Homes", 1500, "Normal"
                )
        );

        network.addArea(
                new ResidentialArea(
                        "A2", "Lakeside Villas", 2000, "High"
                )
        );

        network.addArea(
                new CriticalInstitution(
                        "A3", "City Hospital", 3000, "Critical"
                )
        );

        network.addArea(
                new ResidentialArea(
                        "A4", "Rivergate Apartments", 1800, "Normal"
                )
        );

        network.addArea(
                new ResidentialArea(
                        "A5", "Sunrise Colony", 1200, "High"
                )
        );

        network.addArea(
                new CriticalInstitution(
                        "A6", "Central Fire Station", 1800, "Critical"
                )
        );

        network.addArea(
                new ResidentialArea(
                        "A7", "Hillview Nagar", 1400, "Normal"
                )
        );

        network.addArea(
                new ResidentialArea(
                        "A8", "Maple Residency", 1600, "High"
                )
        );

        network.addArea(
                new ResidentialArea(
                        "A9", "Riverside Colony", 1300, "Normal"
                )
        );

        network.addArea(
                new ResidentialArea(
                        "A10", "Green Park", 1700, "High"
                )
        );


        // ==========================================
        // 15 PIPELINES
        // ==========================================

        network.addPipeline(
                new Pipeline("P1", "R1", "A1")
        );

        network.addPipeline(
                new Pipeline("P2", "R1", "A2")
        );

        network.addPipeline(
                new Pipeline("P3", "R1", "A3")
        );

        network.addPipeline(
                new Pipeline("P4", "A1", "A4")
        );

        network.addPipeline(
                new Pipeline("P5", "A2", "A5")
        );

        network.addPipeline(
                new Pipeline("P6", "A3", "A6")
        );

        network.addPipeline(
                new Pipeline("P7", "A4", "A7")
        );

        network.addPipeline(
                new Pipeline("P8", "A5", "A8")
        );

        network.addPipeline(
                new Pipeline("P9", "A6", "A9")
        );

        network.addPipeline(
                new Pipeline("P10", "A7", "A10")
        );

        network.addPipeline(
                new Pipeline("P11", "R2", "A6")
        );

        network.addPipeline(
                new Pipeline("P12", "R2", "A8")
        );

        network.addPipeline(
                new Pipeline("P13", "A7", "A8")
        );

        network.addPipeline(
                new Pipeline("P14", "A9", "A10")
        );

        network.addPipeline(
                new Pipeline("P15", "A3", "A8")
        );

        // Seed sample public requests awaiting admin approval
        network.addPublicRequest(
                network.findArea("A1"),
                1200,
                "citizen@watergrid.com",
                "Community pipeline low pressure - need domestic refill"
        );
        network.addPublicRequest(
                network.findArea("A3"),
                2500,
                "emergency@cityhealth.gov",
                "City Hospital Emergency ICU reserve replenishment"
        );
    }

    public static void main(String[] args) {

        WaterNetwork network =
                new WaterNetwork();

        createSampleData(network);

        AuthService authService = new AuthService();

        int port = 8080;
        String portEnv = System.getenv("PORT");
        if (portEnv != null) {
            try {
                port = Integer.parseInt(portEnv);
            } catch (NumberFormatException ignored) {}
        }
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException ignored) {}
        }

        File webRoot = new File(".").getAbsoluteFile();
        if (!new File(webRoot, "style.css").exists() && new File(webRoot.getParentFile(), "style.css").exists()) {
            webRoot = webRoot.getParentFile();
        }

        WaterGridHttpServer server = null;
        try {
            server = new WaterGridHttpServer(port, network, authService, webRoot);
            server.start();
        } catch (Exception e) {
            System.err.println("Could not start Web Server on port " + port + ": " + e.getMessage());
        }

        try (Scanner scanner = new Scanner(System.in)) {

        int choice = 0;

        do {

            System.out.println(
                    "\n======================================"
            );

            System.out.println(
                    " SMART WATER DISTRIBUTION MANAGEMENT"
            );

            System.out.println(
                    "======================================"
            );

            System.out.println(
                    "1. Display Reservoirs"
            );

            System.out.println(
                    "2. Display Demand Areas"
            );

            System.out.println(
                    "3. Display Pipelines"
            );

            System.out.println(
                    "4. Check Connectivity"
            );

            System.out.println(
                    "5. Add Water Request"
            );

            System.out.println(
                    "6. Allocate Water"
            );

            System.out.println(
                    "7. Fail Pipeline"
            );

            System.out.println(
                    "8. Repair Pipeline"
            );

            System.out.println(
                    "9. View Maintenance Queue"
            );

            System.out.println(
                    "10. View Allocation History"
            );

            System.out.println(
                    "11. Reset Daily Supply"
            );

            System.out.println(
                    "--- DEMAND FORECASTING ---"
            );

            System.out.println(
                    "12. View Demand Forecast"
            );

            System.out.println(
                    "13. View Area History"
            );

            System.out.println(
                    "14. Record Current Day"
                    + " (without reset)"
            );

            System.out.println(
                    "15. Exit"
            );

            System.out.print(
                    "\nEnter your choice: "
            );

            if (!scanner.hasNextInt()) {
                break;
            }
            choice = scanner.nextInt();

                        switch (choice) {
                                case 1 -> network.displayReservoirs();
                                case 2 -> network.displayAreas();
                                case 3 -> network.displayPipelines();
                                case 4 -> network.showConnectivity();
                                case 5 -> {
                    System.out.print(
                            "Enter area ID: "
                    );

                    String areaId =
                            scanner.next();

                    DemandArea area =
                            network.findArea(areaId);

                    if (area == null) {

                        System.out.println(
                                "Area not found."
                        );

                    } else {

                        System.out.print(
                                "Enter requested litres: "
                        );

                        int litres =
                                scanner.nextInt();

                        network.addWaterRequest(
                                area,
                                litres
                        );
                    }

                                }
                                case 6 -> network.allocateWater();
                                case 7 -> {
                    System.out.print(
                            "Enter pipeline ID: "
                    );

                    String failedId =
                            scanner.next();

                    network.failPipeline(
                            failedId
                    );
                }
                case 8 -> {
                    System.out.print(
                            "Enter pipeline ID: "
                    );

                    String repairId =
                            scanner.next();

                    network.repairPipeline(
                            repairId
                    );
                                }
                                case 9 -> network.displayMaintenanceQueue();
                                case 10 -> network.displayAllocationHistory();
                                case 11 -> network.resetDailySupply();
                                case 12 -> network.showDemandForecast();
                                case 13 -> {
                    System.out.print(
                            "Enter area ID: "
                    );

                    String histAreaId =
                            scanner.next();

                    network.showAreaHistory(
                            histAreaId
                    );
                                }
                                case 14 -> {
                    network.getForecaster()
                            .recordEndOfDay(
                                    network.getAreas()
                            );

                    System.out.println(
                            "Current day's demand data"
                            + " has been recorded"
                            + " (Day "
                            + network.getForecaster()
                                    .getDayCounter()
                            + ")."
                    );
                                }
                                case 15 -> {
                    System.out.println(
                            "Exiting application..."
                    );
                                }
                                default -> {
                    System.out.println(
                            "Invalid choice."
                    );
                                }
            }

        } while (choice != 15);

        } catch (Exception ignored) {
        }

        // Keep the HTTP server running
        try {
            Thread.currentThread().join();
        } catch (InterruptedException ignored) {}
    }
}