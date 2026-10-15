"""Platform sahibi: abonelik, ödeme, paket, ayar ve bildirim route'ları."""
from datetime import date

import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_platform_admin
from app.models.platform_admin import PlatformAdmin
from app.schemas.billing import (
    BillingOverview,
    PaymentCreate,
    PaymentOut,
    PlanCreate,
    PlanOut,
    PlanUpdate,
    PlatformSettingsOut,
    PlatformSettingsUpdate,
    PushPublicKey,
    PushSubscribeIn,
    PushTestResult,
    PushUnsubscribeIn,
    RunChecksResult,
    SubscriptionCreate,
    SubscriptionOut,
    SubscriptionUpdate,
    SuggestOut,
    TenantBilling,
)
from app.services import billing_services as svc
from app.services import job_services, notify_services

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/platform", dependencies=[Depends(get_current_platform_admin)])


# Paketler
@router.get("/plans", response_model=list[PlanOut])
async def list_plans(db: AsyncSession = Depends(get_db)):
    return await svc.list_plans(db)


@router.post("/plans", response_model=PlanOut, status_code=201)
async def create_plan(data: PlanCreate, request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    return await svc.create_plan(db, data, admin, request)


@router.patch("/plans/{plan_id}", response_model=PlanOut)
async def update_plan(plan_id: int, data: PlanUpdate, request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    return await svc.update_plan(db, plan_id, data, admin, request)


@router.delete("/plans/{plan_id}", status_code=204)
async def delete_plan(plan_id: int, request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    await svc.delete_plan(db, plan_id, admin, request)
    return Response(status_code=204)


# Özet
@router.get("/billing/overview", response_model=BillingOverview)
async def billing_overview(db: AsyncSession = Depends(get_db)):
    return await svc.overview(db)


@router.get("/billing/tenants", response_model=list[TenantBilling])
async def billing_tenants(db: AsyncSession = Depends(get_db)):
    return await svc.list_tenant_billing(db)


@router.post("/billing/run-checks", response_model=RunChecksResult)
async def billing_run_checks(
    request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)
):
    try:
        return await job_services.run_billing_checks_logged(db, "manual", admin, request)
    except Exception:
        # Ayrıntı job_runs.error'a yazıldı; istemciye iç hata sızdırılmaz.
        logger.exception("Manual billing check failed")
        raise HTTPException(status_code=500, detail="Günlük kontrol çalışırken hata oluştu, Sistem sayfasından ayrıntıya bakın")


# Dönemler
@router.get("/tenants/{tenant_id}/subscriptions", response_model=list[SubscriptionOut])
async def list_subscriptions(tenant_id: int, db: AsyncSession = Depends(get_db)):
    return await svc.list_subscriptions(db, tenant_id)


@router.get("/tenants/{tenant_id}/subscriptions/suggest", response_model=SuggestOut)
async def suggest_subscription(tenant_id: int, plan_id: int, db: AsyncSession = Depends(get_db)):
    return await svc.suggest_period(db, tenant_id, plan_id)


@router.post("/tenants/{tenant_id}/subscriptions", response_model=SubscriptionOut, status_code=201)
async def create_subscription(tenant_id: int, data: SubscriptionCreate, request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    return await svc.create_subscription(db, tenant_id, data, admin, request)


@router.patch("/subscriptions/{sub_id}", response_model=SubscriptionOut)
async def update_subscription(sub_id: int, data: SubscriptionUpdate, request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    return await svc.update_subscription(db, sub_id, data, admin, request)


@router.delete("/subscriptions/{sub_id}", status_code=204)
async def delete_subscription(sub_id: int, request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    await svc.delete_subscription(db, sub_id, admin, request)
    return Response(status_code=204)


@router.post("/subscriptions/{sub_id}/reminded", response_model=SubscriptionOut)
async def subscription_reminded(sub_id: int, request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    return await svc.mark_reminded(db, sub_id, admin, request)


# Ödemeler
@router.get("/payments", response_model=list[PaymentOut])
async def list_payments(
    tenant_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_payments(db, tenant_id, date_from, date_to)


@router.post("/payments", response_model=PaymentOut, status_code=201)
async def create_payment(data: PaymentCreate, request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    return await svc.create_payment(db, data, admin, request)


@router.delete("/payments/{payment_id}", status_code=204)
async def delete_payment(payment_id: int, request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    await svc.delete_payment(db, payment_id, admin, request)
    return Response(status_code=204)


# Ayarlar
@router.get("/settings", response_model=PlatformSettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)):
    return await svc.get_settings(db)


@router.put("/settings", response_model=PlatformSettingsOut)
async def put_settings(data: PlatformSettingsUpdate, request: Request, admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    return await svc.update_settings(db, data, admin, request)


# Push
@router.get("/push/public-key", response_model=PushPublicKey)
async def push_public_key():
    return PushPublicKey(public_key=settings.vapid_public_key or None)


@router.post("/push/subscribe", status_code=204)
async def push_subscribe(
    data: PushSubscribeIn,
    request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    await svc.push_subscribe(db, admin.id, data, request.headers.get("user-agent"))
    return Response(status_code=204)


@router.post("/push/unsubscribe", status_code=204)
async def push_unsubscribe(data: PushUnsubscribeIn, db: AsyncSession = Depends(get_db)):
    await svc.push_unsubscribe(db, data.endpoint)
    return Response(status_code=204)


@router.post("/push/test", response_model=PushTestResult)
async def push_test(db: AsyncSession = Depends(get_db)):
    sent = await notify_services.send_push_to_all(
        db, "Test bildirimi", "BehTech bildirimleri çalışıyor.", "/platform/ayarlar"
    )
    return PushTestResult(sent=sent)
