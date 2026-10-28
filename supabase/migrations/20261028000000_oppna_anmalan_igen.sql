-- Ta bort sista anmälningsdagen.
--
-- Anmälan stängde av sig själv efter 27 oktober 2026, men festen är kvar och
-- fler familjer ska hinna anmäla sig. anmalan_ar_oppen() används både av
-- insert-policyn och av uppdatera_anmalan(), så det räcker att låta den svara
-- true: båda vägarna öppnas i samma ögonblick, och strukturen från den första
-- migrationen står kvar om spärren någon gång ska tillbaka.
--
-- Kör i Supabase → SQL Editor.

create or replace function public.anmalan_ar_oppen() returns boolean
language sql stable as $$
  select true;
$$;

comment on function public.anmalan_ar_oppen() is
  'Anmälan är öppen tills vidare. Lägg tillbaka ett datumvillkor här om den ska stänga igen.';
