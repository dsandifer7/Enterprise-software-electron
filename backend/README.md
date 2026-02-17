# FastAPI Setup

## 1) Create and activate a virtual environment (Windows PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

## 2) Install dependencies

```powershell
pip install -r requirements.txt
```

## 3) Run the API

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 4) Test it

- Health: `http://127.0.0.1:8000/health`
- Swagger UI: `http://127.0.0.1:8000/docs`

## 5) Test tenant key validation

```powershell
$body = @{ tenant_key = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/activation/validate" -ContentType "application/json" -Body $body
```

## 6) Test users table

Create user:

```powershell
$userBody = @{
  tenant_id = "tenant-aaaaaaaaaaaa"
  email = "admin@business.com"
  password = "changeme123"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/users" -ContentType "application/json" -Body $userBody
```

List users:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/users"
```
