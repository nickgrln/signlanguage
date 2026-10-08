import argparse
import csv
from pathlib import Path

import cv2
import mediapipe as mp

FEATURES = [f"v{index}" for index in range(63)]


def normalized_vector(hand):
    points = [(point.x, point.y, point.z) for point in hand]
    min_z = min(point[2] for point in points)
    max_z = max(point[2] for point in points)
    z_range = max_z - min_z
    values = []
    for x, y, z in points:
        values.extend([
            min(1.0, max(0.0, x)),
            min(1.0, max(0.0, y)),
            0.5 if z_range == 0 else min(1.0, max(0.0, (z - min_z) / z_range))
        ])
    if len(values) != 63:
        raise ValueError("MediaPipe must provide exactly 21 hand landmarks.")
    return values


def main():
    parser = argparse.ArgumentParser(description="Collect hand landmark vectors for one labeled FSL sign.")
    parser.add_argument("--label", required=True, help="Gesture class, for example HELLO or A.")
    parser.add_argument("--samples", type=int, default=100)
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "data" / "landmarks.csv")
    parser.add_argument("--camera", type=int, default=0)
    args = parser.parse_args()
    label = args.label.strip().upper()
    if not label or len(label) > 32 or args.samples < 1:
        raise SystemExit("Provide a gesture label (up to 32 characters) and a positive sample count.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    needs_header = not args.output.exists() or args.output.stat().st_size == 0
    camera = cv2.VideoCapture(args.camera)
    if not camera.isOpened():
        raise SystemExit("Could not open the selected camera.")

    count = 0
    try:
        with args.output.open("a", newline="", encoding="utf-8") as output:
            writer = csv.writer(output)
            if needs_header:
                writer.writerow(["label", *FEATURES])
            with mp.solutions.hands.Hands(
                static_image_mode=False,
                max_num_hands=1,
                min_detection_confidence=0.6,
                min_tracking_confidence=0.5
            ) as tracker:
                while count < args.samples:
                    success, frame = camera.read()
                    if not success:
                        raise RuntimeError("The camera stopped returning frames.")
                    frame = cv2.flip(frame, 1)
                    result = tracker.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                    if result.multi_hand_landmarks:
                        vector = normalized_vector(result.multi_hand_landmarks[0].landmark)
                        writer.writerow([label, *vector])
                        count += 1
                        cv2.putText(frame, f"{label}: {count}/{args.samples}", (18, 36),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (70, 225, 185), 2)
                    else:
                        cv2.putText(frame, "Show one hand to collect a sample", (18, 36),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                    cv2.putText(frame, "Keep your sign steady; press Q to stop", (18, 70),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
                    cv2.imshow("FSL landmark collector — local only", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
    finally:
        camera.release()
        cv2.destroyAllWindows()
    print(f"Collected {count} samples for {label} in {args.output}.")


if __name__ == "__main__":
    main()
