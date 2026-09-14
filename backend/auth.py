import hashlib
import secrets
from datetime import datetime
from backend.database import conn

# In-memory cache plus SQLite persistence so sessions survive browser refreshes and
# Uvicorn worker/process restarts during local development.
SESSIONS = {}

def hash_password(p):
    return hashlib.sha256(p.encode()).hexdigest()

def verify(username, password):
    c = conn()
    row = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not row or row["password_hash"] != hash_password(password):
        c.close()
        return None
    token = secrets.token_urlsafe(32)
    user = dict(row)
    c.execute("INSERT OR REPLACE INTO sessions(token,user_id,created_at) VALUES(?,?,?)",
              (token, user["id"], datetime.utcnow().isoformat()))
    c.commit(); c.close()
    SESSIONS[token] = user
    return token, user

def get_user(token):
    if not token:
        return None
    cached = SESSIONS.get(token)
    if cached:
        return cached
    c = conn()
    row = c.execute("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?", (token,)).fetchone()
    c.close()
    if not row:
        return None
    user = dict(row)
    SESSIONS[token] = user
    return user

def logout(token):
    SESSIONS.pop(token, None)
    c = conn()
    c.execute("DELETE FROM sessions WHERE token=?", (token,))
    c.commit(); c.close()
