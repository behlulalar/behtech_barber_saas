"""Dükkân personeli / yönetici paneli route'ları. Tenant, Host header'ından çözülür; staff token'ı o tenant'a ait olmalı."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_staff, get_current_tenant, is_manager, require_manager
from app.core.security import create_access_token, hash_password, verify_password
from app.models.appointment import Appointment, AppointmentStatus
from app.models.payment_method import PaymentMethod
from app.models.service import Service
from app.models.staff import RoleType, Staff
from app.models.tenant import Tenant
from app.models.tenant_settings import TenantSettings
from app.models.time_off import TimeOff
from app.models.working_hours import WorkingHours
from app.schemas.admin import (
    AdminAppointmentCreate,
    AdminAppointmentOut,
    AdminAppointmentUpdate,
    AdminServiceOut,
    CustomerAdminOut,
    DashboardOut,
    PaymentMethodCreate,
    PaymentMethodOut,
    PaymentMethodUpdate,
    ServiceCreate,
    ServiceUpdate,
    SettingsBody,
    StaffAdminOut,
    StaffCreate,
    StaffMe,
    StaffUpdate,
    TimeOffCreate,
    TimeOffOut,
    WorkingHourIn,
    WorkingHourOut,
)
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.reports import ReportPeriod, RevenueReport
from app.services import admin_services as svc
from app.services import report_services
from app.services.appointment_services import get_available_slots, lock_staff_schedule
from app.services.customer_services import get_or_create_customer

router = APIRouter()

SLOT_MSG = svc.SLOT_TAKEN
FORBIDDEN_OTHER = "Bu işlem için yalnızca kendi kayıtlarınızı yönetebilirsiniz"


def _require_self_or_manager(current: Staff, staff_id: int) -> None:
    if not is_manager(current) and staff_id != current.id:
        raise HTTPException(status_code=403, detail=FORBIDDEN_OTHER)


# ---------------------------------------------------------------- auth
@router.post("/auth/login", response_model=TokenResponse)
async def login(data: LoginRequest, tenant: Tenant = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Staff).where(Staff.phone == data.phone, Staff.tenant_id == tenant.id))
    staff = result.scalar_one_or_none()
    if staff is None or not verify_password(data.password, staff.password):
        raise HTTPException(status_code=401, detail="Telefon veya şifre hatalı")
    token = create_access_token({"sub": str(staff.id), "tenant_id": staff.tenant_id, "type": "staff"})
    return TokenResponse(access_token=token, token_type="bearer")


@router.get("/auth/me", response_model=StaffMe)
async def read_current_staff(current_staff: Staff = Depends(get_current_staff)):
    return current_staff


# ---------------------------------------------------------------- dashboard
@router.get("/admin/dashboard", response_model=DashboardOut)
async def dashboard(
    date_: date | None = Query(default=None, alias="date"),
    current: Staff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    day = date_ or date.today()
    return await svc.build_dashboard(db, current.tenant_id, day, None if is_manager(current) else current.id)


# ---------------------------------------------------------------- reports
@router.get("/admin/reports/revenue", response_model=RevenueReport)
async def revenue_report(
    period: ReportPeriod = "month",
    date_: date | None = Query(default=None, alias="date"),
    staff_id: int | None = None,
    current: Staff = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    """Gelir raporu: yalnızca yönetici (işletme sahibi). Personel göremez."""
    if staff_id is not None:
        await svc.get_staff_in_tenant(db, current.tenant_id, staff_id)
    return await report_services.build_revenue_report(
        db, current.tenant_id, period, date_ or date.today(), staff_id, include_staff=True
    )


# ---------------------------------------------------------------- appointments
@router.get("/admin/appointments", response_model=list[AdminAppointmentOut])
async def list_appointments(
    date_from: date | None = None,
    date_to: date | None = None,
    staff_id: int | None = None,
    status: AppointmentStatus | None = None,
    current: Staff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="Başlangıç tarihi bitiş tarihinden sonra olamaz")
    if not is_manager(current):
        staff_id = current.id
    return await svc.list_appointments(db, current.tenant_id, date_from, date_to, staff_id, status)


@router.post("/admin/appointments", response_model=AdminAppointmentOut, status_code=201)
async def create_appointment(
    data: AdminAppointmentCreate,
    current: Staff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    tid = current.tenant_id
    _require_self_or_manager(current, data.staff_id)
    if data.status in (AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW):
        raise HTTPException(status_code=400, detail="Yeni randevu bu durumla oluşturulamaz")
    if data.appointment_date < date.today() and data.status != AppointmentStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Geçmiş bir tarihe randevu oluşturulamaz")

    await svc.get_staff_in_tenant(db, tid, data.staff_id)
    service = (
        await db.execute(select(Service).where(Service.id == data.service_id, Service.tenant_id == tid))
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    if not service.is_active:
        raise HTTPException(status_code=400, detail="Bu hizmet şu an pasif")

    # Müşteri oluşturma commit edebilir; berber kilidi ondan sonra alınır ve INSERT'e kadar sürer.
    customer = await get_or_create_customer(db, tid, data.phone, data.name, data.surname)
    await lock_staff_schedule(db, tid, data.staff_id)
    # Geçmiş tarihli "tamamlandı" kaydında geçmiş slotlar engel sayılmaz (dolu olanlar yine sayılır).
    slots = await get_available_slots(
        db, tid, data.staff_id, data.service_id, data.appointment_date,
        ignore_past=data.status == AppointmentStatus.COMPLETED,
    )
    if data.appointment_time.replace(second=0, microsecond=0) not in slots:
        await db.rollback()
        raise HTTPException(status_code=409, detail=SLOT_MSG)

    appt = Appointment(
        tenant_id=tid,
        customer_id=customer.id,
        staff_id=data.staff_id,
        service_id=data.service_id,
        appointment_date=data.appointment_date,
        appointment_time=data.appointment_time,
        status=data.status,
    )
    db.add(appt)
    await svc.commit_or_409(db, svc.SLOT_TAKEN)
    return await svc.get_appointment_out(db, tid, appt.id)



@router.patch("/admin/appointments/{appointment_id}", response_model=AdminAppointmentOut)
async def update_appointment(
    appointment_id: int,
    data: AdminAppointmentUpdate,
    current: Staff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    tid = current.tenant_id
    row = (
        await db.execute(
            select(Appointment, Service.duration_min)
            .join(Service, Appointment.service_id == Service.id)
            .where(Appointment.id == appointment_id, Appointment.tenant_id == tid)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    appt, duration = row
    _require_self_or_manager(current, appt.staff_id)

    fields = data.model_fields_set
    if "status" in fields and data.status != appt.status:
        # İptal edilmiş bir randevuyu geri açarken saat başkasına verilmiş olabilir.
        if appt.status == AppointmentStatus.CANCELLED and data.status != AppointmentStatus.CANCELLED:
            if await svc.has_overlap(
                db, tid, appt.staff_id, appt.appointment_date, appt.appointment_time, duration, exclude_id=appt.id
            ):
                raise HTTPException(status_code=409, detail=SLOT_MSG)
        appt.status = data.status
    if "payment_method" in fields:
        appt.payment_method = data.payment_method or None
    await svc.commit_or_409(db, SLOT_MSG)
    return await svc.get_appointment_out(db, tid, appointment_id)


# ---------------------------------------------------------------- services
@router.get("/admin/services", response_model=list[AdminServiceOut])
async def list_services(current: Staff = Depends(get_current_staff), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Service).where(Service.tenant_id == current.tenant_id).order_by(Service.name, Service.id))
    links = await svc.staff_ids_by_service(db, current.tenant_id)
    return [svc.service_out(s, links.get(s.id, [])) for s in result.scalars().all()]


async def _service_name_taken(db: AsyncSession, tid: int, name: str, exclude_id: int | None = None) -> bool:
    q = select(Service.id).where(Service.tenant_id == tid, Service.name == name)
    if exclude_id is not None:
        q = q.where(Service.id != exclude_id)
    return (await db.execute(q.limit(1))).first() is not None


async def _get_service(db: AsyncSession, tid: int, service_id: int) -> Service:
    service = (
        await db.execute(select(Service).where(Service.id == service_id, Service.tenant_id == tid))
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    return service


@router.post("/admin/services", response_model=AdminServiceOut, status_code=201)
async def create_service(data: ServiceCreate, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)):
    if await _service_name_taken(db, current.tenant_id, data.name):
        raise HTTPException(status_code=409, detail="Bu isimde bir hizmet zaten var")
    tid = current.tenant_id
    staff_ids = data.staff_ids if data.staff_ids is not None else await svc.bookable_staff_ids(db, tid)
    service = Service(tenant_id=tid, **data.model_dump(exclude={"staff_ids"}))
    db.add(service)
    await svc.flush_or_409(db, "Bu isimde bir hizmet zaten var")
    await svc.set_service_staff(db, tid, service.id, staff_ids)
    await svc.commit_or_409(db, "Bu isimde bir hizmet zaten var")
    await db.refresh(service)
    return svc.service_out(service, (await svc.staff_ids_by_service(db, tid)).get(service.id, []))


@router.patch("/admin/services/{service_id}", response_model=AdminServiceOut)
async def update_service(
    service_id: int, data: ServiceUpdate, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)
):
    tid = current.tenant_id
    service = await _get_service(db, tid, service_id)
    changes = data.model_dump(exclude_unset=True)
    staff_ids = changes.pop("staff_ids", None)
    if "name" in changes and await _service_name_taken(db, tid, changes["name"], service_id):
        raise HTTPException(status_code=409, detail="Bu isimde bir hizmet zaten var")
    for k, v in changes.items():
        setattr(service, k, v)
    if staff_ids is not None:
        await svc.set_service_staff(db, tid, service_id, staff_ids)
    await svc.commit_or_409(db, "Bu isimde bir hizmet zaten var")
    await db.refresh(service)
    return svc.service_out(service, (await svc.staff_ids_by_service(db, tid)).get(service_id, []))


@router.delete("/admin/services/{service_id}", status_code=204)
async def delete_service(service_id: int, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)):
    service = await _get_service(db, current.tenant_id, service_id)
    if await svc.has_appointments(db, current.tenant_id, service_id=service_id):
        raise HTTPException(status_code=409, detail="Bu hizmete ait randevular var, silmek yerine pasife alın")
    await db.delete(service)
    await svc.commit_or_409(db, "Bu hizmete ait randevular var, silmek yerine pasife alın")
    return Response(status_code=204)


# ---------------------------------------------------------------- staff
@router.get("/admin/staff", response_model=list[StaffAdminOut])
async def list_staff(current: Staff = Depends(get_current_staff), db: AsyncSession = Depends(get_db)):
    q = select(Staff).where(Staff.tenant_id == current.tenant_id)
    if not is_manager(current):
        q = q.where(Staff.id == current.id)  # personel yalnızca kendi kaydını görür
    result = await db.execute(q.order_by(Staff.name, Staff.id))
    links = await svc.service_ids_by_staff(db, current.tenant_id)
    return [svc.staff_out(s, links.get(s.id, [])) for s in result.scalars().all()]


async def _phone_taken(db: AsyncSession, tid: int, phone: str, exclude_id: int | None = None) -> bool:
    q = select(Staff.id).where(Staff.tenant_id == tid, Staff.phone == phone)
    if exclude_id is not None:
        q = q.where(Staff.id != exclude_id)
    return (await db.execute(q.limit(1))).first() is not None


def _forbid_super_admin_touch(current: Staff, role: RoleType | None) -> None:
    if current.role != RoleType.SUPER_ADMIN and role == RoleType.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Yönetici hesabı üzerinde işlem yapma yetkiniz yok")


@router.post("/admin/staff", response_model=StaffAdminOut, status_code=201)
async def create_staff(data: StaffCreate, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)):
    _forbid_super_admin_touch(current, data.role)
    if await _phone_taken(db, current.tenant_id, data.phone):
        raise HTTPException(status_code=409, detail="Bu telefon numarası zaten kayıtlı")
    tid = current.tenant_id
    staff = Staff(
        tenant_id=tid,
        name=data.name,
        surname=data.surname,
        phone=data.phone,
        password=hash_password(data.password),
        role=data.role,
        photo_image=data.photo_image,
    )
    db.add(staff)
    await svc.flush_or_409(db, "Bu telefon numarası zaten kayıtlı")
    if data.role != RoleType.TECHNICAL_SUPPORT:
        service_ids = data.service_ids if data.service_ids is not None else await svc.all_service_ids(db, tid)
        await svc.set_staff_services(db, tid, staff.id, service_ids)
    await svc.commit_or_409(db, "Bu telefon numarası zaten kayıtlı")
    await db.refresh(staff)
    return svc.staff_out(staff, (await svc.service_ids_by_staff(db, tid)).get(staff.id, []))


@router.patch("/admin/staff/{staff_id}", response_model=StaffAdminOut)
async def update_staff(
    staff_id: int, data: StaffUpdate, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)
):
    target = await svc.get_staff_in_tenant(db, current.tenant_id, staff_id)
    changes = data.model_dump(exclude_unset=True)
    _forbid_super_admin_touch(current, target.role)
    _forbid_super_admin_touch(current, changes.get("role"))
    if "role" in changes and staff_id == current.id and changes["role"] != current.role:
        raise HTTPException(status_code=400, detail="Kendi rolünüzü değiştiremezsiniz")
    if "phone" in changes and await _phone_taken(db, current.tenant_id, changes["phone"], staff_id):
        raise HTTPException(status_code=409, detail="Bu telefon numarası zaten kayıtlı")
    if "password" in changes:
        changes["password"] = hash_password(changes["password"])
    service_ids = changes.pop("service_ids", None)
    for k, v in changes.items():
        setattr(target, k, v)
    if service_ids is not None:
        await svc.set_staff_services(db, current.tenant_id, staff_id, service_ids)
    await svc.commit_or_409(db, "Bu telefon numarası zaten kayıtlı")
    await db.refresh(target)
    return svc.staff_out(target, (await svc.service_ids_by_staff(db, current.tenant_id)).get(staff_id, []))


@router.delete("/admin/staff/{staff_id}", status_code=204)
async def delete_staff(staff_id: int, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)):
    target = await svc.get_staff_in_tenant(db, current.tenant_id, staff_id)
    if target.id == current.id:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz")
    _forbid_super_admin_touch(current, target.role)
    if await svc.has_appointments(db, current.tenant_id, staff_id=staff_id):
        raise HTTPException(status_code=409, detail="Bu personelin randevuları var, silinemez")
    await db.delete(target)
    await svc.commit_or_409(db, "Bu personelin randevuları var, silinemez")
    return Response(status_code=204)


# ---------------------------------------------------------------- working hours
@router.get("/admin/working-hours", response_model=list[WorkingHourOut])
async def get_working_hours(
    staff_id: int | None = None, current: Staff = Depends(get_current_staff), db: AsyncSession = Depends(get_db)
):
    staff_id = current.id if staff_id is None else staff_id
    _require_self_or_manager(current, staff_id)
    await svc.get_staff_in_tenant(db, current.tenant_id, staff_id)
    result = await db.execute(
        select(WorkingHours)
        .where(WorkingHours.tenant_id == current.tenant_id, WorkingHours.staff_id == staff_id)
        .order_by(WorkingHours.day_of_week)
    )
    return result.scalars().all()


@router.put("/admin/working-hours/{staff_id}", response_model=list[WorkingHourOut])
async def replace_working_hours(
    staff_id: int,
    data: list[WorkingHourIn],
    current: Staff = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    await svc.get_staff_in_tenant(db, current.tenant_id, staff_id)
    days = [d.day_of_week for d in data]
    if len(days) != len(set(days)):
        raise HTTPException(status_code=400, detail="Aynı gün için birden fazla çalışma saati girilemez")
    await svc.delete_working_hours(db, current.tenant_id, staff_id)
    rows = [
        WorkingHours(
            tenant_id=current.tenant_id,
            staff_id=staff_id,
            day_of_week=d.day_of_week,
            start_time=d.start_time,
            end_time=d.end_time,
        )
        for d in sorted(data, key=lambda x: x.day_of_week)
    ]
    db.add_all(rows)
    await svc.commit_or_409(db, "Çalışma saatleri kaydedilemedi")
    return rows


# ---------------------------------------------------------------- time off
@router.get("/admin/time-off", response_model=list[TimeOffOut])
async def list_time_off(
    staff_id: int | None = None, current: Staff = Depends(get_current_staff), db: AsyncSession = Depends(get_db)
):
    if not is_manager(current):
        if staff_id is not None and staff_id != current.id:
            raise HTTPException(status_code=403, detail=FORBIDDEN_OTHER)
        staff_id = current.id
    q = select(TimeOff).where(TimeOff.tenant_id == current.tenant_id)
    if staff_id is not None:
        q = q.where(TimeOff.staff_id == staff_id)
    result = await db.execute(q.order_by(TimeOff.start_date, TimeOff.id))
    return result.scalars().all()


@router.post("/admin/time-off", response_model=TimeOffOut, status_code=201)
async def create_time_off(
    data: TimeOffCreate, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)
):
    await svc.get_staff_in_tenant(db, current.tenant_id, data.staff_id)
    row = TimeOff(
        tenant_id=current.tenant_id,
        staff_id=data.staff_id,
        start_date=data.start_date,
        end_date=data.end_date,
        reason=data.reason or None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/admin/time-off/{time_off_id}", status_code=204)
async def delete_time_off(
    time_off_id: int, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)
):
    row = (
        await db.execute(select(TimeOff).where(TimeOff.id == time_off_id, TimeOff.tenant_id == current.tenant_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="İzin kaydı bulunamadı")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- payment methods
async def _get_payment_method(db: AsyncSession, tid: int, pm_id: int) -> PaymentMethod:
    pm = (
        await db.execute(select(PaymentMethod).where(PaymentMethod.id == pm_id, PaymentMethod.tenant_id == tid))
    ).scalar_one_or_none()
    if pm is None:
        raise HTTPException(status_code=404, detail="Ödeme yöntemi bulunamadı")
    return pm


async def _pm_name_taken(db: AsyncSession, tid: int, name: str, exclude_id: int | None = None) -> bool:
    q = select(PaymentMethod.id).where(PaymentMethod.tenant_id == tid, PaymentMethod.name == name)
    if exclude_id is not None:
        q = q.where(PaymentMethod.id != exclude_id)
    return (await db.execute(q.limit(1))).first() is not None


@router.get("/admin/payment-methods", response_model=list[PaymentMethodOut])
async def list_payment_methods(current: Staff = Depends(get_current_staff), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PaymentMethod).where(PaymentMethod.tenant_id == current.tenant_id).order_by(PaymentMethod.name, PaymentMethod.id)
    )
    methods = result.scalars().all()
    if is_manager(current):
        return methods
    # Personel "Tamamla" penceresinde yalnızca yöntem adını seçer; IBAN/hesap gibi detaylar yöneticiye özeldir.
    return [PaymentMethodOut(id=m.id, name=m.name, details=None, is_active=m.is_active) for m in methods]


@router.post("/admin/payment-methods", response_model=PaymentMethodOut, status_code=201)
async def create_payment_method(
    data: PaymentMethodCreate, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)
):
    if await _pm_name_taken(db, current.tenant_id, data.name):
        raise HTTPException(status_code=409, detail="Bu isimde bir ödeme yöntemi zaten var")
    pm = PaymentMethod(tenant_id=current.tenant_id, **data.model_dump())
    db.add(pm)
    await svc.commit_or_409(db, "Bu isimde bir ödeme yöntemi zaten var")
    await db.refresh(pm)
    return pm


@router.patch("/admin/payment-methods/{pm_id}", response_model=PaymentMethodOut)
async def update_payment_method(
    pm_id: int, data: PaymentMethodUpdate, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)
):
    pm = await _get_payment_method(db, current.tenant_id, pm_id)
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes and await _pm_name_taken(db, current.tenant_id, changes["name"], pm_id):
        raise HTTPException(status_code=409, detail="Bu isimde bir ödeme yöntemi zaten var")
    for k, v in changes.items():
        setattr(pm, k, v)
    await svc.commit_or_409(db, "Bu isimde bir ödeme yöntemi zaten var")
    await db.refresh(pm)
    return pm


@router.delete("/admin/payment-methods/{pm_id}", status_code=204)
async def delete_payment_method(pm_id: int, current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)):
    pm = await _get_payment_method(db, current.tenant_id, pm_id)
    await db.delete(pm)
    await db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- settings
def _settings_out(tenant: Tenant, row: TenantSettings | None) -> dict:
    if row is None:
        return {
            "business_name": tenant.name,
            "business_address": "",
            "logo_image": None,
            "banner_image": None,
            "notification_banner_enabled": False,
        }
    return {
        "business_name": row.business_name,
        "business_address": row.business_adress,  # DB sütunu yazım hatalı: business_adress
        "logo_image": row.logo_image,
        "banner_image": row.banner_image,
        "notification_banner_enabled": row.notification_banner_enabled,
    }


@router.get("/admin/settings", response_model=SettingsBody)
async def get_settings(
    current: Staff = Depends(require_manager), tenant: Tenant = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)
):
    row = (await db.execute(select(TenantSettings).where(TenantSettings.tenant_id == tenant.id))).scalar_one_or_none()
    return _settings_out(tenant, row)


@router.put("/admin/settings", response_model=SettingsBody)
async def put_settings(
    data: SettingsBody,
    current: Staff = Depends(require_manager),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(select(TenantSettings).where(TenantSettings.tenant_id == tenant.id))).scalar_one_or_none()
    values = {
        "business_name": data.business_name,
        "business_adress": data.business_address or "",
        "logo_image": data.logo_image,
        "banner_image": data.banner_image,
        "notification_banner_enabled": data.notification_banner_enabled,
        "updated_at": datetime.now(),
    }
    if row is None:
        row = TenantSettings(tenant_id=tenant.id, **values)
        db.add(row)
    else:
        for k, v in values.items():
            setattr(row, k, v)
    await svc.commit_or_409(db, "Ayarlar kaydedilemedi")
    return _settings_out(tenant, row)


# ---------------------------------------------------------------- customers
@router.get("/admin/customers", response_model=list[CustomerAdminOut])
async def list_customers(
    q: str | None = Query(default=None, max_length=100),
    current: Staff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_customers(db, current.tenant_id, q, only_staff_id=None if is_manager(current) else current.id)
