// Uppgifter till Supabase-projektet.
//
// Båda värdena hör hemma i klientkoden och är avsedda att synas i webbläsaren.
// Anon-nyckeln är publik — det är radsäkerheten i
// supabase/migrations/20261019000000_anmalningar.sql som skyddar datan,
// inte nyckeln. Lägg ALDRIG in service_role-nyckeln här.
//
// Hämta anon-nyckeln i Supabase: Project Settings → API Keys → anon / public.

window.HALLOWEEN_CONFIG = {
  SUPABASE_URL: "https://tukezihchwsonyunzpwh.supabase.co",
  SUPABASE_ANON_KEY: "KLISTRA_IN_ANON_NYCKELN_HAR"
};
