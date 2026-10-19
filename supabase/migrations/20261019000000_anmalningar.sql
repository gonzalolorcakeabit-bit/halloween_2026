-- Halloweenfest för hela familjen — Alunda, lördag 31 oktober 2026.
--
-- Gästerna ska kunna anmäla sig från mobilen UTAN konto och utan inloggning.
-- Därför arbetar sidan som `anon` och säkerheten ligger i den här filen:
--
--   * alla får läsa buffélistan,
--   * alla får lägga till en anmälan, men bara fram till sista anmälningsdagen,
--   * ingen får ändra någon annans anmälan — ändringar går bara via
--     uppdatera_anmalan(), som kräver den hemliga redigeringsnyckel som
--     gästens egen webbläsare sparade när anmälan skapades.
--
-- Kör filen i Supabase SQL Editor, eller med `supabase db push`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tabellen

create table if not exists public.anmalningar (
  id                uuid primary key,
  familj            text        not null check (char_length(btrim(familj)) between 1 and 60),
  vuxna             smallint    not null default 0 check (vuxna between 0 and 20),
  barn              smallint    not null default 0 check (barn between 0 and 20),
  allergier         text        check (char_length(allergier) <= 400),
  bidrag            text        check (char_length(bidrag) <= 400),
  redigeringsnyckel uuid        not null,
  skapad            timestamptz not null default now(),
  uppdaterad        timestamptz not null default now(),
  constraint minst_en_person check (vuxna + barn >= 1)
);

comment on table public.anmalningar is
  'Anmälningar till Halloweenfesten i Alunda 31 oktober 2026.';
comment on column public.anmalningar.redigeringsnyckel is
  'Hemlig nyckel som gästens webbläsare sparar i localStorage. Krävs för att ändra anmälan. Får aldrig vara läsbar för anon — se column grants nedan.';

-- ------------------------------------------------------------- sista dagen
-- Sista anmälningsdag är hela tisdag 27 oktober 2026. Sverige har gått över
-- till normaltid den 25 oktober, så gränsen är 23:59:59 vid UTC+1.
-- Samma gräns finns i gränssnittet, men den här är den som gäller: den går
-- inte att kringgå genom att redigera sidan.

create or replace function public.anmalan_ar_oppen() returns boolean
language sql stable as $$
  select now() <= timestamptz '2026-10-27 23:59:59+01';
$$;

comment on function public.anmalan_ar_oppen() is
  'Sant så länge anmälan är öppen (till och med 27 oktober 2026).';

-- --------------------------------------------------------------------- RLS

alter table public.anmalningar enable row level security;

drop policy if exists "alla far lasa buffelistan" on public.anmalningar;
create policy "alla far lasa buffelistan"
  on public.anmalningar for select
  to anon, authenticated
  using (true);

drop policy if exists "anmalan tillaten fore sista dagen" on public.anmalningar;
create policy "anmalan tillaten fore sista dagen"
  on public.anmalningar for insert
  to anon, authenticated
  with check (public.anmalan_ar_oppen());

-- Medvetet INGA policys för update eller delete: utan policy är båda stängda
-- för anon. Ändringar sker bara genom uppdatera_anmalan() längre ner.

-- ---------------------------------------------------------- kolumnrättigheter
-- Supabase ger normalt anon breda rättigheter i schemat public. Vi tar bort
-- dem och delar ut exakt de kolumner som behövs. Poängen: redigeringsnyckel
-- finns inte med i select-listan, så den kan aldrig läsas tillbaka av någon
-- annan — bara den webbläsare som själv skapade den känner till den.

revoke all on public.anmalningar from anon, authenticated;

grant select (id, familj, vuxna, barn, allergier, bidrag, skapad, uppdaterad)
  on public.anmalningar to anon, authenticated;

grant insert (id, familj, vuxna, barn, allergier, bidrag, redigeringsnyckel)
  on public.anmalningar to anon, authenticated;

-- ------------------------------------------------- ändra sin egen anmälan

create or replace function public.uppdatera_anmalan(
  p_id        uuid,
  p_nyckel    uuid,
  p_familj    text,
  p_vuxna     smallint,
  p_barn      smallint,
  p_allergier text,
  p_bidrag    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.anmalan_ar_oppen() then
    raise exception 'Anmälan till Halloweenfesten är stängd.' using errcode = 'P0001';
  end if;

  update public.anmalningar
     set familj     = p_familj,
         vuxna      = p_vuxna,
         barn       = p_barn,
         allergier  = p_allergier,
         bidrag     = p_bidrag,
         uppdaterad = now()
   where id = p_id
     and redigeringsnyckel = p_nyckel;

  if not found then
    raise exception 'Anmälan hittades inte, eller fel redigeringsnyckel.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function
  public.uppdatera_anmalan(uuid, uuid, text, smallint, smallint, text, text) from public;
grant execute on function
  public.uppdatera_anmalan(uuid, uuid, text, smallint, smallint, text, text) to anon, authenticated;
