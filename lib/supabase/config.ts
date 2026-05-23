import { isProductionRuntime } from "@/lib/runtime";

const FALLBACK_SUPABASE_URL = "https://jenvnpfdeztpayskqeeq.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplbnZucGZkZXp0cGF5c2txZWVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MDgwNDEsImV4cCI6MjA5NDI4NDA0MX0.4_9hXPXFh-AaRnevxbZjnJIqIEYO7NtNjCw19jDY-Ng";

export function getSupabasePublicConfig() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const configuredAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowFallback = !isProductionRuntime() || process.env.NEXT_PUBLIC_ALLOW_SUPABASE_FALLBACK === "true";

  if ((!configuredUrl || !configuredAnonKey) && isProductionRuntime() && !allowFallback) {
    throw new Error("Production Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return {
    url: configuredUrl || FALLBACK_SUPABASE_URL,
    anonKey: configuredAnonKey || FALLBACK_SUPABASE_ANON_KEY
  };
}
