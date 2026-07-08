# FAST FLEET LOGISTICS App Store and Play Store Readiness

## Public URLs

- Marketing URL: https://fastfleet.com.ng/
- Support URL: https://fastfleet.com.ng/support
- Privacy Policy: https://fastfleet.com.ng/privacy
- Terms of Service: https://fastfleet.com.ng/terms

## Store Submission Status

- In-app account deletion: implemented in customer, rider, and business account settings with a red `Delete my account` action, confirmation modal, immediate auth access removal, device notification token deletion, personal profile anonymization, eligible saved/KYC data cleanup, Supabase sign-out, and a completed `account_deletion_requests` audit record.
- Native app binary: Capacitor wrapper config has been added in `capacitor.config.ts`. Native projects and signed `.ipa` / `.aab` files still require running the native add/sync commands and adding the Android/iOS location permission entries listed in `store-submission/native-build-checklist.md`.
- Store listing assets: generated in `store-assets/` for App Store screenshots/icon and Play Store screenshots/icon/feature graphic.
- Google Play data safety form: drafted in `store-submission/google-play-data-safety.md`.
- Notification system: in-app notification bell, unread count, read/read-all actions, Supabase Realtime subscription, `notifications` table, `push_subscriptions` table, and related schema policies are present.

## Google Play Data Safety Draft

Data collected:
- Name: account profile, support, rider KYC, delivery sender/recipient records.
- Email address: account login, support, receipts, account deletion requests.
- Phone number: delivery coordination, recipient contact, rider onboarding, support.
- Approximate and precise location: pickup detection, route estimates, live delivery tracking, rider location during active jobs.
- Financial info: wallet top-ups, Squad payment references, refund records, withdrawal records, bank payout details for riders.
- Photos/files: rider documents, KYC uploads, vehicle documents where enabled.
- Government ID/NIN: rider KYC where legally or operationally required.
- App activity: delivery history, support tickets, wallet transactions, dashboard activity.

Data shared with third parties:
- Supabase: authentication, database, storage, sessions.
- Squad by GTCO/HabariPay: wallet funding, payment verification, payment references.
- Map/location providers: route preview, pickup detection, delivery tracking.

Security and deletion:
- Account deletion is available in dashboard.
- Payment records may be retained where required for accounting, fraud prevention, dispute resolution, or legal compliance.
- Users can request access, correction, export, or deletion through dashboard settings or support.

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

- Wallet top-ups are for real-world logistics and delivery services. Confirm final Apple review language before submitting iOS builds that use Squad by GTCO/HabariPay.
- Likely content rating: Apple 4+ / Google Everyone, subject to the official questionnaire answers.
- Declare in-app payments as real-world service payments, not digital content.
- Use `store-submission/native-build-checklist.md` before opening App Store Connect or Play Console releases.
