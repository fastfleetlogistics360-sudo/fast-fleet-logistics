# Google Play Data Safety Declaration

Use this as the source-of-truth draft when filling the Google Play Console Data safety form.

## Data Collection

FastFleet collects the following data types:

- Personal info: name, email address, phone number, account type, business contact details, rider profile details.
- Location: pickup address, drop-off address, route estimate, approximate service zone, and rider location while an active delivery is being fulfilled.
- Financial info: Paystack payment references, wallet top-ups, refund records, withdrawal requests, bank payout details for riders, and transaction history.
- Photos and files: rider KYC documents, vehicle documents, proof-of-delivery images, support attachments where enabled.
- Government ID: rider identity and licensing documents where required for KYC and safety review.
- App activity: delivery bookings, order status changes, wallet transactions, support tickets, notification read status, dashboard activity.
- Device or other IDs: Supabase user ID, session identifiers, payment references, delivery tracking codes, push notification endpoint identifiers.

## Data Sharing

FastFleet shares data only as needed to operate the service:

- Supabase: authentication, database, storage, realtime notifications, sessions, and row-level security.
- Paystack: wallet funding, payment verification, bank verification, refunds, and payout references.
- Map/location providers: pickup, drop-off, route, ETA, and delivery tracking support.
- Regulators, law enforcement, insurers, payment partners, or dispute-resolution bodies when required by law or safety/fraud review.

## Security Practices

- Data is encrypted in transit.
- Authentication, role checks, Supabase Row Level Security, storage policies, and admin review workflows restrict access.
- Account deletion is available inside customer, rider, and business dashboard account settings through a red "Delete my account" button.
- Eligible profile/contact records are anonymized immediately and queued for hard deletion after the retention window.

## Retention And Deletion

- Active account profile data is retained while the account remains active.
- Booking drafts and support metadata are normally retained for up to 24 months.
- Delivery records, proof of delivery, wallet transactions, refund records, payout records, fraud signals, and dispute evidence may be retained for up to 7 years when required for tax, accounting, payment, safety, anti-fraud, or legal obligations.
- Deleted accounts are queued in `account_deletion_requests` and direct contact fields are removed from profile records.

## Tracking

Do not mark cross-app advertising tracking unless an advertising SDK or cross-app tracking vendor is added later.
