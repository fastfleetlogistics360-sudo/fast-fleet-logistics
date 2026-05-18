const FALLBACK_SUPABASE_URL = "https://jenvnpfdeztpayskqeeq.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplbnZucGZkZXp0cGF5c2txZWVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MDgwNDEsImV4cCI6MjA5NDI4NDA0MX0.4_9hXPXFh-AaRnevxbZjnJIqIEYO7NtNjCw19jDY-Ng";

export function getSupabasePublicConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY
  };
}
