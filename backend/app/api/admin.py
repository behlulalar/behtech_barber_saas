"""Dükkân personeli / yönetici paneli route'ları. Tenant, Host header'ından çözülür; staff token'ı o tenant'a ait olmalı."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import MANAGER_ROLES, get_current_staff, get_current_tenant, is_manager, require_manager
from app.core.config import settings
from app.core.password_policy import enforce_password_policy
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
    ImpersonatedBy,
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
from app.schemas.auth import PanelKeyVerify, PanelLoginUrlOut, ForgotReset, ForgotSendCode, ImpersonateExchange, LoginRequest, PasswordChange, TokenResponse
from app.schemas.public import SendCodeResponse
from app.schemas.reports import ReportPeriod, RevenueReport
from app.services import admin_services as svc
from app.services import impersonation_services
from app.services import login_throttle, otp_services, panel_key
from app.core.net import client_ip
from app.services.otp_delivery import deliver_code
from app.services.whatsapp_texts import reset_text
from app.services import report_services
from app.services import appointment_notifications, announcement_services, platform_services, whatsapp_connection_services as wa_svc
from app.services import whatsapp_guard as wa_guard, whatsapp_services
from app.services.otp_delivery import to_whatsapp_number
from app.schemas.whatsapp import WhatsappConnectIn, WhatsappConnectOut, WhatsappStatusOut, WhatsappTestIn
from app.models.message_log import MessageLog
from app.schemas.tenant import SetupOut
from app.schemas.announcement import AnnouncementPublic
from app.services.appointment_services import get_available_slots, lock_staff_schedule
from app.services.customer_services import get_or_create_customer

router = APIRouter()

SLOT_MSG = svc.SLOT_TAKEN
STAFF_DELETE_409 = (
    "Bu personelin geçmiş randevuları var, silinemez. Çalışmayı bıraktıysa 'İşten ayrıldı' olarak pasife alın; "
    "geçmiş ve gelir kayıtları korunur."
)
FORBIDDEN_OTHER = "Bu işlem için yalnızca kendi kayıtlarınızı yönetebilirsiniz"


def _require_self_or_manager(current: Staff, staff_id: int) -> None:
    if not is_manager(current) and staff_id != current.id:
        raise HTTPException(status_code=403, detail=FORBIDDEN_OTHER)


# ---------------------------------------------------------------- auth
@router.post("/auth/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    request: Request,
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    await panel_key.require(db, tenant, data.panel_key, request)
    key = login_throttle.make_key(data.phone, tenant.id)
    await login_throttle.ensure_not_locked(db, "staff", key, request)
    result = await db.execute(select(Staff).where(Staff.phone == data.phone, Staff.tenant_id == tenant.id))
    staff = result.scalar_one_or_none()
    # Var olmayan telefon da başarısız sayılır; mesaj aynı kalır (kullanıcı varlığı sızmaz).
    if staff is None or not verify_password(data.password, staff.password):
        if await login_throttle.record_failure(db, "staff", key, request):
            raise login_throttle.locked_now_error()
        raise HTTPException(status_code=401, detail="Telefon veya şifre hatalı")
    await login_throttle.clear_failures(db, "staff", key)
    await db.commit()
    # Parola doğrulandıktan SONRA bakılır: yanlış parolayla pasif hesap varlığı öğrenilemez.
    if not staff.is_active:
        raise HTTPException(status_code=403, detail="Bu hesap pasif. İşletme sahibiyle görüşün")
    return TokenResponse(access_token=_staff_token(staff, remember=data.remember), token_type="bearer")


@router.post("/auth/panel-key/verify", status_code=204)
async def verify_panel_key(
    data: PanelKeyVerify, request: Request, tenant: Tenant = Depends(get_current_tenant), db: AsyncSession = Depends(get_db),
):
    """Giriş sayfası açılırken adresin geçerli olduğunu doğrular; geçersizse 404 (sayfa hiç görünmez)."""
    await panel_key.require(db, tenant, data.panel_key, request)
    return Response(status_code=204)


@router.get("/admin/login-url", response_model=PanelLoginUrlOut)
async def admin_login_url(current: Staff = Depends(require_manager), tenant: Tenant = Depends(get_current_tenant)):
    """Personelin gireceği gizli adres (yalnızca yönetici görür; personele sahip iletir)."""
    return PanelLoginUrlOut(path=panel_key.login_path(tenant))


@router.get("/auth/me", response_model=StaffMe)
async def read_current_staff(request: Request, current_staff: Staff = Depends(get_current_staff)):
    me = StaffMe.model_validate(current_staff)
    admin = getattr(request.state, "impersonator", None)
    if admin is not None:
        me.impersonated_by = ImpersonatedBy(id=admin.id, name=admin.name, phone=admin.phone)
        me.read_only = bool(getattr(request.state, "read_only", False))
    return me


def _staff_token(staff: Staff, remember: bool = False) -> str:
    return create_access_token(
        {"sub": str(staff.id), "tenant_id": staff.tenant_id, "type": "staff", "tv": staff.token_version},
        expires_minutes=settings.remember_token_expire_minutes if remember else None,
    )


def _forbid_in_support(request: Request, message: str) -> None:
    if getattr(request.state, "impersonator", None) is not None:
        raise HTTPException(status_code=403, detail=message)


@router.post("/auth/me/password", response_model=TokenResponse)
async def change_own_password(
    data: PasswordChange,
    request: Request,
    current: Staff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    """Kendi şifresini değiştirir; yeni token döner, diğer cihazlardaki oturumlar düşer."""
    _forbid_in_support(request, "Destek modunda şifre değiştirilemez")
    key = login_throttle.make_key(current.phone, current.tenant_id)
    await login_throttle.ensure_not_locked(db, "staff_pw", key, request)
    if not verify_password(data.current_password, current.password):
        if await login_throttle.record_failure(db, "staff_pw", key, request):
            raise login_throttle.locked_now_error()
        raise HTTPException(status_code=400, detail="Mevcut şifre hatalı")
    enforce_password_policy(data.new_password, current.phone)
    current.password = hash_password(data.new_password)
    current.token_version += 1
    await login_throttle.clear_failures(db, "staff_pw", key)
    await db.commit()
    return TokenResponse(access_token=_staff_token(current), token_type="bearer")


@router.post("/auth/me/logout-all", status_code=204)
async def logout_all_devices(
    request: Request, current: Staff = Depends(get_current_staff), db: AsyncSession = Depends(get_db)
):
    _forbid_in_support(request, "Destek modunda oturumlar kapatılamaz")
    current.token_version += 1
    await db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- şifremi unuttum (telefon + WhatsApp kodu)
FORGOT_MESSAGE = "Numara kayıtlıysa doğrulama kodu gönderildi"
BAD_CODE = "Kod geçersiz veya süresi dolmuş"


@router.post("/auth/forgot/send-code", response_model=SendCodeResponse)
async def forgot_send_code(
    data: ForgotSendCode,
    request: Request,
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Her zaman aynı yanıt: numaranın kayıtlı olup olmadığı sızmaz. Kod satırı numara kayıtsız olsa da yazılır,
    böylece sınırlar (60 sn / 10 dk'da 3) iki durumda da aynı davranır; yalnızca kayıtlı numaraya gönderilir."""
    await panel_key.require(db, tenant, data.panel_key, request)
    staff = (
        await db.execute(
            select(Staff).where(Staff.phone == data.phone, Staff.tenant_id == tenant.id, Staff.is_active == True)  # noqa: E712
        )
    ).scalar_one_or_none()
    code = await otp_services.send_code(db, tenant.id, data.phone, purpose=otp_services.RESET_PURPOSE)
    if staff is not None:
        await deliver_code(db, tenant.id, "password_reset", data.phone, reset_text(tenant.name, code, tenant.id), ip=client_ip(request))
    is_dev = settings.environment == "development"
    return SendCodeResponse(message=FORGOT_MESSAGE, dev_code=code if (is_dev and staff is not None) else None)


