import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const registrar = read("components/notifications/push-notification-registrar.tsx");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const capacitorConfig = read("capacitor.config.ts");
const androidIgnore = read("android/.gitignore");
const environmentExample = read("types/.env.example");
const pushSender = read("lib/notifications/push.ts");
const mainActivity = read("android/app/src/main/java/com/fastfleetlogistics/app/MainActivity.java");
const nativeReadiness = read("android/app/src/main/java/com/fastfleetlogistics/app/NativePushReadinessPlugin.java");
const androidBuild = read("android/app/build.gradle");

test("F-020 uses Capacitor's supported Android push API behind an explicit opt-in", () => {
  assert.match(registrar, /import \{ Capacitor, registerPlugin \} from "@capacitor\/core"/);
  assert.match(registrar, /import \{ PushNotifications \} from "@capacitor\/push-notifications"/);
  assert.match(registrar, /NEXT_PUBLIC_ENABLE_NATIVE_PUSH === "true"/);
  assert.match(registrar, /Capacitor\.isNativePlatform\(\)/);
  assert.match(registrar, /Capacitor\.getPlatform\(\) !== "android"/);
  assert.match(registrar, /PushNotifications\.checkPermissions\(\)/);
  assert.match(registrar, /PushNotifications\.requestPermissions\(\)/);
  assert.match(registrar, /Capacitor\.isPluginAvailable\("NativePushReadiness"\)/);
  assert.match(registrar, /NativePushReadiness\.check\(\)/);
  assert.match(registrar, /if \(!readiness\?\.ready \|\| cancelled\) return/);
  assert.match(registrar, /"registrationError"/);
  assert.match(registrar, /pushNotificationActionPerformed/);
  assert.doesNotMatch(registrar, /window\.Capacitor\?\.Plugins/);
});

test("F-020 requires Firebase resources in a new binary while old binaries safely skip registration", () => {
  assert.match(mainActivity, /registerPlugin\(NativePushReadinessPlugin\.class\)/);
  assert.match(nativeReadiness, /@CapacitorPlugin\(name = "NativePushReadiness"\)/);
  assert.match(nativeReadiness, /getIdentifier\("google_app_id", "string"/);
  assert.match(nativeReadiness, /appId\.startsWith\("1:"\)/);
  assert.match(androidBuild, /google-services\.json is required/);
  assert.match(androidBuild, /apply plugin: 'com\.google\.gms\.google-services'/);
});

test("F-020 supplies FCM's default Android channel and monochrome notification icon", () => {
  assert.match(manifest, /com\.google\.firebase\.messaging\.default_notification_channel_id/);
  assert.match(manifest, /com\.google\.firebase\.messaging\.default_notification_icon/);
  assert.match(read("android/app/src/main/res/values/strings.xml"), /default_notification_channel_id/);
  assert.match(read("android/app/src/main/res/drawable\/ic_stat_fastfleet.xml"), /#FFFFFFFF/);
  assert.match(capacitorConfig, /PushNotifications/);
  assert.match(capacitorConfig, /presentationOptions: \["sound", "alert"\]/);
});

test("F-020 keeps Firebase material out of source control and documents its server-side settings", () => {
  assert.match(androidIgnore, /^google-services\.json$/m);
  assert.match(environmentExample, /^FCM_PROJECT_ID=/m);
  assert.match(environmentExample, /^FCM_CLIENT_EMAIL=/m);
  assert.match(environmentExample, /^FCM_PRIVATE_KEY=/m);
  assert.match(environmentExample, /^NEXT_PUBLIC_ENABLE_NATIVE_PUSH=false$/m);
});

test("F-020 lets Android use Capacitor's default safe notification tap intent", () => {
  assert.match(pushSender, /Do not set click_action without a matching Android intent-filter/);
  assert.doesNotMatch(pushSender, /click_action\s*:/);
  assert.match(registrar, /pushNotificationActionPerformed/);
  assert.match(registrar, /data\.url\.startsWith\("\/"\)/);
});
