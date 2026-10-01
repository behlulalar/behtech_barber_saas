<p align="center">
  <img src="docs/assets/logo.png" alt="Beyond The Code" width="420">
</p>

<h1 align="center">BehTech Barber SaaS</h1>

<p align="center">
  A multi-tenant appointment booking platform for barbershops and salons.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.tr.md">Türkçe</a>
</p>

---

## Overview

This project is a ground-up rebuild of a single-tenant barbershop appointment
system into a proper multi-tenant SaaS product. Each barbershop ("tenant")
gets its own isolated data and its own branded subdomain
(`shop-name.behtechlabs.com`), while the platform owner manages all tenants
from a single codebase and database.

The original single-tenant system (Flask + vanilla JS) is kept as reference
material; this repository is a fresh implementation, not a port.

## Tech stack

| Layer          | Technology                                              |
|----------------|----------------------------------------------------------|
| Backend        | FastAPI, Python 3.14                                      |
| ORM            | SQLAlchemy 2.0 (async), Alembic for migrations            |
| Database       | PostgreSQL                                                 |
| Auth           | JWT (PyJWT), bcrypt (passlib)                              |
| Config         | pydantic-settings (`.env`-driven)                           |
| Frontend       | React (planned — replacing the original vanilla JS panels) |

## Architecture

- **Multi-tenancy:** shared database, row-level isolation via a `tenant_id`
  column on every tenant-scoped table (as opposed to schema-per-tenant),
  chosen for operational simplicity at this stage.
- **Tenant resolution:** subdomain-based — `shop-slug.behtechlabs.com` —
  resolved per-request and carried through the JWT.
- **Platform admin:** a separate, tenant-independent identity
  (`platform_admins`) sits outside the tenant boundary and can administer
  every tenant.

## Database schema

13 tables, fully defined both as raw SQL (`backend/schema.sql`, used as the
original design reference) and as SQLAlchemy models (`backend/app/models/`):

`tenants`, `staff`, `customers`, `services`, `appointments`,
`working_hours`, `time_off`, `staff_services`, `payment_methods`,
`verification_codes`, `webhook_cooldown`, `platform_admins`, `tenant_settings`.

## Project structure

```
saas-app/
├── backend/
│   ├── app/
│   │   ├── core/        # config, database engine/session, security
│   │   ├── models/       # SQLAlchemy models (one file per table)
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── api/            # route handlers
│   │   └── services/       # business logic
│   ├── alembic/            # database migrations
│   └── schema.sql           # reference SQL schema
└── frontend/                # React app (planned)
```

## Status

🚧 Active development. Database schema and SQLAlchemy models are complete;
API layer and frontend are in progress. Not production-ready yet.

## License

Proprietary — all rights reserved. This is a commercial product under
development; the source is not licensed for reuse.
