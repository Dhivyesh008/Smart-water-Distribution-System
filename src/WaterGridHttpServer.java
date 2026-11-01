import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Built-in lightweight HTTP server serving the Web UI and REST API endpoints.
 * Integrates directly with the WaterNetwork simulation engine and AuthService.
 */
public class WaterGridHttpServer {

    private final int port;
    private final WaterNetwork network;
    private final AuthService authService;
    private final File webRoot;
    private HttpServer server;

    public WaterGridHttpServer(int port, WaterNetwork network, AuthService authService, File webRoot) {
        this.port = port;
        this.network = network;
        this.authService = authService;
        this.webRoot = webRoot;
    }

    public void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/", new ApiHandler());
        server.createContext("/", new StaticFileHandler());
        server.setExecutor(Executors.newFixedThreadPool(10));
        server.start();
        System.out.println("=================================================");
        System.out.println(" WaterGrid Java Backend Server Started");
        System.out.println(" URL: http://localhost:" + port + "/");
        System.out.println("=================================================");
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    // -------------------------------------------------------------
    // Helper: Session Cookie extraction
    // -------------------------------------------------------------
    private String extractSessionId(HttpExchange exchange) {
        List<String> cookieHeaders = exchange.getRequestHeaders().get("Cookie");
        if (cookieHeaders == null) return null;
        for (String header : cookieHeaders) {
            String[] cookies = header.split(";");
            for (String cookie : cookies) {
                String[] parts = cookie.trim().split("=", 2);
                if (parts.length == 2 && parts[0].trim().equals("session_id")) {
                    return parts[1].trim();
                }
            }
        }
        return null;
    }

