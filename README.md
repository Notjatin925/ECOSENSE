# VoltSense: Real-Time Smart Energy Saving Reminder System

> **A software-only, zero-hardware prototype of an event-driven, real-time energy telemetry stream and smart push notification reminder engine.**

---

## 1. System Architecture & High-Level Design

VoltSense implements an asynchronous, low-latency, real-time telemetry streaming architecture that monitors electrical power draw across multiple simulated appliances, continuously analyzes thresholds using an in-memory rules engine, and pushes audio-visual reminders directly to an interactive React dashboard via bi-directional WebSockets.

```
                           +----------------------------------------+
                           |   Telemetry Simulator (asyncio tick)   |
                           |   - Workspace: Laptop, Monitors, Lamp  |
                           |   - Climate: Inverter Split AC         |
                           |   - Kitchen: Refrigerator, Kettle      |
                           +-------------------+--------------------+
                                               |
                                               v (every 1.0s)
                           +----------------------------------------+
                           |          In-Memory Rules Engine        |
                           |  - Vampire / Phantom Load (>10W idle)  |
                           |  - Unattended Running (>150W vacant)   |
                           |  - Peak-Hour Tariff Surcharge (>300W)  |
                           |  - Power Surge Safety Detection        |
                           +-------------------+--------------------+
                                               |
                                               v
                           +----------------------------------------+
                           |  FastAPI WebSocket Connection Manager  |
                           +-------------------+--------------------+
                                               |
                          Bi-directional WS /ws | (JSON events)
                                               v
+------------------------------------------------------------------------------------------+
|                        VoltSense React + Vite + Tailwind Dashboard                       |
|  - Real-Time Watts / Volts / Amps Gauges                                                 |
|  - Live SVG Sparkline Trajectories (last 20 readings)                                    |
|  - Interactive Simulator Stress Lab (Presence, Surge, Phantom, Peak Hour)                |
|  - Push Notification Feed with interactive [Turn Off (0W)], [Snooze 5m], [Dismiss]     |
|  - Web Audio API Synthesized Reminder Chimes                                             |
+------------------------------------------------------------------------------------------+
```

---

## 2. Directory Structure

```
d:\antii grave\
├── backend/
│   ├── app/
│   │   ├── __init__.py           # Package initialization
│   │   ├── config.py             # App configurations & environment thresholds
│   │   ├── main.py               # FastAPI application, lifespan loop, REST & WS endpoints
│   │   ├── models.py             # Pydantic schemas (telemetry, alerts, commands)
│   │   ├── rules_engine.py       # In-memory rule evaluation & stateful alert lifecycle
│   │   ├── simulator.py          # Realistic multi-appliance physical simulation
│   │   └── websocket_manager.py  # WebSocket connection manager & broadcast hub
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_engine.py        # Unit tests for rules, simulator, snooze, shutoff
│   │   └── test_websocket.py     # Integration tests for WebSocket stream and REST actions
│   ├── .env                      # Backend environment variables
│   └── requirements.txt          # Python dependencies
├── frontend/
│   ├── public/                   # Static assets & favicon
│   ├── src/
│   │   ├── components/
│   │   │   ├── AlertHistoryDrawer.jsx    # Slide-over drawer for past/active alerts
│   │   │   ├── DeviceGaugeCard.jsx       # Energy gauge card per appliance
│   │   │   ├── DeviceSparkline.jsx       # SVG real-time sparkline graph
│   │   │   ├── Header.jsx                # Header bar, live WS pill, audio toggle
│   │   │   ├── KpiMetrics.jsx            # Top-level wattage & cost KPIs
│   │   │   ├── PushNotificationToasts.jsx# Interactive audio-visual toast stack
│   │   │   └── SimulatorControlPanel.jsx # Interactive rule testing lab
│   │   ├── context/
│   │   │   └── EnergySocketContext.jsx   # WebSocket state management & action dispatch
│   │   ├── utils/
│   │   │   └── audio.js                  # Web Audio API synthesized reminder sounds
│   │   ├── App.jsx                       # Main dashboard layout
│   │   ├── index.css                     # Tailwind CSS & custom animations
│   │   └── main.jsx                      # React 18 DOM mount
│   ├── index.html
│   ├── package.json                      # Frontend dependencies
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── .env                              # Frontend API & WS connection strings
├── run_dev.bat                           # 1-Click Windows Batch launcher
├── run_dev.ps1                           # 1-Click PowerShell launcher
└── README.md                             # Systems architecture documentation
```

