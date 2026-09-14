from pydantic import BaseModel, Field
from typing import Optional

class LoginRequest(BaseModel):
    username: str
    password: str
    portal: str = "personnel"

class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "personnel"
    unit: str = "Alpha Unit"

class CheckinRequest(BaseModel):
    duty_hours: float = Field(ge=0, le=24)
    sleep_hours: float = Field(ge=0, le=24)
    fatigue: float = Field(ge=0, le=10)
    mood: float = Field(ge=0, le=10)
    focus: float = Field(ge=0, le=10)
    social_support: float = Field(ge=0, le=10)
    recovery_gap: float = Field(ge=0, le=30)
    workload: float = Field(ge=0, le=10)
    last_trip: Optional[str] = ""
    duty_location: Optional[str] = ""

class InterventionRequest(BaseModel):
    personnel_id: int
    action: str
    priority: str = "Medium"
    status: str = "Open"
    notes: str = ""
    due_date: str = ""

class ImportRequest(BaseModel):
    rows: list[dict]
