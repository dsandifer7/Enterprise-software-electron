# Enterprise Software Electron

## Quick Start (Windows PowerShell)

From the project root:

```powershell
cd "C:[insert path here]\Enterprise software\Enterprise-Software-Electron"
npm install
```

Set up backend dependencies:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
```

Run everything (backend + renderer + Electron app):

```powershell
npm run dev:full
```

## Manual Run (Optional)

Terminal 1:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2:

```powershell
cd "C:\Users\Kingc\Documents\CODE\Enterprise software\Enterprise-Software-Electron"
npm run dev
```

## Helpful URLs

- Backend health: `http://127.0.0.1:8000/health`
- Backend docs: `http://127.0.0.1:8000/docs`

## Notes

- Tenant bootstrap state is stored per machine in:
  `C:\Users\Kingc\AppData\Roaming\enterprise-software-electron\bootstrap-state.json`
- Backend-specific API test commands are in:
  `backend/README.md`
