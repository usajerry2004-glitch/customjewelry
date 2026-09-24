# Ring Builder → Portal integration

Two endpoints, both API-key gated (not JWT), meant to be called **server-side** from the Kira Jewels website — never from the customer's browser, since the key would be exposed.

Set `RING_BUILDER_API_KEY` in the backend's environment. Send it on every request as the `x-api-key` header.

## 1. Submit an order — `POST /public/ring-builder/orders`

Call this once per completed checkout. A cart with multiple rings creates one Order per ring, all tagged with the same `externalCartId`.

```json
{
  "externalCartId": "O-100020",
  "source": "kira-website",
  "orderDate": "2026-08-18T00:00:00.000Z",
  "customer": {
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "phoneNumber": "555-0100",
    "storeName": "Sherwood Management"
  },
  "customerNotes": "optional",
  "refCustomerPo": "O-100020",
  "shippingAddress": {
    "name": "Jane Doe",
    "company": "Sherwood Management",
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "country": "USA"
  },
  "items": [{
    "externalOrderId": "CB60817001",
    "designId": "CB60817001",
    "modelId": "abc123",
    "title": "Round Basket Full — Size 7 — 3.66 ct · 14K Yellow",
    "description": "Stones: 0.20 ct Round\nSetting: Basket\nRing Metal: 14K Yellow",
    "quantity": 1,
    "unitPrice": 940,
    "currency": "USD",
    "orderType": "Ring",
    "size": "7",
    "metalType": "14K",
    "metalColor": "Yellow",
    "stones": "0.20 ct Round",
    "setting": "Basket",
    "coverage": "Full",
    "caratTotalWeight": 3.66,
    "imageUrl": "https://...",
    "referenceWeblink": "https://.../share?token=..."
  }]
}
```

`externalOrderId` is required per item — it's the idempotency key. Retrying the same call (e.g. after a timeout) never creates a duplicate order; it just returns the same result again.

**How this maps into the portal, field by field:**
| Payload field | Where it goes |
|---|---|
| `orderType`, `size`, `metalType`, `metalColor`, `referenceWeblink` | Same-named order field, directly |
| `quantity` | Order quantity |
| `unitPrice` × `quantity` | Order's quoted price (total, not per-unit) |
| `stones` (e.g. `"0.20 ct Round"`) | Split into stone shape + carat weight where we recognize the shape name; kept as-is either way |
| `caratTotalWeight` | Preferred over the parsed `stones` weight when both are present |
| `refCustomerPo` | Order's customer PO reference |
| `imageUrl` | Fetched and saved as a reference image on the order (same as an uploaded reference photo) — best-effort, a failed fetch doesn't block the order |
| `title`, `description`, `designId`, `modelId`, `setting`, `coverage`, `shippingAddress`, `orderDate`, `source`, cart-level `customerNotes` | All folded into the order's notes field, so nothing is lost even though there's no dedicated column for each of these |
| `currency` | Not used — the portal has no multi-currency support, so this is currently ignored |

**Response:**
```json
{
  "success": true,
  "externalCartId": "O-100020",
  "orders": [
    {
      "externalOrderId": "CB60817001",
      "poNumber": "C00312",
      "trackingToken": "a1b2c3...",
      "trackingUrl": "https://portal.kirajewels.one/track/a1b2c3...",
      "status": "NEW"
    }
  ],
  "message": "1 order(s) received."
}
```

Store `poNumber` and `trackingUrl` against the website's own order — you'll need `externalOrderId` again to poll status.

## 2. Poll status — `GET /public/ring-builder/orders/:externalOrderId`

Call this whenever the customer views their order/account page on the website, or to reconcile against a webhook delivery you never got (§3).

**Response** — same shape §3 pushes, so there's one schema for both push and pull:
```json
{
  "externalOrderId": "wc_order_10432_item_1",
  "externalCartId": "wc_order_10432",
  "poNumber": "C00312",
  "status": "MANUFACTURED",
  "cadSubStatus": null,
  "stoneStatus": "STONE_RECEIVED",
  "trackingNumber": null,
  "courierName": null,
  "shipMethod": null,
  "committedShipDate": "2026-09-01",
  "shippedDate": null,
  "trackingUrl": "https://portal.kirajewels.one/track/a1b2c3...",
  "updatedAt": "2026-08-20T14:32:00.000Z",
  "imageUrl": "https://customjewelry.nyc3.digitaloceanspaces.com/cad/1789...-thumb.jpg",
  "cadFileUrl": "https://customjewelry.nyc3.digitaloceanspaces.com/cad/1789...-152423.3dm",
  "cadFileName": "ring-design-v3.3dm",
  "customerFullName": "Jane Doe",
  "customerEmail": "jane@example.com",
  "phoneNumber": "555-0100",
  "storeName": "Sherwood Management",
  "orderType": "Ring",
  "metalType": "14K",
  "metalColor": "Yellow",
  "size": "7",
  "centerStoneShape": "Round",
  "approximateCaratWeight": "0.20 ct",
  "quantity": 1,
  "quotedCost": 940,
  "referenceWeblink": "https://.../share?token=...",
  "customerNotes": "optional",
  "salesRepName": "Ring Builder",
  "createdAt": "2026-08-18T00:00:00.000Z",
  "completed": false,
  "completedAt": null
}
```
Full customer/product/price fields are included on every response now, not just on the order's first appearance — needed so your side can create a complete record for an order that originated in the dashboard, not just a status stub.
`completed`/`completedAt` are kept alongside the richer fields for any caller still reading the old narrow shape — new integrations should read `status === "COMPLETED"` instead.
`imageUrl` is the latest actual CAD design image once our design team has uploaded one, otherwise the customer's original reference photo, otherwise `null` if neither exists yet (e.g. a brand-new order with no attachments). Always a single direct image URL, never an array.
`cadFileUrl`/`cadFileName` are the actual latest uploaded design file itself, whatever format it is (`.3dm`, `.stl`, `.jpg`, `.pdf`, etc.) — not just the viewable preview `imageUrl` gives you, and never the customer's reference photo (that's not a CAD file). Both `null` if no design file has been uploaded yet. `cadFileName` is the original filename, since the URL alone doesn't always make the format obvious.

