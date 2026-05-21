# FAST FLEET LOGISTICS App Store and Play Store Readiness

## Public URLs

- Marketing URL: https://fastfleetlogistics.pages.dev/
- Support URL: https://fastfleetlogistics.pages.dev/support
- Privacy Policy: https://fastfleetlogistics.pages.dev/privacy
- Terms of Service: https://fastfleetlogistics.pages.dev/terms

## Google Play Data Safety Draft

Data collected:
- Name: account profile, support, rider KYC, delivery sender/recipient records.
- Email address: account login, support, receipts, account deletion requests.
- Phone number: delivery coordination, recipient contact, rider onboarding, support.
- Approximate and precise location: pickup detection, route estimates, live delivery tracking, rider location during active jobs.
- Financial info: wallet top-ups, Paystack payment references, refund records, withdrawal records, bank payout details for riders.
- Photos/files: rider documents, KYC uploads, vehicle documents where enabled.
- Government ID/NIN: rider KYC where legally or operationally required.
- App activity: delivery history, support tickets, wallet transactions, dashboard activity.

Data shared with third parties:
- Supabase: authentication, database, storage, sessions.
- Paystack: wallet funding, payment verification, payment references.
- Map/location providers: route preview, pickup detection, delivery tracking.

Security and deletion:
- Account deletion is available in dashboard.
- Payment records may be retained where required for accounting, fraud prevention, dispute resolution, or legal compliance.
- Users can request access, correction, export, or deletion through support.

## Apple App Privacy Nutrition Label Draft

Data linked to user identity:
- Contact info: name, email, phone.
- Location: pickup/drop-off location, rider location during active delivery.
- Financial info: payment references, wallet records, refund and withdrawal records.
- User content: support messages, delivery notes, KYC document uploads.
- Identifiers: Supabase user ID, payment references, delivery tracking codes.
- Usage data: delivery history, wallet transactions, support interactions.

Purpose:
- App functionality: delivery booking, dispatch matching, tracking, wallet, support, account management.
- Fraud prevention and security: payment verification, rider KYC, suspicious delivery review.
- Customer support: order edits, disputes, refunds, account deletion.

Tracking:
- Do not mark data as used for cross-app advertising tracking unless third-party advertising SDKs are added later.

## Store Notes

- Wallet top-ups are for real-world logistics and delivery services. Confirm final Apple review language before submitting iOS builds that use Paystack.
- Likely content rating: Apple 4+ / Google Everyone, subject to the official questionnaire answers.
- Declare in-app payments as real-world service payments, not digital content.
