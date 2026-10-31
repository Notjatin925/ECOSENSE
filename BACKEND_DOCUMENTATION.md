# BACKEND SYSTEM ARCHITECTURE & API DOCUMENTATION

## **EcoSense Python Backend & SQLite Database Engine**
### *Environmental Studies Capstone Project — Technical Specification*

---

## 1. BACKEND OVERVIEW

The **EcoSense Backend** is a lightweight, zero-dependency **Python REST API server** equipped with an embedded **SQLite3 database** (`ecosense.db`). It runs on Python 3 (standard library) without requiring external frameworks like Flask or FastAPI, ensuring 100% plug-and-play execution on any machine.

```
       ┌────────────────────────────────────────────────────────┐
       │             CLIENT BROWSER (UI / DASHBOARD)            │
       │       index.html  │  app.js  │  style.css             │
       └───────────────────────────┬────────────────────────────┘
                                   │  HTTP Requests (JSON / REST)
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             PYTHON REST API ENGINE (server.py)         │
       │   EcoBackendHandler (Routes: /api/state, /api/toggle)  │
       │   SIM_CONFIG Constants (CEA 0.82 kg CO2/kWh Factor)    │
       └──────────────┬──────────────────────────┬──────────────┘
                      │                          │
                      ▼                          ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │   BACKGROUND WORKER    │      │  SQLITE3 DATABASE      │
       │  Continuous Telemetry  │◄────►│  ecosense.db           │
       │  5-Second Persistence  │      │  4 Relational Tables   │
       │  Reminder Rule Engine  │      │  ACID-compliant logs   │
       └────────────────────────┘      └────────────────────────┘
                      ▲
                      │  HTTP POST (/api/iot/telemetry)
       ┌──────────────┴─────────────────────────────────────────┐
       │      IoT SENSORS & HARDWARE SIMULATION (ESP32/Arduino) │
       │      PIR Occupancy  │  CT Current Clamp  │  DHT Temp   │
       └────────────────────────────────────────────────────────┘
```

---

## 2. DATABASE ARCHITECTURE (`ecosense.db`)

The backend automatically creates and maintains four relational tables in SQLite3:

### Table 1: `energy_telemetry`
Logs continuous electrical and environmental readings every 5 seconds for carbon auditing and historical trend analysis.
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment primary key |
| `timestamp` | TEXT | ISO-8601 real-world timestamp |
| `sim_time` | TEXT | Virtual simulated time (e.g., `"18:30"`) |
| `total_watts` | REAL | Total instantaneous active power draw (Watts) |
| `accumulated_kwh` | REAL | Cumulative electrical consumption (kWh) |
| `co2_kg` | REAL | Cumulative carbon dioxide equivalent ($0.82 \text{ kg CO}_2\text{/kWh}$) |
| `coal_kg` | REAL | Fossil coal extraction and burning avoided |
| `water_liters` | REAL | Power station cooling water saved ($2.4 \text{ L/kWh}$) |
| `eco_score` | INTEGER | Household Eco-Efficiency Rating ($0 - 100$) |

### Table 2: `reminder_events`
Maintains an immutable audit log whenever an energy waste rule is resolved via a green nudge.
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment primary key |
| `timestamp` | TEXT | Timestamp when nudge was executed |
| `rule_id` | TEXT | Identifier (e.g., `"ac_temp_nudge"`, `"geyser_overrun"`) |
| `severity` | TEXT | `"critical"`, `"warning"`, or `"nudge"` |
| `title` | TEXT | User-facing alert title |
| `impact_text` | TEXT | Environmental benefit description |
| `action_taken` | TEXT | Specific remediation action performed |
| `kwh_saved` | REAL | Energy conserved by this intervention (kWh) |

### Table 3: `audit_reports`
Stores full certified household environmental energy audit reports.
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Report ID |
| `created_at` | TEXT | Generation timestamp |
| `monthly_kwh` | REAL | Estimated 30-day electricity consumption |
| `monthly_co2` | REAL | Estimated 30-day carbon footprint ($\text{kg CO}_2\text{e}$) |
| `eco_score` | INTEGER | Eco-score at time of audit |
| `rating_grade` | TEXT | Letter grade (`"Grade A+"`, `"Grade B"`, etc.) |
| `summary_json` | TEXT | Complete JSON snapshot of room/appliance states |

### Table 4: `iot_sensor_logs`
Ingests telemetry from physical or virtual microcontrollers (ESP32 / Arduino / Raspberry Pi).
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Sensor reading ID |
| `received_at` | TEXT | Ingestion timestamp |
| `sensor_id` | TEXT | Node ID (e.g., `"ESP32_LIVING_PIR"`, `"CT_MAINS"`) |
| `sensor_type` | TEXT | Type (`"motion"`, `"current"`, `"temperature"`) |
| `reading_value` | REAL | Numerical sensor measurement |
| `unit` | TEXT | Unit (`"Watts"`, `"Celsius"`, `"boolean"`) |

