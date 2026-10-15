"""Billing saf mantık: period_end / add_months / compute_state (DB gerekmez)."""
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.services.billing_services import add_months, compute_state, payment_status, period_end

TODAY = date(2026, 10, 15)
PS = SimpleNamespace(reminder_days=3, grace_days=7)


def sub(id, start, end, price=1000):
    return SimpleNamespace(id=id, start_date=start, end_date=end, price=price)


# ---- ay sonu / artık yıl ----
@pytest.mark.parametrize("start,months,expected", [
    (date(2027, 1, 31), 1, date(2027, 2, 28)),    # 31 Oca + 1 ay = 28 Şub (artık değil)
    (date(2028, 1, 31), 1, date(2028, 2, 29)),    # artık yıl
    (date(2027, 1, 30), 1, date(2027, 2, 28)),
    (date(2027, 1, 29), 1, date(2027, 2, 28)),
    (date(2028, 1, 29), 1, date(2028, 2, 28)),    # hedef 29 Şub (kırpma yok) -> bir gün önce
    (date(2026, 10, 14), 1, date(2026, 11, 13)),  # normal durum: aynı gün - 1
    (date(2026, 8, 31), 1, date(2026, 9, 30)),    # 30 günlük ay
    (date(2026, 1, 1), 12, date(2026, 12, 31)),
    (date(2026, 1, 1), 1, date(2026, 1, 31)),
    (date(2026, 12, 15), 3, date(2027, 3, 14)),   # yıl devri
    (date(2024, 2, 29), 12, date(2025, 2, 28)),   # artık günden bir yıl sonrası
])
def test_period_end(start, months, expected):
    assert period_end(start, months) == expected


def test_add_months_clamps_and_rolls_year():
    assert add_months(date(2026, 11, 30), 3) == date(2027, 2, 28)
    assert add_months(date(2026, 12, 31), 2) == date(2027, 2, 28)
    assert add_months(date(2026, 5, 31), 1) == date(2026, 6, 30)


# ---- compute_state ----
def test_untracked_when_no_subscriptions():
    st = compute_state([], {}, PS, TODAY)
    assert st.status == "untracked" and st.coverage_end is None and st.outstanding == 0


def test_active():
    st = compute_state([sub(1, TODAY - timedelta(days=10), TODAY + timedelta(days=20))], {}, PS, TODAY)
    assert st.status == "active" and st.days_left == 20 and st.current.id == 1


def test_due_soon_boundary():
    # reminder_days=3: kalan 3 gün -> due_soon, 4 gün -> active
    assert compute_state([sub(1, TODAY - timedelta(days=30), TODAY + timedelta(days=3))], {}, PS, TODAY).status == "due_soon"
    assert compute_state([sub(1, TODAY - timedelta(days=30), TODAY + timedelta(days=4))], {}, PS, TODAY).status == "active"
    # bugün biten dönem hâlâ kapsıyor
    assert compute_state([sub(1, TODAY - timedelta(days=30), TODAY)], {}, PS, TODAY).status == "due_soon"


def test_grace_then_expired_boundary():
    # grace_days=7: bitişten 1..7 gün sonra grace, 8. gün expired
    assert compute_state([sub(1, TODAY - timedelta(days=40), TODAY - timedelta(days=1))], {}, PS, TODAY).status == "grace"
    assert compute_state([sub(1, TODAY - timedelta(days=40), TODAY - timedelta(days=7))], {}, PS, TODAY).status == "grace"
    assert compute_state([sub(1, TODAY - timedelta(days=40), TODAY - timedelta(days=8))], {}, PS, TODAY).status == "expired"


def test_scheduled_only_future_period():
    st = compute_state([sub(1, TODAY + timedelta(days=5), TODAY + timedelta(days=35))], {}, PS, TODAY)
    assert st.status == "scheduled" and st.next.id == 1 and st.current is None


def test_expired_with_future_period_is_not_scheduled_if_has_past():
    past = sub(1, TODAY - timedelta(days=100), TODAY - timedelta(days=60))
    future = sub(2, TODAY + timedelta(days=30), TODAY + timedelta(days=60))
    st = compute_state([past, future], {}, PS, TODAY)
    assert st.status in ("active", "due_soon")  # coverage_end gelecekte


def test_outstanding_only_counts_started_periods():
    s1 = sub(1, TODAY - timedelta(days=30), TODAY + timedelta(days=1), price=1000)
    s2 = sub(2, TODAY + timedelta(days=2), TODAY + timedelta(days=30), price=500)
    st = compute_state([s1, s2], {1: 400}, PS, TODAY)
    assert st.outstanding == 600  # gelecek dönemin borcu sayılmaz


def test_overpayment_does_not_make_negative_outstanding():
    s1 = sub(1, TODAY - timedelta(days=30), TODAY + timedelta(days=30), price=1000)
    assert compute_state([s1], {1: 5000}, PS, TODAY).outstanding == 0


def test_payment_status():
    assert payment_status(1000, 0) == "unpaid"
    assert payment_status(1000, 400) == "partial"
    assert payment_status(1000, 1000) == "paid"
    assert payment_status(1000, 2000) == "paid"
    assert payment_status(0, 0) == "paid"
