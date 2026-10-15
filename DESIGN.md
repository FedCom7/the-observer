# The Observer — documento di progetto

> Un unico posto per seguire tutte le mie passioni: cosa succede adesso, cosa arriva, cosa mi sono perso.
> Sito web consultabile ovunque, app nativa sul Mac. Stile Apple, grafici in stile New York Times.

Stato: **concept v0.2** (15 ottobre 2026).
Prototipi: home [prototype/index.html](prototype/index.html) · control room [prototype/control-room.html](prototype/control-room.html)

## Decisioni prese (15 ottobre 2026)

| Tema | Decisione | Conseguenze |
|---|---|---|
| Costi | **Solo servizi gratuiti** | Niente Claude API a pagamento: il "redattore" e il briefing girano come routine pianificata di Claude Code, coperta dall'abbonamento. Le API sportive solo nel piano gratuito o non ufficiali. |
| Utenti | **Solo io** | Un solo utente, nessuna registrazione: accesso protetto da una password o da un link segreto. |
| Diretta | **Sì, anche live** | Polling ogni 15–30 s durante gli eventi in corso (scoreboard ESPN, F1 live timing). Polling lento quando non c'è nulla di live, per restare nei limiti gratuiti. |
| Mac | **Prima PWA, poi Tauri** | Fase 1: sito installato nel Dock tramite Safari. Fase 3: app Tauri con notifiche native, barra dei menu e widget. |
| Primo approfondimento | **Elezioni americane** | Le midterm sono il 3 novembre 2026: è la prima pagina dedicata da costruire. |
| Lingua | **Inglese** | Interfaccia in inglese. Orari sempre in ora italiana. |
| Viste | **Home + Control Room** | Due modalità: la home "Apple" per la lettura tranquilla e la control room scura e densa per vedere tutto a colpo d'occhio. |

### Architettura scelta per v0.1 (15 ottobre 2026, sera)
- **Vite + React + TypeScript**, sito statico installabile (PWA). Nessun server.
- **Dati live dal browser:** ESPN, Jolpica, Launch Library 2, Spaceflight News e wheretheiss.at accettano richieste dirette dal browser (verificato).
- **Dati curati** in `src/data/*.json`, aggiornati in futuro da un job pianificato (GitHub Actions o una routine di Claude Code).
- **Hosting:** Firebase Hosting gratuito. Codice su GitHub. Le Cloud Functions non servono: richiederebbero il piano a consumo.

### Rischi sul "tutto gratis + live"
- **Notte elettorale live:** AP (la fonte standard) è a pagamento. Alternative gratuite: siti dei segretari di stato, feed pubblici. Va fatto un sopralluogo prima del 3 novembre.
- **F1 live timing:** verificare quali parti di OpenF1 sono ancora gratuite in tempo reale.
- **API ESPN non ufficiali:** gratuite ma senza garanzie. Ogni fonte passa da un adattatore, così si può sostituire senza toccare il resto.

---

## 1. Principi

1. **Il tempo è l'asse principale.** Tutto è organizzato su "ieri, ora, prossimamente". Quale sport sia viene dopo.
2. **A colpo d'occhio, poi in profondità.** La home si legge in 10 secondi; le pagine dedicate offrono l'approfondimento.
3. **Ora italiana sempre.** Ogni orario è convertito in Europe/Rome, con il segnale "notturna" per gli eventi tra 00:00 e 07:00 (NFL, MLB, NBA, college football).
4. **Anti-spoiler di serie.** I risultati si possono oscurare, così posso guardare la replica senza sapere com'è finita.
5. **Il "peso" degli eventi.** Una finale vale più di una partita di regular season. Ogni evento ha un'importanza da 1 a 3 che decide cosa finisce in evidenza.

## 2. Le passioni e come le raggruppo

Il colore identifica la **categoria** (8 colori, palette accessibile ai daltonici), non la singola passione.

| Categoria | Passioni | Tipo di copertura |
|---|---|---|
| Milan | Milan (Serie A, Champions, Coppa Italia) | Partite, classifica, risultati |
| Sport USA | NFL, Patriots, College Football, Texas Longhorns, MLB, NBA (solo panoramica e playoff) | Calendario, record, classifiche, playoff |
| Motori | F1, WEC e 24h di Le Mans, Dakar | Weekend di gara, classifiche, tappe |
| Politica USA | Elezioni americane | Calendario elettorale, sondaggi, previsioni, risultati in diretta |
| Spazio | Voli umani (NASA, SpaceX) | Lanci, missioni in corso, rientri |
| Bici, neve, tennis, vela | Ciclismo, sci alpino, tennis Slam, America's Cup | Gare, classifiche di Coppa, tabelloni |
| Corona e cinema | Famiglia reale, stagione dei premi (Oscar, Globes, BAFTA, SAG, Critics Choice, Gotham, Venezia/Cannes come contorno) | Agenda, nomination, vincitori |
| Apple | Uscite ed eventi | Keynote, uscite, rumor confermati |

