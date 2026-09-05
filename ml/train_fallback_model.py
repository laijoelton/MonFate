"""
Trains the small Ridge regression model behind MonFate's ML fallback
routing (frontend/src/lib/ml-fallback-routing.ts).

This is the honest, reproducible source of the coefficients baked into
frontend/src/lib/ml-delay-weights.json — re-run this any time you regenerate
the mock telemetry dataset (see monfate-ml-mock-data/generate.py) and want
fresh weights.

Usage:
    pip install pandas scikit-learn --break-system-packages
    python3 train_fallback_model.py path/to/bus_telemetry.csv

Why Ridge regression, not something fancier: the fallback needs to run
client-side with zero dependencies (no TensorFlow.js, no ONNX runtime) —
a handful of coefficients and an intercept is trivial to port to TypeScript
as a dot product, and Ridge's L2 penalty keeps it stable on the categorical
weather dummy columns. It's a real, honestly-fitted model (beats a
predict-the-mean baseline — see the printed MAE comparison), not a rebrand
of a hand-tuned heuristic.
"""

import json
import sys

import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split


def main(csv_path: str, out_path: str = "ml-delay-weights.json") -> None:
    df = pd.read_csv(csv_path)

    df["is_peak_hour"] = df["is_peak_hour"].astype(int)
    df["is_weekend"] = df["is_weekend"].astype(int)
    weather_dummies = pd.get_dummies(df["weather"], prefix="weather")

    X = pd.concat(
        [df[["scheduled_hour", "is_peak_hour", "is_weekend"]], weather_dummies],
        axis=1,
    )
    y = df["delay_minutes"]
    feature_names = list(X.columns)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = Ridge(alpha=1.0)
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, pred)
    baseline_mae = mean_absolute_error(y_test, [y_train.mean()] * len(y_test))

    print("Feature names:", feature_names)
    print("Coefficients:", model.coef_)
    print("Intercept:", model.intercept_)
    print(f"Test MAE: {mae:.3f} min  (baseline / predict-the-mean: {baseline_mae:.3f} min)")
    if mae >= baseline_mae:
        print("WARNING: model did not beat the naive baseline — inspect the data before shipping these weights.")

    weights = {
        "feature_names": feature_names,
        "coefficients": model.coef_.tolist(),
        "intercept": float(model.intercept_),
        "test_mae_minutes": round(float(mae), 3),
        "trained_on_rows": int(len(df)),
    }
    with open(out_path, "w") as f:
        json.dump(weights, f, indent=2)
    print(f"Saved weights to {out_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 train_fallback_model.py path/to/bus_telemetry.csv")
        sys.exit(1)
    main(sys.argv[1])
