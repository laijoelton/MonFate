/**to run this create and fill frontend/.env.local
 * cd frontend, then copy .env.example to .env.local (copy .env.example .env.local on Windows).
 *  Open .env.local and fill in: your Firebase config (6 values), 
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, and NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
 * 
 * 
 * then open first terminal
 * still in /frontend/ : npm install. then npm run dev.Leave this terminal open.
 * 
 * Terminal 2: create and fill backend_api/.env
    Open a second terminal. From the project root, cd backend_api, then copy .env.example to .env (copy .env.example .env on Windows). Fill in your (rotated) GEMINI_API_KEY — the other 4 values can stay as the example has them.
    5

    Terminal 2: install and start the backend
    Still in Terminal 2, inside backend_api: py -m pip install -r requirements.txt (first time only). Then go back up: cd .. and run: py -m uvicorn app.main:app --reload --port 8000 from inside backend_api — so: cd backend_api first if you're not already there, then run that command.
    6
    Open the app
    With both terminals still running, open http://localhost:3000 for the citizen app and http://localhost:3000/admin for the cockpit.

*/