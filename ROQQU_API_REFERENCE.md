# **TakeFlow: Roqqu API Reference**

## **1\. General configuration**

Provider: Roqqu API Services (RAS)

Base URL:  
`https://service.roqqu.com/v1`

API version: `1.0.0`

### **Authentication**

Roqqu uses API keys in HTTP headers.

Depending on the endpoint and environment, the documented header is:

* `x-api-key` for live.  
* `x-staging-api-key` for test/staging where specified.

In Postman, the developer selected the API Key authentication method, configured the header key name, and supplied the corresponding Roqqu test key as its value.

Do not hardcode credentials. Configure them through backend environment variables.

Never expose private credentials to the frontend or commit them to Git.

### **Content types**

Roqqu endpoints do not all use the same request format.

Some use:  
`application/json`

Others use:  
`application/x-www-form-urlencoded`

Follow the content type documented for each endpoint.

---

## **2\. Get Crypto Balances**

**Method:** POST

**Path:** `/balances`

**Full URL:** `https://service.roqqu.com/v1/balances`

**Authentication:** Required. Documentation specifies `x-api-key`.

**Content-Type:** `application/x-www-form-urlencoded`

### **Parameters**

| Parameter | Type | Required | Description |
| ----- | ----- | ----- | ----- |
| email | string | No | Merchant email |
| token | string | No | Token symbol, e.g. btc, eth, usdt |

### **Example request**

```
curl -X POST https://service.roqqu.com/v1/balances \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=merchant@example.com" \
  -d "token=btc"
```

### **Example response**

```
{
  "status": "success",
  "message": "balance retrieved successfully",
  "data": {
    "balance": {
      "id": 2,
      "btc": 0,
      "eth": 0,
      "usdt": 137,
      "trx": 0,
      "sol": 0,
      "bnb": 0,
      "ltc": 0,
      "doge": 0,
      "bch": 0,
      "xrp": 0,
      "shib": 0,
      "ada": 0,
      "twt": 0,
      "busd": 0,
      "comp": 0,
      "created_at": "2023-08-09T18:27:44.000Z",
      "updated_at": "2023-08-29T18:06:30.000Z",
      "deleted_at": null
    }
  }
}
```

**TakeFlow use:** Display merchant cryptocurrency balances in the business dashboard.

**Verification:** Tested successfully by the developer in Postman. Confirm the exact staging header used in the successful test before implementing the environment-specific request.

---

## **3\. Generate Wallet**

**Method:** POST

**Path:** `/wallets/generate-wallet`

**Full URL:** `https://service.roqqu.com/v1/wallets/generate-wallet`

**Authentication:**

* Test/staging: `x-staging-api-key`  
* Live: `x-api-key`

**Content-Type:** `application/json`

### **Request body**

```
{
  "network": "bitcoin",
  "customer": {
    "email": "jean@email.com",
    "first_name": "Jean",
    "last_name": "Billy"
  }
}
```

The documentation accepts `customer` as either an object or a JSON string.

### **Parameters**

| Parameter | Type | Required | Description |
| ----- | ----- | ----- | ----- |
| network | string | Yes | Network code, e.g. bitcoin, erc20, bep20, trc20 |
| customer | string or object | Yes | Customer email, first name and last name |

### **Example response**

```
{
  "status": "success",
  "message": "wallet generated successfully",
  "data": {
    "address": "3KVmcuvX6vPVKYiyKz6DjVmhZvnkKbA1zu"
  }
}
```

**TakeFlow use:** Generate a receiving wallet address associated with a client or invoice.

**Verification:** Tested successfully by the developer in Postman.

**Important implementation note:** Confirm whether repeated requests for the same customer and network generate new addresses or return an existing address. Do not assume wallet reuse behaviour.

---

## **4\. Get Addresses**

**Method:** POST

**Path:** `/wallets/get-addresses`

**Full URL:** `https://service.roqqu.com/v1/wallets/get-addresses`

**Content-Type:** `application/x-www-form-urlencoded`

### **Parameters**

| Parameter | Type | Required | Description |
| ----- | ----- | ----- | ----- |
| network | string | Yes | Network code, e.g. erc20 |

### **Example request**

```
curl -X POST https://service.roqqu.com/v1/wallets/get-addresses \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "network=erc20"
```

### **Example response**

```
{
  "status": "success",
  "message": "wallet retrieved successfully",
  "data": [
    {
      "address": "0x019ada547366d2cdbf5532250b61f08a4a856276",
      "network": "erc20",
      "total_received": 0,
      "genesis": 0,
      "customer": null,
      "created_at": "2023-08-09T17:51:53.000Z",
      "updated_at": "2023-08-09T17:51:53.000Z"
    }
  ]
}
```

**TakeFlow use:** Retrieve wallet addresses belonging to a network.

**Verification:** Tested successfully by the developer in Postman.

**Authentication note:** The supplied documentation example does not show an authentication header. The actual successful Postman header configuration must be checked rather than assumed.

---

## **5\. Get Webhook URL**

