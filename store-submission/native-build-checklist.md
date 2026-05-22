# Native App Binary Checklist

FastFleet is a PWA today. App Store and Play Store submission requires a native wrapper build.

## Capacitor Wrapper

The repo now includes `capacitor.config.ts` with:

- App ID: `com.fastfleetlogistics.app`
- App name: `FastFleet Logistics`
- Web directory: `out`
- Android release target: `AAB`

## Build Steps

1. Install Capacitor packages when ready to create native projects:
   `npm install -D @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android`
2. Export or build the web bundle that the wrapper should load.
3. Add native projects:
   `npm run native:add:ios`
   `npm run native:add:android`
4. Sync web assets:
   `npm run native:sync`
5. Open native projects:
   `npm run native:open:ios`
   `npm run native:open:android`
6. Build:
   - iOS: archive in Xcode and export an `.ipa`.
   - Android: generate a signed `.aab` from Android Studio.

## Required Before Upload

- Set bundle identifiers and signing teams in Xcode/Android Studio.
- Add production privacy strings for location, notifications, camera/photo uploads, and document uploads.
- Confirm Paystack wording is declared as payment for real-world logistics services, not digital goods.
- Test account deletion inside customer, rider, and business account settings before review submission.
