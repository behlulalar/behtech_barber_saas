"""Herkese açık (müşteri tarafı) ve müşteri (OTP token'lı) route'ları. Tenant, Host header'ından çözülür."""
import json
import logging
import secrets
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CustomerIdentity, get_current_customer, get_current_tenant
from app.core.security import create_access_token
from app.models.appointment import Appointment, AppointmentStatus
from app.models.customer import Customers
from app.models.service import Service
from app.models.staff import RoleType, Staff
from app.models.tenant import Tenant
from app.models.tenant_settings import TenantSettings
from app.schemas.appointment import AppointmentCreate, AppointmentPublicOut, AppointmentServiceBrief, RescheduleIn, SlotOut, SlotsResponse
from app.schemas.otp import SendCodeRequest, VerifyCodeRequest
from app.schemas.public import CustomerBrief, SendCodeResponse, StaffPublicOut, TenantPublicOut, VerifyCodeResponse
from app.schemas.service import ServiceOut
from app.schemas.site_stats import SiteHitIn
from app.schemas.signup import SignupRequest, SignupResponse
from app.services.admin_services import service_ids_by_staff
from app.services.appointment_services import (
    CANCEL_MIN_HOURS,
    SLOT_MINUTES,
    build_merged_slot_grid,
    build_slot_grid,
    check_daily_limit,
    get_available_slots,
    lock_staff_schedule,
    pick_staff_for_slot,
)
from app.services import site_stats_services, appointment_notifications, panel_key, signup_services, whatsapp_connection_services
from app.services.consent_services import require_customer_consent
from app.services.customer_services import get_or_create_customer
from app.core.net import client_ip
from app.services.otp_delivery import deliver_code
from app.services.whatsapp_texts import otp_text
from app.services.otp_services import send_code, verify_code

router = APIRouter()
logger = logging.getLogger("evolution_webhook")

CUSTOMER_TOKEN_MINUTES = 30


@router.get("/health")
async def health_check():
    return {"status": "healthy 200 OK"}


@router.post("/public/signup", response_model=SignupResponse, status_code=201)
async def public_signup_route(data: SignupRequest, request: Request, db: Session = Depends(get_db)):
    """Tanıtım sitesinden işletme kaydı (tenant Host'una bağlı değil). Hesap platform onayına kadar kapalıdır."""
    tenant = await signup_services.signup(db, data, request)
    return SignupResponse(message="Başvurunuz alındı. Onaylanınca size haber vereceğiz.", slug=tenant.slug)