Aggiungere una passione deve costare poco: ogni passione è un **modulo** con fonte dati, tipo di eventi e widget propri.

## 3. Struttura dell'app

### Home (la dashboard)
1. **Il punto di oggi.** Briefing di 3 righe scritto ogni mattina da Claude sulle sole mie passioni.
2. **Evento clou.** Il prossimo evento di peso 3, con conto alla rovescia (es. Election Day).
3. **Il fiume del tempo.** Timeline orizzontale: una corsia per categoria, da −2 a +25 giorni, con la linea "ORA". È l'elemento visivo che caratterizza l'app.
4. **Agenda 7 giorni.** Lista per giorno con orario italiano, canale TV o streaming e segnale "notturna".
5. **Ultimi risultati.** Le ultime 48–72 ore, con anti-spoiler.
6. **Tessere delle passioni.** Una per passione, ordinate per vicinanza del prossimo evento, con stato (questa settimana / in stagione / in pausa) e un mini-grafico dove ha senso (posizione del Milan, record dei Patriots, classifica F1, Senato).
7. **Mappa della stagione.** Heatmap passioni × 12 mesi: mostra quando ogni mondo è "caldo" e cosa mi aspetta.

### Control Room (seconda vista, stile sala operativa)
Schermo unico scuro e denso, pensato per un monitor grande e per i momenti in cui succede molto:
- **Barra in alto:** orologi Roma, Londra, New York, Austin, Los Angeles e UTC; contatore degli eventi live e di quelli nelle prossime 72 h; barre "tempo" per categoria; anti-spoiler.
- **Wire:** feed cronologico di notizie e azioni live, con etichetta di categoria e badge FLASH.
- **Mappa "Theatre":** vista Atlantico o mondo, eventi live che pulsano, eventi della settimana, linea giorno/notte, posizione della ISS con la traiettoria.
- **T-minus:** i prossimi 11 eventi con conto alla rovescia al secondo.
- **Live & latest:** punteggi in diretta (quarto, minuto, possesso, probabilità di vittoria) e ultimi finali.
- **Midterms:** conto alla rovescia, probabilità di controllo della Camera, proiezione del Senato, margini nelle corse chiave.
- **Classifiche:** Serie A, F1, AFC East, AP Top 25, playoff MLB, con la mia squadra evidenziata.
- **Ticker** in fondo con i titoli.

**Navigazione verso le schermate dedicate.** Dalla control room ogni elemento porta alla pagina della passione: la barra "OPEN" con tutte le passioni, le righe del T-minus, le notizie del wire, le partite, le classifiche e i segnaposto sulla mappa. La pagina si apre sopra la control room nello stile chiaro "Apple + NYT" (segue il tema chiaro/scuro del sistema). Si torna indietro con "‹ Control Room", con Esc o con il tasto indietro del browser. Ogni pagina ha un indirizzo diretto (`#milan`, `#elez`, …).

**Template comune della pagina passione:** prossimo evento con conto alla rovescia, ultimo risultato o diretta, numeri chiave, grafico principale (linee cumulative per le classifiche, barre di scarto partita per partita), calendario in ora italiana con passati e futuri, classifica, notizie dal wire, mappa della stagione per i prossimi 12 mesi.
**Pagina Elezioni (su misura):** conto alla rovescia, probabilità per la Camera, sondaggio generico con annotazioni, margini nelle corse chiave del Senato, orari di chiusura dei seggi in ora italiana.

### Pagine di approfondimento (una per passione)
Ognuna con un template comune (prossimo evento, ultimo risultato, classifica, calendario) e una parte su misura, per esempio:
- **Milan:** classifica con andamento per giornata, calendario, risultati, marcatori.
- **F1:** classifica piloti e costruttori come grafico a linee (punti cumulati gara per gara), weekend corrente sessione per sessione.
- **Elezioni:** media dei sondaggi, mappa, corse chiave, notte elettorale in diretta in stile "needle" del NYT.
- **Spazio:** missioni in corso (chi è in orbita adesso, da quanti giorni), prossimi lanci.
- **Patriots / Texas:** record, prossime partite, profondità della division / ranking.
- **Awards:** tabellone delle nomination con i premi "precursori" che predicono l'Oscar.
- **Dakar / Tour / Giro:** classifica generale tappa per tappa (grafico dei distacchi).
- **Tennis:** tabellone dello Slam in corso.

