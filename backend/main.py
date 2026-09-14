from fastapi import FastAPI, Header, HTTPException, Response, UploadFile, File, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from datetime import datetime
import json, io, csv, statistics, re, os, secrets, urllib.parse, urllib.request, urllib.error

from backend.database import conn, init_db, seed_demo
from backend.auth import verify, get_user, logout, hash_password
from backend.models import LoginRequest, RegisterRequest, CheckinRequest, InterventionRequest, ImportRequest
from backend.ml import predict, predict_many, load_bundle
from backend.wellbeing_recs import recommend_vacations, recommend_breathing

app = FastAPI(title="StressMitra Command & Welfare Intelligence API", version="2.0")

init_db()
seed_demo()

frontend = __import__("pathlib").Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=frontend), name="static")
music_dir = frontend.parent / "music"
if music_dir.exists():
    app.mount("/music", StaticFiles(directory=music_dir), name="music")



GOOGLE_CLIENT_PATH = frontend.parent / "config" / "google-client-id.txt"
JAMENDO_CLIENT_PATH = frontend.parent / "config" / "jamendo-client-id.txt"
GROQ_API_KEY_PATH = frontend.parent / "config" / "groq-api-key.txt"
GOOGLE_MAPS_KEY_PATH = frontend.parent / "config" / "google-maps-api-key.txt"
HEALTH_REPORT_DIR = frontend.parent / "health_reports"
HEALTH_REPORT_DIR.mkdir(exist_ok=True)

def google_maps_api_key():
    env = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if env:
        return env
    try:
        return GOOGLE_MAPS_KEY_PATH.read_text(encoding="utf-8").strip()
    except Exception:
        return ""

def google_client_id():
    env = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if env:
        return env
    try:
        return GOOGLE_CLIENT_PATH.read_text(encoding="utf-8").strip()
    except Exception:
        return ""

def jamendo_client_id():
    env = os.getenv("JAMENDO_CLIENT_ID", "").strip()
    if env:
        return env
    try:
        return JAMENDO_CLIENT_PATH.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def groq_api_key():
    env = os.getenv("GROQ_API_KEY", "").strip()
    if env:
        return env
    try:
        return GROQ_API_KEY_PATH.read_text(encoding="utf-8").strip()
    except Exception:
        return ""

def groq_chat(message, context):
    key = groq_api_key()
    if not key:
        return None
    try:
        from groq import Groq
        client = Groq(api_key=key)
        system = (
            "You are StressMitra AI Assistant, a supportive welfare and wellbeing assistant "
            "for uniformed-service personnel. Give concise, practical, non-diagnostic guidance. "
            "Do not make medical diagnoses or present risk scores as certainty. Encourage appropriate "
            "welfare/medical support when concerns are serious. Never give instructions for self-harm "
            "or dangerous activities. You can explain the StressMitra dashboard, recovery habits, "
            "workload and sleep observations, Jamendo music, nearby recovery places, and welfare alerts. "
            "If context contains personal dashboard data, use it only to explain the provided information; "
            "do not infer sensitive facts that are not present.\n\n"
            f"Current StressMitra context: {json.dumps(context, ensure_ascii=False)}"
        )
        completion = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": message}
            ],
            temperature=0.4,
            max_tokens=500,
        )
        return (completion.choices[0].message.content or "").strip() or None
    except Exception as exc:
        print(f"Groq assistant unavailable: {exc}")
        return None

def public_google_user(profile):
    return {
        "username": str(profile.get("email","")).lower(),
        "full_name": profile.get("name") or profile.get("email") or "Google user",
        "role": "personnel",
        "unit": "Google account",
        "email": str(profile.get("email","")).lower()
    }

def current_user(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    u = get_user(authorization.split(" ",1)[1])
    if not u:
        raise HTTPException(401, "Invalid or expired session")
    return u

def audit(actor_id, action, target=""):
    c=conn(); c.execute("INSERT INTO audit_logs(actor_id,action,target,created_at) VALUES(?,?,?,?)",
                        (actor_id,action,target,datetime.utcnow().isoformat())); c.commit(); c.close()

@app.get("/")
def home():
    return FileResponse(frontend / "index.html")

@app.get("/api/health")
def health():
    return {"status":"ok","service":"StressMitra","version":"2.0"}

@app.post("/api/auth/login")
def login(req: LoginRequest):
    result = verify(req.username, req.password)
    if not result:
        raise HTTPException(401, "Invalid username or password")
    token,user=result
    portal=(req.portal or "personnel").lower()
    allowed = (
        user["role"] == "personnel"
        if portal == "personnel"
        else user["role"] in {"welfare_officer","commander","admin"}
    )
    if not allowed:
        logout(token)
        if portal == "personnel":
            raise HTTPException(403, "This account belongs to the Welfare/Command portal. Choose the Welfare Officer portal.")
        raise HTTPException(403, "This account belongs to the Personnel portal. Choose the Personnel portal.")
    audit(user["id"],"login",f"{user['username']}:{portal}")
    return {"token":token,"user":user,"portal":portal,
            "account":{"id":user["id"],"name":user["full_name"],"email":user["username"],"role":user["role"],"unit":user["unit"]}}

@app.get("/api/config")
def config():
    return {"googleClientId": google_client_id(), "googleMapsApiKey": google_maps_api_key(), "jamendoConfigured": bool(jamendo_client_id()), "groqConfigured": bool(groq_api_key())}

@app.get("/api/jamendo/search")
def jamendo_search(category: str = "Calm"):
    """Search Jamendo's public read API and return playable stream URLs.

    Jamendo read APIs require a client_id, but do not require OAuth for public
    catalog search. The client id is kept in config/jamendo-client-id.txt.
    """
    client_id = jamendo_client_id()
    if not client_id:
        raise HTTPException(503, "Jamendo is not configured. Add your Jamendo client ID to config/jamendo-client-id.txt and restart StressMitra.")
    tags = {
        "Calm": "relaxing chill ambient",
        "Focus": "focus instrumental study",
        "Energetic": "upbeat energetic positive",
        "Romantic": "romantic instrumental"
    }
    selected = category if category in tags else "Calm"
    params = urllib.parse.urlencode({
        "client_id": client_id,
        "format": "json",
        "limit": 10,
        "fuzzytags": tags[selected],
        "audioformat": "mp32",
        "include": "musicinfo"
    })
    url = "https://api.jamendo.com/v3.0/tracks/?" + params
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "StressMitra/2.0"})
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
        tracks = []
        for item in data.get("results", []):
            audio = item.get("audio") or ""
            if not audio:
                continue
            tracks.append({
                "id": str(item.get("id", "")),
                "name": item.get("name", ""),
                "artist": item.get("artist_name", ""),
                "audio": audio,
                "url": item.get("shareurl", "") or f"https://www.jamendo.com/track/{item.get('id','')}",
                "image": item.get("album_image") or item.get("image") or "",
                "license": item.get("license_ccurl", ""),
                "downloadAllowed": bool(item.get("audiodownload_allowed", False))
            })
        return {"category": selected, "tracks": tracks}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise HTTPException(502, f"Jamendo API returned HTTP {exc.code}: {detail}")
    except Exception as exc:
        raise HTTPException(502, f"Jamendo search failed: {exc}")

