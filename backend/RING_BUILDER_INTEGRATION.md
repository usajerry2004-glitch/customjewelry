# Ring Builder → Portal integration

Two endpoints, both API-key gated (not JWT), meant to be called **server-side** from the Kira Jewels website — never from the customer's browser, since the key would be exposed.

Set `RING_BUILDER_API_KEY` in the backend's environment. Send it on every request as the `x-api-key` header.

## 1. Submit an order — `POST /public/ring-builder/orders`

Call this once per completed checkout. A cart with multiple rings creates one Order per ring, all tagged with the same `externalCartId`.

```json
{
  "externalCartId": "wc_order_10432",
  "customer": {
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "phoneNumber": "555-0100",
    "storeName": "Doe & Co."
  },
  "items": [
    {
      "externalOrderId": "wc_order_10432_item_1",
      "productName": "Eternity Ring Builder",
      "metalType": "14K Yellow",
      "metalColor": "Yellow",
      "size": "7",
      "centerStoneShape": "Round",
      "approximateCaratWeight": "3.61-3.71 ct TW",
      "mountingOption": "Semi-Mount",
      "quantity": 1,
      "quotedCost": 940,
      "referenceWeblink": "https://kirajewels.com/products/eternity-ring-builder",
      "customerNotes": "Comfort fit",
      "specs": {
        "Setting": "Basket",
        "Coverage": "Full",
        "Band Width": "Classic",
        "Basket Height": "Normal"
      }
    }
  ]
}
```

`externalOrderId` is required per item — it's the idempotency key. Retrying the same call (e.g. after a timeout) never creates a duplicate order; it just returns the same result again.

**Response:**
```json
{
  "success": true,
  "externalCartId": "wc_order_10432",
  "orders": [
    {
      "externalOrderId": "wc_order_10432_item_1",
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

**Response:**
```json
{
  "externalOrderId": "wc_order_10432_item_1",
  "externalCartId": "wc_order_10432",
  "poNumber": "C00312",
  "status": "CAD_IN_PROGRESS",
  "cadSubStatus": null,
  "stoneStatus": null,
  "trackingNumber": null,
  "courierName": null,
  "shipMethod": null,
  "committedShipDate": null,
  "shippedDate": null,
  "trackingUrl": "https://portal.kirajewels.one/track/a1b2c3...",
  "updatedAt": "2026-08-14T10:03:00.000Z"
}
```

`status` is one of: `NEW`, `CAD_IN_PROGRESS`, `VPO_ISSUED`, `MANUFACTURED`, `SHIPPED`, `REPAIR`, `COMPLETED`, `CANCELLED`.

The customer also automatically gets an email at every status change (order confirmed, in production, shipped, delivered) — that's existing behavior, unchanged by this integration.
