/* Halloween i Alunda — anmälan och gemensam buffélista.
 *
 * Sidan pratar direkt med Supabases REST-api som `anon`, så gästerna slipper
 * konto och inloggning. All säkerhet ligger i databasen (se
 * supabase/migrations/): alla får läsa listan, alla får lägga till en anmälan
 * fram till sista anmälningsdagen, och ingen kan ändra någon annans — en
 * ändring kräver den redigeringsnyckel som webbläsaren sparade när anmälan
 * skapades.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------ inställningar */

  var cfg = window.HALLOWEEN_CONFIG || {};
  var URL_BAS = (cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  var NYCKEL = cfg.SUPABASE_ANON_KEY || "";
  var KONFIGURERAD = !!URL_BAS && !!NYCKEL && NYCKEL.indexOf("KLISTRA_IN") !== 0;

  // Sista anmälningsdag är hela tisdag 27 oktober 2026. Samma gräns finns i
  // databasen — den här är bara till för att visa rätt sak i gränssnittet.
  var DEADLINE = new Date("2026-10-27T23:59:59+01:00").getTime();
  var DAG = 86400000;
  var LAGER = "halloween-alunda-2026";

  var el = function (id) { return document.getElementById(id); };
  var form = el("form"), oppet = el("oppet"), stangd = el("stangd"), tack = el("tack");
  var fel = el("fel"), familjerBox = el("familjer"), summa = el("summa");

  var poster = [], min = null; // min = {id, nyckel} från localStorage

  /* ------------------------------------------------------------------ hjälpare */

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function lasLagrat() {
    try {
      var rad = window.localStorage.getItem(LAGER);
      return rad ? JSON.parse(rad) : null;
    } catch (e) { return null; }
  }

  function sparaLagrat(v) {
    try { window.localStorage.setItem(LAGER, JSON.stringify(v)); } catch (e) { /* privat läge */ }
  }

  function glomLagrat() {
    try { window.localStorage.removeItem(LAGER); } catch (e) { /* strunt samma */ }
  }

  function api(vag, init) {
    init = init || {};
    init.headers = Object.assign({
      "apikey": NYCKEL,
      "Authorization": "Bearer " + NYCKEL,
      "Content-Type": "application/json"
    }, init.headers || {});
    return fetch(URL_BAS + vag, init).then(function (svar) {
      if (svar.ok) return svar.status === 204 ? null : svar.json().catch(function () { return null; });
      return svar.json().catch(function () { return {}; }).then(function (kropp) {
        var e = new Error(kropp.message || ("Servern svarade " + svar.status));
        e.detaljer = kropp;
        throw e;
      });
    });
  }

  /* ----------------------------------------------------------- sista dagen */

  function stangt() { return Date.now() > DEADLINE; }

  function visaDeadline() {
    var kvar = Math.floor((DEADLINE - Date.now()) / DAG);
    var txt = "";
    if (kvar > 1) txt = "(" + kvar + " dagar kvar)";
    else if (kvar === 1) txt = "(sista dagen är i morgon)";
    else if (kvar === 0) txt = "(sista dagen är idag!)";
    el("kvar").textContent = txt;
  }

  function lasOmStangt() {
    if (!stangt()) { visaDeadline(); return; }
    oppet.hidden = true;
    tack.hidden = true;
    stangd.hidden = false;
  }

  /* -------------------------------------------------------------- formulär */

  function tal(id) {
    var v = parseInt(el(id).value, 10);
    return isNaN(v) || v < 0 ? 0 : Math.min(v, 20);
  }

  Array.prototype.forEach.call(document.querySelectorAll(".stepper button"), function (b) {
    b.addEventListener("click", function () {
      var input = el(b.getAttribute("data-mal"));
      var next = tal(b.getAttribute("data-mal")) + parseInt(b.getAttribute("data-steg"), 10);
      input.value = Math.max(0, Math.min(20, next));
    });
  });

  function lasFormular() {
    return {
      familj: el("familj").value.trim(),
      vuxna: tal("vuxna"),
      barn: tal("barn"),
      allergier: el("allergier").value.trim() || null,
      bidrag: el("bidrag").value.trim() || null
    };
  }

  function fyllFormular(p) {
    el("familj").value = p.familj || "";
    el("vuxna").value = typeof p.vuxna === "number" ? p.vuxna : 2;
    el("barn").value = typeof p.barn === "number" ? p.barn : 1;
    el("allergier").value = p.allergier || "";
    el("bidrag").value = p.bidrag || "";
  }

  function visaFel(text) {
    fel.textContent = text;
    fel.hidden = false;
  }

  function knapptext() {
    return min ? "Uppdatera vår anmälan 🎃" : "Vi kommer! 🎃";
  }

  function visaTack(uppdaterad) {
    oppet.hidden = true;
    tack.hidden = false;
    el("tack-text").textContent = uppdaterad
      ? "Er anmälan är uppdaterad. Vi ses den 31 oktober!"
      : "Tack för er anmälan! Vi ser fram emot att fira Halloween tillsammans med er!";
    tack.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    fel.hidden = true;

    var p = lasFormular();
    if (!p.familj) { visaFel("Skriv familjens namn så vi vet vilka ni är."); el("familj").focus(); return; }
    if (p.vuxna + p.barn < 1) { visaFel("Fyll i hur många ni blir — minst en person."); el("vuxna").focus(); return; }
    if (!KONFIGURERAD) { visaFel("Sidan är inte kopplad till databasen än, så anmälan kan inte sparas. Hör av dig till Lisa."); return; }
    if (stangt()) { visaFel("Anmälan stängde den 27 oktober."); lasOmStangt(); return; }

    var knapp = el("skicka");
    knapp.disabled = true;
    knapp.textContent = "Sparar…";

    var uppdatering = !!min;
    var arbete;

    if (uppdatering) {
      arbete = api("/rest/v1/rpc/uppdatera_anmalan", {
        method: "POST",
        body: JSON.stringify({
          p_id: min.id, p_nyckel: min.nyckel, p_familj: p.familj,
          p_vuxna: p.vuxna, p_barn: p.barn,
          p_allergier: p.allergier, p_bidrag: p.bidrag
        })
      });
    } else {
      var ny = { id: uuid(), redigeringsnyckel: uuid() };
      arbete = api("/rest/v1/anmalningar", {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify({
          id: ny.id, familj: p.familj, vuxna: p.vuxna, barn: p.barn,
          allergier: p.allergier, bidrag: p.bidrag,
          redigeringsnyckel: ny.redigeringsnyckel
        })
      }).then(function () {
        min = { id: ny.id, nyckel: ny.redigeringsnyckel };
        sparaLagrat(min);
      });
    }

    arbete.then(function () {
      knapp.disabled = false;
      knapp.textContent = knapptext();
      visaTack(uppdatering);
      return hamtaLista();
    })["catch"](function (err) {
      knapp.disabled = false;
      knapp.textContent = knapptext();
      var kod = (err.detaljer && err.detaljer.code) || "";
      if (kod === "P0001") { visaFel("Anmälan stängde den 27 oktober."); lasOmStangt(); }
      else if (kod === "P0002") { visaFel("Vi hittade inte er tidigare anmälan. Ladda om sidan och försök igen."); glomLagrat(); min = null; }
      else if (kod === "42501" || kod === "42P01") { visaFel("Anmälan går inte att spara just nu. Hör av dig till Lisa så löser vi det."); }
      else { visaFel("Något gick fel när anmälan skulle sparas: " + err.message); }
    });
  });

  el("andra").addEventListener("click", function () {
    tack.hidden = true;
    oppet.hidden = false;
    el("skicka").textContent = knapptext();
    el("familj").focus();
  });

  /* ----------------------------------------------------------- buffélistan */

  function kort(p) {
    var egen = min && p.id === min.id;
    var ruta = document.createElement("div");
    ruta.className = "familj" + (egen ? " jag" : "");

    var namn = document.createElement("div");
    namn.className = "namn";
    var n = document.createElement("span");
    n.textContent = p.familj || "Familj utan namn";
    namn.appendChild(n);
    if (egen) {
      var vi = document.createElement("span");
      vi.className = "vi";
      vi.textContent = "Ni";
      namn.appendChild(vi);
    }
    var antal = document.createElement("span");
    antal.className = "antal-txt";
    antal.textContent = (p.vuxna || 0) + " vuxna · " + (p.barn || 0) + " barn";
    namn.appendChild(antal);
    ruta.appendChild(namn);

    var dl = document.createElement("dl");
    function rad(rubrik, varde) {
      var dt = document.createElement("dt"); dt.textContent = rubrik;
      var dd = document.createElement("dd"); dd.textContent = varde;
      dl.appendChild(dt); dl.appendChild(dd);
    }
    rad("Tar med", p.bidrag ? String(p.bidrag) : "Meddelar senare");
    if (p.allergier) rad("Allergier / specialkost", String(p.allergier));
    ruta.appendChild(dl);

    return ruta;
  }

  function chip(id, antal, ord) {
    var b = document.createElement("b");
    b.textContent = String(antal);
    var nod = el(id);
    nod.textContent = "";
    nod.appendChild(b);
    nod.appendChild(document.createTextNode(" " + ord));
  }

  function rita(melding) {
    familjerBox.textContent = "";

    if (!poster.length) {
      var t = document.createElement("p");
      t.className = "tomt";
      t.textContent = melding || "Ingen har anmält sig än — bli först!";
      familjerBox.appendChild(t);
      summa.hidden = true;
      return;
    }

    var vuxna = 0, barn = 0;
    poster.slice()
      .sort(function (a, b) {
        return String(a.familj || "").localeCompare(String(b.familj || ""), "sv");
      })
      .forEach(function (p) {
        vuxna += Number(p.vuxna) || 0;
        barn += Number(p.barn) || 0;
        familjerBox.appendChild(kort(p));
      });

    chip("chip-familjer", poster.length, poster.length === 1 ? "familj" : "familjer");
    chip("chip-vuxna", vuxna, "vuxna");
    chip("chip-barn", barn, "barn");
    summa.hidden = false;
  }

  function hamtaLista() {
    if (!KONFIGURERAD) { poster = []; rita("Buffélistan är inte igång än."); return Promise.resolve(); }

    return api("/rest/v1/anmalningar?select=id,familj,vuxna,barn,allergier,bidrag&order=familj.asc")
      .then(function (rader) {
        poster = rader || [];

        // Känner webbläsaren igen sin egen anmälan? Då går den att ändra.
        if (min) {
          var vår = null;
          poster.forEach(function (p) { if (p.id === min.id) vår = p; });
          if (vår) {
            fyllFormular(vår);
            el("skicka").textContent = knapptext();
            el("anmalan-rubrik").textContent = "Er anmälan";
          } else {
            glomLagrat();
            min = null;
          }
        }
        rita();
      })["catch"](function () {
        poster = [];
        rita("Buffélistan kunde inte hämtas just nu. Prova att ladda om sidan.");
      });
  }

  /* ------------------------------------------------------------------ start */

  if (!KONFIGURERAD) {
    var notis = el("notis");
    notis.textContent = "Sidan är inte kopplad till Supabase än — anmälan och buffélistan fungerar inte förrän anon-nyckeln är ifylld i config.js.";
    notis.hidden = false;
  }

  min = lasLagrat();
  lasOmStangt();
  el("skicka").textContent = knapptext();
  hamtaLista();

  // Håll listan färsk när man kommer tillbaka till fliken.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) hamtaLista();
  });
})();
