from enum import Enum
from typing import Optional
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="India Domestic Flight & Rail Delay Prediction Engine",
    version="1.0.0",
)

# Enable CORS for Next.js development and production
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # Add production frontend URLs here (e.g. Vercel domain)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Enums & Status Definitions ---
class DelaySeverity(str, Enum):
    ON_TIME = "ON_TIME"
    MODERATE_DELAY = "MODERATE_DELAY"
    SEVERE_DELAY = "SEVERE_DELAY"


# --- Request & Response Models: Flight ---
class FlightPredictRequest(BaseModel):
    airline_code: str = Field(..., example="6E", description="IATA airline code (e.g., 6E for IndiGo, AI for Air India)")
    flight_number: str = Field(..., example="6E-2045")
    origin_airport: str = Field(..., example="DEL", description="Origin 3-letter IATA code (e.g., DEL, BOM, BLR)")
    destination_airport: str = Field(..., example="BOM", description="Destination 3-letter IATA code")
    departure_time: datetime = Field(..., description="Scheduled departure timestamp in ISO format")
    visibility_meters: Optional[float] = Field(5000.0, description="Runway visibility in meters (crucial for fog)")
    wind_speed_kmh: Optional[float] = Field(12.0, description="Wind speed at departure airport")


class PredictionResponse(BaseModel):
    service_type: str
    identifier: str
    predicted_delay_minutes: int
    delay_probability: float
    status: DelaySeverity
    risk_factors: list[str]


# --- Request & Response Models: Railway ---
class TrainPredictRequest(BaseModel):
    train_number: str = Field(..., example="12555", description="5-digit Indian Railways train number")
    train_type: str = Field("Express", example="Rajdhani", description="Express, Superfast, Rajdhani, Shatabdi, etc.")
    origin_station: str = Field(..., example="NDLS", description="Indian Railways origin station code")
    destination_station: str = Field(..., example="GKP", description="Indian Railways destination station code")
    scheduled_departure: datetime = Field(..., description="Scheduled departure timestamp in ISO format")
    fog_index: Optional[float] = Field(0.0, ge=0.0, le=1.0, description="Fog severity scale (0.0 = clear, 1.0 = dense north Indian fog)")
    prior_delay_minutes: Optional[int] = Field(0, description="Cascading delay from previous stations in minutes")


# --- Helper Risk Assessment Logic ---
def classify_delay(minutes: int, prob: float) -> DelaySeverity:
    if minutes <= 15:
        return DelaySeverity.ON_TIME
    elif minutes <= 45:
        return DelaySeverity.MODERATE_DELAY
    return DelaySeverity.SEVERE_DELAY


# --- API Endpoints ---
@app.get("/")
def root():
    return {
        "status": "active",
        "service": "Dual Domestic Transit Predictor (India)",
        "version": "1.0.0",
    }


@app.post("/api/predict/flight", response_model=PredictionResponse)
def predict_flight_delay(payload: FlightPredictRequest):
    factors = []
    base_delay = 5
    prob = 0.15

    # Northern/Western fog and visibility penalty
    if payload.visibility_meters and payload.visibility_meters < 1000:
        base_delay += 40
        prob += 0.50
        factors.append("Low runway visual range (fog alert)")

    # Evening peak traffic penalty at metro hubs (DEL, BOM)
    dep_hour = payload.departure_time.hour
    if payload.origin_airport in ["DEL", "BOM"] and 18 <= dep_hour <= 21:
        base_delay += 20
        prob += 0.25
        factors.append("High airspace congestion during evening departure window")

    status = classify_delay(base_delay, prob)

    return PredictionResponse(
        service_type="FLIGHT",
        identifier=f"{payload.airline_code} {payload.flight_number}",
        predicted_delay_minutes=base_delay,
        delay_probability=round(min(prob, 0.99), 2),
        status=status,
        risk_factors=factors or ["Normal operating conditions"],
    )


@app.post("/api/predict/train", response_model=PredictionResponse)
def predict_train_delay(payload: TrainPredictRequest):
    factors = []
    base_delay = payload.prior_delay_minutes or 0
    prob = 0.20

    # Cascading delay propagation
    if base_delay > 0:
        cascading = int(base_delay * 0.4)
        base_delay += cascading
        prob += 0.35
        factors.append(f"Cascading schedule recovery delay (+{cascading} min)")

    # Winter/Northern plains fog disruption
    if payload.fog_index and payload.fog_index > 0.4:
        fog_delay = int(payload.fog_index * 60)
        base_delay += fog_delay
        prob += 0.40
        factors.append("Dense northern rail track fog caution speed restrictions")

    # Train route priority adjustments
    if payload.train_type.lower() in ["rajdhani", "shatabdi", "vande bharat"]:
        base_delay = max(0, base_delay - 15)
        factors.append("High route track clearance priority")

    status = classify_delay(base_delay, prob)

    return PredictionResponse(
        service_type="TRAIN",
        identifier=f"{payload.train_number} ({payload.train_type})",
        predicted_delay_minutes=base_delay,
        delay_probability=round(min(prob, 0.99), 2),
        status=status,
        risk_factors=factors or ["Track schedule running on time"],
    )