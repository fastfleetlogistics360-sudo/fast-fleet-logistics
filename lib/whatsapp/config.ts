const graphApiVersion = "v22.0";

function value(name: string) {
  return process.env[name]?.trim() || "";
}

export function whatsappConfig() {
  return {
    verifyToken: value("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    accessToken: value("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: value("WHATSAPP_PHONE_NUMBER_ID"),
    appSecret: value("WHATSAPP_APP_SECRET"),
    graphApiVersion: value("WHATSAPP_GRAPH_API_VERSION") || graphApiVersion,
    siteUrl: value("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "")
  };
}

export function whatsappIsConfigured() {
  const config = whatsappConfig();
  return Boolean(config.verifyToken && config.accessToken && config.phoneNumberId && config.appSecret && config.siteUrl);
}

