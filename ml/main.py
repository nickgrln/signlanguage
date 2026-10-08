import os
from pathlib import Path
from typing import Annotated

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_PATH = Path(os.getenv("MODEL_PATH", Path(__file__).parent / "models" / "fsl_random_forest.joblib"))
model = None
app = FastAPI(title="Sign Language Detector model service", version="1.0.0")


class PredictionRequest(BaseModel):
    landmarks: Annotated[list[float], Field(min_length=63, max_length=63)]


@app.on_event("startup")
def load_model():
    global model
    if MODEL_PATH.is_file():
        model = joblib.load(MODEL_PATH)


@app.get("/health")
def health():
    return {"status": "ok", "modelLoaded": model is not None}


@app.post("/predict")
def predict(request: PredictionRequest):
    if len(request.landmarks) != 63 or not all(np.isfinite(request.landmarks)):
        raise HTTPException(status_code=422, detail="Expected exactly 63 finite landmark values.")
    if any(value < 0 or value > 1 for value in request.landmarks):
        raise HTTPException(status_code=422, detail="Landmarks must be normalized to the 0–1 range.")
    if model is None:
        raise HTTPException(status_code=503, detail="No trained FSL model is available. Train and deploy a model first.")

    features = np.asarray(request.landmarks, dtype=np.float32).reshape(1, 63)
    probabilities = model.predict_proba(features)[0]
    best_index = int(np.argmax(probabilities))
    sign = str(model.classes_[best_index])
    confidence = round(float(probabilities[best_index]) * 100, 2)
    return {"sign": sign, "confidence": confidence}