    private void sendJsonResponse(HttpExchange exchange, int statusCode, String json, String setCookieHeader) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store, no-cache, must-revalidate");
        if (setCookieHeader != null) {
            exchange.getResponseHeaders().set("Set-Cookie", setCookieHeader);
        }
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String readRequestBody(HttpExchange exchange) throws IOException {
        try (InputStream is = exchange.getRequestBody()) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    // -------------------------------------------------------------
    // Static Files Handler
    // -------------------------------------------------------------
    private class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String method = exchange.getRequestMethod();
            if (!method.equalsIgnoreCase("GET") && !method.equalsIgnoreCase("HEAD")) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            String path = exchange.getRequestURI().getPath();
            if (path == null || path.equals("/") || path.isEmpty()) {
                path = "/index.html";
            } else if (path.equals("/login")) {
                path = "/login.html";
            } else if (path.equals("/register")) {
                path = "/register.html";
            } else if (path.equals("/public") || path.equals("/citizen")) {
                path = "/public.html";
            } else if (path.equals("/public-login") || path.equals("/citizen-login")) {
                path = "/public-login.html";
            }

            // Remove leading slash
            if (path.startsWith("/")) {
                path = path.substring(1);
            }

            File requestedFile = new File(webRoot, path);

            // Basic path traversal prevention
            if (!requestedFile.getCanonicalPath().startsWith(webRoot.getCanonicalPath()) || !requestedFile.exists() || requestedFile.isDirectory()) {
                String notFound = "<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>";
                byte[] bytes = notFound.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/html; charset=UTF-8");
                exchange.sendResponseHeaders(404, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
                return;
            }

            String contentType = "text/plain";
            String lower = requestedFile.getName().toLowerCase();
            if (lower.endsWith(".html") || lower.endsWith(".htm")) {
                contentType = "text/html; charset=UTF-8";
            } else if (lower.endsWith(".css")) {
                contentType = "text/css; charset=UTF-8";
            } else if (lower.endsWith(".js")) {
                contentType = "application/javascript; charset=UTF-8";
            } else if (lower.endsWith(".json")) {
                contentType = "application/json; charset=UTF-8";
            } else if (lower.endsWith(".png")) {
                contentType = "image/png";
            } else if (lower.endsWith(".svg")) {
                contentType = "image/svg+xml";
            } else if (lower.endsWith(".ico")) {
                contentType = "image/x-icon";
            }

            byte[] fileBytes = Files.readAllBytes(requestedFile.toPath());
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, fileBytes.length);
            if (!method.equalsIgnoreCase("HEAD")) {
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(fileBytes);
                }
            }
        }
    }

    // -------------------------------------------------------------
    // REST API Handler
    // -------------------------------------------------------------
    private class ApiHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            URI uri = exchange.getRequestURI();
            String path = uri.getPath();
            String method = exchange.getRequestMethod();

            // Enable CORS headers for development/flexibility
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

            if (method.equalsIgnoreCase("OPTIONS")) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            try {
                switch (path) {
                    case "/api/me" -> handleMe(exchange);
                    case "/api/auth/register" -> handleRegister(exchange);
                    case "/api/auth/login" -> handleLogin(exchange);
                    case "/api/auth/logout" -> handleLogout(exchange);
                    case "/api/network/state" -> handleNetworkState(exchange);
                    case "/api/requests/add" -> handleAddRequest(exchange);
                    case "/api/requests/accept" -> handleAcceptRequest(exchange);
                    case "/api/requests/reject" -> handleRejectRequest(exchange);
                    case "/api/requests/allocate" -> handleAllocate(exchange);
                    case "/api/pipelines/fail" -> handleFailPipeline(exchange);
                    case "/api/pipelines/repair" -> handleRepairPipeline(exchange);
                    case "/api/simulation/reset-day" -> handleResetDay(exchange);
                    case "/api/forecast" -> handleForecast(exchange);
                    case "/api/area-history" -> handleAreaHistory(exchange);
                    default -> sendJsonResponse(exchange, 404, "{\"error\": \"Endpoint not found\"}", null);
                }
            } catch (Exception ex) {
                ex.printStackTrace();
                sendJsonResponse(exchange, 500, "{\"error\": \"" + JsonUtil.escape(ex.getMessage()) + "\"}", null);
            }
        }

        private void handleMe(HttpExchange exchange) throws IOException {
            String sessionId = extractSessionId(exchange);
            User user = authService.getUserBySession(sessionId);
            if (user == null) {
                sendJsonResponse(exchange, 200, "{\"authenticated\": false}", null);
            } else {
                String json = String.format(
                        "{\"authenticated\": true, \"username\": \"%s\", \"email\": \"%s\", \"role\": \"%s\", \"createdAt\": \"%s\"}",
                        JsonUtil.escape(user.getUsername()),
                        JsonUtil.escape(user.getEmail()),
                        JsonUtil.escape(user.getRole()),
                        JsonUtil.escape(user.getCreatedAt())
                );
                sendJsonResponse(exchange, 200, json, null);
            }
        }

        private void handleRegister(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                sendJsonResponse(exchange, 405, "{\"error\": \"Method not allowed\"}", null);
                return;
            }
            String body = readRequestBody(exchange);
            Map<String, String> params = JsonUtil.parseBody(body);
            String username = params.get("username");
            String email = params.get("email");
            String password = params.get("password");
            String confirmPassword = params.get("confirm_password");
            if (confirmPassword == null) confirmPassword = params.get("confirmPassword");
            String role = params.get("role");
            if (role == null || role.trim().isEmpty()) role = "public";

            AuthService.AuthResult result = authService.register(username, email, password, confirmPassword, role);
            if (result.isSuccess()) {
                String cookie = "session_id=" + result.getSessionId() + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800";
                String json = String.format("{\"success\": true, \"message\": \"%s\", \"username\": \"%s\", \"role\": \"%s\"}",
                        JsonUtil.escape(result.getMessage()), JsonUtil.escape(result.getUser().getUsername()), JsonUtil.escape(result.getUser().getRole()));
                sendJsonResponse(exchange, 200, json, cookie);
            } else {
                String json = String.format("{\"success\": false, \"error\": \"%s\"}", JsonUtil.escape(result.getMessage()));
                sendJsonResponse(exchange, 400, json, null);
            }
        }

        private void handleLogin(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                sendJsonResponse(exchange, 405, "{\"error\": \"Method not allowed\"}", null);
                return;
            }
            String body = readRequestBody(exchange);
            Map<String, String> params = JsonUtil.parseBody(body);
            String email = params.get("email");
            String password = params.get("password");

            AuthService.AuthResult result = authService.login(email, password);
            if (result.isSuccess()) {
                String cookie = "session_id=" + result.getSessionId() + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800";
                String json = String.format("{\"success\": true, \"message\": \"%s\", \"username\": \"%s\", \"role\": \"%s\"}",
                        JsonUtil.escape(result.getMessage()), JsonUtil.escape(result.getUser().getUsername()), JsonUtil.escape(result.getUser().getRole()));
                sendJsonResponse(exchange, 200, json, cookie);
            } else {
                String json = String.format("{\"success\": false, \"error\": \"%s\"}", JsonUtil.escape(result.getMessage()));
                sendJsonResponse(exchange, 401, json, null);
            }
        }

        private void handleLogout(HttpExchange exchange) throws IOException {
            String sessionId = extractSessionId(exchange);
            authService.logout(sessionId);
            String expiredCookie = "session_id=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
            sendJsonResponse(exchange, 200, "{\"success\": true, \"message\": \"Logged out successfully\"}", expiredCookie);
        }

        private void handleNetworkState(HttpExchange exchange) throws IOException {
            List<Reservoir> reservoirs = network.getReservoirs();
            List<DemandArea> areas = network.getAreas();
            List<Pipeline> pipelines = network.getPipelines();
            List<WaterRequest> requests = network.getWaterRequests();
            List<MaintenanceRequest> maintenance = network.getMaintenanceRequests();
            List<AllocationRecord> history = network.getStructuredAllocationHistory();

            int totalSupply = 0;
            int totalDailySupply = 0;
            for (Reservoir r : reservoirs) {
                totalSupply += r.getRemainingSupply();
                totalDailySupply += r.getDailySupply();
            }

            int totalDailyDemand = 0;
            int connectedAreasCount = 0;
            for (DemandArea a : areas) {
                totalDailyDemand += a.getDailyDemand();
                if (network.isAreaConnected(a.getAreaId())) {
                    connectedAreasCount++;
                }
            }

            int failedPipelinesCount = 0;
            for (Pipeline p : pipelines) {
                if (!p.isWorking()) {
                    failedPipelinesCount++;
                }
            }

            StringBuilder sb = new StringBuilder();
            sb.append("{");
            sb.append("\"dayCounter\": ").append(network.getForecaster().getDayCounter()).append(",");
            sb.append("\"totalSupply\": ").append(totalSupply).append(",");
            sb.append("\"totalDailySupply\": ").append(totalDailySupply).append(",");
            sb.append("\"totalDailyDemand\": ").append(totalDailyDemand).append(",");
            sb.append("\"connectedAreasCount\": ").append(connectedAreasCount).append(",");
            sb.append("\"totalAreasCount\": ").append(areas.size()).append(",");
            sb.append("\"failedPipelinesCount\": ").append(failedPipelinesCount).append(",");
            sb.append("\"totalPipelinesCount\": ").append(pipelines.size()).append(",");

            // Reservoirs
            sb.append("\"reservoirs\": [");
            for (int i = 0; i < reservoirs.size(); i++) {
                Reservoir r = reservoirs.get(i);
                double pct = r.getDailySupply() > 0 ? (r.getRemainingSupply() * 100.0 / r.getDailySupply()) : 0;
                if (i > 0) sb.append(",");
                sb.append(String.format("{\"id\": \"%s\", \"name\": \"%s\", \"dailySupply\": %d, \"remainingSupply\": %d, \"percentage\": %.1f}",
                        JsonUtil.escape(r.getReservoirId()), JsonUtil.escape(r.getName()), r.getDailySupply(), r.getRemainingSupply(), pct));
            }
            sb.append("],");

            // Demand Areas
            sb.append("\"areas\": [");
            for (int i = 0; i < areas.size(); i++) {
                DemandArea a = areas.get(i);
                boolean connected = network.isAreaConnected(a.getAreaId());
                if (i > 0) sb.append(",");
                sb.append(String.format("{\"id\": \"%s\", \"name\": \"%s\", \"type\": \"%s\", \"priority\": \"%s\", \"dailyDemand\": %d, \"allocatedWater\": %d, \"unmetWater\": %d, \"connected\": %b}",
                        JsonUtil.escape(a.getAreaId()), JsonUtil.escape(a.getName()), JsonUtil.escape(a.getAreaType()),
                        JsonUtil.escape(a.getPriority()), a.getDailyDemand(), a.getAllocatedWater(), a.getUnmetWater(), connected));
            }
            sb.append("],");

            // Pipelines
            sb.append("\"pipelines\": [");
            for (int i = 0; i < pipelines.size(); i++) {
                Pipeline p = pipelines.get(i);
                if (i > 0) sb.append(",");
                sb.append(String.format("{\"id\": \"%s\", \"from\": \"%s\", \"to\": \"%s\", \"isWorking\": %b}",
                        JsonUtil.escape(p.getPipelineId()), JsonUtil.escape(p.getFrom()), JsonUtil.escape(p.getTo()), p.isWorking()));
            }
            sb.append("],");

            // Pending Requests (Ready for allocation)
            sb.append("\"pendingRequests\": [");
            for (int i = 0; i < requests.size(); i++) {
                WaterRequest wr = requests.get(i);
                if (i > 0) sb.append(",");
                sb.append(String.format("{\"id\": \"%s\", \"areaId\": \"%s\", \"areaName\": \"%s\", \"priority\": \"%s\", \"requestedLitres\": %d, \"arrivalOrder\": %d, \"requestedBy\": \"%s\", \"reason\": \"%s\", \"status\": \"%s\"}",
                        JsonUtil.escape(wr.getId()),
                        JsonUtil.escape(wr.getArea().getAreaId()), JsonUtil.escape(wr.getArea().getName()),
                        JsonUtil.escape(wr.getArea().getPriority()), wr.getRequestedLitres(), wr.getArrivalOrder(),
                        JsonUtil.escape(wr.getRequestedBy()), JsonUtil.escape(wr.getReason()), JsonUtil.escape(wr.getStatus())));
            }
            sb.append("],");

            // All Public & System Requests
            List<WaterRequest> allReqs = network.getAllRequests();
            sb.append("\"allRequests\": [");
            for (int i = 0; i < allReqs.size(); i++) {
                WaterRequest wr = allReqs.get(i);
                if (i > 0) sb.append(",");
                sb.append(String.format("{\"id\": \"%s\", \"areaId\": \"%s\", \"areaName\": \"%s\", \"priority\": \"%s\", \"requestedLitres\": %d, \"requestedBy\": \"%s\", \"reason\": \"%s\", \"status\": \"%s\", \"createdAt\": \"%s\", \"decisionNotes\": \"%s\"}",
                        JsonUtil.escape(wr.getId()),
                        JsonUtil.escape(wr.getArea().getAreaId()), JsonUtil.escape(wr.getArea().getName()),
                        JsonUtil.escape(wr.getArea().getPriority()), wr.getRequestedLitres(),
                        JsonUtil.escape(wr.getRequestedBy()), JsonUtil.escape(wr.getReason()),
                        JsonUtil.escape(wr.getStatus()), JsonUtil.escape(wr.getCreatedAt()),
                        JsonUtil.escape(wr.getDecisionNotes())));
            }
            sb.append("],");

            // Maintenance Queue
            sb.append("\"maintenanceQueue\": [");
            for (int i = 0; i < maintenance.size(); i++) {
                MaintenanceRequest mr = maintenance.get(i);
                Pipeline p = network.findPipeline(mr.getPipelineId());
                String from = p != null ? p.getFrom() : "";
                String to = p != null ? p.getTo() : "";
                if (i > 0) sb.append(",");
                sb.append(String.format("{\"pipelineId\": \"%s\", \"issue\": \"%s\", \"requestNumber\": %d, \"from\": \"%s\", \"to\": \"%s\"}",
                        JsonUtil.escape(mr.getPipelineId()), JsonUtil.escape(mr.getIssue()), mr.getRequestNumber(),
                        JsonUtil.escape(from), JsonUtil.escape(to)));
            }
            sb.append("],");

            // Allocation History
            sb.append("\"allocationHistory\": [");
            for (int i = 0; i < history.size(); i++) {
                AllocationRecord ar = history.get(i);
                if (i > 0) sb.append(",");
                sb.append(String.format("{\"timestamp\": \"%s\", \"areaId\": \"%s\", \"areaName\": \"%s\", \"allocatedLitres\": %d, \"reservoirName\": \"%s\", \"result\": \"%s\"}",
                        JsonUtil.escape(ar.getTimestamp()), JsonUtil.escape(ar.getAreaId()), JsonUtil.escape(ar.getAreaName()),
                        ar.getAllocatedLitres(), JsonUtil.escape(ar.getReservoirName()), JsonUtil.escape(ar.getResult())));
            }
            sb.append("]");

            sb.append("}");

            sendJsonResponse(exchange, 200, sb.toString(), null);
        }

        private void handleAddRequest(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                sendJsonResponse(exchange, 405, "{\"error\": \"Method not allowed\"}", null);
                return;
            }
            String body = readRequestBody(exchange);
            Map<String, String> params = JsonUtil.parseBody(body);
            String areaId = params.get("area_id");
            if (areaId == null) areaId = params.get("areaId");
            String litresStr = params.get("requested_litres");
            if (litresStr == null) litresStr = params.get("requestedLitres");

            if (areaId == null || areaId.trim().isEmpty()) {
                sendJsonResponse(exchange, 400, "{\"success\": false, \"error\": \"Please select a valid demand area.\"}", null);
                return;
            }
            int litres;
            try {
                litres = Integer.parseInt(litresStr);
                if (litres <= 0) throw new NumberFormatException();
            } catch (Exception ex) {
                sendJsonResponse(exchange, 400, "{\"success\": false, \"error\": \"Requested litres must be a positive whole number.\"}", null);
                return;
            }

            DemandArea area = network.findArea(areaId.trim());
            if (area == null) {
                sendJsonResponse(exchange, 404, "{\"success\": false, \"error\": \"The selected demand area does not exist.\"}", null);
                return;
            }

            String requestedBy = params.get("requested_by");
            if (requestedBy == null) requestedBy = params.get("requestedBy");
            if (requestedBy == null || requestedBy.trim().isEmpty()) {
                String sessionId = extractSessionId(exchange);
                User user = authService.getUserBySession(sessionId);
                requestedBy = user != null ? user.getUsername() + " (" + user.getEmail() + ")" : "Public Citizen";
            }

            String reason = params.get("reason");
            if (reason == null || reason.trim().isEmpty()) {
                reason = "Domestic Supply Request";
            }

            String customId = params.get("request_id");
            if (customId == null) customId = params.get("requestId");

            WaterRequest wr = network.addPublicRequest(customId, area, litres, requestedBy, reason);
            String json = String.format("{\"success\": true, \"message\": \"Water request %s registered. Awaiting Administrator approval.\", \"requestId\": \"%s\"}",
                    JsonUtil.escape(wr.getId()), JsonUtil.escape(wr.getId()));
            sendJsonResponse(exchange, 200, json, null);
        }

        private void handleAcceptRequest(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                sendJsonResponse(exchange, 405, "{\"error\": \"Method not allowed\"}", null);
                return;
            }
            String body = readRequestBody(exchange);
            Map<String, String> params = JsonUtil.parseBody(body);
            String requestId = params.get("request_id");
            if (requestId == null) requestId = params.get("requestId");

            if (requestId == null || requestId.trim().isEmpty()) {
                sendJsonResponse(exchange, 400, "{\"success\": false, \"error\": \"Request ID is required.\"}", null);
                return;
            }

            boolean ok = network.acceptRequest(requestId.trim());
            if (ok) {
                sendJsonResponse(exchange, 200, "{\"success\": true, \"message\": \"Request " + JsonUtil.escape(requestId) + " ACCEPTED by Administrator and queued for water distribution.\"}", null);
            } else {
                sendJsonResponse(exchange, 404, "{\"success\": false, \"error\": \"Request " + JsonUtil.escape(requestId) + " not found.\"}", null);
            }
        }

        private void handleRejectRequest(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                sendJsonResponse(exchange, 405, "{\"error\": \"Method not allowed\"}", null);
                return;
            }
            String body = readRequestBody(exchange);
            Map<String, String> params = JsonUtil.parseBody(body);
            String requestId = params.get("request_id");
            if (requestId == null) requestId = params.get("requestId");
            String reason = params.get("reason");

            if (requestId == null || requestId.trim().isEmpty()) {
                sendJsonResponse(exchange, 400, "{\"success\": false, \"error\": \"Request ID is required.\"}", null);
                return;
            }

            boolean ok = network.rejectRequest(requestId.trim(), reason);
            if (ok) {
                sendJsonResponse(exchange, 200, "{\"success\": true, \"message\": \"Request " + JsonUtil.escape(requestId) + " REJECTED by Administrator.\"}", null);
            } else {
                sendJsonResponse(exchange, 404, "{\"success\": false, \"error\": \"Request " + JsonUtil.escape(requestId) + " not found.\"}", null);
            }
        }

        private void handleAllocate(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                sendJsonResponse(exchange, 405, "{\"error\": \"Method not allowed\"}", null);
                return;
            }
            if (network.getWaterRequests().isEmpty()) {
                sendJsonResponse(exchange, 200, "{\"success\": false, \"message\": \"There are no pending water requests to allocate.\"}", null);
                return;
            }
            network.allocateWater();
            sendJsonResponse(exchange, 200, "{\"success\": true, \"message\": \"Pending water requests were processed by priority and network reachability.\"}", null);
        }

        private void handleFailPipeline(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                sendJsonResponse(exchange, 405, "{\"error\": \"Method not allowed\"}", null);
                return;
            }
            String body = readRequestBody(exchange);
            Map<String, String> params = JsonUtil.parseBody(body);
            String pipelineId = params.get("pipeline_id");
            if (pipelineId == null) pipelineId = params.get("pipelineId");

            Pipeline pipeline = network.findPipeline(pipelineId);
            if (pipeline == null) {
                sendJsonResponse(exchange, 404, "{\"success\": false, \"error\": \"Pipeline not found.\"}", null);
                return;
            }
            if (!pipeline.isWorking()) {
                sendJsonResponse(exchange, 200, "{\"success\": false, \"message\": \"" + pipelineId + " is already marked failed.\"}", null);
                return;
            }

            network.failPipeline(pipelineId);
            sendJsonResponse(exchange, 200, "{\"success\": true, \"message\": \"" + pipelineId + " marked failed and added to maintenance queue.\"}", null);
        }

        private void handleRepairPipeline(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                sendJsonResponse(exchange, 405, "{\"error\": \"Method not allowed\"}", null);
                return;
            }
            String body = readRequestBody(exchange);
            Map<String, String> params = JsonUtil.parseBody(body);
            String pipelineId = params.get("pipeline_id");
            if (pipelineId == null) pipelineId = params.get("pipelineId");

            Pipeline pipeline = network.findPipeline(pipelineId);
            if (pipeline == null) {
                sendJsonResponse(exchange, 404, "{\"success\": false, \"error\": \"Pipeline not found.\"}", null);
                return;
            }
            if (pipeline.isWorking()) {
                sendJsonResponse(exchange, 200, "{\"success\": false, \"message\": \"" + pipelineId + " is already working.\"}", null);
                return;
            }

            network.repairPipeline(pipelineId);
            sendJsonResponse(exchange, 200, "{\"success\": true, \"message\": \"" + pipelineId + " repaired successfully.\"}", null);
        }

        private void handleResetDay(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                sendJsonResponse(exchange, 405, "{\"error\": \"Method not allowed\"}", null);
                return;
            }
            network.resetDailySupply();
            int currentDay = network.getForecaster().getDayCounter();
            sendJsonResponse(exchange, 200, "{\"success\": true, \"message\": \"A new simulation day (Day " + currentDay + ") started. Daily supplies and area allocations have been reset.\"}", null);
        }

        private void handleForecast(HttpExchange exchange) throws IOException {
            int totalSupply = network.getTotalRemainingSupply();
            ArrayList<DemandForecast> forecasts = network.getForecaster().generateAllForecasts(network.getAreas(), totalSupply);

            int totalPredicted = 0;
            for (DemandForecast df : forecasts) {
                totalPredicted += df.getPredictedDemand();
            }

            int totalDailyCapacity = 0;
            for (Reservoir r : network.getReservoirs()) {
                totalDailyCapacity += r.getDailySupply();
            }

            boolean sufficient = totalPredicted <= totalDailyCapacity;

            StringBuilder sb = new StringBuilder();
            sb.append("{");
            sb.append("\"dayCount\": ").append(network.getForecaster().getDayCounter()).append(",");
            sb.append("\"totalPredicted\": ").append(totalPredicted).append(",");
            sb.append("\"totalDailyCapacity\": ").append(totalDailyCapacity).append(",");
            sb.append("\"sufficient\": ").append(sufficient).append(",");
            sb.append("\"forecasts\": [");
            for (int i = 0; i < forecasts.size(); i++) {
                DemandForecast df = forecasts.get(i);
                if (i > 0) sb.append(",");
                sb.append(String.format("{\"areaId\": \"%s\", \"areaName\": \"%s\", \"currentDemand\": %d, \"predicted\": %d, \"trend\": \"%s\", \"trendSymbol\": \"%s\", \"trendPct\": %.1f, \"confidence\": \"%s\", \"risk\": %b}",
                        JsonUtil.escape(df.getAreaId()), JsonUtil.escape(df.getAreaName()),
                        df.getCurrentDemand(), df.getPredictedDemand(),
                        JsonUtil.escape(df.getTrend()), JsonUtil.escape(df.getTrendSymbol()),
                        df.getTrendPercentage(), JsonUtil.escape(df.getConfidence()), df.isSupplyRisk()));
            }
            sb.append("]}");

            sendJsonResponse(exchange, 200, sb.toString(), null);
        }

        private void handleAreaHistory(HttpExchange exchange) throws IOException {
            String query = exchange.getRequestURI().getQuery();
            String areaId = null;
            if (query != null) {
                for (String param : query.split("&")) {
                    String[] pair = param.split("=");
                    if (pair.length == 2 && pair[0].equals("areaId")) {
                        areaId = pair[1];
                        break;
                    }
                }
            }

            if (areaId == null || areaId.isEmpty()) {
                sendJsonResponse(exchange, 400, "{\"error\": \"Missing areaId parameter\"}", null);
                return;
            }

            List<Integer> history = network.getForecaster().getHistory(areaId);
            StringBuilder sb = new StringBuilder();
            sb.append("{\"areaId\": \"").append(JsonUtil.escape(areaId)).append("\", \"history\": [");
            for (int i = 0; i < history.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(history.get(i));
            }
            sb.append("]}");

            sendJsonResponse(exchange, 200, sb.toString(), null);
        }
    }
}