@app.post("/api/assistant/chat")
def assistant_chat(payload: dict, authorization: str | None = Header(default=None)):
    # General chat works without login; a valid session adds latest check-in context.
    user = None
    if authorization and authorization.startswith("Bearer "):
        try:
            user = get_user(authorization.split(" ",1)[1])
        except Exception:
            user = None
    if not user:
        user = {"id": None, "full_name": "there", "role": "guest", "unit": ""}

    message = str(payload.get("message") or "").strip()
    if not message:
        raise HTTPException(400, "Message is required.")

    c = conn()
    latest = None
    open_alerts = 0
    if user.get("id"):
        latest = c.execute(
            "SELECT risk_level,risk_probability,sleep_hours,duty_hours,workload,mood,focus,social_support,recovery_gap,created_at FROM checkins WHERE user_id=? ORDER BY id DESC LIMIT 1",
            (user["id"],)
        ).fetchone()
        if user.get("role") == "personnel":
            open_alerts = c.execute(
                "SELECT COUNT(*) AS n FROM alerts WHERE personnel_id=? AND acknowledged=0",
                (user["id"],)
            ).fetchone()["n"]
    c.close()

    if latest:
        context = {
            "name": user.get("full_name", "there"),
            "role": user.get("role"),
            "unit": user.get("unit"),
            "latest_screening": {
                "risk_level": latest["risk_level"],
                "risk_probability": round(float(latest["risk_probability"] or 0) * 100),
                "sleep_hours": latest["sleep_hours"],
                "duty_hours": latest["duty_hours"],
                "workload": latest["workload"],
                "mood": latest["mood"],
                "focus": latest["focus"],
                "social_support": latest["social_support"],
                "recovery_gap": latest["recovery_gap"],
            },
            "open_welfare_alerts": open_alerts,
        }
    else:
        context = {"name": user.get("full_name", "there"), "role": user.get("role"), "unit": user.get("unit"), "latest_screening": None, "open_welfare_alerts": 0}

    # Prefer Groq when configured. The local assistant remains as a fallback if the API is unavailable.
    groq_reply = groq_chat(message, context)
    if groq_reply:
        return {"reply": groq_reply, "provider": "groq", "context": context}

    text = message.lower()
    name = user.get("full_name", "there").split()[0]
    latest_screening = context.get("latest_screening") or {}
    risk = latest_screening.get("risk_level") or "No recent screening"
    prob = latest_screening.get("risk_probability", 0)
    sleep = float(latest_screening.get("sleep_hours") or 0)
    duty = float(latest_screening.get("duty_hours") or 0)
    workload = float(latest_screening.get("workload") or 0)
    if any(k in text for k in ("music", "song", "jamendo", "audio")):
        reply = "Open Music → Jamendo Player to choose Calm, Focus, Energetic or Recommended music."
    elif any(k in text for k in ("place", "park", "walk", "nearby", "map", "route")):
        reply = "Open Recommendations → Nearby recovery places, allow browser location, then use Route for a walking route or Open map."
    elif any(k in text for k in ("sleep", "tired", "rest", "recover")):
        reply = f"Your latest recorded sleep was {sleep:g} hours. Protect a consistent recovery window and discuss workload adjustments with welfare staff if recovery is difficult."
    elif any(k in text for k in ("duty", "workload", "hours", "shift")):
        reply = f"Your latest recorded duty was {duty:g} hours and workload score was {workload:g}/10. These are observations, not medical limits or orders."
    elif any(k in text for k in ("stress", "stressed", "anxious", "overwhelmed")):
        reply = f"I can help you make a small recovery plan, {name}. Your latest advisory risk is {risk}. Consider a short pause and talking with a trusted welfare contact if you are finding things difficult."
    elif any(k in text for k in ("alert", "warning", "risk")):
        reply = f"Your latest screening is {risk} ({prob}% advisory probability), with {context['open_welfare_alerts']} open welfare alert(s). This is a support signal, not a diagnosis."
    else:
        reply = "I can help with your wellbeing signal, sleep/recovery, workload, welfare alerts, Jamendo music, nearby reset places, or StressMitra features."
    return {"reply": reply, "provider": "local-fallback", "context": context}

