#!/usr/bin/env python3
"""
EcoSense Python Backend & REST API Server
Smart Energy-Saving Reminder & Carbon Conservation System
Environmental Studies Capstone Project

Features:
- Full RESTful API endpoints for appliance controls, reminders, telemetry, and audits
- Embedded SQLite3 database (ecosense.db) for logging energy readings & reminder events
- Threaded background worker for continuous energy calculation and telemetry archiving
- IoT Ingestion Endpoint (/api/iot/telemetry) for simulated or real ESP32/Arduino sensors
- Static file serving for the interactive dashboard (index.html, style.css, app.js)
- 100% Zero third-party dependencies (pure standard Python library)
"""

import http.server
import socketserver
import sqlite3
import json
import urllib.parse
import os
import sys
import webbrowser
import threading
import time
from datetime import datetime

# Windows console encoding safeguard
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = 8000
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ecosense.db")

# --- Environmental Constants & Grid Factors ---
SIM_CONFIG = {
    "emissionFactorKgPerKwh": 0.82,  # National thermal grid emission factor (CEA benchmark)
    "coalKgPerKwh": 0.65,           # Coal extraction and combustion avoided per kWh
    "waterLitersPerKwh": 2.40,       # Thermal power station cooling water consumption
    "costPerKwh": 8.0,               # Electricity tariff unit cost
    "treeAnnualAbsorptionKg": 21.0   # Mature broadleaf tree CO2 absorption rate/year
}

# --- In-Memory State Model ---
lock = threading.Lock()

state = {
    "simMinutes": 18 * 60 + 30,  # 18:30 (Evening Peak)
    "simSpeed": 1,               # 1 real sec = 1 sim min
    "totalKwh": 1.45,
    "totalSavedKwh": 0.85,
    "ecoScore": 88,
    "rooms": {
        "livingRoom": {
            "name": "Living Room",
            "occupied": True,
            "vacantMinutes": 0,
            "appliances": {
                "fan": {"name": "Ceiling Fan", "status": "on", "watts": 75, "kwh": 0.15},
                "lights": {"name": "LED Ceiling Fixtures", "status": "on", "watts": 30, "kwh": 0.08},
                "tv": {"name": "Smart TV (55-inch)", "status": "standby", "activeWatts": 120, "standbyWatts": 15, "watts": 15, "kwh": 0.22},
                "console": {"name": "Gaming Console & Setup", "status": "standby", "activeWatts": 90, "standbyWatts": 14, "watts": 14, "kwh": 0.18}
            }
        },
        "bedroom": {
            "name": "Master Bedroom",
            "occupied": True,
            "vacantMinutes": 0,
            "windowOpen": False,
            "acTemp": 22,
            "appliances": {
                "ac": {"name": "Inverter AC (1.5 Ton)", "status": "on", "watts": 1050, "kwh": 0.65},
                "lights": {"name": "Room Lamp & Lights", "status": "on", "watts": 25, "kwh": 0.05},
                "laptop": {"name": "Laptop Charger Block", "status": "standby", "activeWatts": 65, "standbyWatts": 6, "watts": 6, "kwh": 0.09}
            }
        },
        "kitchen": {
            "name": "Kitchen",
            "occupied": False,
            "vacantMinutes": 20,
            "fridgeDoorOpen": False,
            "fridgeDoorSeconds": 0,
            "appliances": {
                "fridge": {"name": "Inverter Refrigerator", "status": "on", "watts": 160, "kwh": 0.45},
                "microwave": {"name": "Microwave Oven", "status": "standby", "activeWatts": 1200, "standbyWatts": 7, "watts": 7, "kwh": 0.04},
                "exhaust": {"name": "Kitchen Exhaust Fan", "status": "off", "watts": 55, "kwh": 0.02}
            }
        },
        "bathroom": {
            "name": "Bathroom",
            "occupied": False,
            "vacantMinutes": 45,
            "geyserMinutes": 28,
            "appliances": {
                "geyser": {"name": "Electric Water Geyser (25L)", "status": "on", "watts": 2000, "kwh": 0.82},
                "exhaust": {"name": "Exhaust Fan", "status": "on", "watts": 40, "kwh": 0.06}
            }
        }
    },
    "activeReminders": []
}

