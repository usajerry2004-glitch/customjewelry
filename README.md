# 💎 JewelFlow OS — Custom Jewelry Workflow Management Platform

> **Lead Engineer's Vision**: A premium, enterprise-grade workflow system replacing spreadsheets and disconnected tools with a beautiful, unified platform for the entire custom jewelry manufacturing lifecycle.

---

## 🌟 Project Summary

JewelFlow OS is a purpose-built workflow management platform for custom jewelry businesses. It replaces Smartsheet/spreadsheet-based processes with a modern, real-time, role-aware system that tracks every order from customer inquiry to final delivery — including CAD design, SKU generation, stone requests, India manufacturing, US setting, and repair management.

**Based on:** Real operational data from Kira Jewels custom order workflows (`Custom_Orders_-_Customer.xlsx`) and the technical blueprint (`JewelFlow_OS_Technical_Blueprint.docx`).

---

## 🗂️ Project Structure

```
jewelflow-os/
├── frontend/              # React + Next.js 14 App
│   ├── src/
│   │   ├── components/    # Reusable UI components by domain
│   │   ├── pages/         # Next.js page routes
│   │   ├── hooks/         # Custom React hooks
│   │   ├── store/         # Zustand global state
│   │   ├── utils/         # Helpers and formatters
│   │   └── styles/        # Global CSS + Tailwind config
│   └── public/            # Static assets
├── backend/               # Node.js + NestJS API
│   ├── src/
│   │   ├── modules/       # Domain-driven NestJS modules
│   │   ├── common/        # Guards, decorators, filters
│   │   ├── config/        # Environment & app configuration
│   │   └── database/      # Migrations, seeds, entities
│   └── test/              # Unit + E2E tests
├── docs/                  # Full documentation
│   ├── api/               # REST API reference
│   ├── architecture/      # System design diagrams
│   ├── deployment/        # AWS deployment guide
│   └── user-guide/        # Role-specific user guides
├── scripts/               # DB seed, deploy, CI/CD scripts
└── .github/workflows/     # GitHub Actions CI/CD pipelines
```

---

## 🏗️ Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend Framework | Next.js 14 (App Router) | SSR, performance, SEO |
| UI Library | React 18 + TypeScript | Component architecture |
| Styling | Tailwind CSS + Shadcn/UI | Rapid, consistent UI |
| Animations | Framer Motion | Premium feel |
| State Management | Zustand | Lightweight, scalable |
| Backend Framework | NestJS (Node.js) | Enterprise-grade, modular |
| Database | PostgreSQL 15 | Relational, reliable |
| Cache | Redis | Real-time sessions, queues |
| File Storage | AWS S3 | CAD files, images |
| Authentication | Clerk (JWT + RBAC) | Role-based access |
| Real-time | WebSocket (Socket.io) | Live order updates |
| Email | Resend | Transactional emails |
| Cloud | AWS (EC2, RDS, S3, CF) | Scalable infrastructure |
| CI/CD | GitHub Actions | Automated deployments |

---

## 📋 Workflow Stages (Based on Real Data)

```
[1] Customer Request → [2] Authorization Review → [3] CAD Design
→ [4] Customer CAD Approval → [5] SKU Generation
→ [6] Manufacturing (India) → [7] Stone Request & Allocation
→ [8] Production & QC → [9] Shipping to USA
→ [10] US Setter (Repair/Polish) → [11] Final Delivery
↕
[Casting-Only Path] → [Stone Selection (USA)] → [US Setter] → [Delivery]
```

---

## 🏢 Departments & Roles

| Role | Access Level | Key Capabilities |
|---|---|---|
| **Admin** | Full Access | System config, all modules |
| **Sales Rep** | Orders, Customers | Create/view orders, quote |
| **Authorizer** | Orders, Approvals | Review, approve, reject |
| **CAD Designer** | CAD Module | Upload CAD, set estimates |
| **SKU Manager** | SKU Module | Generate SKUs, catalog |
| **Factory Manager** | Manufacturing | Update production status |
| **Stone Manager** | Inventory | Stone requests, allocation |
| **Shipping Manager** | Shipping | Tracking, dispatch |
| **US Setter** | Repairs, Finishing | Receive, set, ship |
| **Customer** | Portal | View order status only |

---

## 🚀 Development Phases

### Phase 1 — Core Platform (Weeks 1–8)
- [x] Project setup, CI/CD, auth
- [x] Order management (create, view, update)
- [x] Role-based dashboards
- [x] CAD upload and approval flow
- [x] SKU generation system
- [x] Basic notifications

### Phase 2 — Operations (Weeks 9–16)
- [ ] Inventory & stone management
- [ ] Manufacturing workflow (India factory)
- [ ] Shipping & tracking integration
- [ ] Repair management module
- [ ] Customer portal

### Phase 3 — Intelligence (Weeks 17–24)
- [ ] Advanced reporting & analytics
- [ ] Performance dashboards
- [ ] Mobile app (React Native)
- [ ] AI-powered quote estimation
- [ ] Security hardening & audit

---

## 🏃 Quick Start

```bash
# Clone and install
git clone https://github.com/your-org/jewelflow-os.git
cd jewelflow-os

# Backend
cd backend && npm install
cp .env.example .env  # Fill in your vars
npm run migration:run
npm run seed
npm run start:dev

# Frontend
cd ../frontend && npm install
cp .env.local.example .env.local  # Fill in your vars
npm run dev
```

Visit: http://localhost:3000

---

## 📊 Key Features

- **🔄 Real-time Kanban** — Drag-and-drop order cards through workflow stages
- **📎 File Attachments** — CAD files, reference images, customer photos
- **💬 Comments & History** — Full audit trail on every order
- **📧 Smart Notifications** — Email + in-app for stage transitions
- **📈 Analytics Dashboard** — Revenue, volume, turnaround metrics
- **🔐 RBAC Security** — Granular permissions per role
- **📱 Mobile Responsive** — Works on phone/tablet for factory floor
- **🔍 Advanced Search** — Full-text search across all orders/SKUs

---

## 📞 Team Structure

| Role | Responsibility |
|---|---|
| Product Manager | Roadmap, stakeholder alignment |
| UX/UI Designer | Figma designs, design system |
| Frontend Lead | Next.js architecture, component library |
| Frontend Dev (x2) | Feature development |
| Backend Lead | NestJS API, database design |
| Backend Dev (x2) | Module development |
| QA Engineer | Test automation, quality |
| DevOps Engineer | AWS, CI/CD, monitoring |

---

## 📄 License

Proprietary — © 2025 JewelFlow OS. All rights reserved.
