-- =============================================
-- SAAS APP - VERİTABANI ŞEMASI
-- PostgreSQL
-- =============================================

-- Role tipi için ENUM oluştur
CREATE TYPE role_type AS ENUM ('super_admin', 'staff', 'technical_support');

-- Randevu durumu için ENUM oluştur
CREATE TYPE appointment_status AS ENUM ( 'pending', 'confirmed', 'completed', 'cancelled', 'no_show');

-- =============================================
-- 1. TENANT TABLOSU
-- =============================================
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- =============================================
-- 2. STAFF TABLOSU
-- =============================================
CREATE TABLE staff (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    surname VARCHAR(255) NOT NULL,
    phone VARCHAR(10) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role role_type DEFAULT 'staff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_staff_phone_tenant UNIQUE (phone, tenant_id)
);

-- =============================================
-- 3. CUSTOMER TABLOSU
-- =============================================
CREATE TABLE customers ( 
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    surname VARCHAR(255) NOT NULL,
    phone VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_customer_phone_tenant UNIQUE (phone, tenant_id)
);

-- =============================================
-- 4. SERVİCES TABLOSU
-- =============================================
CREATE TABLE services(
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price INTEGER NOT NULL, -- TL cinsinden, kuruşlar yok.
    duration_min INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT unique_services_name_tenant UNIQUE (tenant_id, name)
);

-- =============================================
-- 5. APPOINTMENTS TABLOSU
-- =============================================
CREATE TABLE appointments(
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    appointment_date DATE NOT NULL, 
    appointment_time TIME NOT NULL,
    status appointment_status NOT NULL,
    payment_method VARCHAR, 
    reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_date_time_staff UNIQUE (staff_id, appointment_date, appointment_time)
);

-- =============================================
-- 6. WORKING HOURS TABLOSU
-- =============================================
CREATE TABLE working_hours(
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >=0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_staff_day UNIQUE (staff_id, day_of_week)
);

-- =============================================
-- 7. İZİN TABLOSU
-- =============================================
CREATE TABLE time_off(
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255)
);

-- =============================================
-- 8. HİZMETLER TABLOSU
-- =============================================
CREATE TABLE staff_services(
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    price INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_services_staff UNIQUE (service_id, staff_id)
);

-- =============================================
-- 9. PAYMENT METHODS TABLOSU
-- =============================================
CREATE TABLE payment_methods(
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    details JSONB, 
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_name_tenant UNIQUE (name, tenant_id)
);

-- =============================================
-- 10. VERIFICATION CODES TABLOSU
-- =============================================
CREATE TABLE verification_codes(
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone VARCHAR(10) NOT NULL, 
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_used BOOLEAN NOT NULL DEFAULT FALSE
);

-- =============================================
-- 11. WEBHOOK COOLDOWN TABLOSU
-- =============================================
CREATE TABLE webhook_cooldown(
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone VARCHAR(10) NOT NULL,
    send_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_phone_tenant UNIQUE (phone, tenant_id)
);

-- =============================================
-- 12. PLATFORM ADMINS TABLOSU
-- =============================================
CREATE TABLE platform_admins(
    id SERIAL PRIMARY KEY,
    phone VARCHAR(10) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 13. TENANT SETTINGS TABLOSU
-- =============================================
CREATE TABLE tenant_settings (
    tenant_id INTEGER PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    banner_image TEXT,
    logo_image TEXT,
    notification_banner_enabled BOOLEAN DEFAULT FALSE,
    business_name TEXT NOT NULL,
    business_adress TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INDEXLER
-- =============================================
CREATE INDEX idx_staff_tenant_id ON staff(tenant_id);
CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX idx_working_hours_tenant_id ON working_hours(tenant_id);
CREATE INDEX idx_staff_services_tenant_id ON staff_services(tenant_id);
CREATE INDEX idx_payment_methods_tenant_id ON payment_methods(tenant_id);
CREATE INDEX idx_verification_codes_tenant_id ON verification_codes(tenant_id);
CREATE INDEX idx_time_off_tenant_id ON time_off(tenant_id);
CREATE INDEX idx_appointments_tenant_id ON appointments(tenant_id);
CREATE INDEX idx_appointments_customer_id ON appointments(customer_id);
CREATE INDEX idx_appointments_service_id ON appointments(service_id);


