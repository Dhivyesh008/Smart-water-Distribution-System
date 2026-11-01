# Smart Water Distribution System (WaterGrid)

A comprehensive smart water distribution and pipeline management system built with Java, modern frontend web technologies (HTML5, CSS3, JavaScript), and Supabase Cloud PostgreSQL integration.

---

## 🌟 Overview

WaterGrid provides real-time monitoring, priority-based water allocation, interactive network mapping, and automated failover for urban water distribution grids.

### Key Capabilities:
- **Interactive Pipeline Network Map:** 5-stage interactive network flow visualizer with live pipeline cut/repair simulation and maintenance ticketing.
- **Priority-Based Water Allocation:** Dynamic priority queues (Critical > High > Normal) ensuring essential services like hospitals and fire stations receive guaranteed supply before residential zones.
- **Multi-Reservoir Supply Management:** Real-time tracking of reservoir capacities, daily supply thresholds, and daily reset/replenishment controls.
- **Citizen Water Request Portal:** Dedicated public interface for residents and organizations to request supply, with an operator approval desk.
- **PostgreSQL Audit Trail & Allocation History:** Full audit logs stored in Supabase with live search, outcome filtering, and instant synchronization.
- **Demand Forecasting:** Predictive demand forecasting using Holt's linear trend indicators and historical usage analysis.

---

## 🛠 Tech Stack

- **Backend:** Java 17+ (Custom Lightweight HTTP Server, Graph Algorithms, Priority Queue Management)
- **Database & Realtime:** Supabase Cloud (PostgreSQL, Row Level Security, Realtime broadcasting)
- **Frontend:** Vanilla HTML5, Modern Responsive CSS3, JavaScript (ES6+), Supabase JS SDK

---

## 🚀 Getting Started

### 1. Running the Web Frontend

You can run the web interface directly using any static web server:

```bash
# Using Node.js serve
npx serve .

# Or using Python's built-in HTTP server
python -m http.server 3000
```

Then open `http://localhost:3000` in your browser.

### 2. Running the Java Backend Server

Compile and launch the standalone Java server:

```bash
# Compile all source files
javac -d out/production/SmartWater src/*.java

# Run the server
java -cp out/production/SmartWater WaterGridHttpServer
```

---

## 🔐 Credentials & Default Accounts

- **Admin/Operator Access:**
  - Email: `admin@watergrid.com`
  - Password: `Admin@123`
- **Citizen Request Portal:**
  - Email: `citizen@watergrid.com`
  - Password: `Citizen@123`
