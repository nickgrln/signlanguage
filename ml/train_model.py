import argparse
import csv
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

FEATURES = [f"v{index}" for index in range(63)]


def main():
    parser = argparse.ArgumentParser(description="Train an FSL random forest from labeled 63-value hand landmark samples.")
    parser.add_argument("--data", type=Path, default=Path(__file__).parent / "data" / "landmarks.csv")
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "models" / "fsl_random_forest.joblib")
    parser.add_argument("--trees", type=int, default=300)
    arguments = parser.parse_args()

    if not arguments.data.is_file():
        raise SystemExit(f"Training data not found: {arguments.data}. Collect labeled samples first.")
    features, labels = [], []
    with arguments.data.open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        missing = set(["label", *FEATURES]) - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"CSV is missing required columns: {', '.join(sorted(missing))}")
        for line_number, row in enumerate(reader, start=2):
            values = [float(row[column]) for column in FEATURES]
            if len(values) != 63 or not np.isfinite(values).all() or any(value < 0 or value > 1 for value in values):
                raise SystemExit(f"Invalid normalized landmark vector on CSV row {line_number}.")
            features.append(values)
            labels.append(row["label"].strip().upper())

    x = np.asarray(features, dtype=np.float32)
    y = np.asarray(labels)
    classes, counts = np.unique(y, return_counts=True)
    if len(classes) < 2:
        raise SystemExit("Collect samples for at least two distinct signs before training.")
    if counts.min() < 4:
        raise SystemExit("Each sign needs at least 4 samples for a meaningful validation split.")

    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.2, random_state=42, stratify=y
    )
    classifier = make_pipeline(
        StandardScaler(),
        RandomForestClassifier(
            n_estimators=arguments.trees,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
            min_samples_leaf=2
        )
    )
    classifier.fit(x_train, y_train)
    print(classification_report(y_test, classifier.predict(x_test), zero_division=0))
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(classifier, arguments.output)
    print(f"Saved model to {arguments.output} ({len(y)} samples, {len(classes)} signs).")


if __name__ == "__main__":
    main()
