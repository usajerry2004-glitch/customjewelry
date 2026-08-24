# 💎 Kira Custom Jewelry — Custom Jewelry Workflow Management Platform

A workflow management platform for Kira Custom Jewelry's custom order pipeline — replacing spreadsheet-based tracking with a real-time, role-aware system covering CAD design, SKU generation, India manufacturing, US setting/repair, stone sourcing, and customer-facing order tracking.

---

## 🗂️ Project Structure

```
jewelflow-os/                     # actual project root is one level deeper: jewelflow-os/jewelflow-os/
├── frontend/                      # Next.js 14 (Pages Router) + React 18 + TypeScript
│   ├── src/
│   │   ├── pages/                 # dashboard, orders (kanban/[id]), cad, manufacturing,
│   │   │                          # repairs, stone, reports, customers, todos, settings,
│   │   │                          # audit-log, import, track/[token] (customer tracking link),
│   │   │                          # customer/orders, custom/exclusive-custom-designs
│   │   ├── components/            # layout/, orders/, dashboard/, reports/, StlViewer,
│   │   │                          # ThreeDmViewer (rhino3dm + three.js CAD preview)
│   │   ├── store/                 # Zustand global state
│   │   ├── utils/, types/, styles/
│   └── public/
├── backend/                       # NestJS 10 + TypeORM + PostgreSQL
│   ├── src/
│   │   ├── modules/                # auth, users, orders, cad, sku, manufacturing, repairs,
│   │   │                           # companies, customer-codes, import, messages,
│   │   │                           # notifications, email, reports, search, sla, spaces,
│   │   │                           # todos, public (ring-builder + customer tracking)
│   │   ├── common/                 # guards, decorators, filters
│   │   ├── database/                # entities, migrations, seeds (synchronize: true locally)
│   ├── scripts/                    # one-off ts-node scripts (debug-order, seed-*, etc.)
│   ├── uploads/                    # local file storage for CAD/reference uploads
│   └── wordpress-integration/       # Ring Builder → portal integration assets
├── docs/                           # architecture / deployment / user-guide notes (some stale)
└── .github/workflows/ci.yml        # test + build on push/PR (does not deploy)
```

---

## 🏗️ Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand |
| 3D / CAD preview | three.js + rhino3dm (STL / 3dm viewers) |
| Real-time | Socket.io (client + `@nestjs/websockets` on the API) |
| Backend | NestJS 10, TypeORM, PostgreSQL |
| Auth | JWT via Passport (`passport-jwt`, `bcryptjs`) — no third-party auth provider |
| File storage | DigitalOcean Spaces (S3-compatible, via `@aws-sdk/client-s3`) — the `spaces` module |
| Email | Nodemailer |
| Docs / exports | `pdfkit` (PDFs), `xlsx` (import), `sharp` (image processing) |
| Error tracking | Sentry (`@sentry/node`, `@sentry/nextjs`) |
| E2E testing | Playwright (frontend) |

---

## 🏢 Roles (`UserRole` enum)

`ADMIN`, `SALES_REP`, `AUTHORIZER`, `CAD_DESIGNER`, `FACTORY_MANAGER`, `FACTORY_VIEWER` (read-only counterpart to Factory Manager), `STONE_MANAGER`, `CUSTOMER`.

---

## 📋 Workflow (module map)

Customer request → **Authorization** review → **CAD** design & customer approval → **SKU** generation → **Manufacturing** (India) → stone request/allocation (**Stone Manager**) → production & QC → shipping to US → US setting/repair (**Repairs** module) → delivery. Customers can follow their order via a tokenized public link (`/track/[token]`) without logging in.

A separate integration (`backend/wordpress-integration`, see `backend/RING_BUILDER_INTEGRATION.md`) lets the Kira Jewels website's Ring Builder submit orders directly into the portal via an API-key-gated endpoint (`POST /public/ring-builder/orders`).

---

## 🏃 Local Development

The real project root is one directory deeper: `jewelflow-os/jewelflow-os/`.

**Backend** — PostgreSQL runs locally (Windows service `postgresql-x64-17`, no Redis required despite `REDIS_*` vars in `.env.example`). `nest build` is currently unreliable on this machine (exits 0 without emitting `dist`), so run via `ts-node` directly:

```powershell
cd backend
.\node_modules\.bin\ts-node -r tsconfig-paths/register src/main.ts
```

API on http://localhost:4000, Swagger docs at http://localhost:4000/api/docs.

**Frontend**:

```powershell
cd frontend
npm run dev
```

App on http://localhost:3000. `.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`.

**Alternative — Docker**: `make dev-all` (or `docker-compose up --build`) brings up Postgres + API + web in containers. `Makefile` targets: `dev-db`, `dev-api`, `dev-web`, `test-api`, `seed`, `install`, `clean`.

### Seed credentials (local/dev only)

| Role | Email | Password |
|---|---|---|
| Admin | admin@kirajewels.one | KiRa@Admin#2025! |
| Sales | sales@kirajewels.one | KiRa@Sales#2025! |
| Authorizer | authorizer@kirajewels.one | KiRa@Auth#2025! |
| CAD Designer | cad@kirajewels.one | KiRa@CadDesign#2025! |
| SKU Manager | sku@kirajewels.one | KiRa@SkuMgr#2025! |
| Factory | factory@kirajewels.one | KiRa@Factory#2025! |
| Shipping | shipping@kirajewels.one | KiRa@Shipping#2025! |
| Customer | customer@example.com | KiRa@Customer#2025! |

> `synchronize: true` means new entity columns only land in Postgres once the backend actually boots and reconnects — if a newly added field 500s ("column does not exist"), restart the backend first.

---

## 🚀 Deployment

Production runs on **DigitalOcean App Platform**, not AWS (the `docs/deployment/AWS_SETUP.md` doc and `docker-compose.prod.yml`/`nginx/*.conf` are stale leftovers from an earlier plan). Both the API and frontend apps **auto-deploy on push to `main`** — but only via the `kirajewels` git remote (`CustomDashboard/CustomJewelry`), not `origin`. No manual redeploy step is needed; check the app's Activity tab in the DO dashboard to confirm a push deployed.

- Frontend: `dashboard.<domain>` (CNAME → DO app)
- Backend API: `dashboardapi.<domain>` (CNAME → DO app)

GitHub Actions (`.github/workflows/ci.yml`) only runs backend tests and a frontend build on push/PR — it does not deploy.

---

## 📄 License

Proprietary — © 2026 Kira Custom Jewelry. All rights reserved.