@router.post("/auth/forgot/reset", status_code=204)
async def forgot_reset(
    data: ForgotReset,
    request: Request,
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    await panel_key.require(db, tenant, data.panel_key, request)
    key = login_throttle.make_key(data.phone, tenant.id)
    await login_throttle.ensure_not_locked(db, "staff_reset", key, request)
    # Zayıf şifre kodu yakmasın: önce kural, sonra kod.
    enforce_password_policy(data.new_password, data.phone)
    try:
        await otp_services.verify_code(db, tenant.id, data.phone, data.code, purpose=otp_services.RESET_PURPOSE)
        staff = (
            await db.execute(
                select(Staff).where(Staff.phone == data.phone, Staff.tenant_id == tenant.id, Staff.is_active == True)  # noqa: E712
            )
        ).scalar_one_or_none()
        if staff is None:
            raise HTTPException(status_code=400, detail=BAD_CODE)
    except HTTPException as exc:
        if exc.status_code == 400:
            if await login_throttle.record_failure(db, "staff_reset", key, request):
                raise login_throttle.locked_now_error()
        raise
    staff.password = hash_password(data.new_password)
    staff.token_version += 1
    await login_throttle.clear_failures(db, "staff_reset", key)
    await db.commit()
    return Response(status_code=204)


@router.post("/auth/impersonate", response_model=TokenResponse)
async def impersonate_exchange(
    data: ImpersonateExchange,
    request: Request,
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Platform panelinden alınan tek kullanımlık kodu işletme personeli token'ına çevirir (herkese açık rota)."""
    return await impersonation_services.exchange(db, data.code, tenant, request)


@router.post("/auth/impersonate/end", status_code=204)
async def impersonate_end(
    request: Request,
    current_staff: Staff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
):
    admin = getattr(request.state, "impersonator", None)
    if admin is None:
        raise HTTPException(status_code=400, detail="Bu oturum bir destek oturumu değil")
    await impersonation_services.end(db, admin, current_staff, getattr(request.state, "impersonation_started", None), request)
    return Response(status_code=204)


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
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tid))).scalar_one()
    await appointment_notifications.on_created(db, tenant, appt, actor=current)
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
        was_active = appt.status == AppointmentStatus.CONFIRMED
        appt.status = data.status
    else:
        was_active = False
    if "payment_method" in fields:
        appt.payment_method = data.payment_method or None
    await svc.commit_or_409(db, SLOT_MSG)
    if was_active and appt.status == AppointmentStatus.CANCELLED:
        tenant = (await db.execute(select(Tenant).where(Tenant.id == tid))).scalar_one()
        await appointment_notifications.on_cancelled(db, tenant, appt, by="shop", actor=current)
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
    result = await db.execute(select(Staff).where(Staff.tenant_id == current.tenant_id).order_by(Staff.name, Staff.id))
    links = await svc.service_ids_by_staff(db, current.tenant_id)
    out = [svc.staff_out(s, links.get(s.id, [])) for s in result.scalars().all()]
    if not is_manager(current):
        out = [o for o in out if o.is_active]  # personel yalnızca aktif ekibi görür
        # Personel ekibi görür ama düzenleyemez; telefon aynı zamanda giriş adı olduğu için yalnızca kendisininki görünür.
        out = [o if o.id == current.id else o.model_copy(update={"phone": ""}) for o in out]
    return out


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
    if "is_active" in changes:
        new_active = changes.pop("is_active")
        if new_active is None:
            pass
        elif new_active != target.is_active:
            if not new_active:
                if staff_id == current.id:
                    raise HTTPException(status_code=400, detail="Kendi hesabınızı pasife alamazsınız")
                if target.role in MANAGER_ROLES:
                    others = (
                        await db.execute(
                            select(func.count(Staff.id)).where(
                                Staff.tenant_id == current.tenant_id,
                                Staff.id != staff_id,
                                Staff.is_active == True,  # noqa: E712
                                Staff.role.in_(list(MANAGER_ROLES)),
                            )
                        )
                    ).scalar_one()
                    if others == 0:
                        raise HTTPException(status_code=400, detail="Son aktif yöneticiyi pasife alamazsınız")
                future = await svc.count_future_appointments(db, current.tenant_id, staff_id)
                if future:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Bu personelin {future} gelecek randevusu var. Önce bu randevuları iptal edin.",
                    )
                target.is_active = False
                target.left_at = date.today()
                target.token_version += 1  # açık oturumlar düşsün
            else:
                target.is_active = True
                target.left_at = None
    if "password" in changes:
        changes["password"] = hash_password(changes["password"])
        # Şifre değişince personelin açık oturumları düşsün.
        target.token_version += 1
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
        raise HTTPException(status_code=409, detail=STAFF_DELETE_409)
    await db.delete(target)
    await svc.commit_or_409(db, STAFF_DELETE_409)
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
            "contact_phone": None,
            "whatsapp_phone": None,
            "instagram": None,
        }
    return {
        "business_name": row.business_name,
        "business_address": row.business_adress,  # DB sütunu yazım hatalı: business_adress
        "logo_image": row.logo_image,
        "banner_image": row.banner_image,
        "notification_banner_enabled": row.notification_banner_enabled,
        "contact_phone": row.contact_phone,
        "whatsapp_phone": row.whatsapp_phone,
        "instagram": row.instagram,
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
        "contact_phone": data.contact_phone,
        "whatsapp_phone": data.whatsapp_phone,
        "instagram": data.instagram,
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


@router.get("/admin/announcements", response_model=list[AnnouncementPublic])
async def admin_announcements(staff: Staff = Depends(get_current_staff), db: AsyncSession = Depends(get_db)):
    """Platformdan gelen, bu işletme için şu an geçerli duyurular (kapatma tarayıcıda hatırlanır)."""
    return await announcement_services.active_for_tenant(db, staff.tenant_id)


@router.get("/admin/setup", response_model=SetupOut)
async def admin_setup(current: Staff = Depends(require_manager), db: AsyncSession = Depends(get_db)):
    """Kurulum rehberi: işletmenin müşteri randevusu alabilmesi için eksikler (platformdaki kontrol listesiyle aynı mantık)."""
    return (await platform_services._setup_for(db, [current.tenant_id]))[current.tenant_id]


# ---------------------------------------------------------------- WhatsApp (dükkânın kendi hesabı)

def _wa_out(row, reachable: bool) -> WhatsappStatusOut:
    if row is None:
        return WhatsappStatusOut(state="close", server_reachable=reachable)
    return WhatsappStatusOut(state=row.state, phone=row.phone, profile_name=row.profile_name,
                             connected_at=row.connected_at, server_reachable=reachable, paused=row.paused,
                             paused_reason=row.paused_reason, disconnect_reason=row.disconnect_reason,
                             disconnected_at=row.disconnected_at)


@router.get("/admin/whatsapp", response_model=WhatsappStatusOut)
async def admin_whatsapp_status(
    current: Staff = Depends(require_manager), tenant: Tenant = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)
):
    row, reachable = await wa_svc.refresh(db, tenant)
    return _wa_out(row, reachable)


