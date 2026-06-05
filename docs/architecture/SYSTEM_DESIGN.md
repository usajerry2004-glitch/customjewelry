# Kira Custom Jewelry — System Architecture

## High-Level Architecture

```
┌──────────────────────────────────────────────────┐
│                    USERS                          │
│ Admin | Sales Rep | CAD | Factory | Stone | Ship  │
└──────────────────────────────────────────────────┘
                       │
             ┌─────────▼──────────┐
             │   Next.js Frontend  │
             │   React 18 + TSX    │
             └─────────┬──────────┘
                       │ REST + WebSocket
             ┌─────────▼──────────┐
             │  NestJS API Server  │
             │  Port 4000          │
             └──┬──────┬──────┬───┘
                │      │      │
       ┌────────▼──┐ ┌─▼──┐ ┌▼───────┐
       │PostgreSQL │ │Redis│ │ AWS S3  │
       │   RDS     │ │Cache│ │CAD Files│
       └───────────┘ └────┘ └─────────┘
```

## Workflow State Machine

```
Customer Form
     │
     ▼
[WAITING_CONFIRMATION] → Reject → [CANCELLED]
     │ Approve
     ▼
[PENDING_CAD] → [CAD_IN_PROGRESS] → Upload
                                       │
                           ┌──────────▼──────────┐
                        Approve             Request Revision
                           │                     │
                           ▼                     ▼
               [CUSTOMER_APPROVED]      [CAD_IN_PROGRESS]
                           │
                           ▼
                    [SKU_CREATION]
                           │
                           ▼
                    [VPO_ISSUED] → India Factory
                           │
                           ▼
               [ORDER_JOB_BAG_CREATED]
                           │
                    ┌──────┴──────┐
             Standard       Casting Only
                │                 │
                ▼                 ▼
       Stone Request         US Setter
       from USA Office            │
                │                 ▼
                ▼            [DELIVERED]
         [READY_TO_INVOICE]
                │
                ▼
         [READY_TO_SHIP]
                │
                ▼
           [SHIPPED]
                │
         ┌──────┴──────┐
     OK             Repair
      │                │
      ▼                ▼
  [DELIVERED]      [REPAIR]
                       │
                       ▼
                   [DELIVERED]
```

## Role Access Matrix

| Feature         | Admin | Sales | Auth | CAD | SKU | Factory | Stone | Ship | Setter |
|-----------------|-------|-------|------|-----|-----|---------|-------|------|--------|
| Create Order    |  ✅   |  ✅   |  ✅  |  ❌ |  ❌ |   ❌    |  ❌   |  ❌  |   ❌   |
| Approve Order   |  ✅   |  ❌   |  ✅  |  ❌ |  ❌ |   ❌    |  ❌   |  ❌  |   ❌   |
| Upload CAD      |  ✅   |  ❌   |  ❌  |  ✅ |  ❌ |   ❌    |  ❌   |  ❌  |   ❌   |
| Generate SKU    |  ✅   |  ❌   |  ❌  |  ❌ |  ✅ |   ❌    |  ❌   |  ❌  |   ❌   |
| Stone Requests  |  ✅   |  ❌   |  ❌  |  ❌ |  ❌ |   ✅    |  ✅   |  ❌  |   ❌   |
| Shipping        |  ✅   |  ❌   |  ❌  |  ❌ |  ❌ |   ❌    |  ❌   |  ✅  |   ❌   |
| Repairs         |  ✅   |  ❌   |  ❌  |  ❌ |  ❌ |   ❌    |  ❌   |  ❌  |   ✅   |
| Analytics       |  ✅   |  ❌   |  ❌  |  ❌ |  ❌ |   ❌    |  ❌   |  ❌  |   ❌   |
