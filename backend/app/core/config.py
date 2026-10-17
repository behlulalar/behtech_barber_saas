from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    access_token_expire_minutes: int
    remember_token_expire_minutes: int = 60 * 24 * 30
    base_domain: str
    environment: str
    daily_appointment_limit: int
    otp_expiration_seconds: int
    backup_retention_days: int
    # Yüklenen görsellerin (logo, kapak, fotoğraf) saklandığı klasör; canlıda kalıcı birime bağlanır (yedeğe dahil).
    media_dir: str = "media"
    evolution_api_base_url: str
    evolution_api_key: str
    # ESKİ (tek platform hattı) — artık kullanılmıyor; her dükkânın kendi instance'ı var (whatsapp_connections).
    evolution_instance_name: str | None = None
    # Evolution'ın olayları (bağlantı durumu) göndereceği adres: backend'in /api/webhooks/evolution'ı.
    # Yerelde Docker'dan host'a: http://host.docker.internal:8001/api/webhooks/evolution
    evolution_webhook_url: str | None = None
    # Webhook'u doğrulamak için gizli anahtar (URL'ye ?token= olarak eklenir). Boşsa webhook reddedilir.
    evolution_webhook_secret: str | None = None
    # Sadece geliştirmede: WhatsApp bağlanana kadar her OTP bu kod olur. environment
    # "development" değilse yok sayılır. WhatsApp testine geçince .env'den silin.
    otp_fixed_code: str | None = None
    # Billing bildirimleri (hepsi opsiyonel; yoksa ilgili kanal kapalı)
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_starttls: bool = True
    # Giriş denemesi sınırı: aynı hesap için LOGIN_LOCK_MINUTES içinde LOGIN_MAX_FAILURES hatalı deneme kilitler.
    # --- WhatsApp ban / kötüye kullanım koruması (yalnızca dışarıdan tetiklenen doğrulama kodlarına uygulanır;
    # onay/iptal/hatırlatma gibi sistem mesajları kuyrukta aralıklı gider, ASLA düşürülmez) ---
    # Dükkân başına saatlik/günlük doğrulama kodu tavanı (son çare güvenlik sınırı; normal kullanımda erişilmez).
    whatsapp_tenant_hourly_limit: int = 300
    whatsapp_tenant_daily_limit: int = 2000
    # Aynı IP'den doğrulama kodu isteği (saatlik / günlük).
    otp_ip_hourly_limit: int = 10
    otp_ip_daily_limit: int = 30
    # Doğrulanmayan kod alarmı: son 1 saatte bu kadar kod gönderilip girilmediyse gönderim geçici durur.
    otp_unverified_breaker: int = 25
    # Arka arkaya bu kadar başarısız gönderimde dükkânın gönderimi otomatik durur.
    whatsapp_failure_pause: int = 5
    # Kuyruk: aynı numaradan iki mesaj arası rastgele boşluk (saniye).
    whatsapp_queue_gap_min: float = 3.0
    whatsapp_queue_gap_max: float = 8.0
    # Kuyruk ve sağlık kontrolü uygulama içinde çalışsın mı (testlerde kapalı).
    whatsapp_worker_enabled: bool = True
    # Platform yöneticileri için iki aşamalı doğrulama (TOTP). None = otomatik: production'da ZORUNLU, geliştirmede isteğe bağlı.
    # Zorunluyken 2FA'sı olmayan yönetici girişte yalnızca kurulum ekranına erişebilen kısıtlı bir oturum alır.
    platform_2fa_required: bool | None = None
    # 2FA gizli anahtarlarını veritabanında şifreleyen anahtar (yoksa JWT_SECRET'tan türetilir; değişirse 2FA'lar sıfırlanmalı).
    totp_encryption_key: str | None = None
    login_max_failures: int = 5
    login_lock_minutes: int = 15
    # Reverse proxy (nginx) arkasında True yapın: IP, X-Forwarded-For'un ilk değerinden alınır.
    # Proxy yoksa True yapmayın; istemci başlığı sahte yazabilir.
    trust_proxy_headers: bool = False
    model_config = SettingsConfigDict(env_file=".env")
    
settings = Settings()