@app.post("/api/auth/google")
def google_login(payload: dict):
    client_id = google_client_id()
    if not client_id:
        raise HTTPException(503, "Google sign-in is not configured. Add your OAuth Web Client ID to config/google-client-id.txt and restart StressMitra.")
    credential = str(payload.get("credential") or "")
    if not credential:
        raise HTTPException(400, "Google credential is missing.")
    try:
        query = urllib.parse.urlencode({"id_token": credential})
        with urllib.request.urlopen("https://oauth2.googleapis.com/tokeninfo?" + query, timeout=8) as response:
            profile = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(401, "Google account could not be verified. Check your internet connection and OAuth configuration.")
    if str(profile.get("aud","")) != client_id or str(profile.get("email_verified","")).lower() != "true":
        raise HTTPException(401, "Google account could not be verified for this prototype.")
    email = str(profile.get("email","")).strip().lower()
    if not email:
        raise HTTPException(401, "Google did not return a verified email address.")
    c=conn()
    row=c.execute("SELECT * FROM users WHERE username=?",(email,)).fetchone()
    if row:
        user=dict(row)
    else:
        full_name=str(profile.get("name") or email)
        random_password=secrets.token_urlsafe(32)
        c.execute("INSERT INTO users(username,password_hash,full_name,role,unit,created_at) VALUES(?,?,?,?,?,?)",
                  (email,hash_password(random_password),full_name,"personnel","Google account",datetime.utcnow().isoformat()))
        c.commit()
        user=dict(c.execute("SELECT * FROM users WHERE username=?",(email,)).fetchone())
    c.close()
    token = secrets.token_urlsafe(32)
    # Persist the Google session as well, so the check-in endpoint sees the same
    # authenticated user after refresh/reload.
    c2 = conn()
    c2.execute("INSERT OR REPLACE INTO sessions(token,user_id,created_at) VALUES(?,?,?)",
               (token, user["id"], datetime.utcnow().isoformat()))
    c2.commit(); c2.close()
    from backend.auth import SESSIONS
    SESSIONS[token] = user
    public={"id":user["id"],"username":user["username"],"full_name":user["full_name"],"role":user["role"],"unit":user["unit"]}
    return {"token":token,"user":public,"account":{"id":user["id"],"name":user["full_name"],"email":user["username"],"role":user["role"],"unit":user["unit"]}}

@app.get("/api/auth/me")
def auth_me(authorization: str | None = Header(default=None)):
    """Verify that the browser's stored session token is still valid."""
    return current_user(authorization)

@app.post("/api/auth/logout")
def do_logout(authorization: str | None = Header(default=None)):
    u=current_user(authorization); logout(authorization.split(" ",1)[1]); audit(u["id"],"logout",u["username"])
    return {"ok":True}

@app.post("/api/auth/register")
def register(req: RegisterRequest, authorization: str | None = Header(default=None)):
    if len(req.password) < 6:
        raise HTTPException(400, "Password must contain at least 6 characters")
    if not req.username.strip() or not req.full_name.strip() or not req.unit.strip():
        raise HTTPException(400, "Full name, username and unit are required")
    # Self-registration is intentionally limited to personnel.
    c=conn()
    try:
        c.execute("INSERT INTO users(username,password_hash,full_name,role,unit,created_at) VALUES(?,?,?,?,?,?)",
                  (req.username,hash_password(req.password),req.full_name,"personnel",req.unit,datetime.utcnow().isoformat()))
        c.commit()
    except Exception:
        raise HTTPException(400,"Username already exists")
    finally: c.close()
    token,user = verify(req.username, req.password)
    audit(user["id"],"register",user["username"])
    return {"token":token,"user":user,"account":{"id":user["id"],"name":user["full_name"],"email":user["username"],"role":user["role"],"unit":user["unit"]}}

@app.post("/api/predict/preview")
def predict_preview(req: CheckinRequest, authorization: str | None = Header(default=None)):
    """Non-persisting prediction used for live sliders / what-if exploration.
    Does not create a check-in record, alert, or audit entry."""
    current_user(authorization)
    return predict(req.model_dump())

@app.post("/api/health-report")
async def health_report(request: Request, authorization: str | None = Header(default=None), x_filename: str | None = Header(default=None)):
    u=current_user(authorization)
    content_type=request.headers.get("content-type","").split(";")[0].lower()
    if content_type != "application/pdf":
        raise HTTPException(415, "Only PDF health reports are accepted.")
    raw=await request.body()
    if len(raw)>8*1024*1024:
        raise HTTPException(413, "Health report is too large. Maximum size is 8 MB.")
    if not raw:
        raise HTTPException(400, "The PDF is empty.")
    filename=urllib.parse.unquote(x_filename or "health-report.pdf")
    safe=re.sub(r"[^A-Za-z0-9._-]+","_",filename)[:120] or "health-report.pdf"
    if not safe.lower().endswith(".pdf"):
        safe += ".pdf"
    stamp=datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    path=HEALTH_REPORT_DIR / f"{u['id']}_{stamp}_{safe}"
    path.write_bytes(raw)
    audit(u["id"],"health_report_upload",safe)
    return {"ok":True,"filename":safe,"size":len(raw),"message":"PDF received for authorised human review. It is not automatically interpreted as a diagnosis."}


