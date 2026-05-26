const config = {
  appId: "com.fastfleetlogistics.app",
  appName: "Fast Fleets 360 Logistics",
  webDir: "out",
  server: {
    url: process.env.CAPACITOR_SERVER_URL,
    cleartext: false
  },
  ios: {
    scheme: "FastFleets360"
  },
  android: {
    buildOptions: {
      releaseType: "AAB"
    }
  }
};

export default config;
