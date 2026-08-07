export function getSupabasePublicConfig() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const configuredAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!configuredUrl || !configuredAnonKey) {
    throw new Error("Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return {
    url: configuredUrl,
    anonKey: configuredAnonKey
  };
}
