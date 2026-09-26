# Android push-notification release checklist

This project uses Firebase Cloud Messaging (FCM) for the installed Android app. It is intentionally disabled until this checklist is complete, so a missing Firebase setup cannot destabilise the app when a user accepts the notification permission.

## 1. Register the exact Android app in Firebase

In Firebase Console, create or select the Fast Fleets 360 Firebase project and add an Android app with this exact package name:

```
com.fastfleetlogistics.app
```

Download `google-services.json` and place it at:

```
android/app/google-services.json
```

Do not rename it. It is deliberately ignored by Git and is only included in the Android release build.

## 2. Enable server delivery

In Firebase/Google Cloud:

1. Enable the Firebase Cloud Messaging API (v1).
2. Create a service-account key for the Firebase project, or use a dedicated existing service account with the **Firebase Cloud Messaging API Admin** role.
3. In Vercel's Production environment, set these server-only variables from that service-account JSON file:

   - `FCM_PROJECT_ID` = `project_id`
   - `FCM_CLIENT_EMAIL` = `client_email`
   - `FCM_PRIVATE_KEY` = `private_key` (preserve the line breaks, or use literal `\n`)

Never expose the private key in `NEXT_PUBLIC_*`, source control, chat, or a mobile binary.

## 3. Enable the installed Android app only after Firebase is present

Set this Vercel Production variable and redeploy the website **only after the
new Android binary has been built and passed the device test**:

```
NEXT_PUBLIC_ENABLE_NATIVE_PUSH=true
```

The Android shell loads the deployed website, so this public build-time value must be in the deployed Next.js bundle. The matching `google-services.json` must also be present before building the Android AAB.

## 4. Build and test before releasing

1. Run `npm run native:sync` after placing the Firebase file.
2. Build a signed AAB with the same Firebase file present.
3. Install it on a physical Android device with Google Play services.
4. Sign in, accept the Android notification permission, then confirm that a row with `provider = fcm` and `platform = android` appears in `push_subscriptions` for that account.
5. Put the app in the background. In Firebase Console, send a test notification to the device token.
6. Confirm all three results: it displays with the Fast Fleet status-bar icon, tapping it opens only the intended internal screen, and the app does not crash.
7. Finally approve a test rider KYC record and confirm the real server-generated notification is received.

If registration fails, leave `NEXT_PUBLIC_ENABLE_NATIVE_PUSH=false`; do not repeatedly prompt the user or retry in a loop. The app continues to provide in-app notifications while push delivery is unavailable.

## Current code safeguards

- Android FCM registration is explicitly opt-in.
- Older Android binaries without Firebase configuration safely skip native push
  registration; they are never shown a permission prompt by this feature.
- A new binary refuses to build if `google-services.json` is missing.
- Permission state is checked before requesting it.
- FCM registration failures do not retry in a loop.
- Notification taps accept only safe same-app paths.
- The `delivery_updates` Android channel and a monochrome status-bar icon are configured for FCM.
