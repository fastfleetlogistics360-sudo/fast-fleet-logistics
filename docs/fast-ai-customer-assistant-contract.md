# Future customer-facing FAST AI contract (not implemented)

Phase 1B adds no customer endpoint, conversation store, model call, or chat UI. A later phase must authenticate with the existing Supabase customer session, authorise every operation against that user, and call the current server-side Fast Fleets services rather than tables or provider APIs directly.

## Proposed API boundary

`POST /api/customer/fast-ai/messages` accepts a short message plus a client session ID. The server resolves the authenticated customer and returns only an intent, safe answer, or a handoff reference. No payment credential, KYC, rider location, unrelated order, or provider secret may enter the model context.

## Intent contracts

- Booking: call the existing checkout/quote endpoints; never calculate fares or create deliveries directly.
- Delivery status: query only customer-owned orders through the existing account/tracking projection.
- Restaurant, shopping, grocery and FastErrands: call existing public catalog and marketplace services; preserve availability and price checks.
- Human escalation: create or link an existing support case via the support service, with a consented context summary.

## Required later data model

Use `assistant_conversations`, `assistant_messages`, and `assistant_tool_audits` with RLS restricted to the authenticated customer and service-only sensitive fields. Store redacted tool inputs/outputs and short retention windows; do not store payment data or raw KYC documents.

## Required safeguards and rollout

Rate limit per authenticated user, device/IP, and conversation; enforce content-abuse controls, tool allowlists, idempotency keys for writes, explicit confirmation before booking, human escalation, audit logs, and staged test accounts. Roll out in this order: read-only status/catalog → supervised support handoff → quote explanation → explicit-confirmation booking. Payment, rider assignment, and delivery validation remain owned by existing Fast Fleets services.