# --- SQLite Database Initialization ---
def init_database():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 1. Telemetry Log Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS energy_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            sim_time TEXT NOT NULL,
            total_watts REAL NOT NULL,
            accumulated_kwh REAL NOT NULL,
            co2_kg REAL NOT NULL,
            coal_kg REAL NOT NULL,
            water_liters REAL NOT NULL,
            eco_score INTEGER NOT NULL
        )
    ''')

    # 2. Reminder Audit Event Log
    c.execute('''
        CREATE TABLE IF NOT EXISTS reminder_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            rule_id TEXT NOT NULL,
            severity TEXT NOT NULL,
            title TEXT NOT NULL,
            impact_text TEXT NOT NULL,
            action_taken TEXT NOT NULL,
            kwh_saved REAL NOT NULL
        )
    ''')

    # 3. Environmental Audit Reports
    c.execute('''
        CREATE TABLE IF NOT EXISTS audit_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            monthly_kwh REAL NOT NULL,
            monthly_co2 REAL NOT NULL,
            eco_score INTEGER NOT NULL,
            rating_grade TEXT NOT NULL,
            summary_json TEXT NOT NULL
        )
    ''')

    # 4. IoT Sensor Ingestion Logs
    c.execute('''
        CREATE TABLE IF NOT EXISTS iot_sensor_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at TEXT NOT NULL,
            sensor_id TEXT NOT NULL,
            sensor_type TEXT NOT NULL,
            reading_value REAL NOT NULL,
            unit TEXT NOT NULL
        )
    ''')

    conn.commit()
    conn.close()
    print("[+] SQLite Database initialized successfully: ecosense.db")

def log_telemetry_to_db(sim_time_str, watts, kwh, co2, coal, water, score):
    try:
        conn = sqlite3.connect(DB_FILE, timeout=5)
        c = conn.cursor()
        now = datetime.now().isoformat()
        c.execute('''
            INSERT INTO energy_telemetry 
            (timestamp, sim_time, total_watts, accumulated_kwh, co2_kg, coal_kg, water_liters, eco_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (now, sim_time_str, watts, kwh, co2, coal, water, score))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[!] DB Log Error: {e}")