@router.get("/public/panel-manifest")
async def public_panel_manifest(
    request: Request, k: str = "", tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    """Yönetim panelinin PWA manifest'i (dükkân adıyla). Gerçek bir adresten verilir: blob: manifest'ler bazı tarayıcılarda
    'uygulamayı yükle' ölçütünü sağlamaz. Herkese açıktır, bu yüzden gizli anahtar varsayılan olarak İÇERMEZ (start_url /panel).
    İSTİSNA: istek geçerli anahtarı `?k=` ile sunarsa (yalnızca anahtarı zaten bilen, panele girmiş kullanıcının sayfası sunar)
    start_url `/panel?k=<anahtar>` olur: kurulan uygulama (özellikle iOS'ta Safari'den ayrı depolamasıyla) anahtarı kendi
    depolamasına yazıp giriş ekranına gidebilir, "sayfa bulunamadı" görmez. Yanlış anahtar IP başına sayılır (tahmin sınırı)."""
    start_url = "/panel"
    if k:
        try:
            await panel_key.require(db, tenant, k, request)
            start_url = f"/panel?k={k}"
        except HTTPException:
            pass  # yanlış/kilitli: genel manifest (anahtar sızmaz); başarısızlık zaten sayıldı
    ts = (await db.execute(select(TenantSettings).where(TenantSettings.tenant_id == tenant.id))).scalar_one_or_none()
    name = (ts.business_name if ts and ts.business_name else tenant.name).strip()
    manifest = {
        "id": "/panel", "name": f"{name} Yönetim", "short_name": name[:12], "start_url": start_url, "scope": "/panel",
        "display": "standalone", "lang": "tr", "background_color": "#F6F1E9", "theme_color": "#F6F1E9",
        "icons": [
            {"src": "/icons/platform-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "/icons/platform-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "/icons/platform-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    return Response(content=json.dumps(manifest, ensure_ascii=False), media_type="application/manifest+json",
                    headers={"Cache-Control": "no-cache"})


@router.post("/public/site-hit", status_code=204)
async def site_hit(data: SiteHitIn, db: Session = Depends(get_db)):
    """Tanıtım sitesi sayacı (ziyaret / "Ücretsiz dene" / demo tıklaması). Çerez, IP, kimlik tutulmaz; yalnızca günlük toplam artar."""
    await site_stats_services.hit(db, data.event)
    return Response(status_code=204)


@router.get("/public/tenant", response_model=TenantPublicOut)
async def public_tenant_route(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(select(TenantSettings).where(TenantSettings.tenant_id == tenant.id))
    tenant_settings = result.scalar_one_or_none()
    return TenantPublicOut(
        name=tenant.name,
        slug=tenant.slug,
        business_name=tenant_settings.business_name if tenant_settings else tenant.name,
        business_address=(tenant_settings.business_adress or None) if tenant_settings else None,
        logo_image=tenant_settings.logo_image if tenant_settings else None,
        banner_image=tenant_settings.banner_image if tenant_settings else None,
        contact_phone=tenant_settings.contact_phone if tenant_settings else None,
        whatsapp_phone=tenant_settings.whatsapp_phone if tenant_settings else None,
        instagram=tenant_settings.instagram if tenant_settings else None,
        otp_available=settings.environment == "development" or await whatsapp_connection_services.is_open(db, tenant.id),
    )


@router.get("/staff", response_model=list[StaffPublicOut])
async def staff_route(
    service_id: int | None = None, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    """Berber listesi; service_id verilirse sadece o hizmeti veren berberler."""
    result = await db.execute(
        select(Staff)
        .where(Staff.tenant_id == tenant.id, Staff.role != RoleType.TECHNICAL_SUPPORT, Staff.is_active == True)  # noqa: E712
        .order_by(Staff.id)
    )
    links = await service_ids_by_staff(db, tenant.id)
    out = [
        StaffPublicOut.model_validate(s).model_copy(update={"service_ids": sorted(links.get(s.id, []))})
        for s in result.scalars().all()
    ]
    if service_id is not None:
        out = [s for s in out if service_id in s.service_ids]
    return out


@router.get("/services", response_model=list[ServiceOut])
async def services_route(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(
        select(Service).where(Service.tenant_id == tenant.id, Service.is_active == True).order_by(Service.id)  # noqa: E712
    )
    return result.scalars().all()


@router.get("/availability")
async def availability_route(
    staff_id: int,
    service_id: int,
    date: date,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    # Motor geçmiş saatleri zaten eler; yalnızca seçilebilir (bookable) başlangıçlar döner.
    return await get_available_slots(db, tenant.id, staff_id, service_id, date)


def _hhmm(t: time, end: bool = False) -> str:
    return "24:00" if end and t == time(0, 0) else t.strftime("%H:%M")


@router.get("/availability/slots", response_model=SlotsResponse)
async def availability_slots_route(
    service_id: int,
    date: date,
    staff_id: int | None = None,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    # staff_id yoksa "fark etmez": hizmeti veren tüm berberlerin birleşik gridi.
    if staff_id is None:
        grid = await build_merged_slot_grid(db, tenant.id, service_id, date)
    else:
        grid = await build_slot_grid(db, tenant.id, staff_id, service_id, date)
    return SlotsResponse(
        date=grid.date,
        slot_minutes=SLOT_MINUTES,
        duration_slots=grid.duration_slots,
        closed_reason=grid.closed_reason,
        slots=[
            SlotOut(start=_hhmm(s.start), end=_hhmm(s.end, end=True), status=s.status, bookable=s.bookable)
            for s in grid.slots
        ],
    )


# ---------------------------------------------------------------- OTP auth

@router.post("/auth/send-code", response_model=SendCodeResponse)
async def send_code_route(
    data: SendCodeRequest, request: Request, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    await require_customer_consent(db, tenant.id, data.phone, data.kvkk_accepted, request)
    code = await send_code(db, tenant.id, data.phone)
    # Geliştirmede no-op (kod dev_code ile döner); üretimde WhatsApp, başarısızsa 503.
    await deliver_code(db, tenant.id, "otp", data.phone, otp_text(tenant.name, code, tenant.id), ip=client_ip(request))
    is_dev = settings.environment == "development"
    return SendCodeResponse(message="Doğrulama kodu gönderildi", dev_code=code if is_dev else None)


@router.post("/auth/verify-code", response_model=VerifyCodeResponse)
async def verify_code_route(
    data: VerifyCodeRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    await verify_code(db, tenant.id, data.phone, data.code)
    token = create_access_token(
        {"type": "customer", "phone": data.phone, "tenant_id": tenant.id},
        expires_minutes=CUSTOMER_TOKEN_MINUTES,
    )
    result = await db.execute(
        select(Customers).where(Customers.tenant_id == tenant.id, Customers.phone == data.phone)
    )
    customer = result.scalar_one_or_none()
    return VerifyCodeResponse(access_token=token, token_type="bearer", customer=customer)


# ---------------------------------------------------------------- Appointments

def _public_query(tenant_id: int):
    return (
        select(Appointment, Service, Staff)
        .join(Service, Appointment.service_id == Service.id)
        .join(Staff, Appointment.staff_id == Staff.id)
        .where(Appointment.tenant_id == tenant_id)
    )


def _to_public(appointment: Appointment, service: Service, staff: Staff) -> AppointmentPublicOut:
    return AppointmentPublicOut(
        id=appointment.id,
        appointment_date=appointment.appointment_date,
        appointment_time=appointment.appointment_time,
        status=appointment.status,
        # Fiyat: randevu anında kaydedilen (hizmet fiyatı sonradan değişmiş olabilir); eski kayıtta hizmetin güncel fiyatı.
        service=AppointmentServiceBrief(
            id=service.id, name=service.name, duration_min=service.duration_min,
            price=appointment.price if appointment.price is not None else service.price,
        ),
        staff=staff,
    )


@router.post("/appointments", response_model=AppointmentPublicOut)
async def appointment_create(
    data: AppointmentCreate,
    identity: CustomerIdentity = Depends(get_current_customer),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    now = datetime.now()
    if data.appointment_date < now.date():
        raise HTTPException(status_code=400, detail="Geçmiş bir tarihe randevu alınamaz")
    if datetime.combine(data.appointment_date, data.appointment_time) <= now:
        raise HTTPException(status_code=400, detail="Geçmiş bir saate randevu alınamaz")

    service = (
        await db.execute(select(Service).where(Service.id == data.service_id, Service.tenant_id == tenant.id))
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    if not service.is_active:
        raise HTTPException(status_code=400, detail="Bu hizmet şu an verilmiyor")
    staff = None
    if data.staff_id is not None:
        staff = (
            await db.execute(select(Staff).where(Staff.id == data.staff_id, Staff.tenant_id == tenant.id))
        ).scalar_one_or_none()
        if staff is None:
            raise HTTPException(status_code=404, detail="Berber bulunamadı")
        if not staff.is_active:
            raise HTTPException(status_code=400, detail="Berber bulunamadı")

    customer = await get_or_create_customer(db, tenant.id, identity.phone, data.name.strip(), data.surname.strip())
    await check_daily_limit(db, tenant.id, customer.id, data.appointment_date)

    # get_or_create_customer commit edebilir; kilit ondan SONRA alınmalı ki INSERT'e kadar sürsün.
    if staff is None:  # "fark etmez": o saati alabilen, o gün en az randevusu olan berber
        staff = await pick_staff_for_slot(db, tenant.id, data.service_id, data.appointment_date, data.appointment_time)
    await lock_staff_schedule(db, tenant.id, staff.id)
    # Slot listesi: hizmet/berber bu dükkâna ait mi, çalışma saati, izin, çakışma — hepsini kapsar.
    slots = await get_available_slots(db, tenant.id, staff.id, data.service_id, data.appointment_date)
    if data.appointment_time not in {s.replace(second=0, microsecond=0) for s in slots}:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu saat artık müsait değil, lütfen başka bir saat seçin")

    # İptal edilen randevular yeni bir randevuyu engellemez (kısmi unique index: status <> 'cancelled');
    # iptal kaydı geçmiş olarak olduğu gibi kalır.
    appointment = Appointment(
        tenant_id=tenant.id,
        customer_id=customer.id,
        staff_id=staff.id,
        service_id=data.service_id,
        price=service.price,  # randevu anındaki fiyat saklanır
        appointment_date=data.appointment_date,
        appointment_time=data.appointment_time,
        status=AppointmentStatus.CONFIRMED,  # işletme onayı beklenmez
    )
    db.add(appointment)
    try:
        await db.commit()
    except IntegrityError:
        # Aynı anda gelen iki istekten biri unique(staff, date, time) kısıtına takılır.
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu saat artık müsait değil, lütfen başka bir saat seçin")
    await db.refresh(appointment)
    await appointment_notifications.on_created(db, tenant, appointment)
    return _to_public(appointment, service, staff)


@router.get("/customer/me", response_model=CustomerBrief | None)
async def customer_me(
    identity: CustomerIdentity = Depends(get_current_customer),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """Oturumdaki (OTP ile doğrulanmış) telefonun bu dükkândaki kayıtlı adı/soyadı; kayıt yoksa null.
    Yeni randevu formunu önceden doldurmak için (ad yalnızca doğrulama anında değil, her zaman güncel okunur)."""
    return (await db.execute(
        select(Customers).where(Customers.tenant_id == tenant.id, Customers.phone == identity.phone)
    )).scalar_one_or_none()


@router.get("/customer/appointments", response_model=list[AppointmentPublicOut])
async def customer_appointments(
    identity: CustomerIdentity = Depends(get_current_customer),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    query = (
        _public_query(tenant.id)
        .join(Customers, Appointment.customer_id == Customers.id)
        .where(Customers.phone == identity.phone, Customers.tenant_id == tenant.id)
        .order_by(Appointment.appointment_date.desc(), Appointment.appointment_time.desc())
    )
    rows = (await db.execute(query)).all()
    return [_to_public(a, s, st) for a, s, st in rows]


@router.post("/customer/appointments/{appointment_id}/cancel", response_model=AppointmentPublicOut)
async def customer_cancel_appointment(
    appointment_id: int,
    identity: CustomerIdentity = Depends(get_current_customer),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    query = (
        _public_query(tenant.id)
        .join(Customers, Appointment.customer_id == Customers.id)
        .where(
            Appointment.id == appointment_id,
            Customers.phone == identity.phone,
            Customers.tenant_id == tenant.id,
        )
    )
    row = (await db.execute(query)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    appointment, service, staff = row

    if appointment.status not in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
        raise HTTPException(status_code=400, detail="Bu randevu iptal edilemez")
    start = datetime.combine(appointment.appointment_date, appointment.appointment_time)
    if start - datetime.now() < timedelta(hours=CANCEL_MIN_HOURS):
        raise HTTPException(
            status_code=400,
            detail=f"Randevuya {CANCEL_MIN_HOURS} saatten az kaldığı için iptal edilemez, lütfen işletmeyle iletişime geçin",
        )

    appointment.status = AppointmentStatus.CANCELLED
    await db.commit()
    await db.refresh(appointment)
    await appointment_notifications.on_cancelled(db, tenant, appointment, by="customer")
    return _to_public(appointment, service, staff)


@router.post("/customer/appointments/{appointment_id}/reschedule", response_model=AppointmentPublicOut)
async def customer_reschedule_appointment(
    appointment_id: int,
    data: RescheduleIn,
    identity: CustomerIdentity = Depends(get_current_customer),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """Müşteri kendi randevusunu aynı hizmet + berberde başka saate alır. İptal kuralıyla aynı süre sınırı geçerlidir."""
    row = (await db.execute(
        _public_query(tenant.id)
        .join(Customers, Appointment.customer_id == Customers.id)
        .where(Appointment.id == appointment_id, Customers.phone == identity.phone, Customers.tenant_id == tenant.id)
    )).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    appointment, service, staff = row
    if appointment.status not in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
        raise HTTPException(status_code=400, detail="Bu randevunun saati değiştirilemez")
    now = datetime.now()
    old_date, old_time = appointment.appointment_date, appointment.appointment_time
    if datetime.combine(old_date, old_time) - now < timedelta(hours=CANCEL_MIN_HOURS):
        raise HTTPException(
            status_code=400,
            detail=f"Randevuya {CANCEL_MIN_HOURS} saatten az kaldığı için saati değiştirilemez, lütfen işletmeyle iletişime geçin",
        )
    new_date, new_time = data.appointment_date, data.appointment_time
    if (new_date, new_time.replace(second=0, microsecond=0)) == (old_date, old_time.replace(second=0, microsecond=0)):
        raise HTTPException(status_code=400, detail="Yeni saat mevcut randevunuzla aynı")
    if datetime.combine(new_date, new_time) <= now:
        raise HTTPException(status_code=400, detail="Geçmiş bir saate randevu alınamaz")
    if new_date != old_date:
        await check_daily_limit(db, tenant.id, appointment.customer_id, new_date)

    # Berberin takvimini kilitle; mevcut randevu kendi yeni saatini engellemesin diye geçici olarak iptal sayılır.
    # Saat müsait değilse işlem geri alınır (rollback) ve randevu olduğu gibi kalır.
    await lock_staff_schedule(db, tenant.id, staff.id)
    appointment.status = AppointmentStatus.CANCELLED
    await db.flush()
    slots = await get_available_slots(db, tenant.id, staff.id, service.id, new_date)
    if new_time.replace(second=0, microsecond=0) not in {s.replace(second=0, microsecond=0) for s in slots}:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu saat müsait değil, lütfen başka bir saat seçin")
    appointment.status = AppointmentStatus.CONFIRMED
    appointment.appointment_date, appointment.appointment_time = new_date, new_time
    # Yeni saate 90 dk'dan az kaldıysa yeni değişiklik mesajı yeterli, ayrıca hatırlatma gitmesin.
    appointment.reminder_sent = datetime.combine(new_date, new_time) - now < appointment_notifications.REMINDER_MIN_NOTICE
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu saat artık müsait değil, lütfen başka bir saat seçin")
    await db.refresh(appointment)
    await appointment_notifications.on_rescheduled(db, tenant, appointment, old_date, old_time)
    return _to_public(appointment, service, staff)


@router.post("/webhooks/evolution")
async def evolution_webhook(request: Request, token: str = "", db: Session = Depends(get_db)):
    """Evolution olayları (dükkân instance'larının bağlantı durumu). ?token= gizli anahtarla doğrulanır."""
    secret = settings.evolution_webhook_secret
    if not secret or not secrets.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Geçersiz webhook anahtarı")
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz gövde")
    if isinstance(payload, dict):
        logger.info("Evolution webhook: event=%s instance=%s", payload.get("event"), payload.get("instance"))
        await whatsapp_connection_services.handle_webhook(db, payload)
    return {"status": "received"}
