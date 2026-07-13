# Native App Binary Checklist

FastFleet is a PWA today. App Store and Play Store submission requires a native wrapper build.

## Capacitor Wrapper

The repo now includes `capacitor.config.ts` with:

- App ID: `com.fastfleetlogistics.app`
- App name: `Fast Fleets 360 Logistics`
- Web directory: `out`
- Android release target: `AAB`

Android has been generated with Capacitor and can produce a release bundle at:

`android/app/build/outputs/bundle/release/app-release.aab`

## Build Steps

1. Export or build the web bundle that the wrapper should load.
2. Sync web assets:
   `CAPACITOR_SERVER_URL=https://fastfleet.com.ng npm run native:sync`
3. Open native projects:
   `npm run native:open:ios`
   `npm run native:open:android`
4. Build:
   - iOS: archive in Xcode and export an `.ipa`.
   - Android: generate a signed `.aab` from Android Studio or run `./gradlew :app:bundleRelease` from `android/`.

## Android Release Signing

The Android project is configured to read release signing credentials from `android/key.properties`. The real key file and password file are ignored by Git.

1. Create an upload key for Google Play:
   ```bash
   /opt/homebrew/opt/openjdk@21/bin/keytool -genkeypair \
     -v \
     -keystore android/upload-keystore.jks \
     -keyalg RSA \
     -keysize 2048 \
     -validity 10000 \
     -alias upload
   ```
2. Copy `android/key.properties.example` to `android/key.properties`.
3. Place the keystore at the path used by `storeFile`.
4. Build `android/app/build/outputs/bundle/release/app-release.aab`.

Until `android/key.properties` exists, Gradle can create an unsigned proof bundle only. Play Console requires the final upload bundle to be signed.

## Required Before Upload

- Add Android upload signing key and confirm Play App Signing.
- Add `android/app/google-services.json` from Firebase before testing native Android push notifications.
- After Play Console creates the app signing certificate, set `ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS` in production to the Play signing SHA-256 fingerprint so `https://fastfleet.com.ng/.well-known/assetlinks.json` can verify Android App Links.
- Set bundle identifiers and signing teams in Xcode/Android Studio.
- Add production privacy strings for location, notifications, camera/photo uploads, and document uploads.
- Confirm Squad wording is declared as payment for real-world logistics services, not digital goods.
- Test account deletion inside customer, rider, and business account settings before review submission.

## Android App Links

The Android manifest is prepared for verified links on `fastfleet.com.ng` and `www.fastfleet.com.ng`. Native open-app behavior will only verify after the production site serves a non-empty Digital Asset Links response with the real Play signing SHA-256 fingerprint.

Before the Play Store app is live, the site can safely return an empty `assetlinks.json` response. That keeps the PWA install flow active now and lets native link opening be enabled later without changing the package ID.

## Live Location Permissions

FastFleet currently requests rider location through the browser Geolocation API in the PWA and Capacitor WebView. Android foreground location, camera, and notification permissions have been added.

Android `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

iOS `ios/App/App/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>FastFleet uses your location during active deliveries so customers can track rider movement from pickup to drop-off.</string>
```

If background delivery tracking is added later, add the platform-specific background location permissions and App Store/Play Store background location disclosures before release. The current implementation is foreground tracking only.