def log_reminder_event_to_db(rule_id, severity, title, impact_text, action_taken, kwh_saved):
    try:
        conn = sqlite3.connect(DB_FILE, timeout=5)
        c = conn.cursor()
        now = datetime.now().isoformat()
        c.execute('''
            INSERT INTO reminder_events 
            (timestamp, rule_id, severity, title, impact_text, action_taken, kwh_saved)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (now, rule_id, severity, title, impact_text, action_taken, kwh_saved))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[!] DB Reminder Log Error: {e}")

# --- Helper Logic & Math ---
def calculate_ac_watts(temp):
    if temp <= 18: return 1550
    if temp == 19: return 1400
    if temp == 20: return 1250
    if temp == 21: return 1150
    if temp == 22: return 1050
    if temp == 23: return 970
    if temp == 24: return 890
    if temp == 25: return 780
    return 680

def update_wattages_backend():
    r = state["rooms"]
    # Living Room
    r["livingRoom"]["appliances"]["fan"]["watts"] = 75 if r["livingRoom"]["appliances"]["fan"]["status"] == "on" else 0
    r["livingRoom"]["appliances"]["lights"]["watts"] = 30 if r["livingRoom"]["appliances"]["lights"]["status"] == "on" else 0
    
    tv_st = r["livingRoom"]["appliances"]["tv"]["status"]
    r["livingRoom"]["appliances"]["tv"]["watts"] = 120 if tv_st == "on" else (15 if tv_st == "standby" else 0)
    
    con_st = r["livingRoom"]["appliances"]["console"]["status"]
    r["livingRoom"]["appliances"]["console"]["watts"] = 90 if con_st == "on" else (14 if con_st == "standby" else 0)

    # Bedroom
    br = r["bedroom"]
    if br["appliances"]["ac"]["status"] == "on":
        w = calculate_ac_watts(br["acTemp"])
        if br["windowOpen"]: w += 400
        br["appliances"]["ac"]["watts"] = w
    else:
        br["appliances"]["ac"]["watts"] = 0
    
    br["appliances"]["lights"]["watts"] = 25 if br["appliances"]["lights"]["status"] == "on" else 0
    lap_st = br["appliances"]["laptop"]["status"]
    br["appliances"]["laptop"]["watts"] = 65 if lap_st == "on" else (6 if lap_st == "standby" else 0)

    # Kitchen
    kt = r["kitchen"]
    if kt["appliances"]["fridge"]["status"] == "on":
        kt["appliances"]["fridge"]["watts"] = 320 if kt["fridgeDoorOpen"] else 160
    else:
        kt["appliances"]["fridge"]["watts"] = 0
    
    mw_st = kt["appliances"]["microwave"]["status"]
    kt["appliances"]["microwave"]["watts"] = 1200 if mw_st == "on" else (7 if mw_st == "standby" else 0)
    kt["appliances"]["exhaust"]["watts"] = 55 if kt["appliances"]["exhaust"]["status"] == "on" else 0

    # Bathroom
    bt = r["bathroom"]
    bt["appliances"]["geyser"]["watts"] = 2000 if bt["appliances"]["geyser"]["status"] == "on" else 0
    bt["appliances"]["exhaust"]["watts"] = 40 if bt["appliances"]["exhaust"]["status"] == "on" else 0

def get_total_watts_backend():
    total = 0
    for r_k, room in state["rooms"].items():
        for a_k, app in room["appliances"].items():
            total += app.get("watts", 0)
    return total

def evaluate_rules_backend():
    reminders = []
    r = state["rooms"]
    norm_min = ((state["simMinutes"] % 1440) + 1440) % 1440
    is_peak = (norm_min >= 18 * 60 and norm_min <= 22 * 60)

    # Rule 1: Vacant living room
    if not r["livingRoom"]["occupied"] and r["livingRoom"]["vacantMinutes"] >= 5:
        fan_on = r["livingRoom"]["appliances"]["fan"]["status"] == "on"
        light_on = r["livingRoom"]["appliances"]["lights"]["status"] == "on"
        if fan_on or light_on:
            reminders.append({
                "id": "vacant_living_room",
                "severity": "critical",
                "title": "Living Room Vacant — Lights/Fan Running",
                "desc": f"Living Room empty for {r['livingRoom']['vacantMinutes']} mins with active fixtures.",
                "ecoFact": "Lighting and unneeded fans in empty rooms account for ~12% of avoidable residential electricity waste.",
                "impact": "Save ~105W & 0.48 kg CO2",
                "actionText": "Turn Off Room"
            })

    # Rule 2: AC Temp
    if r["bedroom"]["appliances"]["ac"]["status"] == "on":
        if r["bedroom"]["acTemp"] < 24:
            diff = 24 - r["bedroom"]["acTemp"]
            reminders.append({
                "id": "ac_temp_nudge",
                "severity": "warning",
                "title": f"AC Set to {r['bedroom']['acTemp']}°C (Eco-Optimum is 24°C)",
                "desc": f"Operating at {r['bedroom']['acTemp']}°C consumes ~{diff*6}% more power than recommended by BEE.",
                "ecoFact": "Every 1°C increase in AC setting reduces compressor load by 6%, saving roughly 4-9 units monthly.",
                "impact": f"Save ~{calculate_ac_watts(r['bedroom']['acTemp']) - calculate_ac_watts(24)}W",
                "actionText": "Set to 24°C"
            })
        if r["bedroom"]["windowOpen"]:
            reminders.append({
                "id": "ac_window_open",
                "severity": "critical",
                "title": "Thermal Leak: Bedroom Window Is Open While AC Runs",
                "desc": "Outdoor air entering forces compressor into maximum duty cycle.",
                "ecoFact": "Cooling an unsealed room increases AC duty cycle by over 45%, rapidly spiking carbon emissions.",
                "impact": "Save ~400W & avoid motor strain",
                "actionText": "Close Window"
            })

    # Rule 3: Geyser overrun
    if r["bathroom"]["appliances"]["geyser"]["status"] == "on" and r["bathroom"]["geyserMinutes"] >= 20:
        reminders.append({
            "id": "geyser_overrun",
            "severity": "critical",
            "title": "Geyser Overheating (Running > 20 Mins)",
            "desc": f"Water heater active for {r['bathroom']['geyserMinutes']} mins. 2000W element heating already-hot water.",
            "ecoFact": "Water heaters are the single highest wattage appliance (2-3 kW). Running past 15-20 mins wastes pure thermal energy.",
            "impact": "Save 2000W & 1.64 kg CO2/hr",
            "actionText": "Turn Off Geyser"
        })

    # Rule 4: Phantom loads
    phantom_w = 0
    if r["livingRoom"]["appliances"]["tv"]["status"] == "standby": phantom_w += 15
    if r["livingRoom"]["appliances"]["console"]["status"] == "standby": phantom_w += 14
    if r["bedroom"]["appliances"]["laptop"]["status"] == "standby": phantom_w += 6
    if r["kitchen"]["appliances"]["microwave"]["status"] == "standby": phantom_w += 7

    if phantom_w >= 20:
        reminders.append({
            "id": "phantom_vampire_load",
            "severity": "warning",
            "title": f"Vampire / Phantom Load Alert ({phantom_w}W Idle)",
            "desc": "Consumer electronics drawing continuous standby power without active utility.",
            "ecoFact": "Phantom power accounts for 5% to 10% of total residential electricity consumption globally.",
            "impact": f"Save {phantom_w}W & 0.75 kg CO2/wk",
            "actionText": "Cut Standby Loads"
        })

    # Rule 5: Fridge open
    if r["kitchen"]["fridgeDoorOpen"]:
        reminders.append({
            "id": "fridge_door_open",
            "severity": "critical",
            "title": "Refrigerator Door Left Ajar!",
            "desc": "Cold air escaping causes compressor to ramp up to 320W continuously.",
            "ecoFact": "Leaving a refrigerator door ajar for 1 minute takes 10-15 minutes to recover its internal eco-temperature.",
            "impact": "Save 160W & protect food freshness",
            "actionText": "Close Fridge Door"
        })

    # Rule 6: Peak demand
    if is_peak:
        if r["bathroom"]["appliances"]["geyser"]["status"] == "on" or r["kitchen"]["appliances"]["microwave"]["status"] == "on":
            reminders.append({
                "id": "peak_demand_stress",
                "severity": "nudge",
                "title": "Peak Grid Stress Hours (6 PM – 10 PM)",
                "desc": "High-draw loads active during regional grid peak demand.",
                "ecoFact": "Grid peaker plants emit 25-40% more CO2 per kWh than baseload renewables.",
                "impact": "Shift load to off-peak",
                "actionText": "Acknowledge Peak"
            })

    state["activeReminders"] = reminders

# --- Background Worker Thread ---
def background_telemetry_loop():
    last_db_log_time = time.time()
    while True:
        time.sleep(1.0)
        with lock:
            if state["simSpeed"] > 0:
                delta_m = state["simSpeed"]
                state["simMinutes"] += delta_m

                # Vacancy counters
                for r_k, room in state["rooms"].items():
                    if not room["occupied"]:
                        room["vacantMinutes"] += delta_m
                    else:
                        room["vacantMinutes"] = 0

                # Geyser counter
                if state["rooms"]["bathroom"]["appliances"]["geyser"]["status"] == "on":
                    state["rooms"]["bathroom"]["geyserMinutes"] += delta_m
                else:
                    state["rooms"]["bathroom"]["geyserMinutes"] = 0

                update_wattages_backend()
                evaluate_rules_backend()

                watts = get_total_watts_backend()
                kwh_inc = (watts * (delta_m / 60.0)) / 1000.0
                state["totalKwh"] += kwh_inc

                # Calculate Eco-Score
                score = 100
                for rem in state["activeReminders"]:
                    if rem["severity"] == "critical": score -= 15
                    elif rem["severity"] == "warning": score -= 8
                    elif rem["severity"] == "nudge": score -= 4
                if watts > 2500: score -= 10
                elif watts > 1500: score -= 5
                state["ecoScore"] = max(35, min(100, score))

        # Log to SQLite every 5 seconds
        if time.time() - last_db_log_time >= 5.0:
            last_db_log_time = time.time()
            with lock:
                w = get_total_watts_backend()
                kwh = state["totalKwh"]
                co2 = kwh * SIM_CONFIG["emissionFactorKgPerKwh"]
                coal = (state["totalSavedKwh"] * SIM_CONFIG["coalKgPerKwh"])
                water = (state["totalSavedKwh"] * SIM_CONFIG["waterLitersPerKwh"])
                score = state["ecoScore"]
                
                h = int((state["simMinutes"] % 1440) / 60)
                m = int(state["simMinutes"] % 60)
                sim_str = f"{h:02d}:{m:02d}"

            log_telemetry_to_db(sim_str, w, kwh, co2, coal, water, score)

# --- HTTP Request Handler with REST API Routing ---
class EcoBackendHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        body = json.dumps(data).encode('utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def parse_json_body(self):
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len == 0: return {}
        raw = self.rfile.read(content_len)
        try:
            return json.loads(raw.decode('utf-8'))
        except:
            return {}

    # --- GET Endpoints ---
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/status":
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM energy_telemetry")
            telemetry_count = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM reminder_events")
            event_count = c.fetchone()[0]
            conn.close()

            self.send_json({
                "status": "online",
                "backend": "Python 3 Standard Server + SQLite3",
                "database": "ecosense.db",
                "telemetry_records": telemetry_count,
                "reminder_events_logged": event_count,
                "timestamp": datetime.now().isoformat()
            })
            return

        elif path == "/api/state":
            with lock:
                w = get_total_watts_backend()
                kwh = state["totalKwh"]
                co2 = kwh * SIM_CONFIG["emissionFactorKgPerKwh"]
                cost = kwh * SIM_CONFIG["costPerKwh"]
                
                resp = {
                    "simMinutes": state["simMinutes"],
                    "simSpeed": state["simSpeed"],
                    "currentWatts": w,
                    "totalKwh": round(kwh, 3),
                    "totalSavedKwh": round(state["totalSavedKwh"], 3),
                    "co2Kg": round(co2, 3),
                    "estCost": round(cost, 2),
                    "ecoScore": state["ecoScore"],
                    "rooms": state["rooms"],
                    "activeReminders": state["activeReminders"],
                    "config": SIM_CONFIG
                }
            self.send_json(resp)
            return

        elif path == "/api/history":
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM energy_telemetry ORDER BY id DESC LIMIT 20")
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            rows.reverse()
            self.send_json({"history": rows})
            return

        elif path == "/api/reminders/logs":
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM reminder_events ORDER BY id DESC LIMIT 25")
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            self.send_json({"logs": rows})
            return

        # Serve static assets (index.html, style.css, app.js, etc.)
        super().do_GET()

    # --- POST Endpoints ---
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_json_body()

        if path == "/api/appliance/toggle":
            room_key = body.get("room")
            app_key = body.get("appliance")
            with lock:
                if room_key in state["rooms"] and app_key in state["rooms"][room_key]["appliances"]:
                    app = state["rooms"][room_key]["appliances"][app_key]
                    app["status"] = "off" if app["status"] == "on" else "on"
                    update_wattages_backend()
                    evaluate_rules_backend()
            self.send_json({"success": True, "room": room_key, "appliance": app_key, "newStatus": app["status"]})
            return

        elif path == "/api/appliance/standby":
            room_key = body.get("room")
            app_key = body.get("appliance")
            with lock:
                if room_key in state["rooms"] and app_key in state["rooms"][room_key]["appliances"]:
                    app = state["rooms"][room_key]["appliances"][app_key]
                    if app["status"] == "on": app["status"] = "standby"
                    elif app["status"] == "standby": app["status"] = "off"
                    else: app["status"] = "on"
                    update_wattages_backend()
                    evaluate_rules_backend()
            self.send_json({"success": True, "room": room_key, "appliance": app_key, "newStatus": app["status"]})
            return

        elif path == "/api/appliance/ac-temp":
            new_temp = int(body.get("temp", 24))
            with lock:
                state["rooms"]["bedroom"]["acTemp"] = new_temp
                update_wattages_backend()
                evaluate_rules_backend()
            self.send_json({"success": True, "acTemp": new_temp})
            return

        elif path == "/api/room/occupancy":
            room_key = body.get("room")
            with lock:
                if room_key in state["rooms"]:
                    occ = not state["rooms"][room_key]["occupied"]
                    state["rooms"][room_key]["occupied"] = occ
                    if occ: state["rooms"][room_key]["vacantMinutes"] = 0
                    evaluate_rules_backend()
            self.send_json({"success": True, "room": room_key, "occupied": occ})
            return

        elif path == "/api/room/window":
            with lock:
                win = not state["rooms"]["bedroom"]["windowOpen"]
                state["rooms"]["bedroom"]["windowOpen"] = win
                update_wattages_backend()
                evaluate_rules_backend()
            self.send_json({"success": True, "windowOpen": win})
            return

        elif path == "/api/room/fridge-door":
            with lock:
                fr = not state["rooms"]["kitchen"]["fridgeDoorOpen"]
                state["rooms"]["kitchen"]["fridgeDoorOpen"] = fr
                update_wattages_backend()
                evaluate_rules_backend()
            self.send_json({"success": True, "fridgeDoorOpen": fr})
            return

        elif path == "/api/reminders/fix":
            rem_id = body.get("reminderId")
            with lock:
                kwh_saved = 0.15
                action_name = "Remediated"
                if rem_id == "vacant_living_room":
                    state["rooms"]["livingRoom"]["appliances"]["fan"]["status"] = "off"
                    state["rooms"]["livingRoom"]["appliances"]["lights"]["status"] = "off"
                    action_name = "Turned Off Empty Living Room"
                elif rem_id == "ac_temp_nudge":
                    state["rooms"]["bedroom"]["acTemp"] = 24
                    action_name = "Optimized AC to 24°C"
                elif rem_id == "ac_window_open":
                    state["rooms"]["bedroom"]["windowOpen"] = False
                    action_name = "Sealed Bedroom Window"
                elif rem_id == "geyser_overrun":
                    state["rooms"]["bathroom"]["appliances"]["geyser"]["status"] = "off"
                    state["rooms"]["bathroom"]["geyserMinutes"] = 0
                    action_name = "Shut Down Overheated Geyser"
                elif rem_id == "phantom_vampire_load":
                    state["rooms"]["livingRoom"]["appliances"]["tv"]["status"] = "off"
                    state["rooms"]["livingRoom"]["appliances"]["console"]["status"] = "off"
                    state["rooms"]["bedroom"]["appliances"]["laptop"]["status"] = "off"
                    state["rooms"]["kitchen"]["appliances"]["microwave"]["status"] = "off"
                    action_name = "Cut All Standby Vampire Power"
                elif rem_id == "fridge_door_open":
                    state["rooms"]["kitchen"]["fridgeDoorOpen"] = False
                    action_name = "Sealed Refrigerator Door"

                state["totalSavedKwh"] += kwh_saved
                update_wattages_backend()
                evaluate_rules_backend()

            # Record in SQLite database
            log_reminder_event_to_db(rem_id, "resolved", "Green Nudge Executed", "Saved energy via reminder", action_name, kwh_saved)
            self.send_json({"success": True, "reminderId": rem_id, "action": action_name, "kwhSaved": kwh_saved})
            return

        elif path == "/api/scenario":
            scen = body.get("scenario")
            r = state["rooms"]
            with lock:
                if scen == "wasteful":
                    r["livingRoom"]["occupied"] = False
                    r["livingRoom"]["vacantMinutes"] = 25
                    r["livingRoom"]["appliances"]["fan"]["status"] = "on"
                    r["livingRoom"]["appliances"]["lights"]["status"] = "on"
                    r["livingRoom"]["appliances"]["tv"]["status"] = "standby"
                    r["livingRoom"]["appliances"]["console"]["status"] = "standby"

                    r["bedroom"]["occupied"] = True
                    r["bedroom"]["windowOpen"] = True
                    r["bedroom"]["acTemp"] = 18
                    r["bedroom"]["appliances"]["ac"]["status"] = "on"
                    r["bedroom"]["appliances"]["laptop"]["status"] = "standby"

                    r["kitchen"]["fridgeDoorOpen"] = True
                    r["kitchen"]["appliances"]["fridge"]["status"] = "on"
                    r["kitchen"]["appliances"]["microwave"]["status"] = "standby"

                    r["bathroom"]["appliances"]["geyser"]["status"] = "on"
                    r["bathroom"]["geyserMinutes"] = 35
                    state["simMinutes"] = 19 * 60
                elif scen == "eco":
                    r["livingRoom"]["occupied"] = True
                    r["livingRoom"]["vacantMinutes"] = 0
                    r["livingRoom"]["appliances"]["fan"]["status"] = "on"
                    r["livingRoom"]["appliances"]["lights"]["status"] = "off"
                    r["livingRoom"]["appliances"]["tv"]["status"] = "off"
                    r["livingRoom"]["appliances"]["console"]["status"] = "off"

                    r["bedroom"]["occupied"] = True
                    r["bedroom"]["windowOpen"] = False
                    r["bedroom"]["acTemp"] = 24
                    r["bedroom"]["appliances"]["ac"]["status"] = "on"
                    r["bedroom"]["appliances"]["laptop"]["status"] = "off"

                    r["kitchen"]["fridgeDoorOpen"] = False
                    r["kitchen"]["appliances"]["fridge"]["status"] = "on"
                    r["kitchen"]["appliances"]["microwave"]["status"] = "off"

                    r["bathroom"]["appliances"]["geyser"]["status"] = "off"
                    r["bathroom"]["geyserMinutes"] = 0
                    state["simMinutes"] = 14 * 60
                elif scen == "vacation":
                    for r_k in r:
                        r[r_k]["occupied"] = False
                    r["livingRoom"]["appliances"]["tv"]["status"] = "standby"
                    r["livingRoom"]["appliances"]["console"]["status"] = "standby"
                    r["bedroom"]["appliances"]["laptop"]["status"] = "standby"
                    r["kitchen"]["appliances"]["microwave"]["status"] = "standby"
                    r["kitchen"]["appliances"]["fridge"]["status"] = "on"

                update_wattages_backend()
                evaluate_rules_backend()

            self.send_json({"success": True, "scenario": scen})
            return

        elif path == "/api/iot/telemetry":
            # Endpoint for simulated or real IoT nodes (e.g., ESP32 / Arduino / CT clamp)
            sensor_id = body.get("sensor_id", "ESP32_UNKNOWN")
            sensor_type = body.get("type", "current")
            val = float(body.get("value", 0.0))
            unit = body.get("unit", "W")

            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("INSERT INTO iot_sensor_logs (received_at, sensor_id, sensor_type, reading_value, unit) VALUES (?, ?, ?, ?, ?)",
                      (datetime.now().isoformat(), sensor_id, sensor_type, val, unit))
            conn.commit()
            conn.close()

            self.send_json({"success": True, "message": "IoT Telemetry ingested into SQLite", "sensor_id": sensor_id})
            return

        elif path == "/api/audit/save":
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            m_kwh = float(body.get("monthlyKwh", 0))
            m_co2 = float(body.get("monthlyCo2", 0))
            score = int(body.get("score", 85))
            grade = body.get("grade", "Grade A")
            summary = json.dumps(body.get("summary", {}))

            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("INSERT INTO audit_reports (created_at, monthly_kwh, monthly_co2, eco_score, rating_grade, summary_json) VALUES (?, ?, ?, ?, ?, ?)",
                      (now_str, m_kwh, m_co2, score, grade, summary))
            report_id = c.lastrowid
            conn.commit()
            conn.close()

            self.send_json({"success": True, "reportId": report_id, "savedAt": now_str})
            return

        self.send_json({"error": "Endpoint Not Found"}, status=404)

# --- Server Startup ---
def run_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    init_database()

    # Launch background telemetry loop thread
    t = threading.Thread(target=background_telemetry_loop, daemon=True)
    t.start()
    print("[+] Background Environmental Calculation Thread started.")

    port = PORT
    for attempt in range(5):
        try:
            with socketserver.TCPServer(("", port), EcoBackendHandler) as httpd:
                url = f"http://localhost:{port}"
                print("=" * 65)
                print("  [EcoSense] Python REST API & SQLite Backend Server")
                print("  Environmental Studies Capstone Project")
                print("=" * 65)
                print(f"  [+] Server Listening at: {url}")
                print(f"  [+] SQLite Database File: {DB_FILE}")
                print(f"  [+] REST API Base URL: {url}/api/state")
                print(f"  [+] Opening browser automatically...")
                print("  [+] Press Ctrl+C in this terminal window to stop the server.")
                print("=" * 65)
                webbrowser.open(url)
                httpd.serve_forever()
                break
        except OSError:
            port += 1
            continue

if __name__ == "__main__":
    try:
        run_server()
    except KeyboardInterrupt:
        print("\n[+] EcoSense Server stopped gracefully. Goodbye!")
        sys.exit(0)
