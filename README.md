# Halloween i Alunda — 31 oktober 2026

Digital inbjudan till Halloweenfest för hela familjen, med program, gemensam
buffé och anmälan direkt i sidan. Gästerna anmäler sig från mobilen **utan
konto och utan inloggning** — de behöver bara länken.

En statisk sida (ingen byggkedja, inga beroenden) som pratar direkt med
Supabases REST-api.

```
index.html     inbjudan
styles.css     formgivningen
app.js         anmälan, buffélista, sista anmälningsdag
config.js      Supabase-url och anon-nyckel   ← den enda fil du behöver fylla i
supabase/migrations/20261019000000_anmalningar.sql
```

## Kom igång

**1. Lägg upp tabellen.** Öppna Supabase → SQL Editor, klistra in hela
`supabase/migrations/20261019000000_anmalningar.sql` och kör. Har du
Supabase-CLI:t kopplat till projektet går det lika bra med:

```bash
supabase db push
```

**2. Fyll i anon-nyckeln.** Supabase → Project Settings → API Keys → kopiera
`anon` / `public` och klistra in i `config.js`:

```js
window.HALLOWEEN_CONFIG = {
  SUPABASE_URL: "https://tukezihchwsonyunzpwh.supabase.co",
  SUPABASE_ANON_KEY: "eyJ..."
};
```

Anon-nyckeln är publik och hör hemma i klientkoden — det är radsäkerheten i
migrationen som skyddar datan. **Lägg aldrig in `service_role`-nyckeln här.**

Så länge nyckeln saknas visar sidan en orange notis högst upp och anmälan
sparas inte.

**3. Testa lokalt.**

```bash
python3 -m http.server 8000
```

Öppna <http://localhost:8000>, anmäl en testfamilj och kontrollera att den
dyker upp i buffélistan och i tabellen `anmalningar`.

## Publicera

Sidan är helt statisk, så vilken statisk värd som helst duger.

* **Cloudflare Pages / Netlify / Vercel** — koppla GitHub-repot, inget
  byggkommando, publiceringskatalog `/`. Fungerar även när repot är privat.
* **GitHub Pages** — Settings → Pages → Deploy from a branch → `main` / `root`.
  Kräver att repot är publikt, eller ett betalt GitHub-konto.

Dela sedan länken i familjechatten.

## Hur anmälan skyddas

Gästerna är anonyma, så säkerheten ligger i databasen i stället för i
inloggningen:

| | |
|---|---|
| **Läsa buffélistan** | alla — men bara kolumnerna som visas på sidan |
| **Anmäla sig** | alla, till och med 27 oktober 2026 |
| **Ändra sin anmälan** | bara med rätt `redigeringsnyckel` |
| **Ändra någon annans** | ingen |

När en familj anmäler sig skapar webbläsaren en hemlig `redigeringsnyckel`,
skickar med den och sparar den i `localStorage`. Nyckeln delas aldrig ut
igen — kolumnen ingår inte i de `select`-rättigheter som `anon` har — så
ingen annan kan läsa den. Ändringar sker genom funktionen
`uppdatera_anmalan()`, som kräver både rätt id och rätt nyckel.

Sista anmälningsdagen kontrolleras både i sidan och i databasen, så den går
inte att kringgå genom att redigera JavaScript.

En familj som byter telefon eller rensar webbläsardatan tappar sin nyckel och
får anmäla sig på nytt. Dubbletter städar du enklast bort i Supabases
tabellvy.
