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

Call this whenever the customer views their order/account page on the website.

**Deliberately narrow on purpose**: this only tells you whether the order is completed — none of the internal production stages (CAD, VPO, manufacturing, shipping, etc.) are exposed. Those are internal-only; the website should just show "in progress" until `completed` flips to `true`.

**Response:**
```json
{
  "externalOrderId": "wc_order_10432_item_1",
  "externalCartId": "wc_order_10432",
  "poNumber": "C00312",
  "completed": false,
  "completedAt": null
}
```

Once the order finishes: `completed: true`, `completedAt: "2026-08-20T14:32:00.000Z"`.

The customer also automatically gets an email at every internal status change (order confirmed, in production, shipped, delivered) — that's existing behavior, unrelated to and unchanged by this endpoint.

## 3. Outbound push when an order completes

In addition to polling, we now also push to your site the moment an order is marked completed on our end — so you don't strictly need to poll at all if you'd rather just receive this.

**Setup needed on our side** (once you give us a URL): set these two in the backend environment —
```
RING_BUILDER_WEBHOOK_URL=https://kirajewels.com/wp-json/your-plugin/order-completed
RING_BUILDER_WEBHOOK_SECRET=<a shared secret you and we both know>
```
Nothing fires until `RING_BUILDER_WEBHOOK_URL` is set — no webhook target configured means no calls go out.

**What we send**, `POST` to that URL:
```json
{
  "externalOrderId": "wc_order_10432_item_1",
  "externalCartId": "wc_order_10432",
  "poNumber": "C00312",
  "completed": true,
  "completedAt": "2026-08-20T14:32:00.000Z"
}
```
Header `x-kira-webhook-secret` carries the shared secret above — your endpoint should reject the request if it doesn't match, so nobody else can spoof a "completed" call to your site.

We retry once (after a 2 second delay) if the first attempt fails or times out (10s), then give up and log it on our end — there's no further retry after that, so if your endpoint is down for longer than that, you'd only find out from the poll endpoint (§2) still returning `completed: false` until you check again.
