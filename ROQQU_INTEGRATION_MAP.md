# **TakeFlow and Roqqu Integration Map**

## **Purpose**

This document describes how TakeFlow uses Roqqu to support crypto receivables management.

## **Payment workflow**

1. A business registers on TakeFlow.  
2. The business creates a client record.  
3. The business creates an invoice with an amount, crypto asset, network and due date.  
4. TakeFlow requests a receiving wallet from Roqqu using `POST /wallets/generate-wallet`.  
5. TakeFlow saves the returned address and associates it with the relevant invoice.  
6. TakeFlow displays the payment instructions to the client.  
7. The client sends cryptocurrency to the receiving address.  
8. Roqqu sends a webhook notification, subject to the configured event types and the applicable webhook mechanism.  
9. TakeFlow receives the notification and decrypts it using the officially documented procedure.  
10. TakeFlow retrieves transaction details using `GET /transaction/deposit/:tx_hash`.  
11. TakeFlow checks transaction status using `GET /transaction/status/:tx_hash` and, where necessary, `POST /transaction/requery/:network`.  
12. TakeFlow validates the transaction's address, asset, network, hash and amount.  
13. TakeFlow records the verified transaction.  
14. TakeFlow matches the transaction to the appropriate invoice.  
15. TakeFlow updates the invoice's received amount, outstanding amount and status.

## **Supporting operations**

* `POST /balances`: retrieve merchant crypto balances for dashboard information.  
* `POST /wallets/get-addresses`: retrieve addresses associated with a network.  
* `GET /webhooks`: inspect configured webhook details.  
* `POST /webhooks/retrigger`: request another delivery of webhook events for a transaction.

## **Important implementation rules**

* A generated wallet address is not proof of payment.  
* A webhook must be decrypted and validated before processing.  
* A transaction should be checked against Roqqu's transaction records.  
* Duplicate webhook events and duplicate transactions must not increase invoice balances twice.  
* Partial payments must be supported.  
* Overpayments must be recorded accurately.  
* Transactions that cannot be matched reliably must remain unmatched for review.  
* Payment status must be derived from verified transaction records.

## **Outstanding questions**

1. Does Roqqu generate a unique address for each customer and network?  
2. Can an invoice reliably be associated with a generated address?  
3. What is the exact webhook decryption algorithm?  
4. What are the payloads for `coin-received` events?  
5. What are the meanings of the transaction status values?  
6. Which assets and networks are enabled in our staging account?  
7. Does the payment-link webhook functionality apply to our wallet-generation workflow?

Do not assume answers to these questions. Verify them against official documentation or staging tests.

