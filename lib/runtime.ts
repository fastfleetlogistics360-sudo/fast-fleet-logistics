export function isProductionRuntime() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

export function canUseDemoFallback() {
  return process.env.NEXT_PUBLIC_ALLOW_DEMO_DATA === "true" || !isProductionRuntime();
}

export function missingServiceResponse(feature: string) {
  return {
    error: `Production ${feature} is not configured. Set SUPABASE_SERVICE_ROLE_KEY and verify the production Supabase schema.`,
    code: "production_service_not_configured"
  };
}
