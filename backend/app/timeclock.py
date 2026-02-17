from __future__ import annotations

import csv
import io
from datetime import date, datetime, time, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import (
    AuditLog,
    Employee,
    ManagerAlert,
    Shift,
    TimeEvent,
    TimePolicy,
    TimesheetApproval,
)

router = APIRouter(prefix="/timeclock", tags=["timeclock"])
EVENT_TYPES = {"clock_in", "clock_out", "break_start", "break_end"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_datetime(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {value}") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"Invalid date: {value}") from error


def log_action(session, tenant_id: str, actor: str, action: str, details: str) -> None:
    session.add(
        AuditLog(
            tenant_id=tenant_id,
            actor=actor or "system",
            action=action,
            details=details,
        )
    )


def get_or_create_policy(session, tenant_id: str) -> TimePolicy:
    policy = session.execute(select(TimePolicy).where(TimePolicy.tenant_id == tenant_id)).scalar_one_or_none()
    if policy:
        return policy
    policy = TimePolicy(tenant_id=tenant_id)
    session.add(policy)
    session.commit()
    session.refresh(policy)
    return policy


def compute_worked_minutes(events: list[TimeEvent], range_start: datetime, range_end: datetime) -> int:
    events_sorted = sorted(events, key=lambda e: e.occurred_at)
    clock_in_at = None
    break_start_at = None
    worked_seconds = 0

    for event in events_sorted:
        if event.occurred_at < range_start or event.occurred_at > range_end:
            continue

        if event.event_type == "clock_in":
            clock_in_at = event.occurred_at
            break_start_at = None
        elif event.event_type == "break_start" and clock_in_at and not break_start_at:
            break_start_at = event.occurred_at
        elif event.event_type == "break_end" and clock_in_at and break_start_at:
            if event.occurred_at > break_start_at:
                clock_in_at += event.occurred_at - break_start_at
            break_start_at = None
        elif event.event_type == "clock_out" and clock_in_at:
            end_at = event.occurred_at
            if break_start_at and end_at > break_start_at:
                end_at = break_start_at
            if end_at > clock_in_at:
                worked_seconds += int((end_at - clock_in_at).total_seconds())
            clock_in_at = None
            break_start_at = None

    return worked_seconds // 60


class EmployeeCreateRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    role: str = Field(default="staff", max_length=64)
    location: str = Field(default="", max_length=128)


class EmployeeResponse(BaseModel):
    id: int
    tenant_id: str
    full_name: str
    email: str
    role: str
    location: str
    is_active: bool


class TimeEventRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    employee_id: int
    event_type: Literal["clock_in", "clock_out", "break_start", "break_end"]
    occurred_at: str
    source: Literal["employee", "manager", "system"] = "employee"
    reason: str = Field(default="", max_length=255)
    created_by: str = Field(default="", max_length=255)


class ShiftCreateRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    employee_id: int
    start_at: str
    end_at: str
    location: str = Field(default="", max_length=128)
    role: str = Field(default="staff", max_length=64)


class ShiftResponse(BaseModel):
    id: int
    employee_id: int
    start_at: str
    end_at: str
    location: str
    role: str
    status: str


class ApprovalRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    employee_id: int
    period_start: str
    period_end: str
    status: Literal["approved", "rejected"]
    approved_by: str = Field(default="", max_length=255)


class PolicyUpdateRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    overtime_daily_hours: int = Field(ge=1, le=24)
    overtime_weekly_hours: int = Field(ge=1, le=168)
    max_break_minutes: int = Field(ge=0, le=720)
    late_tolerance_minutes: int = Field(ge=0, le=120)
    early_clock_in_minutes: int = Field(ge=0, le=180)
    geofence_required: bool = False


class AlertResolveRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    alert_id: int


class AlertSyncRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    day: str


@router.post("/employees", response_model=EmployeeResponse)
def create_employee(payload: EmployeeCreateRequest) -> EmployeeResponse:
    session = SessionLocal()
    try:
        employee = Employee(
            tenant_id=payload.tenant_id.strip(),
            full_name=payload.full_name.strip(),
            email=payload.email.strip().lower(),
            role=payload.role.strip(),
            location=payload.location.strip(),
            is_active=1,
        )
        session.add(employee)
        log_action(session, employee.tenant_id, "manager", "employee.create", f"employee_id={employee.id}")
        session.commit()
        session.refresh(employee)
        return EmployeeResponse(
            id=employee.id,
            tenant_id=employee.tenant_id,
            full_name=employee.full_name,
            email=employee.email,
            role=employee.role,
            location=employee.location,
            is_active=bool(employee.is_active),
        )
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Employee email already exists for this tenant.")
    finally:
        session.close()


@router.get("/employees", response_model=list[EmployeeResponse])
def list_employees(tenant_id: str) -> list[EmployeeResponse]:
    session = SessionLocal()
    try:
        rows = session.execute(
            select(Employee).where(Employee.tenant_id == tenant_id).order_by(Employee.full_name.asc())
        ).scalars().all()
        return [
            EmployeeResponse(
                id=row.id,
                tenant_id=row.tenant_id,
                full_name=row.full_name,
                email=row.email,
                role=row.role,
                location=row.location,
                is_active=bool(row.is_active),
            )
            for row in rows
        ]
    finally:
        session.close()


@router.post("/events")
def create_time_event(payload: TimeEventRequest) -> dict[str, str]:
    if payload.event_type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid event_type.")

    session = SessionLocal()
    try:
        tenant_id = payload.tenant_id.strip()
        employee = session.execute(
            select(Employee).where(Employee.id == payload.employee_id, Employee.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found.")

        event = TimeEvent(
            tenant_id=tenant_id,
            employee_id=payload.employee_id,
            event_type=payload.event_type,
            occurred_at=parse_datetime(payload.occurred_at),
            source=payload.source,
            reason=payload.reason.strip(),
            created_by=payload.created_by.strip(),
        )
        session.add(event)
        log_action(
            session,
            tenant_id,
            payload.created_by or "system",
            "time_event.create",
            f"employee_id={payload.employee_id};type={payload.event_type};reason={payload.reason}",
        )
        session.commit()
        return {"status": "ok"}
    finally:
        session.close()


@router.get("/live")
def live_board(tenant_id: str) -> list[dict]:
    session = SessionLocal()
    try:
        employees = session.execute(
            select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active == 1)
        ).scalars().all()
        result = []
        for employee in employees:
            last_event = session.execute(
                select(TimeEvent)
                .where(TimeEvent.tenant_id == tenant_id, TimeEvent.employee_id == employee.id)
                .order_by(TimeEvent.occurred_at.desc())
                .limit(1)
            ).scalar_one_or_none()
            status = "out"
            if last_event:
                if last_event.event_type == "clock_in":
                    status = "in"
                elif last_event.event_type == "break_start":
                    status = "break"
                elif last_event.event_type == "break_end":
                    status = "in"
            result.append(
                {
                    "employee_id": employee.id,
                    "full_name": employee.full_name,
                    "status": status,
                    "last_event_type": last_event.event_type if last_event else "",
                    "last_event_at": last_event.occurred_at.isoformat() if last_event else "",
                }
            )
        return result
    finally:
        session.close()


@router.post("/shifts", response_model=ShiftResponse)
def create_shift(payload: ShiftCreateRequest) -> ShiftResponse:
    start_at = parse_datetime(payload.start_at)
    end_at = parse_datetime(payload.end_at)
    if end_at <= start_at:
        raise HTTPException(status_code=400, detail="Shift end must be after start.")

    session = SessionLocal()
    try:
        tenant_id = payload.tenant_id.strip()
        employee = session.execute(
            select(Employee).where(Employee.id == payload.employee_id, Employee.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found.")

        row = Shift(
            tenant_id=tenant_id,
            employee_id=payload.employee_id,
            start_at=start_at,
            end_at=end_at,
            location=payload.location.strip(),
            role=payload.role.strip(),
            status="scheduled",
        )
        session.add(row)
        log_action(
            session,
            tenant_id,
            "manager",
            "shift.create",
            f"employee_id={payload.employee_id};start={start_at.isoformat()}",
        )
        session.commit()
        session.refresh(row)
        return ShiftResponse(
            id=row.id,
            employee_id=row.employee_id,
            start_at=row.start_at.isoformat(),
            end_at=row.end_at.isoformat(),
            location=row.location,
            role=row.role,
            status=row.status,
        )
    finally:
        session.close()


@router.get("/shifts", response_model=list[ShiftResponse])
def list_shifts(tenant_id: str, date_from: str, date_to: str) -> list[ShiftResponse]:
    start_date = parse_date(date_from)
    end_date = parse_date(date_to)
    start_dt = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, time.max, tzinfo=timezone.utc)

    session = SessionLocal()
    try:
        rows = session.execute(
            select(Shift)
            .where(Shift.tenant_id == tenant_id, Shift.start_at >= start_dt, Shift.start_at <= end_dt)
            .order_by(Shift.start_at.asc())
        ).scalars().all()
        return [
            ShiftResponse(
                id=row.id,
                employee_id=row.employee_id,
                start_at=row.start_at.isoformat(),
                end_at=row.end_at.isoformat(),
                location=row.location,
                role=row.role,
                status=row.status,
            )
            for row in rows
        ]
    finally:
        session.close()


@router.get("/exceptions")
def list_exceptions(tenant_id: str, day: str) -> list[dict]:
    target_day = parse_date(day)
    start_dt = datetime.combine(target_day, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(target_day, time.max, tzinfo=timezone.utc)

    session = SessionLocal()
    try:
        policy = get_or_create_policy(session, tenant_id)
        exceptions = []
        shifts = session.execute(
            select(Shift).where(Shift.tenant_id == tenant_id, Shift.start_at >= start_dt, Shift.start_at <= end_dt)
        ).scalars().all()
        for shift in shifts:
            first_event = session.execute(
                select(TimeEvent)
                .where(
                    TimeEvent.tenant_id == tenant_id,
                    TimeEvent.employee_id == shift.employee_id,
                    TimeEvent.occurred_at >= shift.start_at,
                    TimeEvent.occurred_at <= shift.end_at,
                    TimeEvent.event_type == "clock_in",
                )
                .order_by(TimeEvent.occurred_at.asc())
                .limit(1)
            ).scalar_one_or_none()
            if not first_event:
                exceptions.append(
                    {
                        "type": "no_show",
                        "employee_id": shift.employee_id,
                        "message": "No clock-in during scheduled shift.",
                    }
                )
            elif first_event.occurred_at > shift.start_at:
                minutes_late = int((first_event.occurred_at - shift.start_at).total_seconds() // 60)
                if minutes_late > policy.late_tolerance_minutes:
                    exceptions.append(
                        {
                            "type": "late_arrival",
                            "employee_id": shift.employee_id,
                            "message": f"Late by {minutes_late} minutes.",
                        }
                    )

        employees = session.execute(
            select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active == 1)
        ).scalars().all()
        for employee in employees:
            events = session.execute(
                select(TimeEvent)
                .where(
                    TimeEvent.tenant_id == tenant_id,
                    TimeEvent.employee_id == employee.id,
                    TimeEvent.occurred_at >= start_dt,
                    TimeEvent.occurred_at <= end_dt,
                )
                .order_by(TimeEvent.occurred_at.asc())
            ).scalars().all()
            worked_minutes = compute_worked_minutes(events, start_dt, end_dt)
            if worked_minutes > policy.overtime_daily_hours * 60:
                exceptions.append(
                    {
                        "type": "overtime_risk",
                        "employee_id": employee.id,
                        "message": f"Daily hours {worked_minutes / 60:.2f} exceed threshold.",
                    }
                )
        return exceptions
    finally:
        session.close()


@router.get("/timesheet-summary")
def timesheet_summary(tenant_id: str, period_start: str, period_end: str) -> list[dict]:
    start_dt = parse_datetime(period_start)
    end_dt = parse_datetime(period_end)
    session = SessionLocal()
    try:
        employees = session.execute(
            select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active == 1)
        ).scalars().all()
        output = []
        for employee in employees:
            events = session.execute(
                select(TimeEvent)
                .where(
                    TimeEvent.tenant_id == tenant_id,
                    TimeEvent.employee_id == employee.id,
                    TimeEvent.occurred_at >= start_dt,
                    TimeEvent.occurred_at <= end_dt,
                )
                .order_by(TimeEvent.occurred_at.asc())
            ).scalars().all()
            minutes = compute_worked_minutes(events, start_dt, end_dt)
            approval = session.execute(
                select(TimesheetApproval).where(
                    TimesheetApproval.tenant_id == tenant_id,
                    TimesheetApproval.employee_id == employee.id,
                    TimesheetApproval.period_start == start_dt,
                    TimesheetApproval.period_end == end_dt,
                )
            ).scalar_one_or_none()
            output.append(
                {
                    "employee_id": employee.id,
                    "full_name": employee.full_name,
                    "hours": round(minutes / 60, 2),
                    "status": approval.status if approval else "pending",
                }
            )
        return output
    finally:
        session.close()


@router.post("/timesheet-approval")
def approve_timesheet(payload: ApprovalRequest) -> dict[str, str]:
    session = SessionLocal()
    try:
        tenant_id = payload.tenant_id.strip()
        start_dt = parse_datetime(payload.period_start)
        end_dt = parse_datetime(payload.period_end)
        row = session.execute(
            select(TimesheetApproval).where(
                TimesheetApproval.tenant_id == tenant_id,
                TimesheetApproval.employee_id == payload.employee_id,
                TimesheetApproval.period_start == start_dt,
                TimesheetApproval.period_end == end_dt,
            )
        ).scalar_one_or_none()
        if not row:
            row = TimesheetApproval(
                tenant_id=tenant_id,
                employee_id=payload.employee_id,
                period_start=start_dt,
                period_end=end_dt,
                status=payload.status,
                approved_by=payload.approved_by.strip(),
                approved_at=utc_now(),
            )
            session.add(row)
        else:
            row.status = payload.status
            row.approved_by = payload.approved_by.strip()
            row.approved_at = utc_now()
        log_action(
            session,
            tenant_id,
            payload.approved_by or "manager",
            "timesheet.approval",
            f"employee_id={payload.employee_id};status={payload.status}",
        )
        session.commit()
        return {"status": "ok"}
    finally:
        session.close()


@router.get("/policy")
def get_policy(tenant_id: str) -> dict:
    session = SessionLocal()
    try:
        row = get_or_create_policy(session, tenant_id)
        return {
            "tenant_id": row.tenant_id,
            "overtime_daily_hours": row.overtime_daily_hours,
            "overtime_weekly_hours": row.overtime_weekly_hours,
            "max_break_minutes": row.max_break_minutes,
            "late_tolerance_minutes": row.late_tolerance_minutes,
            "early_clock_in_minutes": row.early_clock_in_minutes,
            "geofence_required": bool(row.geofence_required),
        }
    finally:
        session.close()


@router.put("/policy")
def update_policy(payload: PolicyUpdateRequest) -> dict[str, str]:
    session = SessionLocal()
    try:
        row = get_or_create_policy(session, payload.tenant_id.strip())
        row.overtime_daily_hours = payload.overtime_daily_hours
        row.overtime_weekly_hours = payload.overtime_weekly_hours
        row.max_break_minutes = payload.max_break_minutes
        row.late_tolerance_minutes = payload.late_tolerance_minutes
        row.early_clock_in_minutes = payload.early_clock_in_minutes
        row.geofence_required = 1 if payload.geofence_required else 0
        log_action(session, row.tenant_id, "manager", "policy.update", "timeclock policy updated")
        session.commit()
        return {"status": "ok"}
    finally:
        session.close()


@router.get("/alerts")
def list_alerts(tenant_id: str) -> list[dict]:
    session = SessionLocal()
    try:
        rows = session.execute(
            select(ManagerAlert).where(ManagerAlert.tenant_id == tenant_id).order_by(ManagerAlert.created_at.desc())
        ).scalars().all()
        return [
            {
                "id": row.id,
                "employee_id": row.employee_id,
                "alert_type": row.alert_type,
                "message": row.message,
                "resolved": bool(row.resolved),
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    finally:
        session.close()


@router.post("/alerts/sync")
def sync_alerts(payload: AlertSyncRequest) -> dict[str, int]:
    tenant_id = payload.tenant_id.strip()
    target_day = parse_date(payload.day)
    start_dt = datetime.combine(target_day, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(target_day, time.max, tzinfo=timezone.utc)

    session = SessionLocal()
    try:
        policy = get_or_create_policy(session, tenant_id)
        created = 0
        shifts = session.execute(
            select(Shift).where(Shift.tenant_id == tenant_id, Shift.start_at >= start_dt, Shift.start_at <= end_dt)
        ).scalars().all()
        for shift in shifts:
            first_event = session.execute(
                select(TimeEvent)
                .where(
                    TimeEvent.tenant_id == tenant_id,
                    TimeEvent.employee_id == shift.employee_id,
                    TimeEvent.occurred_at >= shift.start_at,
                    TimeEvent.occurred_at <= shift.end_at,
                    TimeEvent.event_type == "clock_in",
                )
                .order_by(TimeEvent.occurred_at.asc())
                .limit(1)
            ).scalar_one_or_none()

            to_create = None
            if not first_event:
                to_create = ("no_show", "No clock-in during scheduled shift.")
            else:
                minutes_late = int((first_event.occurred_at - shift.start_at).total_seconds() // 60)
                if minutes_late > policy.late_tolerance_minutes:
                    to_create = ("late_arrival", f"Late by {minutes_late} minutes.")

            if to_create:
                exists = session.execute(
                    select(ManagerAlert).where(
                        ManagerAlert.tenant_id == tenant_id,
                        ManagerAlert.employee_id == shift.employee_id,
                        ManagerAlert.alert_type == to_create[0],
                        ManagerAlert.resolved == 0,
                    )
                ).scalar_one_or_none()
                if not exists:
                    session.add(
                        ManagerAlert(
                            tenant_id=tenant_id,
                            employee_id=shift.employee_id,
                            alert_type=to_create[0],
                            message=to_create[1],
                        )
                    )
                    created += 1
        session.commit()
        return {"created": created}
    finally:
        session.close()


@router.post("/alerts/resolve")
def resolve_alert(payload: AlertResolveRequest) -> dict[str, str]:
    session = SessionLocal()
    try:
        row = session.execute(
            select(ManagerAlert).where(
                and_(ManagerAlert.id == payload.alert_id, ManagerAlert.tenant_id == payload.tenant_id.strip())
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Alert not found.")
        row.resolved = 1
        session.commit()
        return {"status": "ok"}
    finally:
        session.close()


@router.get("/export.csv")
def export_timesheet_csv(tenant_id: str, period_start: str, period_end: str) -> Response:
    start_dt = parse_datetime(period_start)
    end_dt = parse_datetime(period_end)
    session = SessionLocal()
    try:
        employees = session.execute(
            select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active == 1)
        ).scalars().all()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["employee_id", "employee_name", "hours", "period_start", "period_end"])
        for employee in employees:
            events = session.execute(
                select(TimeEvent)
                .where(
                    TimeEvent.tenant_id == tenant_id,
                    TimeEvent.employee_id == employee.id,
                    TimeEvent.occurred_at >= start_dt,
                    TimeEvent.occurred_at <= end_dt,
                )
                .order_by(TimeEvent.occurred_at.asc())
            ).scalars().all()
            minutes = compute_worked_minutes(events, start_dt, end_dt)
            writer.writerow(
                [employee.id, employee.full_name, round(minutes / 60, 2), start_dt.isoformat(), end_dt.isoformat()]
            )
        csv_data = output.getvalue()
        return Response(content=csv_data, media_type="text/csv")
    finally:
        session.close()
