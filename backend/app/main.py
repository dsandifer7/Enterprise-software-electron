from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import re
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal, engine, Base
from app.models import User

app = FastAPI(title="Enterprise Software Backend")
HEX_256_PATTERN = re.compile(r"^[a-fA-F0-9]{64}$")


class ActivationRequest(BaseModel):
    tenant_key: str = Field(min_length=64, max_length=64)


class ActivationResponse(BaseModel):
    tenant_id: str
    business_name: str
    api_base_url: str


class CreateUserRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=255)


class UserResponse(BaseModel):
    id: int
    tenant_id: str
    email: str


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/activation/validate", response_model=ActivationResponse)
def validate_activation(payload: ActivationRequest) -> ActivationResponse:
    tenant_key = payload.tenant_key.strip().lower()

    if not HEX_256_PATTERN.match(tenant_key):
        raise HTTPException(
            status_code=400,
            detail="Tenant key must be a valid 64-character hex string.",
        )

    # Placeholder tenancy mapping. Replace with DB lookup when tenant registry is ready.
    tenant_segment = tenant_key[:12]
    tenant_id = f"tenant-{tenant_segment}"

    return ActivationResponse(
        tenant_id=tenant_id,
        business_name=f"Business {tenant_segment.upper()}",
        api_base_url=f"https://api.example.com/{tenant_id}",
    )


@app.post("/users", response_model=UserResponse)
def create_user(payload: CreateUserRequest) -> UserResponse:
    session = SessionLocal()
    try:
        user = User(
            tenant_id=payload.tenant_id.strip(),
            email=payload.email.strip().lower(),
            # Placeholder only. Replace with a secure password hash (Argon2/bcrypt).
            password_hash=f"plain:{payload.password}",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return UserResponse(id=user.id, tenant_id=user.tenant_id, email=user.email)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="User email already exists.")
    finally:
        session.close()


@app.get("/users", response_model=list[UserResponse])
def list_users() -> list[UserResponse]:
    session = SessionLocal()
    try:
        users = session.execute(select(User).order_by(User.id.desc())).scalars().all()
        return [UserResponse(id=user.id, tenant_id=user.tenant_id, email=user.email) for user in users]
    finally:
        session.close()