---

## 3. REST API SPECIFICATION

Base URL: `http://localhost:8000`

### 3.1 System & Telemetry Endpoints

#### `GET /api/status`
* **Purpose:** Health check, database telemetry counter, and server metadata.
* **Response (200 OK):**
```json
{
  "status": "online",
  "backend": "Python 3 Standard Server + SQLite3",
  "database": "ecosense.db",
  "telemetry_records": 142,
  "reminder_events_logged": 8,
  "timestamp": "2026-10-10T17:05:00.123456"
}
```

#### `GET /api/state`
* **Purpose:** Returns the full live system state, active reminders, room states, and KPIs.
* **Response (200 OK):**
```json
{
  "simMinutes": 1110,
  "currentWatts": 2480,
  "totalKwh": 1.485,
  "totalSavedKwh": 0.850,
  "co2Kg": 1.218,
  "estCost": 11.88,
  "ecoScore": 92,
  "activeReminders": [...],
  "rooms": {...}
}
```

#### `GET /api/history`
* **Purpose:** Fetches the last 20 telemetry records from SQLite for graphing.
* **Response (200 OK):**
```json
{
  "history": [
    { "id": 1, "sim_time": "18:30", "total_watts": 3477.0, "co2_kg": 1.189, "eco_score": 88 },
    ...
  ]
}
```

---

### 3.2 Appliance & Room Control Endpoints

#### `POST /api/appliance/toggle`
* **Payload:** `{"room": "livingRoom", "appliance": "fan"}`
* **Response:** `{"success": true, "room": "livingRoom", "appliance": "fan", "newStatus": "off"}`

#### `POST /api/appliance/standby`
* **Purpose:** Cycles consumer electronics between `active -> standby -> off`.
* **Payload:** `{"room": "livingRoom", "appliance": "tv"}`
* **Response:** `{"success": true, "newStatus": "off"}`

#### `POST /api/appliance/ac-temp`
* **Payload:** `{"temp": 24}`
* **Response:** `{"success": true, "acTemp": 24}`

#### `POST /api/room/occupancy`
* **Payload:** `{"room": "livingRoom"}`
* **Response:** `{"success": true, "room": "livingRoom", "occupied": false}`

#### `POST /api/room/window`
* **Payload:** `{"windowOpen": false}`
* **Response:** `{"success": true, "windowOpen": false}`

---

### 3.3 Reminder Resolution & Scenarios

#### `POST /api/reminders/fix`
* **Purpose:** Executes a green nudge action, recomputes loads, and permanently logs energy savings to SQLite.
* **Payload:** `{"reminderId": "ac_temp_nudge"}`
* **Response (200 OK):**
```json
{
  "success": true,
  "reminderId": "ac_temp_nudge",
  "action": "Optimized AC to 24°C",
  "kwhSaved": 0.15
}
```

#### `POST /api/scenario`
* **Payload:** `{"scenario": "wasteful" | "eco" | "vacation"}`
* **Response:** `{"success": true, "scenario": "wasteful"}`

---

### 3.4 IoT Hardware Telemetry Endpoint

#### `POST /api/iot/telemetry`
* **Purpose:** Ingests live telemetry from microcontrollers (ESP32, Arduino, Raspberry Pi).
* **Payload:**
```json
{
  "sensor_id": "ESP32_BEDROOM_DHT",
  "type": "temperature",
  "value": 26.5,
  "unit": "Celsius"
}
```
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "IoT Telemetry ingested into SQLite",
  "sensor_id": "ESP32_BEDROOM_DHT"
}
```

---

## 4. ARCHITECTURE SUMMARY & KEY HIGHLIGHTS

When asked: **"Explain your backend architecture"**, deliver these 4 points:

1. **Lightweight & Modular:**
   > *"We engineered a zero-dependency Python backend utilizing Python's built-in `http.server` and `socketserver` modules. It implements a complete RESTful API architecture without bloated third-party frameworks, making it exceptionally fast and portable."*

2. **Persistent Relational Database:**
   > *"All energy telemetry, reminder trigger events, and certified audit reports are logged directly into an embedded SQLite database (`ecosense.db`). Every time a user executes a green nudge, an immutable record of conserved kilowatt-hours is committed to disk."*

3. **Background Multi-Threaded Engine:**
   > *"The backend runs a daemon worker thread that continuously computes thermodynamic cooling formulas, integrates electrical energy over time ($P(t) \cdot dt$), and archives snapshots to SQLite every 5 seconds."*

4. **IoT & Hardware Ready:**
   > *"The backend features a dedicated `/api/iot/telemetry` endpoint. Real ESP32 microcontrollers equipped with split-core current sensors (CT clamps) and PIR motion sensors can stream live household telemetry directly into EcoSense over Wi-Fi via standard HTTP POST."*
