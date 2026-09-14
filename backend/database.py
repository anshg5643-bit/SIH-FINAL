import json
import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).resolve().parent.parent / "stressmitra.db"

def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c

def init_db():
    c = conn()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'personnel',
        unit TEXT DEFAULT 'Alpha Unit',
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        duty_hours REAL, sleep_hours REAL, fatigue REAL, mood REAL,
        focus REAL, social_support REAL, recovery_gap REAL, workload REAL,
        risk_probability REAL, risk_level TEXT, factors_json TEXT,
        actions_json TEXT, created_at TEXT NOT NULL,
        last_trip TEXT DEFAULT '', duty_location TEXT DEFAULT '',
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS interventions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        personnel_id INTEGER NOT NULL,
        owner_id INTEGER,
        status TEXT NOT NULL DEFAULT 'Open',
        priority TEXT NOT NULL DEFAULT 'Medium',
        action TEXT NOT NULL,
        notes TEXT DEFAULT '',
        due_date TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        personnel_id INTEGER NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        acknowledged INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER,
        action TEXT NOT NULL,
        target TEXT DEFAULT '',
        created_at TEXT NOT NULL
    );
    """)
    c.commit()
    # Migrate older databases created before last_trip / duty_location existed.
    existing_cols = {row["name"] for row in c.execute("PRAGMA table_info(checkins)").fetchall()}
    for col in ("last_trip", "duty_location"):
        if col not in existing_cols:
            c.execute(f"ALTER TABLE checkins ADD COLUMN {col} TEXT DEFAULT ''")
    c.commit()
    c.close()

def seed_demo():
    c = conn()
    users = [
        ("personnel01","demo123","Aarav Singh","personnel","Alpha Unit"),
        ("welfare01","demo123","Welfare Officer","welfare_officer","Alpha Unit"),
        ("commander01","demo123","Unit Commander","commander","Alpha Unit"),
        ("admin01","demo123","System Admin","admin","HQ"),
    ]
    import hashlib
    # Extra personnel demo records make the welfare portal useful immediately.
    users.extend([
        ("personnel02","demo123","Meera Sharma","personnel","Bravo Unit"),
        ("personnel03","demo123","Rohan Verma","personnel","Charlie Unit"),
    ])
    for u,p,n,r,unit in users:
        h = hashlib.sha256(p.encode()).hexdigest()
        c.execute("INSERT OR IGNORE INTO users(username,password_hash,full_name,role,unit,created_at) VALUES(?,?,?,?,?,?)",
                  (u,h,n,r,unit,datetime.utcnow().isoformat()))

    # Seed a few clearly-labelled prototype welfare alerts so the Welfare Officer
    # portal is not empty on first launch. They are demo records, not real alerts.
    personnel = c.execute("SELECT id, username, full_name FROM users WHERE role='personnel' ORDER BY id").fetchall()
    existing_alerts = c.execute("SELECT COUNT(*) AS n FROM alerts").fetchone()["n"]
    if existing_alerts == 0 and personnel:
        now = datetime.utcnow().isoformat()
        demo_alerts = [
            (personnel[0]["id"], "High", "Prototype alert: elevated workload and reduced recovery signal. Welfare review recommended."),
            (personnel[1]["id"] if len(personnel)>1 else personnel[0]["id"], "Medium", "Prototype alert: repeated late-shift pattern suggests a supportive check-in."),
            (personnel[2]["id"] if len(personnel)>2 else personnel[0]["id"], "Medium", "Prototype alert: current wellbeing check suggests a recovery conversation may help."),
        ]
        for pid, level, message in demo_alerts:
            c.execute("INSERT INTO alerts(personnel_id,level,message,acknowledged,created_at) VALUES(?,?,?,?,?)",
                      (pid, level, message, 0, now))
    # Seed synthetic check-ins so the demo Overview and risk charts are populated immediately.
    # These records are clearly synthetic prototype data, not field performance evidence.
    existing_checkins = c.execute("SELECT COUNT(*) AS n FROM checkins").fetchone()["n"]
    if existing_checkins == 0 and personnel:
        from datetime import timedelta
        now_dt = datetime.utcnow()
        demo_rows = [
            (personnel[0]["id"], 10.5, 5.5, 6.5, 4.5, 5.0, 6.0, 4.0, 7.5, 0.74, "High"),
            (personnel[1]["id"], 9.0, 6.5, 4.5, 6.0, 6.5, 7.0, 2.0, 5.5, 0.46, "Medium"),
            (personnel[2]["id"], 8.0, 7.5, 2.5, 7.5, 8.0, 8.0, 1.0, 3.5, 0.18, "Low"),
        ]
        for offset in range(7):
            for j, row in enumerate(demo_rows):
                pid,duty,sleep,fatigue,mood,focus,support,recovery,workload,prob,level=row
                # Small day-to-day variation creates a readable trend chart.
                delta=(offset-3)*0.025
                pprob=max(0.05,min(0.92,prob+delta+(j-1)*0.01))
                created=(now_dt-timedelta(days=6-offset, hours=j)).isoformat()
                factors=json.dumps(["Synthetic prototype trend", "Recovery/load pattern"])
                actions=json.dumps(["Review with welfare staff", "Consider recovery planning"])
                c.execute("INSERT INTO checkins(user_id,duty_hours,sleep_hours,fatigue,mood,focus,social_support,recovery_gap,workload,risk_probability,risk_level,factors_json,actions_json,created_at,last_trip,duty_location) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (pid,duty,sleep,fatigue,mood,focus,support,recovery,workload,pprob,level,factors,actions,created,"","Demo Unit"))

    c.commit()
    c.close()