@app.post("/api/checkins-with-report")
async def create_checkin_with_report(
    request: Request,
    authorization: str | None = Header(default=None),
):
    """Save the check-in and optional PDF in one authenticated request.
    This avoids losing the session between two separate browser requests.
    """
    u=current_user(authorization)
    form=await request.form()
    def num(name, default=0.0):
        try: return float(form.get(name, default))
        except (TypeError, ValueError): raise HTTPException(422, f"Invalid value for {name}")
    last_trip=str(form.get("last_trip","") or "").strip()[:200]
    duty_location=str(form.get("duty_location","") or "").strip()[:200]
    req=CheckinRequest(
        duty_hours=num("duty_hours"), sleep_hours=num("sleep_hours"),
        fatigue=num("fatigue"), mood=num("mood"), focus=num("focus"),
        social_support=num("social_support"), recovery_gap=num("recovery_gap"),
        workload=num("workload"), last_trip=last_trip, duty_location=duty_location
    )
    out=predict(req.model_dump())
    c=conn()
    cur=c.execute("""INSERT INTO checkins(user_id,duty_hours,sleep_hours,fatigue,mood,focus,social_support,recovery_gap,workload,
        risk_probability,risk_level,factors_json,actions_json,created_at,last_trip,duty_location) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (u["id"],req.duty_hours,req.sleep_hours,req.fatigue,req.mood,req.focus,req.social_support,req.recovery_gap,req.workload,
         out["risk_probability"],out["risk_level"],json.dumps(out["factors"]),json.dumps(out["actions"]),datetime.utcnow().isoformat(),
         last_trip,duty_location))
    if out["risk_level"]=="High":
        c.execute("INSERT INTO alerts(personnel_id,level,message,created_at) VALUES(?,?,?,?)",
                  (u["id"],"High","High-risk wellness check-in requires welfare review.",datetime.utcnow().isoformat()))
    c.commit(); c.close(); audit(u["id"],"checkin",str(cur.lastrowid))

    report_status=None
    report=form.get("health_report")
    if report is not None and hasattr(report,"read"):
        filename=getattr(report,"filename","") or "health-report.pdf"
        content_type=(getattr(report,"content_type","") or "").lower()
        if not (filename.lower().endswith(".pdf") or content_type=="application/pdf"):
            raise HTTPException(415,"Health report must be a PDF file.")
        raw=await report.read()
        if len(raw)>8*1024*1024: raise HTTPException(413,"Health report is too large. Maximum size is 8 MB.")
        if not raw: raise HTTPException(400,"The PDF is empty.")
        safe=re.sub(r"[^A-Za-z0-9._-]+","_",urllib.parse.unquote(filename))[:120] or "health-report.pdf"
        if not safe.lower().endswith(".pdf"): safe += ".pdf"
        stamp=datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        path=HEALTH_REPORT_DIR / f"{u['id']}_{stamp}_{safe}"
        path.write_bytes(raw); audit(u["id"],"health_report_upload",safe)
        report_status={"filename":safe,"size":len(raw)}

    probability=float(out["risk_probability"]); risk_score=round(probability*100)
    plan=build_condition_plan(req.model_dump(),out["risk_level"],probability)
    vacation_spots,vacation_note=recommend_vacations(duty_location,last_trip)
    breathing_primary,breathing_alternates=recommend_breathing(out["risk_level"])
    recommendations={
        "music":"Low-tempo focus flow" if risk_score>=67 else ("Clear-head instrumental" if risk_score>=45 else "Calm stress-relief ringtone"),
        "place":"Quiet recovery space with a short walk" if risk_score>=67 else ("Familiar low-stimulation route" if risk_score>=45 else "Comfortable outdoor break"),
        "yoga":"Gentle shoulder & spine reset" if risk_score>=67 else ("Desk recovery flow" if risk_score>=45 else "Breath & balance reset"),
        "targetDutyHours":plan["targets"]["duty_hours"],"targetSleepHours":plan["targets"]["sleep_hours"],"targetWorkload":plan["targets"]["workload"],
        "vacationSpots":vacation_spots,"vacationNote":vacation_note,
        "breathing":{"primary":breathing_primary,"alternates":breathing_alternates}
    }
    return {"id":cur.lastrowid,**out,"prediction":{"riskScore":risk_score,"riskLevel":out["risk_level"],"riskProbability":probability},"recommendations":recommendations,"report":report_status}

@app.post("/api/checkins")
def create_checkin(req: CheckinRequest, authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    out=predict(req.model_dump())
    c=conn()
    cur=c.execute("""INSERT INTO checkins(user_id,duty_hours,sleep_hours,fatigue,mood,focus,social_support,recovery_gap,workload,
        risk_probability,risk_level,factors_json,actions_json,created_at,last_trip,duty_location) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (u["id"],req.duty_hours,req.sleep_hours,req.fatigue,req.mood,req.focus,req.social_support,req.recovery_gap,req.workload,
         out["risk_probability"],out["risk_level"],json.dumps(out["factors"]),json.dumps(out["actions"]),datetime.utcnow().isoformat(),
         req.last_trip or "",req.duty_location or ""))
    if out["risk_level"]=="High":
        c.execute("INSERT INTO alerts(personnel_id,level,message,created_at) VALUES(?,?,?,?)",
                  (u["id"],"High","High-risk wellness check-in requires welfare review.",datetime.utcnow().isoformat()))
    c.commit(); c.close(); audit(u["id"],"checkin",str(cur.lastrowid))
    probability=float(out["risk_probability"])
    risk_score=round(probability*100)
    plan=build_condition_plan(req.model_dump(), out["risk_level"], probability)
    vacation_spots,vacation_note=recommend_vacations(req.duty_location,req.last_trip)
    breathing_primary,breathing_alternates=recommend_breathing(out["risk_level"])
    recommendations={
        "music": "Low-tempo focus flow" if risk_score>=67 else ("Clear-head instrumental" if risk_score>=45 else "Calm stress-relief ringtone"),
        "place": "Quiet recovery space with a short walk" if risk_score>=67 else ("Familiar low-stimulation route" if risk_score>=45 else "Comfortable outdoor break"),
        "yoga": "Gentle shoulder & spine reset" if risk_score>=67 else ("Desk recovery flow" if risk_score>=45 else "Breath & balance reset"),
        "targetDutyHours": plan["targets"]["duty_hours"],
        "targetSleepHours": plan["targets"]["sleep_hours"],
        "targetWorkload": plan["targets"]["workload"],
        "vacationSpots": vacation_spots, "vacationNote": vacation_note,
        "breathing": {"primary": breathing_primary, "alternates": breathing_alternates}
    }
    return {"id":cur.lastrowid,**out,"prediction":{"riskScore":risk_score,"riskLevel":out["risk_level"],"riskProbability":probability},"recommendations":recommendations}



