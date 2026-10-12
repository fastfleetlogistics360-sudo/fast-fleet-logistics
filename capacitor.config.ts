const config = {
  appId: "com.fastfleetlogistics.app",
  appName: "Fast Fleets 360 Logistics",
  webDir: "out",
  server: {
    // Native releases are a secure WebView shell for the production app. Keep
    // production as the safe default so a release cannot accidentally launch
    // without a server URL; development and staging builds may still override
    // it with CAPACITOR_SERVER_URL during sync.
    url: process.env.CAPACITOR_SERVER_URL || "https://fastfleet.com.ng",
    cleartext: false
  },
  ios: {
    scheme: "FastFleets360"
  },
  android: {
    buildOptions: {
      releaseType: "AAB"
    }
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["sound", "alert"]
    }
  }
};

export default config;