@router.post("/admin/whatsapp/connect", response_model=WhatsappConnectOut)
async def admin_whatsapp_connect(
    data: WhatsappConnectIn,
    current: Staff = Depends(require_manager), tenant: Tenant = Depends(get_current_tenant), db: AsyncSession = Depends(get_db),
):
    """QR (ve telefon verildiyse eşleştirme kodu) üretir. QR ~40 sn geçerli; arayüz süresi dolunca yeniden ister."""
    row, qr, code = await wa_svc.start_connect(db, tenant, to_whatsapp_number(data.phone) if data.phone else None)
    return WhatsappConnectOut(**_wa_out(row, True).model_dump(), qr_base64=qr, pairing_code=code)


@router.post("/admin/whatsapp/disconnect", response_model=WhatsappStatusOut)
async def admin_whatsapp_disconnect(
    current: Staff = Depends(require_manager), tenant: Tenant = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)
):
    row = await wa_svc.disconnect(db, tenant)
    return _wa_out(row, True)


@router.post("/admin/whatsapp/test", status_code=204)
async def admin_whatsapp_test(
    data: WhatsappTestIn,
    current: Staff = Depends(require_manager), tenant: Tenant = Depends(get_current_tenant), db: AsyncSession = Depends(get_db),
):
    row = await wa_svc.get_row(db, tenant.id)
    if row is None or row.state != "open":
        raise HTTPException(status_code=409, detail="Önce WhatsApp hesabınızı bağlayın")
    wa_guard.ensure_usable(row)
    try:
        await whatsapp_services.send_text(row.instance_name, to_whatsapp_number(data.phone),
                                          f"{tenant.name}: WhatsApp bağlantınız çalışıyor. Doğrulama kodları bu numaradan gidecek.",
                                          delay_ms=wa_guard.otp_delay_ms())
        ok = True
    except whatsapp_services.EvolutionError:
        ok = False
    await wa_guard.record_result(db, row, ok=ok)
    db.add(MessageLog(tenant_id=tenant.id, kind="test", ok=ok))
    await db.commit()
    if not ok:
        raise HTTPException(status_code=503, detail="Test mesajı gönderilemedi, bağlantıyı kontrol edin")
    return Response(status_code=204)
