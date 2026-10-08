const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export type User = { id: string; name: string; email: string; role: "Admin" | "Signer" | "Listener" };
export type Detection = { id: string; sign: string; confidence: number; detectedAt: string };
export type Session = { id: string; startedAt: string; endedAt: string | null; signsDetected: number; uniqueSigns: number };
export type Report = { sign: string; count: number; totalConfidence: number; avgConfidence: number; firstSeen: string; lastSeen: string };
export type QueuedDetection = { sign: string; confidence: number; sessionId: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window === "undefined" ? null : window.sessionStorage.getItem("signflow-token");
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
  if (!response.ok) {
    let message = "The service could not complete the request.";
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* Keep the standard request error. */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  me: async () => {
    try { return (await request<{ user: User }>("/api/v1/auth/me")).user; } catch { return null; }
  },
  register: async (input: { name: string; email: string; password: string; role: "Signer" | "Listener" }) => {
    const result = await request<{ user: User; token: string }>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(input) });
    window.sessionStorage.setItem("signflow-token", result.token);
    return result;
  },
  login: async (input: { email: string; password: string }) => {
    const result = await request<{ user: User; token: string }>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(input) });
    window.sessionStorage.setItem("signflow-token", result.token);
    return result;
  },
  logout: async () => {
    try { await request<void>("/api/v1/auth/logout", { method: "POST" }); }
    finally { window.sessionStorage.removeItem("signflow-token"); }
  },
  startSession: () => request<{ sessionId: string; startedAt: string }>("/api/v1/sessions", { method: "POST", body: "{}" }),
  endSession: (id: string) => request<{ ended: boolean }>(`/api/v1/sessions/${encodeURIComponent(id)}/end`, { method: "POST", body: "{}" }),
  predict: (landmarks: number[]) => request<{ sign: string; confidence: number }>("/api/v1/predict", { method: "POST", body: JSON.stringify({ landmarks }) }),
  saveDetection: (sessionId: string, detection: QueuedDetection) =>
    request<{ accepted: boolean; reason?: string; historyId?: string }>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/history`, {
      method: "POST", body: JSON.stringify({ sign: detection.sign, confidence: detection.confidence })
    }),
  sessions: async () => (await request<{ sessions: Session[] }>("/api/v1/sessions")).sessions,
  history: async (sessionId: string) => (await request<{ history: Detection[] }>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/history`)).history,
  reports: async () => (await request<{ reports: Report[] }>("/api/v1/reports")).reports,
  catalog: async () => (await request<{ gestures: { id: number; label: string; sampleCount: number }[] }>("/api/v1/catalog")).gestures,
  adminUsers: async () => (await request<{ users: { id: string; name: string; email: string; role: User["role"]; totalSigns: number; totalSessions: number }[] }>("/api/v1/admin/users")).users,
  adminHealth: () => request<{ api: string; database: string; catalogEntries: number }>("/api/v1/admin/health"),
  updateRole: (id: string, role: User["role"]) => request<{ updated: boolean }>(`/api/v1/admin/users/${encodeURIComponent(id)}/role`, { method: "PATCH", body: JSON.stringify({ role }) })
};