**Method:** GET

**Path:** `/webhooks`

**Full URL:** `https://service.roqqu.com/v1/webhooks`

### **Example request**

```
curl -X GET https://service.roqqu.com/v1/webhooks
```

### **Example response**

```
{
  "status": "success",
  "message": "webhooks retrieved successfully",
  "data": {
    "id": 1,
    "merchant": "test1@business.com",
    "url": "https://test-webhooks.com/webhooks/coins",
    "event_types": "[\"coin-sends\", \"coin-received\", \"wallet-generated\"]",
    "status": "1",
    "created_at": "2023-09-06T01:27:40.000Z",
    "updated_at": "2023-09-06T01:32:26.000Z"
  }
}
```

**TakeFlow use:** Retrieve the webhook URL configured for the merchant and inspect its registered event types.

**Authentication:** Not specified in the supplied example. Verify the actual requirement.

---

## **6\. Retrigger Webhook Events**

**Method:** POST

**Path:** `/webhooks/retrigger`

**Full URL:** `https://service.roqqu.com/v1/webhooks/retrigger`

**Authentication:** Required. `x-api-key` header.

**Content-Type:** `application/x-www-form-urlencoded`

### **Parameters**

| Parameter | Type | Required | Description |
| ----- | ----- | ----- | ----- |
| transaction\_hash | string | Yes | Blockchain transaction hash |

### **Example request**

```
curl -X POST https://service.roqqu.com/v1/webhooks/retrigger \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "transaction_hash=YOUR_TRANSACTION_HASH"
```

### **Example response**

```
{
  "status": "success",
  "message": "Successfully retriggered 2 webhook event(s)",
  "data": {
    "retriggered_count": 1,
    "webhook_ids": [123],
    "transaction_hash": "YOUR_TRANSACTION_HASH"
  }
}
```

**TakeFlow use:** Support recovery when a webhook notification was missed or failed.

Do not expose this operation to ordinary customers without appropriate authorization and safeguards.

---

## **7\. Payment Link Webhook Events**

The documentation describes webhook events for payment link transactions.

### **Event types**

| Event | Meaning |
| ----- | ----- |
| `payment_link_completed` | Payment completed with exact amount |
| `payment_link_completed_overpaid` | Payment completed with excess amount |
| `payment_link_failed` | Payment failed or customer underpaid |

### **Webhook payload structure**

```
{
  "event_id": "evt_1234567890",
  "event_type": "payment_link_completed",
  "meta_data": {
    "payment_link_refid": "abc123def456ghi789",
    "payment_reference": "ORDER123ABC",
    "amount_required": 1000,
    "amount_currency": "ngn",
    "amount_received": "0.0001",
    "amount_received_usd": 1000,
    "overpaid_amount": "0",
    "overpaid_amount_usd": 0,
    "underpaid_amount": "0",
    "underpaid_amount_usd": 0,
    "token": "BTC",
    "value": "0.0001",
    "hash": "abc123...",
    "status": "completed",
    "customer": {
      "email": "customer@example.com",
      "first_name": "John",
      "last_name": "Doe"
    },
    "address": "RECEIVING_ADDRESS",
    "network": "bitcoin",
    "metadata": {}
  },
  "datetime": "2024-01-01T12:00:00Z"
}
```

### **Other event payloads**

The `payment_link_completed_overpaid` and `payment_link_failed` events use the same general structure, with different event types, statuses, and overpayment or underpayment amounts.

### **Important security notes**

* Webhooks are sent asynchronously and may be delayed.  
* The webhook body is encrypted.  
* The documentation states that the body must be decrypted using the API key.  
* The exact decryption algorithm and implementation must be obtained from the official "Decrypt Webhook Body" documentation section.  
* Never process an encrypted webhook as if it were already verified.  
* Implement event deduplication using `event_id` where available.  
* Reconcile using the payment reference, transaction hash, receiving address, network and amount.

**TakeFlow use:** Receive payment notifications and update invoice payment records.

**Outstanding verification:** Confirm whether these payment-link events apply to the wallet-generation workflow we are implementing, or whether separate `coin-received` events have a different payload and decryption procedure.

---

## **8\. Get Transaction by Transaction Hash**

**Method:** GET

**Path:** `/transaction/deposit/:tx_hash`

**Full URL pattern:**

`https://service.roqqu.com/v1/transaction/deposit/{tx_hash}`

**Authentication:**

* Test/staging: `x-staging-api-key`  
* Live: `x-api-key`

### **Path parameters**

| Parameter | Type | Required | Description |
| ----- | ----- | ----- | ----- |
| tx\_hash | string | Yes | Blockchain transaction hash |

### **Example request**

```
curl -X GET https://service.roqqu.com/v1/transaction/deposit/YOUR_TRANSACTION_HASH \
  -H "x-staging-api-key: YOUR_STAGING_API_KEY"
```

### **Example response**