### Funzioni trasversali
- **Ricerca e comandi con ⌘K.**
- **Notifiche** (app Mac): "tra 15 minuti inizia…", "risultato finale" (rispetta l'anti-spoiler).
- **Esportazione calendario** (.ics) per passione, per avere gli eventi anche in Calendario.
- **Widget e barra dei menu** sul Mac: prossimo evento e conto alla rovescia.
- **Modalità evento live.** Quando un evento di peso 3 è in corso, la home si riorganizza attorno a esso.

## 4. Architettura proposta

```
 Fonti dati (API, feed, web)
        │
        ▼
 Raccolta dati  ── cron ogni 5 min / 1 h / 1 giorno, a seconda della fonte
   ├─ adattatori per le API strutturate (sport, lanci)
   └─ "redattore" Claude per le fonti non strutturate (corona, premi, Apple, Dakar, America's Cup)
        │
        ▼
 Database (Postgres)  ── eventi, risultati, classifiche, briefing
        │
        ▼
 Web app (Next.js) ── sito responsive + PWA
        │
        └─ app Mac (Tauri) ── stesso codice, più notifiche native, barra dei menu, widget
```

- **Frontend:** Next.js + React + TypeScript; grafici con D3 (o Visx) per lo stile NYT.
- **App Mac:** Tauri, che riusa il frontend web ed è leggera (pochi MB). Prima tappa possibile: PWA installata con "Aggiungi al Dock" di Safari.
- **Backend:** Supabase (Postgres, autenticazione, funzioni pianificate) oppure un piccolo server Node.
- **Hosting:** Vercel per il sito, Supabase per i dati. Il piano gratuito basta per un singolo utente.
- **AI:** Claude API per il briefing quotidiano e per trasformare le notizie non strutturate in eventi con data, ora e peso.

### Modello dati di base
```
Passion   (id, nome, categoria, attiva, fonte)
Event     (id, passion_id, titolo, inizio, fine, peso 1-3, stato, luogo, canale_tv, fonte_url)
Result    (event_id, riepilogo, punteggio_json, spoiler: bool)
Standing  (passion_id, competizione, aggiornato_il, righe_json)
Briefing  (data, testo, eventi_citati)
```

## 5. Fonti dati (da verificare una per una)

| Passione | Fonte candidata | Note |
|---|---|---|
| Milan | football-data.org (piano gratuito copre la Serie A), API-Football | Gratuito con limiti di frequenza |
| NFL, CFB, MLB, NBA, Texas, Patriots | API pubbliche ESPN (non ufficiali), in alternativa SportsDataIO | ESPN è gratis ma potrebbe cambiare senza preavviso |
| F1 | Jolpica (successore di Ergast), OpenF1 per i dati live | Gratuite |
| WEC / Le Mans | Calendario ufficiale FIA WEC più risultati tramite redattore AI | Nessuna API pubblica affidabile |
| Dakar | Sito ufficiale tramite redattore AI | Solo gennaio |
| Elezioni | Calendari FEC e statali, aggregatori di sondaggi, AP per la notte elettorale | La notte elettorale live è la parte più costosa |
| Spazio | Launch Library 2 (The Space Devs) | Gratuito, ottimo per lanci e astronauti in orbita |
| Ciclismo, sci, tennis | ProCyclingStats, FIS, calendari ufficiali, tramite redattore AI | Dati strutturati scarsi |
| America's Cup | Sito ufficiale tramite redattore AI | Eventi rari |
| Famiglia reale | Court Circular (royal.uk) e notizie tramite redattore AI | |
| Awards | Calendario dei premi più notizie tramite redattore AI | |
| Apple | Apple Newsroom (RSS) | |

## 6. Stile visivo

- **Base Apple:** font di sistema (SF Pro), sfondo grigio chiarissimo e card bianche con angoli morbidi; in dark mode sfondo nero puro e card grigio scuro. Molta aria, header traslucido.
- **Grafici NYT:** Franklin per etichette e annotazioni, linee sottili da 2 px, griglia appena visibile, etichette dirette a fine linea, annotazioni testuali sugli eventi chiave, tooltip con mirino.
- **Titoli editoriali:** un serif (Newsreader) solo per il briefing e i titoli degli approfondimenti.
- **Colori:** 8 colori di categoria da una palette verificata per daltonici; il blu di sistema Apple solo per "ora" e per le azioni.

## 7. Roadmap

| Fase | Contenuto |
|---|---|
| **0 · Concept** | Questo documento e il prototipo della home (fatti) |
| **1 · MVP** | Next.js, database, eventi da 4–5 fonti automatiche (Milan, F1, NFL/Patriots, spazio, Apple), home e control room con dati veri, approfondimento elezioni pronto prima del 3 novembre |
| **2 · Tutte le passioni** | Redattore AI per le fonti non strutturate, pagine di approfondimento con template comune |
| **3 · App Mac** | Tauri, notifiche, barra dei menu, export .ics |
| **4 · Effetto wow** | Notte elettorale live, F1 live timing, briefing vocale, widget |
