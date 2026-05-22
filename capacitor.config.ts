const config = {
  appId: "com.fastfleetlogistics.app",
  appName: "FastFleet Logistics",
  webDir: "out",
  server: {
    url: process.env.CAPACITOR_SERVER_URL,
    cleartext: false
  },
  ios: {
    scheme: "FastFleet"
  },
  android: {
    buildOptions: {
      releaseType: "AAB"
    }
  }
};

export default config;