---

## 3. Real-Time Detection & Smart Reminder Rules

| Rule Name | Trigger Condition | Severity | Default Action & Remediation |
| :--- | :--- | :--- | :--- |
| **Phantom / Vampire Load Alert** | Device in `STANDBY` mode draws $\ge 10\text{W}$ for $\ge 10\text{ seconds}$ | `warning` | Warns user of continuous parasitic energy leak. Provides **[Turn Off Remotely]** button to cut power to 0W. |
| **Unattended Running Alert** | Room is vacant (`user_present == False`) AND any device draws $\ge 150\text{W}$ (e.g. AC, Kettle) | `critical` | Urgent immediate alert. Highlights massive wasted draw in an empty room with **[Turn Off Remotely]** button. |
| **Peak-Hour Surcharge Warning** | Dynamic peak tariff window active (`14:00 - 19:00` or manual override) AND high load $\ge 300\text{W}$ | `warning` | Informs user of high tariff rate ($\$0.38/\text{kWh}$ vs $\$0.15/\text{kWh}$) and advises postponing non-essential heavy cycles. |
| **Power Surge Protection** | Load exceeds breaker rating ($\ge 2200\text{W}$) or sudden spike | `critical` | Emergency alert to protect simulated appliance circuitry. |

### In-App Interactive Notification Actions
- **`[Turn Off Remotely]`**: Dispatches a command to the telemetry simulator to instantly drop the appliance's wattage to **0.0W**, sets its state to `OFF`, and automatically marks the alert as **Resolved**.
- **`[Snooze 5 min]`**: Silences the reminder for 300 seconds (or customized duration).
- **`[Dismiss]`**: Acknowledges and dismisses the alert into the resolved history log.

---

## 4. Quick Start & Run Instructions

### Option A: Single-Command Launchers
- **Windows Command Prompt / Double-Click**:
  ```cmd
  run_dev.bat
  ```
- **PowerShell**:
  ```powershell
  .\run_dev.ps1
  ```

### Option B: Manual Two-Terminal Launch

**Terminal 1 (Backend - FastAPI):**
```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*API Docs: http://localhost:8000/docs | WebSocket: ws://localhost:8000/ws*

**Terminal 2 (Frontend - React + Vite):**
```powershell
cd frontend
npm install
npm run dev
```
*Dashboard: http://localhost:5173*

---

## 5. Automated Verification & Test Suite

Run the full pytest suite from the project root:
```powershell
python -m pytest backend/tests -v
```

### Verified Test Cases:
1. `test_simulator_initialization`: Verifies realistic initial wattage profiles for Laptop, Dual Monitors, Desk Lamp, AC, Refrigerator, and Kettle.
2. `test_remote_turn_off`: Confirms that remote shutoff drops wattage to exactly 0.0W and current to 0.0A.
3. `test_vampire_load_rule`: Validates that standby draw $>10\text{W}$ over threshold triggers a `VAMPIRE_LOAD` warning.
4. `test_unattended_running_rule`: Validates that toggling `user_present=False` while the AC draws $>150\text{W}$ immediately fires an `UNATTENDED_RUNNING` critical alert.
5. `test_peak_hour_surcharge_rule`: Validates tariff multiplier and `PEAK_HOUR_SURCHARGE` alert during peak pricing windows.
6. `test_alert_snooze_and_dismiss`: Confirms snooze silence timers and alert dismissal.
7. `test_remote_shutoff_resolves_alerts`: Confirms that shutting off a device automatically resolves associated active alerts.
8. `test_rest_health_and_status`: Tests FastAPI REST health and state endpoints.
9. `test_rest_controls_and_rules`: Tests REST simulator triggers and alert actions.
10. `test_websocket_stream`: Connects to `ws://localhost:8000/ws`, tests bidirectional message exchange, and validates telemetry streaming updates without page reload.