def build_condition_plan(payload, risk_level, probability):
    """Create configurable welfare guardrails from the current screening condition.
    These are prototype decision-support targets, not medical orders or fixed operational rules.
    """
    duty = float(payload.get("duty_hours", 8))
    sleep = float(payload.get("sleep_hours", 7))
    fatigue = float(payload.get("fatigue", 4))
    workload = float(payload.get("workload", 5))
    recovery = float(payload.get("recovery_gap", 7))

    if risk_level == "High" or probability >= 0.67:
        duty_target = "≤ 8 h/day until reviewed"
        workload_target = "3–5 / 10"
        recovery_target = "Recovery opportunity within 24–48 h"
        priority = "High"
    elif risk_level == "Medium" or probability >= 0.34:
        duty_target = "≤ 9 h/day with recovery breaks"
        workload_target = "4–6 / 10"
        recovery_target = "Recovery opportunity within 3–7 days"
        priority = "Medium"
    else:
        duty_target = "≤ 10 h/day"
        workload_target = "4–7 / 10"
        recovery_target = "Maintain routine recovery / leave plan"
        priority = "Routine"

    # Sleep target is consistent because the model should not infer an exact medical sleep prescription.
    sleep_target = "7–9 h/night"
    targets = {
        "duty_hours": duty_target,
        "sleep_hours": sleep_target,
        "workload": workload_target,
        "recovery": recovery_target,
        "fatigue": "≤ 4 / 10",
        "focus": "≥ 6 / 10",
        "mood": "≥ 6 / 10",
        "social_support": "≥ 6 / 10",
    }

    reasons=[]
    if duty > 10: reasons.append(f"Current duty is {duty:.1f} h")
    if sleep < 7: reasons.append(f"Current sleep is {sleep:.1f} h")
    if fatigue >= 7: reasons.append(f"Fatigue is {fatigue:.1f}/10")
    if workload >= 7: reasons.append(f"Workload is {workload:.1f}/10")
    if recovery > 7: reasons.append(f"Recovery gap is {recovery:.0f} days")

    return {
        "priority": priority,
        "targets": targets,
        "reasons": reasons,
        "disclaimer": "Prototype welfare guardrails only. Final duty, rest and workload decisions must be set by authorized command/welfare policy and human review."
    }


def build_future_outlook(rows):
    """Generate short-horizon welfare recommendations from currently stored screening data.
    This is a heuristic support layer, not a clinical forecast or guarantee.
    """
    rows=[dict(r) for r in rows]
    if not rows:
        return {"status":"no_data","summary":"No current screening data is available yet.","recommendations":["Collect an authorized screening/check-in before generating a future outlook."],"trend":"unknown","signals":{}}
    latest=rows[-1]
    probs=[float(r.get("risk_probability") or 0) for r in rows[-6:]]
    current=probs[-1]
    previous=sum(probs[:-1])/max(1,len(probs)-1) if len(probs)>1 else current
    delta=current-previous
    trend="rising" if delta>0.05 else "improving" if delta<-0.05 else "stable"
    factors=json.loads(latest.get("factors_json") or "[]")
    actions=json.loads(latest.get("actions_json") or "[]")
    rec=[]
    if trend=="rising":
        rec.append("Prioritize an earlier welfare follow-up because the recent screening trajectory is rising.")
    elif trend=="improving":
        rec.append("Continue the current recovery/support pattern and keep routine monitoring in place.")
    else:
        rec.append("Maintain routine monitoring and review the next screening for meaningful change.")
    labels={f.get("feature") for f in factors}
    if "duty_hours" in labels or "workload" in labels:
        rec.append("Review upcoming duty/workload allocation and protect adequate recovery opportunities where operationally feasible.")
    if "sleep_hours" in labels or "fatigue" in labels or "recovery_gap" in labels:
        rec.append("Prioritize rest and recovery planning in the near-term schedule.")
    if "mood" in labels or "social_support" in labels or "focus" in labels:
        rec.append("Offer a confidential, voluntary welfare conversation or support pathway; do not treat the score as a disciplinary measure.")
    for a in actions:
        if a not in rec: rec.append(a)
    if current>=0.67:
        horizon="near-term attention recommended"
    elif current>=0.34:
        horizon="continued monitoring recommended"
    else:
        horizon="routine monitoring"

    # Simple short-horizon projection: extrapolate the recent slope forward.
    # Heuristic support signal only -- not a clinical or guaranteed forecast.
    n=len(probs)
    if n>=2:
        xs=list(range(n)); mean_x=sum(xs)/n; mean_y=sum(probs)/n
        num=sum((xs[i]-mean_x)*(probs[i]-mean_y) for i in range(n))
        den=sum((xs[i]-mean_x)**2 for i in range(n)) or 1
        slope=num/den
    else:
        slope=0.0
    def clamp(v): return max(0.0,min(1.0,v))
    projection={
        "in_7_days":round(clamp(current+slope*1),4),
        "in_14_days":round(clamp(current+slope*2),4),
        "in_30_days":round(clamp(current+slope*4),4),
    }

    plan=build_condition_plan(latest, latest.get("risk_level","Low"), current)
    return {"status":"ok","current_risk":round(current,4),"trend":trend,"change":round(delta,4),
            "horizon":horizon,"summary":f"Current screening is {latest.get('risk_level','Unknown')} with a {current*100:.1f}% estimated risk probability; recent trajectory is {trend}.",
            "recommendations":rec[:6],"signals":[f.get("label") for f in factors],"projection":projection,
            "recommended_plan":plan}

