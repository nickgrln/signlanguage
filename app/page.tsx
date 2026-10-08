"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHandTracking } from "../hooks/useHandTracking";
import { api, type Detection, type Report, type Session, type User } from "../lib/api";
import { enqueueOffline, flushOffline } from "../lib/offline";

type Screen = "welcome" | "live" | "dashboard" | "history" | "reports" | "learn" | "admin" | "settings";
type CatalogItem = { id: number; label: string; sampleCount: number };

const navigation: { id: Screen; label: string; icon: string; roles?: User["role"][] }[] = [
  { id: "live", label: "Live translator", icon: "◉", roles: ["Signer", "Admin"] },
  { id: "dashboard", label: "Overview", icon: "⌂" },
  { id: "history", label: "Session history", icon: "◷" },
  { id: "reports", label: "Accuracy reports", icon: "▥", roles: ["Signer", "Admin"] },
  { id: "learn", label: "Learn signs", icon: "✳" },
  { id: "admin", label: "Admin console", icon: "◇", roles: ["Admin"] },
  { id: "settings", label: "Settings", icon: "⚙" }
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = window.localStorage.getItem("sld-theme");
    const initial = saved === "dark" || saved === "light" ? saved :
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
    void api.me().then((current) => {
      if (current) {
        setUser(current);
        setScreen("dashboard");
      }
    });
  }, []);

  const changeTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("sld-theme", next);
  };

  const onAuthenticated = (signedInUser: User) => {
    setUser(signedInUser);
    setScreen(signedInUser.role === "Listener" ? "dashboard" : "live");
    setAuthMode(null);
    setError("");
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setScreen("welcome");
  };

  return (
    <main className="app-shell">
      {user ? (
        <div className="workspace">
          <Sidebar user={user} screen={screen} onNavigate={setScreen} onLogout={logout} />
          <section className="main-column">
            <header className="topbar">
              <div className="breadcrumb"><span>Workspace</span><i>/</i><strong>{navigation.find((item) => item.id === screen)?.label ?? "Welcome"}</strong></div>
              <div className="top-actions">
                <span className="privacy-pill"><span className="privacy-dot" /> Video stays on this device</span>
                <button className="icon-button theme-toggle" onClick={changeTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
                  {theme === "dark" ? "☼" : "☾"}
                </button>
                <button className="avatar" aria-label={`Signed in as ${user.name}`}>{user.name.charAt(0).toUpperCase()}</button>
              </div>
            </header>
            {screen === "live" && <LiveScreen user={user} onError={setError} />}
            {screen === "dashboard" && <Dashboard user={user} onNavigate={setScreen} onError={setError} />}
            {screen === "history" && <HistoryScreen />}
            {screen === "reports" && <ReportsScreen />}
            {screen === "learn" && <LearnScreen />}
            {screen === "admin" && <AdminScreen onError={setError} />}
            {screen === "settings" && <SettingsScreen onTheme={changeTheme} theme={theme} />}
            <div className="toast-region" aria-live="polite">{error && <div className="toast"><span>!</span>{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}</div>
          </section>
        </div>
      ) : (
        <Welcome
          authMode={authMode}
          onAuthMode={setAuthMode}
          onAuthenticated={onAuthenticated}
          onTheme={changeTheme}
          theme={theme}
        />
      )}
    </main>
  );
}

function Brand() {
  return <div className="brand"><div className="brand-mark"><span>⌁</span><i /></div><span>sign<span className="brand-accent">flow</span></span></div>;
}

function Sidebar({ user, screen, onNavigate, onLogout }: {
  user: User; screen: Screen; onNavigate: (screen: Screen) => void; onLogout: () => void;
}) {
  const items = navigation.filter((item) => !item.roles || item.roles.includes(user.role));
  return (
    <aside className="sidebar">
      <Brand />
      <div className="side-label">YOUR SPACE</div>
      <nav aria-label="Main navigation" className="side-nav">
        {items.map((item) => (
          <button key={item.id} className={`nav-item ${screen === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)}>
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
            {item.id === "live" && <span className="live-indicator" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-tip">
        <div className="tip-icon">✦</div><strong>A little practice goes far</strong>
        <p>Every sign you learn opens a new way to connect.</p>
        <button onClick={() => onNavigate("learn")}>Explore the guide <span>→</span></button>
      </div>
      <div className="user-card">
        <div className="avatar avatar-small">{user.name.charAt(0).toUpperCase()}</div>
        <div className="user-copy"><strong>{user.name}</strong><span>{user.role}</span></div>
        <button className="logout-button" onClick={onLogout} aria-label="Sign out">↗</button>
      </div>
    </aside>
  );
}

function Welcome({ authMode, onAuthMode, onAuthenticated, onTheme, theme }: {
  authMode: "login" | "register" | null;
  onAuthMode: (mode: "login" | "register" | null) => void;
  onAuthenticated: (user: User) => void;
  onTheme: () => void;
  theme: string;
}) {
  return (
    <div className="welcome-page">
      <header className="welcome-nav"><Brand /><div className="welcome-links"><a href="#how-it-works">How it works</a><a href="#our-approach">Our approach</a></div>
        <div className="welcome-actions"><button className="icon-button" onClick={onTheme} aria-label={`Switch theme`}>{theme === "dark" ? "☼" : "☾"}</button><button className="button button-quiet" onClick={() => onAuthMode("login")}>Log in</button><button className="button button-dark" onClick={() => onAuthMode("register")}>Get started <span>↗</span></button></div>
      </header>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" /> MADE FOR MORE WAYS TO CONNECT</div>
          <h1>Every sign<br />says <span>something.</span></h1>
          <p className="hero-description">A thoughtful companion for Filipino Sign Language. Practice, translate, and make every conversation feel a little closer.</p>
          <div className="hero-buttons"><button className="button button-dark button-large" onClick={() => onAuthMode("register")}>Try it for free <span>↗</span></button><button className="button button-outline button-large" onClick={() => onAuthMode("login")}><span className="play-icon">▷</span> I already have an account</button></div>
          <div className="hero-trust"><span className="avatar-stack"><i>J</i><i>M</i><i>A</i></span><span>Built for practice, made for people</span><span className="trust-separator">·</span><span>Privacy-first by design</span></div>
        </div>
        <div className="hero-art" aria-label="Illustration of sign language being translated"><div className="art-glow" />
          <div className="demo-window"><div className="demo-head"><div className="demo-live"><i /> LIVE DEMO</div><span>FSL · Filipino</span></div>
            <div className="demo-camera"><div className="camera-orbit orbit-one" /><div className="camera-orbit orbit-two" /><div className="hand-illustration"><svg viewBox="0 0 230 260" role="img" aria-label="Line illustration of a hand signing"><path d="M75 235c-9-25-18-47-23-66-3-12-3-23 3-28 7-6 17 2 22 13l17 34-12-91c-1-10 4-17 12-17 8 0 13 5 14 15l12 68-1-119c0-10 5-17 13-17s13 6 14 16l3 119 11-88c1-9 6-15 14-14 8 1 12 7 11 17l-5 91 9-43c2-10 9-14 16-11 7 2 10 9 8 18l-18 88c-8 39-31 61-67 61-27 0-45-16-52-46Z" /><path className="hand-line" d="m110 111 10 75m21-126 2 93m26-4-5 58m-51 5c17 11 40 13 59 4" /></svg></div>
              <div className="landmark l1" /><div className="landmark l2" /><div className="landmark l3" /><div className="landmark l4" /><div className="landmark l5" />
              <div className="face-box"><div className="face-box-label">HAND TRACKED <span>●</span></div></div>
            </div><div className="demo-caption"><div><small>WE THINK YOU SIGNED</small><strong>HELLO <span>👋</span></strong></div><div className="demo-confidence"><div className="mini-ring">92</div><span>CONFIDENCE</span></div></div>
          </div>
          <div className="floating-note note-one"><span className="note-check">✓</span><div><strong>Private by design</strong><small>Your video never leaves your device</small></div></div>
          <div className="floating-note note-two"><span className="note-wave">⌁</span><div><strong>HELLO!</strong><small>Spoken in Filipino</small></div><span className="sound-bars"><i /><i /><i /><i /><i /></span></div>
          <div className="hero-spark spark-one">✳</div><div className="hero-spark spark-two">✦</div>
        </div>
      </section>
      <section id="how-it-works" className="how-section"><div className="section-heading"><span className="eyebrow">SIMPLE AS A CONVERSATION</span><h2>Three steps. One more way to connect.</h2></div>
        <div className="steps">{[["01", "Sign", "Make a sign in front of your camera. Your video stays right here on your device.", "⌁"], ["02", "Detect", "On-device hand tracking spots the sign. No video is uploaded or saved.", "⌖"], ["03", "Speak", "See the translation appear, then choose to read it aloud in Filipino.", "♫"]].map(([n, title, text, icon], index) =>
          <article className="step-card" key={title}><div className={`step-icon step-${index + 1}`}>{icon}</div><span className="step-number">{n}</span><h3>{title}</h3><p>{text}</p>{index < 2 && <span className="step-arrow">→</span>}</article>)}</div>
      </section>
      <section id="our-approach" className="disclaimer"><span>✳</span><p><strong>A companion, not a replacement.</strong> Signflow recognizes a growing set of practice signs. It is not a substitute for a qualified sign language interpreter.</p></section>
      <footer className="welcome-footer"><Brand /><span>Made with care, for more ways to understand one another.</span><span>Filipino Sign Language · Privacy-first</span></footer>
      {authMode && <AuthDialog mode={authMode} onMode={onAuthMode} onAuthenticated={onAuthenticated} />}
    </div>
  );
}

function AuthDialog({ mode, onMode, onAuthenticated }: {
  mode: "login" | "register"; onMode: (mode: "login" | "register" | null) => void; onAuthenticated: (user: User) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"Signer" | "Listener">("Signer");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = mode === "register"
        ? await api.register({ name: String(data.get("name")), email: String(data.get("email")), password: String(data.get("password")), role })
        : await api.login({ email: String(data.get("email")), password: String(data.get("password")) });
      onAuthenticated(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t sign you in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onMode(null); }}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="dialog-close" onClick={() => onMode(null)} aria-label="Close">×</button><Brand />
      <span className="auth-kicker">{mode === "login" ? "WELCOME BACK" : "YOUR NEXT CONVERSATION STARTS HERE"}</span>
      <h2 id="auth-title">{mode === "login" ? "Good to see you." : "Let's get started."}</h2>
      <p>{mode === "login" ? "Pick up where you left off." : "Create a free account to start practicing."}</p>
      <form onSubmit={submit}>
        {mode === "register" && <label>Your name<input name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="How should we call you?" /></label>}
        <label>Email address<input type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label>Password<input type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 10 : 1} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /></label>
        {mode === "register" && <label>I’m here as<select value={role} onChange={(event) => setRole(event.target.value as "Signer" | "Listener")}><option value="Signer">FSL signer</option><option value="Listener">Listener</option></select></label>}
        {error && <div className="form-error" role="alert">◉ {error}</div>}
        <button className="button button-dark auth-submit" type="submit" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Log in" : "Create my account"} <span>↗</span></button>
      </form>
      <div className="auth-switch">{mode === "login" ? "New to Signflow?" : "Already have an account?"} <button onClick={() => { setError(""); onMode(mode === "login" ? "register" : "login"); }}>{mode === "login" ? "Create an account" : "Log in"}</button></div>
      <div className="auth-safe">🔒 Your account details are encrypted and stored securely.</div>
    </section>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function LiveScreen({ user, onError }: { user: User; onError: (message: string) => void }) {
  const [sessionId, setSessionId] = useState("");
  const [sessionStarted, setSessionStarted] = useState<number | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [translation, setTranslation] = useState("");
  const [lastPrediction, setLastPrediction] = useState<{ sign: string; confidence: number } | null>(null);
  const [modelMessage, setModelMessage] = useState("Position one hand inside the frame to begin.");
  const [speaking, setSpeaking] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const media = useHandTracking({
    enabled: Boolean(sessionId),
    onLandmarks: async (landmarks) => {
      try {
        const predicted = await api.predict(landmarks);
        setLastPrediction(predicted);
        setModelMessage(predicted.confidence >= 70 ? "Sign recognized" : "Hold your sign steady for a clearer reading.");
        if (predicted.confidence < 70) return;
        const previous = detections[0];
        if (previous?.sign === predicted.sign && Date.now() - new Date(previous.detectedAt).getTime() < 800) return;
        if (!sessionId) return;
        let saved: { accepted: boolean; reason?: string; historyId?: string };
        try {
          saved = await api.saveDetection(sessionId, { ...predicted, sessionId });
        } catch (caught) {
          if (navigator.onLine || predicted.confidence < 70) throw caught;
          await enqueueOffline({ ...predicted, sessionId });
          setModelMessage("Offline — this sign is queued to sync when you reconnect.");
          return;
        }
        if (!saved.accepted) return;
        const record = { id: saved.historyId ?? crypto.randomUUID(), sign: predicted.sign, confidence: predicted.confidence, detectedAt: new Date().toISOString() };
        setDetections((current) => [record, ...current].slice(0, 20));
        setTranslation((current) => current ? `${current} ${predicted.sign}` : predicted.sign);
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : "Could not classify the current frame.");
      }
    }
  });

  useEffect(() => {
    if (sessionStarted === null) {
      return;
    }
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [sessionStarted]);

  useEffect(() => {
    const sync = () => { void flushOffline(async (record) => api.saveDetection(record.sessionId, record)); };
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, []);

  const elapsed = useMemo(() => sessionStarted ? Math.floor((now - sessionStarted) / 1000) : 0, [sessionStarted, now]);
  const timerText = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const startSession = async () => {
    try {
      const started = await api.startSession();
      setSessionId(started.sessionId);
      const now = Date.now();
      setSessionStarted(now);
      setDetections([]);
      setTranslation("");
      setModelMessage("Camera is ready. Try a sign from the learning guide.");
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not start your session.");
    }
  };
  const endSession = async () => {
    try {
      await api.endSession(sessionId);
      setSessionId("");
      setSessionStarted(null);
      setLastPrediction(null);
      setModelMessage("Session complete. Nice work showing up to practice.");
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not end your session.");
    }
  };
  const speak = () => {
    if (!translation || !("speechSynthesis" in window)) {
      setVoiceNotice("Speech playback isn’t available in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(translation);
    const voices = window.speechSynthesis.getVoices();
    const filipino = voices.find((voice) => voice.lang.toLowerCase() === "fil-ph");
    if (filipino) {
      utterance.voice = filipino;
      utterance.lang = "fil-PH";
      setVoiceNotice("");
    } else {
      utterance.lang = "fil-PH";
      setVoiceNotice("A Filipino voice isn’t installed in this browser. Your device may use its default voice.");
    }
    utterance.rate = 0.92;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => { setSpeaking(false); setVoiceNotice("Speech playback could not start. Check your browser’s speech settings."); };
    window.speechSynthesis.speak(utterance);
  };

  return <div className="content-page live-page">
    <PageHeading eyebrow="YOUR PRACTICE SPACE" title={user.role === "Listener" ? "Listen & follow along" : "Let’s make a connection."} description="Show a sign. We’ll help put it into words." action={<div className="session-stats"><span className="stat-live"><i /> {sessionId ? "SESSION LIVE" : "READY WHEN YOU ARE"}</span><span>◷ {timerText}</span><span>✳ {detections.length} signs</span></div>} />
    {user.role === "Listener" ? <div className="listener-message"><div className="listener-icon">⌁</div><h2>Your space to follow along</h2><p>Ask a signer to share their session to see a live translation here. You can also browse past sessions and practice signs together.</p></div> :
      <div className="translator-grid">
        <div className="camera-column">
          <div className={`camera-card ${media.cameraState === "ready" ? "camera-active" : ""}`}>
            <video ref={media.videoRef} className="camera-video" autoPlay muted playsInline aria-label="Live mirrored camera feed" />
            <canvas ref={media.canvasRef} className="camera-overlay" aria-hidden="true" />
            {media.cameraState !== "ready" && <div className="camera-empty">
              <div className={`camera-empty-icon ${media.cameraState === "loading" ? "pulse" : ""}`}>{media.cameraState === "error" ? "!" : "⌖"}</div>
              <strong>{media.cameraState === "loading" ? "Warming up your camera…" : media.cameraState === "error" ? "We couldn’t open the camera" : "Your camera, your space"}</strong>
              <p>{media.error || "Allow camera access when your browser asks. Video stays on this device."}</p>
              {media.cameraState !== "loading" && <button className="button button-outline camera-permission" onClick={media.startCamera}>{media.cameraState === "error" ? "Try camera again" : "Enable my camera"} <span>↗</span></button>}
            </div>}
            {media.cameraState === "ready" && <>
              <div className="camera-status"><i /> CAMERA ON · PRIVATE</div>
              <div className="camera-hint">{modelMessage}</div>
            </>}
            {media.cameraState === "ready" && lastPrediction && <div className="detection-float">
              <div className={`confidence-ring ${lastPrediction.confidence >= 90 ? "high" : lastPrediction.confidence >= 70 ? "medium" : "low"}`} role="img" aria-label={`${Math.round(lastPrediction.confidence)} percent confidence`} style={{ "--confidence": `${lastPrediction.confidence}%` } as React.CSSProperties}><span>{Math.round(lastPrediction.confidence)}<small>%</small></span></div>
              <div><small>{lastPrediction.confidence >= 70 ? "DETECTED SIGN" : "KEEP HOLDING"}</small><strong>{lastPrediction.sign}</strong></div>
            </div>}
            {media.cameraState === "ready" && !sessionId && <div className="camera-cta"><button className="button button-dark" onClick={startSession}>Start a session <span>→</span></button></div>}
            {media.cameraState === "ready" && sessionId && <div className="camera-cta"><button className="button button-stop" onClick={endSession}><span /> End session</button></div>}
            {media.cameraState === "ready" && <span className="camera-frame frame-tl" />}
            {media.cameraState === "ready" && <span className="camera-frame frame-tr" />}
            {media.cameraState === "ready" && <span className="camera-frame frame-bl" />}
            {media.cameraState === "ready" && <span className="camera-frame frame-br" />}
          </div>
          <p className="camera-privacy"><span>▣</span> Camera processing happens on this device. Only your confirmed text and confidence are saved.</p>
        </div>
        <div className="translation-column">
          <section className="panel translation-card"><div className="panel-heading"><div><span className="eyebrow">YOUR WORDS, TAKING SHAPE</span><h2>Translation output</h2></div><span className="language-tag">EN · FSL</span></div>
            <div className="translation-output" aria-live="polite" aria-atomic="true">{translation || <span className="output-placeholder">Your signs will find their words here…</span>}</div>
            <div className="translation-actions"><button className="button button-dark speak-button" disabled={!translation} onClick={speak}><span>{speaking ? "Ⅱ" : "♫"}</span>{speaking ? "Speaking…" : "Speak in Filipino"}</button><div className="output-tools"><button className="icon-button" disabled={!translation} onClick={() => void navigator.clipboard.writeText(translation)} aria-label="Copy translation">▢</button><button className="icon-button" disabled={!translation} onClick={() => setTranslation((current) => current.trim().split(/\s+/).slice(0, -1).join(" "))} aria-label="Remove last word">⌫</button><button className="icon-button" disabled={!translation} onClick={() => setTranslation("")} aria-label="Clear translation">×</button></div></div>
            {voiceNotice && <p className="inline-notice" role="status">ⓘ {voiceNotice}</p>}
          </section>
          <section className="panel recent-card"><div className="panel-heading"><div><span className="eyebrow">THIS SESSION</span><h2>Recent signs <span className="count-badge">{detections.length}</span></h2></div><span className="subtle">Latest first</span></div>
            {detections.length ? <div className="recent-list">{detections.slice(0, 20).map((item) => <div className="recent-row" key={item.id}><div className="sign-bubble">{item.sign.slice(0, 1)}</div><div className="recent-label"><strong>{item.sign}</strong><span>{new Date(item.detectedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div><span className={`confidence-tag ${item.confidence >= 90 ? "confidence-high" : ""}`}>{Math.round(item.confidence)}%</span></div>)}</div>
              : <div className="recent-empty"><span>⌁</span><strong>No signs yet</strong><p>{sessionId ? "When you sign, your accepted detections will appear here." : "Start a session whenever you’re ready to practice."}</p></div>}
          </section>
          <div className="interpreter-note"><span>✳</span><p>Designed for practice and everyday support. Signflow isn’t a replacement for a qualified FSL interpreter.</p></div>
        </div>
      </div>}
  </div>;
}

function Dashboard({ user, onNavigate, onError }: { user: User; onNavigate: (screen: Screen) => void; onError: (message: string) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [signTotal, setSignTotal] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  useEffect(() => {
    void Promise.all([api.sessions(), api.reports()]).then(([history, summary]) => {
      setSessions(history);
      setReports(summary);
      setSignTotal(history.reduce((sum, session) => sum + session.signsDetected, 0));
      setSessionTotal(history.length);
    }).catch((caught) => onError(caught instanceof Error ? caught.message : "Could not load your dashboard."));
  }, [onError]);
  const accuracy = reports.length ? Math.round(reports.reduce((sum, item) => sum + item.avgConfidence, 0) / reports.length) : 0;
  return <div className="content-page"><PageHeading eyebrow={`GOOD TO SEE YOU, ${user.name.split(" ")[0].toUpperCase()}`} title={user.role === "Listener" ? "Stay in the conversation." : "Your practice, at a glance."} description="A little progress, one sign at a time." action={<button className="button button-dark" onClick={() => onNavigate(user.role === "Listener" ? "learn" : "live")}>{user.role === "Listener" ? "Explore signs" : "Start practicing"} <span>↗</span></button>} />
    <div className="stats-grid">
      <StatCard icon="⌁" label="Signs recognized" value={signTotal.toLocaleString()} note="Across your saved sessions" variant="lavender" />
      <StatCard icon="◷" label="Practice sessions" value={sessionTotal.toString()} note="Every moment adds up" variant="mint" />
      <StatCard icon="◎" label="Average confidence" value={`${accuracy}%`} note={accuracy ? "Based on your sign reports" : "Your first practice is a good start"} variant="peach" />
      <StatCard icon="✦" label="Signs to explore" value="31" note="A growing FSL practice set" variant="blue" />
    </div>
    <div className="dashboard-columns"><section className="panel sessions-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR JOURNEY</span><h2>Recent sessions</h2></div><button className="text-link" onClick={() => onNavigate("history")}>See all <span>→</span></button></div>
      {sessions.length ? sessions.slice(0, 5).map((session) => <div className="session-row" key={session.id}><span className="session-date-icon">◷</span><div className="session-row-main"><strong>{new Date(session.startedAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</strong><small>{new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {session.uniqueSigns} unique signs</small></div><span className="session-count">{session.signsDetected} signs</span></div>)
      : <div className="empty-state"><div className="empty-art">⌁</div><strong>Your story starts with one sign.</strong><p>Start a session to see your progress unfold here.</p><button className="text-link" onClick={() => onNavigate("live")}>Try your first session →</button></div>}</section>
      <section className="panel progress-panel"><div className="panel-heading"><div><span className="eyebrow">LITTLE BY LITTLE</span><h2>Signs you’re learning</h2></div><button className="text-link" onClick={() => onNavigate("reports")}>View report →</button></div>
        {reports.length ? reports.slice(0, 5).map((item) => <div className="progress-row" key={item.sign}><span>{item.sign}</span><div className="progress-track"><i style={{ width: `${Math.min(100, item.avgConfidence)}%` }} /></div><strong>{Math.round(item.avgConfidence)}%</strong></div>) : <div className="report-empty"><span>✳</span><p>Once you practice, your strongest signs will show up here.</p></div>}
        <button className="practice-card" onClick={() => onNavigate("learn")}><span>✦</span><span><strong>Keep exploring</strong><small>Try a new sign today</small></span><b>→</b></button>
      </section></div>
    <div className="dashboard-footnote"><span>ⓘ</span> Your video is processed locally and never stored. Only confirmed text results and practice metrics are saved.</div>
  </div>;
}

function StatCard({ icon, label, value, note, variant }: { icon: string; label: string; value: string; note: string; variant: string }) {
  return <article className="stat-card"><div className={`stat-icon ${variant}`}>{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></article>;
}

function HistoryScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<Detection[]>([]);
  useEffect(() => { void api.sessions().then((rows) => { setSessions(rows); if (rows[0]) setSelected(rows[0].id); }).catch(() => {}); }, []);
  useEffect(() => { if (selected) void api.history(selected).then(setHistory).catch(() => setHistory([])); }, [selected]);
  const visible = history.filter((item) => item.sign.includes(query.trim().toUpperCase()));
  return <div className="content-page"><PageHeading eyebrow="LOOKING BACK" title="Your sessions, remembered." description="A private record of your practice, ready whenever you are." />
    <div className="filter-bar"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a sign…" aria-label="Filter signs" /></label><label className="select-wrap"><span className="sr-only">Choose a session</span><select value={selected} onChange={(event) => setSelected(event.target.value)}>{sessions.map((session) => <option key={session.id} value={session.id}>{new Date(session.startedAt).toLocaleDateString()} · {session.signsDetected} signs</option>)}</select></label></div>
    <section className="panel history-panel"><div className="panel-heading"><div><span className="eyebrow">LATEST FIRST</span><h2>Detections <span className="count-badge">{visible.length}</span></h2></div><span className="subtle">Showing up to 20 signs</span></div>
      {visible.length ? <div className="table-scroll"><table><thead><tr><th>SIGN</th><th>CONFIDENCE</th><th>DATE & TIME</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><span className="table-sign">{item.sign.slice(0, 1)}</span><strong>{item.sign}</strong></td><td><span className="table-confidence"><i style={{ width: `${item.confidence}%` }} />{Math.round(item.confidence)}%</span></td><td>{new Date(item.detectedAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-art">◷</div><strong>No saved signs just yet.</strong><p>Once you complete a session, its signs will be here.</p></div>}
    </section>
  </div>;
}

function ReportsScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  useEffect(() => { void Promise.all([api.reports(), api.catalog()]).then(([summary, gestures]) => { setReports(summary); setCatalog(gestures); }).catch(() => {}); }, []);
  const bySign = new Map(reports.map((item) => [item.sign, item]));
  const strongest = [...reports].sort((a, b) => b.avgConfidence - a.avgConfidence).slice(0, 3);
  const weakest = [...reports].sort((a, b) => a.avgConfidence - b.avgConfidence).slice(0, 3);
  return <div className="content-page"><PageHeading eyebrow="YOUR LEARNING, IN PERSPECTIVE" title="Confidence comes with practice." description="A gentle look at the signs you know and the ones you’re growing into." />
    <div className="report-highlights"><section className="highlight-card strongest"><span className="eyebrow">YOUR STRONGEST SIGNS</span><h2>Look at you go.</h2>{strongest.length ? strongest.map((item) => <div className="highlight-row" key={item.sign}><span className="highlight-emoji">✦</span><strong>{item.sign}</strong><span>{Math.round(item.avgConfidence)}%</span></div>) : <p>Your strongest signs will appear after your first session.</p>}</section>
      <section className="highlight-card growing"><span className="eyebrow">ROOM TO GROW</span><h2>Every try counts.</h2>{weakest.length ? weakest.map((item) => <div className="highlight-row" key={item.sign}><span className="highlight-emoji">↗</span><strong>{item.sign}</strong><span>{Math.round(item.avgConfidence)}%</span></div>) : <p>Practice a few signs to see your next steps here.</p>}</section></div>
    <section className="panel report-grid-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR FSL SIGN LIBRARY</span><h2>Practice, one sign at a time</h2></div><span className="subtle">Confidence is a guide, not a grade.</span></div><div className="report-sign-grid">{(catalog.length ? catalog : "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((label, id) => ({ id, label, sampleCount: 0 }))).map((item) => { const result = bySign.get(item.label); return <div className={`report-sign ${result && result.avgConfidence >= 90 ? "sign-mastered" : ""}`} key={item.label}><span>{item.label.slice(0, 2)}</span><small>{result ? `${Math.round(result.avgConfidence)}%` : "—"}</small><div className="sign-meter"><i style={{ width: `${result?.avgConfidence ?? 0}%` }} /></div></div>; })}</div>
    </section>
  </div>;
}

function LearnScreen() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [filter, setFilter] = useState("");
  useEffect(() => { void api.catalog().then(setCatalog).catch(() => setCatalog([])); }, []);
  const signs = catalog.filter((item) => item.label.includes(filter.toUpperCase()));
  return <div className="content-page"><PageHeading eyebrow="A FRIENDLY PLACE TO BEGIN" title="Learn at your own pace." description="Start with a letter, discover a word, and make it yours." />
    <label className="search-field learn-search"><span>⌕</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search letters and signs…" aria-label="Search sign catalog" /></label>
    <div className="learn-grid">{signs.map((item) => <article className="learn-card" key={item.id}><div className="learn-card-head"><span className="learn-letter">{item.label.slice(0, 1)}</span><span className="catalog-samples">{item.sampleCount} samples</span></div><h3>{item.label}</h3><p>{item.label.length === 1 ? `Practice the letter ${item.label}. Use a clear hand shape and hold it steady.` : `Practice the FSL sign for “${item.label.toLowerCase()}”. Watch the camera preview for feedback.`}</p><button className="learn-card-link" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>View practice guide <span>↗</span></button></article>)}
      {!signs.length && <div className="panel learn-empty"><span>✳</span><h2>{filter ? "No matching signs yet" : "The sign library is getting ready"}</h2><p>{filter ? "Try searching for a letter or another word." : "Connect the API and catalog to explore the full collection."}</p></div>}</div>
    <div className="interpreter-note learn-disclaimer"><span>ⓘ</span><p>Sign variations can differ by community. This learning library is a practice aid, not a substitute for an FSL teacher or interpreter.</p></div>
  </div>;
}

function AdminScreen({ onError }: { onError: (message: string) => void }) {
  const [users, setUsers] = useState<{ id: string; name: string; email: string; role: User["role"]; totalSigns: number; totalSessions: number }[]>([]);
  const [health, setHealth] = useState<{ api: string; database: string; catalogEntries: number } | null>(null);
  useEffect(() => { void Promise.all([api.adminUsers(), api.adminHealth()]).then(([records, status]) => { setUsers(records); setHealth(status); }).catch((caught) => onError(caught instanceof Error ? caught.message : "Could not load admin overview.")); }, [onError]);
  const updateRole = async (id: string, role: User["role"]) => {
    try { await api.updateRole(id, role); setUsers((current) => current.map((item) => item.id === id ? { ...item, role } : item)); }
    catch (caught) { onError(caught instanceof Error ? caught.message : "Could not update that role."); }
  };
  return <div className="content-page"><PageHeading eyebrow="SYSTEM ADMINISTRATION" title="Everything in good hands." description="A clear view of people, signs, and system health." />
    <div className="admin-health-grid"><div className="health-card"><span>NODE API</span><strong><i /> {health?.api ?? "Checking…"}</strong><small>Render service</small></div><div className="health-card"><span>MYSQL DATABASE</span><strong><i /> {health?.database ?? "Checking…"}</strong><small>sign_language_db</small></div><div className="health-card"><span>GESTURE CATALOG</span><strong>{health?.catalogEntries ?? "—"} signs</strong><small>Supported practice classes</small></div></div>
    <section className="panel admin-users"><div className="panel-heading"><div><span className="eyebrow">PEOPLE & PERMISSIONS</span><h2>Account management</h2></div><span className="count-badge">{users.length}</span></div>
      <div className="table-scroll"><table><thead><tr><th>NAME</th><th>ROLE</th><th>SESSIONS</th><th>SIGNS</th></tr></thead><tbody>{users.map((record) => <tr key={record.id}><td><strong>{record.name}</strong><small className="table-email">{record.email}</small></td><td><select className="role-select" value={record.role} onChange={(event) => void updateRole(record.id, event.target.value as User["role"])} aria-label={`Role for ${record.name}`}><option>Signer</option><option>Listener</option><option>Admin</option></select></td><td>{record.totalSessions}</td><td>{record.totalSigns}</td></tr>)}</tbody></table></div>
    </section>
    <div className="interpreter-note"><span>⚠</span><p>Role changes take effect for new sign-ins. Review elevated Admin access regularly.</p></div>
  </div>;
}

function SettingsScreen({ onTheme, theme }: { onTheme: () => void; theme: string }) {
  const [highContrast, setHighContrast] = useState(false);
  return <div className="content-page"><PageHeading eyebrow="MAKE IT YOURS" title="A space that feels right." description="Small choices to make practice more comfortable." />
    <div className="settings-grid"><section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">APPEARANCE</span><h2>Theme</h2></div><span className="settings-icon">☼</span></div><p>Choose the view that feels easiest on your eyes.</p><div className="theme-options"><button className={`theme-option ${theme === "light" ? "selected" : ""}`} onClick={() => theme !== "light" && onTheme()}><span className="theme-preview light-preview">☼</span><strong>Light</strong></button><button className={`theme-option ${theme === "dark" ? "selected" : ""}`} onClick={() => theme !== "dark" && onTheme()}><span className="theme-preview dark-preview">☾</span><strong>Dark</strong></button></div></section>
      <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">SPEECH</span><h2>Spoken translations</h2></div><span className="settings-icon">♫</span></div><p>Use a Filipino voice when one is available on your device.</p><div className="setting-value"><span>Preferred voice</span><strong>Filipino · fil-PH <i className="setting-check">✓</i></strong></div><div className="setting-value"><span>Speech speed</span><strong>Gentle · 0.92×</strong></div></section>
      <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">ACCESSIBILITY</span><h2>Your comfort matters</h2></div><span className="settings-icon">◎</span></div><p>Adjust visual settings to support the way you interact.</p><label className="setting-toggle"><span><strong>High contrast</strong><small>Increase distinction between surfaces</small></span><input type="checkbox" checked={highContrast} onChange={(event) => { setHighContrast(event.target.checked); document.documentElement.classList.toggle("high-contrast", event.target.checked); }} /><i /></label><div className="setting-value"><span>Motion</span><strong>Follows your device preference</strong></div></section>
      <section className="panel settings-panel privacy-settings"><div className="panel-heading"><div><span className="eyebrow">PRIVACY, ALWAYS</span><h2>Your camera stays yours.</h2></div><span className="settings-icon">▣</span></div><p>Hand tracking happens in your browser. The camera feed is never uploaded. Only confirmed sign labels and practice metrics are saved to your account.</p><div className="privacy-steps"><span>✓ Local camera processing</span><span>✓ Encrypted account sign-in</span><span>✓ You can clear your own saved history</span></div></section></div>
  </div>;
}