```
{
  "status": "success",
  "message": "transaction retrieved",
  "data": {
    "ref": "48291037465829103746",
    "status": 1,
    "genesis": 0,
    "email": "merchant@business.com",
    "value": 2,
    "network": "erc20",
    "token": "usdt",
    "address": "RECEIVING_ADDRESS",
    "sender": "SENDER_ADDRESS",
    "extra": null,
    "tx_hash": "YOUR_TRANSACTION_HASH",
    "output_pos": null,
    "customer": null,
    "total_received": 0,
    "created_at": "2025-12-20T20:42:28.000Z",
    "updated_at": "2025-12-21T17:45:49.000Z",
    "deleted_at": null
  }
}
```

### **Documented errors**

Not found:

```
{
  "status": "fail",
  "message": "tx_hash details not found"
}
```

Missing path parameter:

```
{
  "status": "fail",
  "message": "tx_hash not found in params"
}
```

**TakeFlow use:** Retrieve transaction details for payment verification and reconciliation.

---

## **9\. Requery Transaction**

**Method:** POST

**Path:** `/transaction/requery/:network`

**Full URL pattern:**

`https://service.roqqu.com/v1/transaction/requery/{network}`

**Authentication:**

* Test/staging: `x-staging-api-key`  
* Live: `x-api-key`

**Content-Type:** `application/x-www-form-urlencoded`

### **Supported network codes**

* bep20  
* erc20  
* base  
* bitcoin  
* trc20  
* xrp  
* solana  
* litecoin

### **Parameters**

| Parameter | Type | Required | Description |
| ----- | ----- | ----- | ----- |
| network | string | Yes | Network in the URL |
| tx\_hash | string | Yes | Blockchain transaction hash in the form body |

### **Example request**

```
curl -X POST https://service.roqqu.com/v1/transaction/requery/bep20 \
  -H "x-staging-api-key: YOUR_STAGING_API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "tx_hash=YOUR_TRANSACTION_HASH"
```

### **Possible responses**

Confirmed in block:

```
{
  "status": "success",
  "message": "Transaction confirmed in Block.",
  "data": null
}
```

Already credited:

```
{
  "status": "success",
  "message": "Transaction already credited.",
  "data": null
}
```

Pending or not found:

```
{
  "status": "fail",
  "message": "transaction not found or still pending"
}
```

Other documented failure messages include:

* `transaction may have been skipped`  
* `transaction failed`  
* `network not supported`  
* `(tx_hash) not found in request body`  
* `Action Failed`

**TakeFlow use:** Recheck a transaction when its payment notification is delayed or its status needs confirmation.

---

## **10\. Get Transaction Status by Transaction Hash**

**Method:** GET

**Path:** `/transaction/status/:tx_hash`

**Full URL pattern:**

`https://service.roqqu.com/v1/transaction/status/{tx_hash}`

**Authentication:**

* Test/staging: `x-staging-api-key`  
* Live: `x-api-key`

### **Path parameters**

| Parameter | Type | Required | Description |
| ----- | ----- | ----- | ----- |
| tx\_hash | string | Yes | Blockchain transaction hash |

### **Example request**

```
curl -X GET https://service.roqqu.com/v1/transaction/status/YOUR_TRANSACTION_HASH \
  -H "x-staging-api-key: YOUR_STAGING_API_KEY"
```

### **Example response**

```
{
  "status": "success",
  "message": "transaction retrieved",
  "data": {
    "status": 1,
    "email": "merchant@business.com",
    "value": 2,
    "network": "erc20"
  }
}
```

### **Documented errors**

```
{
  "status": "fail",
  "message": "tx_hash details not found"
}
```

```
{
  "status": "fail",
  "message": "tx_hash not found in params"
}
```

**TakeFlow use:** Retrieve transaction status fields to support payment verification.

Do not assume the meaning of numeric status values without confirming the official status definitions.

---

## **11\. Implementation and verification status**

The developer has personally tested these endpoints successfully in Postman:

* `POST /balances`  
* `POST /wallets/generate-wallet`  
* `POST /wallets/get-addresses`

The following endpoint specifications have been supplied from the Roqqu documentation but have not yet been confirmed as successfully tested by the developer:

* `GET /webhooks`  
* `POST /webhooks/retrigger`  
* `GET /transaction/deposit/:tx_hash`  
* `POST /transaction/requery/:network`  
* `GET /transaction/status/:tx_hash`

The payment-link webhook event documentation has also been supplied, but the webhook decryption procedure and the applicability of those events to our wallet workflow still need verification.

Do not treat documented as equivalent to tested.

## **12\. General integration rules**

1. Use the exact endpoint method, path, authentication header and content type.  
2. Keep credentials in backend environment variables.  
3. Validate provider responses before using them.  
4. Use database transactions for payment reconciliation.  
5. Prevent duplicate transaction processing.  
6. Never mark an invoice as paid based only on an unverified notification.  
7. Support partial payments and overpayments.  
8. Keep unmatched payments available for review.  
9. Preserve transaction hashes and provider references for auditability.  
10. Never invent missing API behaviour.