@app.get("/api/checkins")
def my_checkins(authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    c=conn()
    rows=c.execute("SELECT * FROM checkins WHERE user_id=? ORDER BY created_at DESC",(u["id"],)).fetchall()
    c.close()
    return [dict(r) for r in rows]

@app.get("/api/forecast")
def future_forecast(authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    c=conn()
    if u["role"]=="personnel":
        rows=c.execute("SELECT * FROM checkins WHERE user_id=? ORDER BY created_at",(u["id"],)).fetchall()
    else:
        rows=c.execute("SELECT * FROM checkins ORDER BY created_at").fetchall()
    c.close()
    return build_future_outlook(rows)

@app.get("/api/dashboard")
def dashboard(authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    c=conn()
    if u["role"]=="personnel":
        rows=c.execute("SELECT * FROM checkins WHERE user_id=? ORDER BY created_at",(u["id"],)).fetchall()
        latest=rows[-1] if rows else None
        person={"id":u["id"],"full_name":u["full_name"],"unit":u["unit"],"role":u["role"],
                "risk_level": latest["risk_level"] if latest else None,
                "risk_probability": latest["risk_probability"] if latest else 0,
                "last_checkin": latest["created_at"] if latest else None,
                "sleep_hours": latest["sleep_hours"] if latest else None}
        alerts=c.execute("SELECT * FROM alerts WHERE personnel_id=? ORDER BY created_at DESC",(u["id"],)).fetchall()
        ints=c.execute("SELECT * FROM interventions WHERE personnel_id=? ORDER BY updated_at DESC",(u["id"],)).fetchall()
        counts={"Low":0,"Medium":0,"High":0}
        for r in rows:
            if r["risk_level"] in counts:
                counts[r["risk_level"]] += 1
        latest_dict=dict(latest) if latest else None
        if latest_dict:
            person.update({
                "risk_probability": latest_dict.get("risk_probability"),
                "risk_level": latest_dict.get("risk_level"),
                "last_checkin": latest_dict.get("created_at"),
                "sleep_hours": latest_dict.get("sleep_hours"),
                "duty_hours": latest_dict.get("duty_hours"),
                "workload": latest_dict.get("workload"),
                "fatigue": latest_dict.get("fatigue"),
                "mood": latest_dict.get("mood"),
                "focus": latest_dict.get("focus"),
                "social_support": latest_dict.get("social_support"),
                "recovery_gap": latest_dict.get("recovery_gap"),
                "factors_json": latest_dict.get("factors_json"),
                "actions_json": latest_dict.get("actions_json"),
            })
        trend=[{"label":r["created_at"][:10],"value":round(float(r["risk_probability"] or 0)*100,1)} for r in rows[-20:]]
        return {"role":u["role"],"user":u,"latest":latest_dict,"history":[dict(r) for r in rows],
                "personnel":[person],"personnel_count":1,"checkins_count":len(rows),"screened_personnel_count":1 if latest else 0,
                "open_alerts":sum(1 for r in alerts if not r["acknowledged"]),
                "interventions_open":sum(1 for r in ints if r["status"]!="Closed"),
                "alerts":[dict(r) for r in alerts],"interventions":[dict(r) for r in ints],
                "risk_distribution":counts,"risk_trend":trend}
    # welfare/commander/admin aggregate scope
    rows=c.execute("""SELECT u.id,u.full_name,u.unit,
        (SELECT risk_level FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) risk_level,
        (SELECT risk_probability FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) risk_probability,
        (SELECT created_at FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) last_checkin,
        (SELECT duty_hours FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) duty_hours,
        (SELECT sleep_hours FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) sleep_hours,
        (SELECT fatigue FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) fatigue,
        (SELECT focus FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) focus,
        (SELECT mood FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) mood,
        (SELECT social_support FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) social_support,
        (SELECT recovery_gap FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) recovery_gap,
        (SELECT workload FROM checkins x WHERE x.user_id=u.id ORDER BY created_at DESC LIMIT 1) workload
        FROM users u WHERE u.role='personnel'""").fetchall()
    alerts=c.execute("SELECT a.*,u.full_name FROM alerts a JOIN users u ON u.id=a.personnel_id ORDER BY a.created_at DESC").fetchall()
    ints=c.execute("""SELECT i.*,u.full_name FROM interventions i JOIN users u ON u.id=i.personnel_id
                      ORDER BY i.updated_at DESC""").fetchall()
    personnel=[dict(r) for r in rows]
    all_checkins=c.execute("SELECT created_at, risk_probability, risk_level FROM checkins ORDER BY created_at").fetchall()
    c.close()
    counts={"Low":0,"Medium":0,"High":0}
    for x in personnel:
        if x.get("risk_level"): counts[x["risk_level"]]=counts.get(x["risk_level"],0)+1
    trend=[{"label":r["created_at"][:10],"value":round(float(r["risk_probability"])*100,1)} for r in all_checkins[-20:]]
    for x in personnel:
        if x.get("risk_probability") is not None and x.get("risk_level"):
            payload={k:x.get(k) for k in ["duty_hours","sleep_hours","fatigue","mood","focus","social_support","recovery_gap","workload"]}
            x["recommended_plan"]=build_condition_plan(payload, x["risk_level"], float(x["risk_probability"]))
    screened=sum(1 for x in personnel if x.get("risk_level"))
    return {"role":u["role"],"user":u,"personnel":personnel,
            "alerts":[dict(r) for r in alerts],"interventions":[dict(r) for r in ints],
            "personnel_count":len(personnel),"checkins_count":len(all_checkins),"screened_personnel_count":screened,
            "open_alerts":sum(1 for r in alerts if not r["acknowledged"]),
            "interventions_open":sum(1 for r in ints if r["status"]!="Closed"),
            "risk_distribution":counts,"risk_trend":trend}

@app.get("/api/evaluation")
def evaluation(authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    if u["role"] not in ("welfare_officer","commander","admin"): raise HTTPException(403,"Restricted to authorized oversight roles")
    b=load_bundle()
    return b["metrics"]

@app.get("/api/model/feature-importance")
def feature_importance(authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    if u["role"] not in ("welfare_officer","commander","admin"): raise HTTPException(403,"Restricted")
    b=load_bundle()
    return [{"feature":f,"importance":round(float(v),4)} for f,v in zip(b["features"],b["model"].feature_importances_)]

@app.get("/api/personnel")
def personnel(authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    if u["role"] not in ("welfare_officer","commander","admin"): raise HTTPException(403,"Restricted")
    c=conn(); rows=c.execute("SELECT id,full_name,unit,role,created_at FROM users WHERE role='personnel' ORDER BY full_name").fetchall(); c.close()
    return [dict(r) for r in rows]

@app.get("/api/personnel/{personnel_id}/history")
def personnel_history(personnel_id:int, authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    if u["role"]=="personnel" and u["id"]!=personnel_id: raise HTTPException(403,"You can only view your own history")
    c=conn(); rows=c.execute("SELECT * FROM checkins WHERE user_id=? ORDER BY created_at",(personnel_id,)).fetchall(); c.close()
    return [dict(r) for r in rows]

@app.get("/api/alerts")
def alerts(authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    c=conn()
    if u["role"]=="personnel":
        rows=c.execute("SELECT * FROM alerts WHERE personnel_id=? ORDER BY created_at DESC",(u["id"],)).fetchall()
    else:
        rows=c.execute("SELECT a.*,u.full_name FROM alerts a JOIN users u ON u.id=a.personnel_id ORDER BY a.created_at DESC").fetchall()
    c.close(); return [dict(r) for r in rows]

@app.post("/api/alerts/{alert_id}/ack")
def ack_alert(alert_id:int, authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    if u["role"]=="personnel": raise HTTPException(403,"Restricted")
    c=conn(); c.execute("UPDATE alerts SET acknowledged=1 WHERE id=?",(alert_id,)); c.commit(); c.close()
    audit(u["id"],"ack_alert",str(alert_id)); return {"ok":True}

@app.post("/api/interventions")
def create_intervention(req: InterventionRequest, authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    if u["role"] not in ("welfare_officer","commander","admin"): raise HTTPException(403,"Restricted")
    now=datetime.utcnow().isoformat(); c=conn()
    cur=c.execute("""INSERT INTO interventions(personnel_id,owner_id,status,priority,action,notes,due_date,created_at,updated_at)
                     VALUES(?,?,?,?,?,?,?,?,?)""",
                  (req.personnel_id,u["id"],req.status,req.priority,req.action,req.notes,req.due_date,now,now))
    c.commit(); c.close(); audit(u["id"],"create_intervention",str(req.personnel_id)); return {"id":cur.lastrowid}

@app.patch("/api/interventions/{iid}")
def update_intervention(iid:int, status:str, authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    if u["role"] not in ("welfare_officer","commander","admin"): raise HTTPException(403,"Restricted")
    c=conn(); c.execute("UPDATE interventions SET status=?,updated_at=? WHERE id=?",(status,datetime.utcnow().isoformat(),iid)); c.commit(); c.close()
    audit(u["id"],"update_intervention",str(iid)); return {"ok":True}


@app.post("/api/import/hrms")
async def import_hrms_and_predict(file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    """Import an approved/synthetic HRMS-style CSV without requiring pandas."""
    u = current_user(authorization)
    if u["role"] not in ("welfare_officer", "admin"):
        raise HTTPException(403, "Only welfare/admin can import HRMS data")
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Please upload a CSV file")

    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(413, "CSV is too large for the prototype (8 MB maximum)")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    try:
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    except Exception as exc:
        raise HTTPException(400, f"Could not read CSV: {exc}")

    required = ["personnel_ref", "unit", "duty_hours", "sleep_hours", "fatigue", "mood",
                "focus", "social_support", "recovery_gap", "workload"]
    fieldnames = reader.fieldnames or []
    missing = [c for c in required if c not in fieldnames]
    if missing:
        raise HTTPException(400, "Missing required columns: " + ", ".join(missing))
    if not rows:
        raise HTTPException(400, "CSV contains no data rows")

    numeric_cols = required[2:]
    ranges = {
        "duty_hours": (0, 24), "sleep_hours": (0, 24), "fatigue": (0, 10), "mood": (0, 10),
        "focus": (0, 10), "social_support": (0, 10), "recovery_gap": (0, 75), "workload": (0, 10)
    }

    valid_records = []
    numeric_rejected = 0
    range_rejected = 0

    for row in rows:
        parsed = dict(row)
        try:
            for col in numeric_cols:
                value = float(str(row.get(col, "")).strip())
                if value != value:  # NaN
                    raise ValueError
                parsed[col] = value
        except (TypeError, ValueError):
            numeric_rejected += 1
            continue

        out_of_range = any(
            parsed[col] < lo or parsed[col] > hi
            for col, (lo, hi) in ranges.items()
        )
        if out_of_range:
            range_rejected += 1
            continue
        valid_records.append(parsed)

    if not valid_records:
        raise HTTPException(400, "No valid rows remain after validation")

    payloads = [{k: float(row[k]) for k in numeric_cols} for row in valid_records]
    try:
        predictions = predict_many(payloads)
    except Exception as exc:
        raise HTTPException(500, f"ML prediction failed: {type(exc).__name__}: {exc}")

    now = datetime.utcnow().isoformat()
    created_users = processed = 0
    risk_counts = {"Low": 0, "Medium": 0, "High": 0}
    sample_results = []
    c = conn()
    try:
        for row, out in zip(valid_records, predictions):
            ref = str(row["personnel_ref"]).strip()
            if not ref:
                continue
            username = "hrms_" + re.sub(r"[^A-Za-z0-9_.-]", "_", ref)[:40]
            name = str(row.get("full_name", row.get("name", f"Personnel {ref}"))).strip()
            unit = str(row["unit"]).strip() or "Imported Unit"

            existing = c.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
            if existing:
                user_id = existing["id"]
                c.execute("UPDATE users SET full_name=?, unit=? WHERE id=?", (name, unit, user_id))
            else:
                cur = c.execute(
                    "INSERT INTO users(username,password_hash,full_name,role,unit,created_at) VALUES(?,?,?,?,?,?)",
                    (username, hash_password("ChangeMe123"), name, "personnel", unit, now)
                )
                user_id = cur.lastrowid
                created_users += 1

            c.execute(
                """INSERT INTO checkins(user_id,duty_hours,sleep_hours,fatigue,mood,focus,social_support,recovery_gap,workload,
                    risk_probability,risk_level,factors_json,actions_json,created_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (user_id, row["duty_hours"], row["sleep_hours"], row["fatigue"], row["mood"], row["focus"],
                 row["social_support"], row["recovery_gap"], row["workload"], out["risk_probability"], out["risk_level"],
                 json.dumps(out["factors"]), json.dumps(out["actions"]), now)
            )

            if out["risk_level"] == "High":
                existing_alert = c.execute(
                    "SELECT id FROM alerts WHERE personnel_id=? AND level='High' AND acknowledged=0 LIMIT 1",
                    (user_id,)
                ).fetchone()
                if not existing_alert:
                    c.execute("INSERT INTO alerts(personnel_id,level,message,created_at) VALUES(?,?,?,?)",
                              (user_id, "High", "High-risk HRMS screening requires welfare review.", now))

            processed += 1
            risk_counts[out["risk_level"]] += 1
            if len(sample_results) < 8:
                sample_results.append({
                    "personnel_ref": ref,
                    "name": name,
                    "risk_level": out["risk_level"],
                    "risk_probability": out["risk_probability"],
                    "factors": [f["label"] for f in out["factors"][:4]]
                })
        c.commit()
    except Exception as exc:
        c.rollback()
        raise HTTPException(500, f"HRMS import failed while saving results: {type(exc).__name__}: {exc}")
    finally:
        c.close()

    audit(u["id"], "hrms_ml_import", f"{file.filename}:{processed}")
    return {
        "ok": True,
        "filename": file.filename,
        "rows_received": len(rows),
        "rows_processed": processed,
        "rows_rejected": len(rows) - processed,
        "validation_rejected": numeric_rejected + range_rejected,
        "created_users": created_users,
        "risk_distribution": risk_counts,
        "sample_results": sample_results,
        "note": "Synthetic/de-identified demo data only. Production HRMS integration requires organizational authorization and approved secure interfaces."
    }


@app.post("/api/import/csv")
def import_csv(file, authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    if u["role"] not in ("welfare_officer","admin"): raise HTTPException(403,"Only welfare/admin can import")
    data = file.file.read().decode("utf-8-sig")
    reader=csv.DictReader(io.StringIO(data))
    created=0
    c=conn()
    for r in reader:
        username=r.get("username") or r.get("service_id") or f"imported_{created+1}"
        name=r.get("full_name") or r.get("name") or username
        unit=r.get("unit") or "Imported Unit"
        try:
            c.execute("INSERT INTO users(username,password_hash,full_name,role,unit,created_at) VALUES(?,?,?,?,?,?)",
                      (username,hash_password("ChangeMe123"),name,"personnel",unit,datetime.utcnow().isoformat()))
            created+=1
        except: pass
    c.commit(); c.close(); audit(u["id"],"csv_import",str(created))
    return {"created_users":created,"note":"Imported accounts use a demo password and should be reset in a production identity system."}

@app.get("/api/reports/welfare/{personnel_id}")
def welfare_report(personnel_id:int, authorization: str | None = Header(default=None)):
    u=current_user(authorization)
    if u["role"]=="personnel" and u["id"]!=personnel_id: raise HTTPException(403,"Restricted")
    c=conn()
    person=c.execute("SELECT * FROM users WHERE id=?",(personnel_id,)).fetchone()
    rows=c.execute("SELECT * FROM checkins WHERE user_id=? ORDER BY created_at",(personnel_id,)).fetchall()
    ints=c.execute("SELECT * FROM interventions WHERE personnel_id=? ORDER BY updated_at DESC",(personnel_id,)).fetchall()
    c.close()
    if not person: raise HTTPException(404,"Personnel not found")
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    buf=io.BytesIO(); doc=SimpleDocTemplate(buf,pagesize=A4,rightMargin=36,leftMargin=36,topMargin=36,bottomMargin=36)
    styles=getSampleStyleSheet(); story=[]
    story.append(Paragraph("StressMitra — Welfare Support Report",styles["Title"]))
    story.append(Spacer(1,12))
    story.append(Paragraph(f"Personnel: {person['full_name']} | Unit: {person['unit']}",styles["Normal"]))
    story.append(Paragraph(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",styles["Normal"]))
    story.append(Spacer(1,14))
    data=[["Date","Risk","Probability","Duty h","Sleep h","Fatigue","Mood","Workload"]]
    for r in rows:
        data.append([r["created_at"][:10],r["risk_level"],f"{r['risk_probability']*100:.1f}%",r["duty_hours"],r["sleep_hours"],r["fatigue"],r["mood"],r["workload"]])
    if len(data)==1: data.append(["No check-ins","","","","","","",""])
    t=Table(data,repeatRows=1); t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#0f172a")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("GRID",(0,0),(-1,-1),0.25,colors.grey),("FONTSIZE",(0,0),(-1,-1),7)])); story.append(t)
    story.append(Spacer(1,14))
    story.append(Paragraph("Welfare interventions",styles["Heading2"]))
    if ints:
        for i in ints: story.append(Paragraph(f"• {i['priority']} — {i['action']} — {i['status']} — {i['notes']}",styles["Normal"]))
    else: story.append(Paragraph("No interventions recorded.",styles["Normal"]))
    story.append(Spacer(1,14))
    story.append(Paragraph("Use note: this prototype is a welfare-support screening system, not a clinical diagnosis or automated disciplinary decision system.",styles["Italic"]))
    doc.build(story); buf.seek(0)
    audit(u["id"],"download_report",str(personnel_id))
    return StreamingResponse(buf,media_type="application/pdf",headers={"Content-Disposition":f'attachment; filename="welfare_report_{personnel_id}.pdf"'})