The customer also automatically gets an email at every internal status change (order confirmed, in production, shipped, delivered) — that's existing behavior, unrelated to and unchanged by this endpoint.

## 3. Outbound push on every status change (and shipping-field edits) — now every order, not just Ring Builder

We push to your site whenever **any** order's status changes, and whenever its shipping fields (tracking number, courier, ship method, committed/shipped date) get set independent of a status change — not just Ring Builder ones. So you don't strictly need to poll at all if you'd rather just receive this. Built to match kirajewels.one's published receiver spec.

**Important for orders you didn't originate**: an order entered directly by our staff, or submitted through our web form, has no `externalOrderId`/`externalCartId` your site gave it — there was never a checkout on your end to reference. For these, we send our own PO number as both `externalOrderId` and `externalCartId`. Since your receiver spec currently drops anything it can't match to an existing order, **please treat an unrecognized id here as "create a new order record," not "drop it,"** or these will silently disappear on your end. This was the agreed approach for surfacing every dashboard order on your site, not just Ring Builder ones.

**Setup needed on our side** (once you give us a URL and a shared secret): set these two in the backend environment —
```
RING_BUILDER_WEBHOOK_URL=https://kirajewels.one/api/webhooks/jewelflow
RING_BUILDER_WEBHOOK_SECRET=<the shared secret you generate and send us>
```
Nothing fires until `RING_BUILDER_WEBHOOK_URL` is set — no webhook target configured means no calls go out. Do a `GET` on that URL first (their receiver spec has this as a connectivity/secret check) before relying on the first real `POST`.

**What we send**, `POST` to that URL — identical shape to the poll response in §2 (full order details included), plus `event`:
```json
{
  "event": "order.updated",
  "externalOrderId": "wc_order_10432_item_1",
  "externalCartId": "wc_order_10432",
  "poNumber": "C00312",
  "status": "MANUFACTURED",
  "cadSubStatus": null,
  "stoneStatus": "STONE_RECEIVED",
  "trackingNumber": null,
  "courierName": null,
  "shipMethod": null,
  "committedShipDate": "2026-09-01",
  "shippedDate": null,
  "trackingUrl": "https://portal.kirajewels.one/track/a1b2c3...",
  "updatedAt": "2026-08-20T14:32:00.000Z",
  "imageUrl": "https://customjewelry.nyc3.digitaloceanspaces.com/cad/1789...-thumb.jpg",
  "cadFileUrl": "https://customjewelry.nyc3.digitaloceanspaces.com/cad/1789...-152423.3dm",
  "cadFileName": "ring-design-v3.3dm",
  "customerFullName": "Jane Doe",
  "customerEmail": "jane@example.com",
  "phoneNumber": "555-0100",
  "storeName": "Sherwood Management",
  "orderType": "Ring",
  "metalType": "14K",
  "metalColor": "Yellow",
  "size": "7",
  "centerStoneShape": "Round",
  "approximateCaratWeight": "0.20 ct",
  "quantity": 1,
  "quotedCost": 940,
  "referenceWeblink": "https://.../share?token=...",
  "customerNotes": "optional",
  "salesRepName": "Ring Builder",
  "createdAt": "2026-08-18T00:00:00.000Z"
}
```
`event` is `"order.completed"` when `status` is `"COMPLETED"`, else `"order.updated"` — the receiver spec's own delivery-handling logic keys off `status`, not `event`, so treat `event` as informational only.

**Status vocabulary** (the full enum a JewelFlow order can hold): `NEW`, `CAD_IN_PROGRESS`, `VPO_ISSUED`, `MANUFACTURED`, `SHIPPED`, `REPAIR`, `COMPLETED`, `CANCELLED`. **`COMPLETED` is the one that means "finished and physically ready for you to take over shipping to the customer"** — it's the only status this integration has ever pushed as a completion signal, it's the status Admin sets to close out a Ring Builder order, and it's what triggers the order-delivered customer email. `SHIPPED` exists in the enum but, as of this integration, no code path in the app ever transitions an order *into* it — it looks like a leftover from before Ring Builder existed, when this app may have handled shipping to the customer directly. Treat `MANUFACTURED`/`SHIPPED`/`REPAIR`/`CANCELLED` as "not done yet" (or, for `CANCELLED`, "never will be") until told otherwise.

**Signing**: header `x-jewelflow-signature: sha256=<hex>` — an HMAC-SHA256 of the exact request body bytes, keyed with the shared secret above. Recompute it the same way on your end and compare; reject anything that doesn't match.

**Retry behavior**: a `5xx` response (or a timeout, 10s) gets one retry after a 2 second delay, then we give up and log it. A `4xx` response (bad signature, bad shape) is **not** retried — that's a request-level problem retrying identically won't fix, so we log it and stop immediately rather than burning the retry on something that can't succeed.
