export function isProductionRuntime() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

export function canUseDemoFallback() {
  return process.env.NEXT_PUBLIC_ALLOW_DEMO_DATA === "true" || !isProductionRuntime();
}

export function missingServiceResponse(feature: string) {
  return {
    error: `${feature} is temporarily in operational handoff. Please verify service credentials and Supabase schema status.`,
    code: "operational_handoff_required"
  };
}
