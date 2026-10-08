import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";

type CameraState = "idle" | "loading" | "ready" | "error";
type HookOptions = { enabled: boolean; onLandmarks: (landmarks: number[]) => void | Promise<void> };

const handConnections: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10],
  [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18],
  [18, 19], [19, 20], [0, 17]
];

function flattenNormalized(points: { x: number; y: number; z: number }[]) {
  if (points.length !== 21) throw new Error("Hand tracking must produce exactly 21 landmarks.");
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  const zRange = maxZ - minZ;
  return points.flatMap(({ x, y, z }) => [
    Math.max(0, Math.min(1, x)),
    Math.max(0, Math.min(1, y)),
    zRange === 0 ? 0.5 : Math.max(0, Math.min(1, (z - minZ) / zRange))
  ]);
}

export function useHandTracking({ enabled, onLandmarks }: HookOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callbackRef = useRef(onLandmarks);
  const classifyingRef = useRef(false);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [error, setError] = useState("");

  useEffect(() => { callbackRef.current = onLandmarks; }, [onLandmarks]);

  const startCamera = useCallback(async () => {
    setCameraState("loading");
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support camera access.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
      );
      landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      setCameraState("ready");
    } catch (caught) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const message = caught instanceof Error ? caught.message : "Camera setup failed.";
      setError(message.includes("Permission") || message.includes("denied")
        ? "Camera permission was blocked. Allow camera access in your browser settings, then try again."
        : message);
      setCameraState("error");
    }
  }, []);

  useEffect(() => {
    if (!enabled || cameraState !== "ready") return;
    let animationFrame = 0;
    let lastPredict = 0;
    const draw = (now: number) => {
      animationFrame = requestAnimationFrame(draw);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      const context = canvas?.getContext("2d");
      if (!video || !canvas || !context || !landmarker || video.readyState < 2) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      const result = landmarker.detectForVideo(video, now);
      const hand = result.landmarks[0];
      if (!hand) return;
      const points = hand.map(({ x, y }) => ({ x, y }));
      context.save();
      context.strokeStyle = "rgba(153, 247, 224, .88)";
      context.lineWidth = Math.max(2, canvas.width / 360);
      context.shadowColor = "#5ff0cc";
      context.shadowBlur = 14;
      context.lineCap = "round";
      context.lineJoin = "round";
      handConnections.forEach(([from, to]) => {
        const start = points[from];
        const end = points[to];
        context.beginPath();
        context.moveTo(start.x * canvas.width, start.y * canvas.height);
        context.lineTo(end.x * canvas.width, end.y * canvas.height);
        context.stroke();
      });
      points.forEach((point, index) => {
        context.beginPath();
        context.fillStyle = index === 0 || [4, 8, 12, 16, 20].includes(index) ? "#fff3d2" : "#83f4db";
        context.arc(point.x * canvas.width, point.y * canvas.height, Math.max(3, canvas.width / 150), 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
      if (now - lastPredict >= 160) {
        lastPredict = now;
        const vector = flattenNormalized(hand.map((point) => ({ ...point, x: 1 - point.x })));
        if (vector.length === 63 && !classifyingRef.current) {
          classifyingRef.current = true;
          void Promise.resolve(callbackRef.current(vector)).finally(() => { classifyingRef.current = false; });
        }
      }
    };
    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [cameraState, enabled]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    landmarkerRef.current?.close();
  }, []);

  return { videoRef, canvasRef, cameraState, error, startCamera };
}
