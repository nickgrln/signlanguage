# Sign Language Detector

An FSL practice and translation web app. The browser runs the camera and MediaPipe hand landmark tracking; a Node.js API hosted on Render validates requests, enforces account/session rules, and writes classification results to Render PostgreSQL. A Python service hosts the trained Random Forest model. The camera feed is never sent to the API.

## Deployment architecture

```text
Browser (React 18 + Next.js on Vercel)
  ├─ MediaPipe Hands: camera → 21 landmarks → 63 normalized values
  ├─ Node.js REST API on Render
  │    ├─ Render PostgreSQL: accounts, sessions, history, reports, catalog
  │    └─ Python/FastAPI model service on Render: Random Forest inference
  └─ IndexedDB: queues confirmed signs while offline
```

The database script targets PostgreSQL only. It does not create a local database or use MySQL/XAMPP. Run its schema against the PostgreSQL database you create in Render.

## 1. Create the Render PostgreSQL database

1. In the Render dashboard, create a PostgreSQL database and choose a region.
2. Open its **Connect** panel and copy the **Internal Database URL**. Use the internal URL for a Render API service in the same region.
3. In the database's PSQL/Shell connection, execute `schema.sql`, followed by `seed.sql` if you want the sample catalog and demonstration records. These scripts create tables, constraints, indexes, the report/session trigger, and `session_summary` inside the selected database.
4. For a local database client, connect with Render's External Database URL instead. Do not commit either URL.

The demo seed users have disabled passwords and are not login accounts. After registering your real account, promote it to Admin from the Render PostgreSQL shell:

```sql
UPDATE users SET role = 'Admin' WHERE email = 'you@example.com';
```

Sign out and back in for the updated role to appear in the signed session.

## 2. Deploy the Node.js API to Render

Create a Render **Web Service** from this repository:

- Root Directory: `backend`
- Runtime: Node
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Health Check Path: `/health`

Configure these environment variables in the Render service:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Internal Database URL from Render PostgreSQL |
| `JWT_SECRET` | Random secret with at least 32 characters |
| `FRONTEND_ORIGIN` | Exact Vercel origin, e.g. `https://your-app.vercel.app` |
| `ML_SERVICE_URL` | Internal URL for the Python model service (see below) |
| `NODE_ENV` | `production` |

Render supplies `PORT`. The API also supports `ML_MOCK_MODE=true` for a clearly labeled UI demonstration when there is no trained model; never use that option for real interpretation or evaluation.

Authentication uses short-lived signed bearer tokens held for the current browser tab, which avoids third-party cookie restrictions between `vercel.app` and `onrender.com`. The API also sets an HttpOnly cookie where the browser accepts cross-origin cookies. Use HTTPS in production and set `FRONTEND_ORIGIN` to the precise deployed origin.

## 3. Deploy the Next.js/React frontend to Vercel

Import the repository into Vercel with the repository root as the project root. Vercel detects Next.js. Add:

```text
NEXT_PUBLIC_API_URL=https://your-api.onrender.com
```

Add the final Vercel URL to the Render `FRONTEND_ORIGIN` allowlist. If using a custom frontend domain, update that origin too. Redeploy both services after changing environment variables.

Local frontend:

```powershell
npm install
Copy-Item .env.example .env.local
# Set NEXT_PUBLIC_API_URL to your local or deployed Node API URL.
npm run dev
```

## 4. Run the Node API locally (optional)

Use a PostgreSQL connection string in `backend/.env` (or export `DATABASE_URL` in your shell), then:

```powershell
Set-Location backend
npm install
npm run dev
```

Example environment:

```text
DATABASE_URL=postgresql://user:password@localhost:5432/sign_language_db
JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
FRONTEND_ORIGIN=http://localhost:3000
ML_SERVICE_URL=http://127.0.0.1:8000
```

## 5. Train and deploy the FSL model (Python 3.10+)

Create labeled landmark data locally. Only numeric landmarks are saved; the collection script does not save camera frames:

```powershell
Set-Location ml
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python collect_landmarks.py --label HELLO --samples 150
python collect_landmarks.py --label A --samples 150
python train_model.py
```

Collect a balanced set of examples for **at least two classes** and varied signers/lighting before training. The training command reports held-out metrics and exports `ml/models/fsl_random_forest.joblib`; model files and collected personal samples are ignored by Git. For Render, deploy a Python Web Service with root directory `ml`, build command `pip install -r requirements.txt`, and start command `uvicorn main:app --host 0.0.0.0 --port $PORT`. Put a trained model in the service's `models` directory or configure `MODEL_PATH`; set the Node service's `ML_SERVICE_URL` to this service's internal URL.

If the model artifact is not present, `/health` reports `modelLoaded: false` and `/predict` returns `503`; there is no success-shaped fake prediction. Local/demo mode is separately opt-in using the Node API's `ML_MOCK_MODE=true`.

## Detection and storage rules

- The API refuses any prediction request that does not contain exactly 63 finite normalized values.
- Only confidence of **70% or higher** can be persisted.
- Both the UI and API suppress the same consecutive sign within **800 ms**. PostgreSQL advisory locks serialize concurrent writes for a user's active session.
- An authenticated owner must have an active session before history can be inserted.
- The history API returns at most the **20 newest** records for one session.
- A PostgreSQL `AFTER INSERT` trigger updates report aggregates, the user's sign count, and session counts atomically.
- Audio uses the `fil-PH` voice when installed and displays a notice when the browser falls back.

## Smoke checks

1. Verify Render API `/health` returns `status: ok` and a database latency.
2. Register a Signer, log in, allow camera access, start a session, and test that signs below 70% are not saved.
3. Submit identical signs within 800 ms and confirm only one history entry; wait 800 ms and confirm the next may save.
4. End the session, then verify history is newest-first and capped at 20, reports and counters updated, and another user's session cannot be accessed.
5. Log in as Listener and verify session creation is denied; log in as Admin and test role management.
6. Block the network during a detection and reconnect; queued detections should retry against the API.
7. Measure end-to-end latency and PostgreSQL insert latency in the target Render region. Network distance and cold starts affect the <100 ms/frame and <15 ms insert goals; confirm these empirically before relying on them.

This product is a practice and communication aid for selected signs, not a substitute for an FSL teacher or qualified interpreter.
