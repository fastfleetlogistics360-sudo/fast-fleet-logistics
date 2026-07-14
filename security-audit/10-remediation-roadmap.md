# Remediation Roadmap

## Before Any Production Launch

1. Fix F-001 role/admin self-escalation.
2. Remove admin fallback credentials and fail closed on missing admin env.
3. Require `FASTFLEET_ADMIN_REQUIRE_SUPABASE_PROFILE=true` behavior in production code, not only env.
4. Require `CRON_SECRET` for daily commission.
5. Make delivery proofs private and participant-scoped.
6. Add upload MIME/magic/extension allowlists and upload rate limits.
7. Add global security headers.
8. Restrict `/api/health/readiness` to admin or reduce it to a non-sensitive uptime check.

## Before Play Store Upload

1. Confirm Android package id and Play App Signing setup.
2. Keep upload keystore/key.properties out of Git.
3. Add Firebase `google-services.json` only through secure channel if native push requires it; avoid committing secrets.
4. Verify Data Safety answers match actual collection: location, financial, KYC docs, support, push tokens.
5. Test account deletion for customer/rider/business.
6. Test PWA/native notification permission and app links.
7. Run staging security tests from `09-security-test-plan.md`.

## Before Taking Live Payments At Scale

1. Add signed Squad webhook.
2. Add ledger reconciliation reports.
3. Add alerts for failed webhook, duplicate references, negative wallet transitions, and withdrawal anomalies.
4. Verify no card PAN/sensitive payment data is stored in metadata.
5. Add admin approval audit logs with immutable actor/time/change data.

## After Launch

1. Add continuous dependency scanning.
2. Add Supabase Security Advisor review into release checklist.
3. Add RLS regression tests to CI.
4. Add rate-limit dashboards and abuse alerts.
5. Schedule quarterly security review and annual external pen test.

