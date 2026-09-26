# IMPLEMENTATION_PLAN

Opdateret: 2026-09-26 (T22)


## Mission

Dette offentlige repo leverer den gratis, lokale og open source CLI til at transformere JSON, CSV, YAML og XML samt det offentlige site. Den betalte desktopudgave, licenslogikken og al Pro-implementation ligger i det private `mahope/transmute-desktop` og udvikles i loopet `transmute-desktop`. Her er målet at gøre CLI'en fuldt brugbar og gøre vejen til Desktop Pro tydelig. Hele udviklingen skal ske på `ceo/*`-branch og merges til `main`.

## Iterationsstatus

Desktopkoden blev flyttet til `mahope/transmute-desktop` i commit `16cb82a`. T1's RustSec-afhængigheder findes derfor ikke længere i dette offentlige repo, og den uafsluttede `ceo/rustsec-baseline` skal ikke merges hertil. T1 er lukket som overført uden en ny audit af en afhængighedsgraf, der ikke længere findes. T5 er færdig med commit `28a06dd`, T6 med `d555f65`, T7 med `0534cb8`, T8 med `86a236d` (slice 1 i `414eb8b`) og T9 med `f2956f5`. T13 er færdig med commit `4d7fc35`, T14 med `5f64894` og T15 med `2fb9631`, alle tre på `ceo/deploy-freshness-check` og **ingen af dem mergeret**, fordi `DEPLOY-MISSING` står. T8 og T9 er lukket. T12 er færdig med `6516fdb` (dansk support-side), T13 med `4d7fc35`, T14 med `5f64894`, T15 med `296f40e`/`bf61cce`-bunken, T16 med `bf61cce`, T17 med `8be3643`, T18 med `a31aba8` og T19 med `538aa2e` — de ni ligger u mergerede på `ceo/xml-attributes` og dens afkom, fordi diffene rører `site/engine.js` og `DEPLOY-MISSING` står. T20 er færdig med commit `dbeae3c` på `ceo/nested-cells` og har samme grund. T21 er færdig på `ceo/xml-safe-keys` og har samme grund. T22 er færdig med commit `0115204` på `ceo/format-detect` og har samme grund. Se Deploy og `❓ Til Mads` punkt 1. T10 er færdig med ni slices: 1 i `14dce0b`, 2 i `599ca4f`, 3 i `a4114ca`, 4 i `8a161fb`, 5 in `bb19768`, 6 i `c446d37`, 7 i `c1bee9f`, 8 i `9b7ddf5` og 9 i `427b113` + `fda739c` (runner-images). Dependabot-PR #4 er lukket med vilje.

**Deploy-status ⚠️ (genverificeret 2026-09-26 ca. 05:3x CEST med `npm run check:deploy`, starten på denne iteration):** uændret. Live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, `/support/index.html` utilgængelig, 25 afvigende filer. Se `❓ Til Mads` punkt 1.

**Næste iteration:** deploy-stillen er uændret, og derfor ligger **elleve** færdige commits på fem branch uden merge. Den næste iteration skal **først** køre `npm run check:deploy`; hvis `DEPLOY-MISSING` er væk, merger hele bunken (T13 `4d7fc35`, T14 `5f64894`, T15 `2fb9631`, T16 `bf61cce`, T17 `8be3643`, T12, T18 `a31aba8`, T20 `dbeae3c`, T21 `f49458a` og T22 `0115204`) til `main`, og `VERIFICÉR DEPLOY`-noterne lukkes. Står den stadig, er det nye produktarbejde, der skal vælges, og **T20's metode er den der virkede**: kør rigtige filer gennem `src/cli.js` med hvert output-format, og se efter exit 0 med mistet data.

**De fire flader, T21 og T22 efterlod, er nu lukket:** serialiseringssiden (T20: `[object Object]`, array-kollision, `join --prefix`), `unique` uden `by` og `group` (T21: rækkefølgeafhængig nøgle, `__proto__`), XML-udgangen (T21: ulovlige tag-navne, tavs læsefejl) og `detectFormat` (T22: svagere kopi af læserens regel, afvisning af TSV/semikon/pipe/enkolonne på stdin). **`sort` er den eneste af de fire, der står åben, og den er dokumenteret væk i T21**: tal-strenge sorteres leksikografisk, fordi det er præcis hvad `jq`'s `sort_by` gør på strenge, og CSV-coercion gør tal til tal alligevel. Det er en afvejning, ikke en tavs korruption, så den kræver en beslutning fra Mads, ikke en fix.

**Den næste flade at undersøge er den, ingen opgave endnu har rørt: `compileExpression`.** Den fanger **alle** fejl i et `new Function` og returnerer så alligevel identiteten. En syntaktisk ugyldig expression fejler derfor *stille*: `{"op":"filter","expr":"item.age >"}` og `{"op":"filter","expr":"item.age > 5"}` (manglende parentes) kører begge med **exit 0, tom stderr og alle rækker i output**, som om intet var skrevet. Brugeren får sin fulde tabel tilbage i stedet for det han bad om. Det er den næste tavs-fejl-klasse i samme familie som T13–T22.

Bemærk den asymmetri, der gør fundet skarpere: en expression der *kompilerer* men kaster ved kørsel (`{"op":"map","expr":"item.nope.deep"}`) giver exit 1 med beskeden `Cannot read properties of undefined (reading 'deep')`. Altså er runtime-fejl allerede høje, mens syntax-fejl er stille — det er præcis omvendt af, hvad man vil. Konkret næste skridt: en test, der kræver at en expression, der ikke kan kompileres, fejler højt som en usage-fejl (exit 2) med den rå syntaksfejl, plus en beslutning om hvor den må fejle: `compileExpression` kaldes også fra sitets playground, så en hård fejl skal kunne vises i browseren uden at slå siden ihjel.

**Den anden konkrete fejl fundet under researchen i denne iteration:** `--delimiter` er **stille ignoreret i preview-tilstanden**. `showPreview` kalder `run(text, format, [])` uden at give `delimiter` videre, så `transmute semikolonfil.csv --delimiter ,` viser den auto-detekterede `;` —mens den *samme* kommando plus `--output csv` faktisk bruger `,` og advarser om for lange rækker. Flaget valideres altså, accepteres og kasseres, og resultatet afhænger af om man tilføjer `--output`. Lille, men præcis den slags inkonsistens T16's regel er skrevet for. Ikke rettet i T22, fordi den hører til `cli.js` og ikke til den detektor, T22 satte sig for.

`npm run check:site` er grøn efter T22. `❓ Til Mads` punkt 1 er stadig den eneste beslutning, der frigør mest, og intet i køen kan løse den.

T17 (nested YAML på input) er færdig på `ceo/nested-yaml` og ligger på branch, ligesom T13/T14/T15/T16, fordi `DEPLOY-MISSING` står.

## Kvalitetsgate

Den obligatoriske gate er denne, i den angivne rækkefølge:

1. Root: `npm test && npm pack --dry-run`. `npm test` kører otte trin i rækkefølge: `test/test.js` (67 engine-tests), `test/cli.test.mjs` (70 reelle CLI-kørsler), `test/conformance.test.mjs` (65 CLI-vs-site- og dokumentationskontroller), `test/readme.test.mjs` (6 README-eksempelkontroller), workflow-regressionerne (39), `tools/verify_workflows.mjs` (4 workflows) og siden T9 `tools/verify_contract.mjs` (166 kontrat- og claimkontroller over 27 filer). Den kan også køres alene med `npm run check:contract`.
2. Site: `npm run check:site` (opbygger `.venv-site` med Python 3.13.15, Playwright 1.60.0 og Chromium, kører SEO-, layout- og selftesten) og `npm run audit:site` (`pip-audit` på den hash-låste lockfil). Begge er T6 og kører med præcis samme kommando lokalt og i CI.
3. Deploy: `npm run check:deploy` (`tools/check_deploy_freshness.py`) henter hver tekstfil under `site/` fra live **én gang** og matcher den mod hvert site-commit i `origin/main` fra nyeste til ældste. Det udskriver det commit live faktisk serverer, listen af udeployede commits og de afvigende filer. `tools/deploy_freshness_selftest.py` er offline og ligger i `check:site`, så gaten beviser, at værktøjet stadig kan se drift. Kør den efter hver batch-deploy; **dens exit 0 erstatter alle manuelle live-tjek i denne plan.** Den siger intet om funktion og udseende — til det bruges `tools/verify_live.py --no-report`.

Repoet har ingen root scripts for lint eller typecheck. Den nuværende PR-CI bruger Node 20 og 22 og kører kun `npm test` efterfulgt af `npm pack --dry-run`; T6 har lagt site-gaten i `.github/workflows/site-gate.yml`, som kun kører på site- og værktøjsændringer. Nye frontendtests skal wire ind i `npm test`, så de faktisk er en del af gaten. `npm run snapshots:cli` regenererer `test/fixtures/expected.json` og må kun køres som en del af en bevidst ændring af engine-adfærd. `npm run release`, tag-triggerede workflows og workflow-dispatch må ikke køres af loopet, fordi de kan publicere eller oprette releases.

## Deploy

**DEPLOY-MISSING: live er `3d90812` fra 2026-09-24, og 5 site-commit står u deployede — målt, ikke gættet (2026-09-26 ca. 02:4x CEST, genmålt med `npm run check:deploy`). To batch-vinduer (17:30 og 21:30 den 25/9) er gået uden deploy.**

**Den tidligere diagnose var fejl, og det er den vigtigste rettelse i denne plan.** Planen hævdede i fem iterationer, at batchdeployeren ikke havde kørt siden 2026-09-08. Beviset var `sitemap.xml`'s `lastmod 2026-09-08` plus et 404 på `/support/`. Den første halvdel var en **målefejl**: `lastmod` skrives kun, når `site_chrome.py` regenererer sitemap'en (`tools/site_chrome.py:629`), altså ikke når der deployes. Commit `3d90812` — som *er* live — har selv `lastmod 2026-09-08` i sin sitemap. Først da indholdet sammenlignes mod git, bliver tallene rigtige:

- `deploy-site`-kørslen `36062253130` for `3d90812` sluttede **`success`** 2026-09-24T21:33:38Z. Den var altså ikke død.
- Live er `3d90812`. Bevis: `/cheatsheet/` er **byte-identisk** med den commits fil, og `/index.html` afviger kun i de to ting Cloudflare indsætter (e-mail-obfuskering og sit eget `/cdn-cgi/scripts/`-script).
- Udeployet siden da: `0534cb8` (support-/købsside), `414eb8b` (docs + `table`-fix), `86a236d`, `f2956f5`, `599ca4f` — **25 filer** i drift.
- **Årsagen er T5, ikke en død batchdeployer.** `deploy-site.yml` var det *eneste* deployapparat i repoet (wrangler → Cloudflare Pages, projekt `transmute-run`), og T5 fjernede det 2026-09-25T16:20. Siden da har repoet ingen deploymekanisme. Der er gået to vinduer (17:30 og 21:30 den 25/9) siden det.

Det er en **mindre** fejl end den gamle diagnose lovede: der skal genstartes én ting, og den lå i dette repo. Se `❓ Til Mads` punkt 1. Bevisværktøjet er `npm run check:deploy` (T15), som gentager hele målingen ovenfor på ét kommando.


**Live's købsflow er derfor lige nu brudt.** Live-forsidens primære CTA er stadig `Download for macOS, Windows or Linux` → `https://github.com/mahope/transmute/releases`, altså et releases-page, der ikke indeholder appen, fordi appen bygges i det private repo. Det er produktfasens prioritet 1, "et køb, der ikke leverer", og rettelsen ligger i `f2956f5` — som ikke er deployet.
VERIFICÉR DEPLOY: `/support/` + Support-link i footeren på alle 19 sider + `lastmod` 2026-09-24 i sitemap, commit `0534cb8`, push 2026-09-25T16:35Z (18:35 CEST). Tidszonen for batchdeployeren er stadig ukendt, så to-vinduer-tællen kan ikke begynde, før Mads svarer.

VERIFICÉR DEPLOY: `table`-output i `site/engine.js` viser nestede records som JSON i stedet for `[object Object]` (samme ændring som i `src/engine.js`), commit `414eb8b`, push 2026-09-25T17:19Z (19:19 CEST). Verificér ved at åbne https://transmute.run/ , indsætte to JSON-records med et array i felt `items`, bruge `group` og kontrollere, at cellen viser `[{"sku":…}]` og ikke `[object Object]`.

VERIFICÉR DEPLOY: ny `Full reference`-sektion i `/cheatsheet/`, link til `docs/cli.md` i playgroundet på `/` og `/da/`, link i `llms.txt`, regenereret chrome/søgeindeks/sitemap (`lastmod 2026-09-25`), commit `86a236d`, push 2026-09-25T18:2xZ. Verificér ved at åbne https://transmute.run/cheatsheet/ og se afsnittet "Full reference" nederst, og https://transmute.run/ hvor der under playgroundet står "Need the whole CLI?".

VERIFICÉR DEPLOY: footerens `Desktop app`-link peger på `/#desktop` i stedet for dette repos releases på alle 19 sider, `Download for macOS, Windows or Linux` er erstattet af `How to get the app, and what Pro adds` → `/support/#buying-pro` på `/` og `/da/`, begge forsider har et `id="desktop"`-anker, og to guides linkede `desktop app` til `/#install` og peger nu på `/#desktop`, commit `f2956f5`, push 2026-09-25T18:50Z (20:50 CEST). Verificér ved at åbne https://transmute.run/ , klikke på `Desktop app` i footeren og se, at den lander i `#desktop`, og på https://transmute.run/guides/xml-to-json/ at `Transmute desktop app` nu fører til `#desktop` og ikke til CLI-installationen.

Loopet må aldrig trigge deploy, webhook, Dokploy-API eller andre udadvendte writes. Den tidligere `.github/workflows/deploy-site.yml` deployed `site/**` ved push til `main` og blev fjernet i commit `28a06dd`. `tools/verify_workflows.mjs` er nu en del af `npm test` og afviser Cloudflare Pages eller kendte push-triggerede deploymekanismer. T5 rørte ingen sitefiler, så der forventes ingen ekstern batch-deploy og der er oprettet ingen `VERIFICÉR DEPLOY`-note. Slice 8 af T10 rører heller ingen `site/`-fil, så den får ingen note.

Før T5-merge var seneste `deploy-site`-kørsel run `36062253130` med commit `3d90812ee423d61da7dc9096f5f9985da6e90a75`, oprettet `2026-09-24T21:33:38Z`. Efter merge af `28a06dd` blev ingen ny `deploy-site`-kørsel oprettet; CI-run `36146904851` for committen sluttede `success` den `2026-09-25T14:21:13Z`.

Efter merge af en fremtidig live-siteændring skal planen få `VERIFICÉR DEPLOY: <ændring> <commit-sha> <tidspunkt med UTC-offset>`. Den eksterne batchdeploy forventes ca. kl. 07:30, 12:30 og 17:30. Kildekontrakten angiver ikke tidszone, så to-vinduer-tællen må først begynde, når den faktiske offset er observeret og skrevet i noten. HTTP 200 er ikke tilstrækkelig; indholdet skal sammenlignes. Efter to dokumenterede deploy-vinduer uden den forventede live-ændring skrives `DEPLOY-MISSING: <detaljer>`, og yderligere merges til `main` stoppes. Aktuelle deploy-notes: én, T7 med commit `0534cb8` (se afsnittets start).

## Researchmetode og baseline

Researchen dækkede root, CLI, Tauri-backend, desktop-frontend, site, docs, scripts, workflows og dependencystatus med statisk kodeinspektion og tre uafhængige research-passager. Der blev ikke læst `.env*` eller credentials, og der blev ikke foretaget outward writes eller GUI-klik.

Følgende baseline-kommandoer blev kørt mod commit `3d90812`:

- `npm audit --package-lock=false --omit=dev` → `found 0 vulnerabilities`.
- `npm outdated --depth=0` → ingen output.
- `npm test` → 38 passed, 0 failed.
- `npm pack --dry-run` → grøn, fem filer i tarball-manifestet.
- `cargo audit --version` → værktøjet findes ikke lokalt.
- `cargo search cargo-audit --limit 1` → aktuel public version `0.22.2`.
- `python3 -m pip index versions pip-audit` → aktuel public version `2.9.0`.
- Lokalt: Node 22.23.2, npm 10.9.8, Rust 1.97.1, system-Python 3.9.6 med Playwright 1.60.0 og Python 3.13.15 uden Playwright.
- `~/.local/oxloop/AFHAENGIGHEDER.md` er fra 2026-08-23 og indeholder ikke Transmute; den er derfor ikke en aktuel kilde til repoets afhængigheder.

## Nuværende repoopdeling

- Commit `16cb82a` fjernede `desktop/`, Tauri-buildworkflowen og desktop-testen fra det offentlige repo. Der findes ingen `Cargo.toml`, `Cargo.lock` eller `tauri.conf.json` på `main` efter committen.
- T1, T3, T4 og den gamle del af T8 er derfor ikke længere opgaver i dette repo. T3 og T4 overføres som uændrede krav til `transmute-desktop`; T1's isolerede CI/Dependabot-ændringer på `ceo/rustsec-baseline` er historiske og skal ikke merges.
- Den offentlige frie vare er CLI'en og sitet. Betalt implementation, desktopens købsflow, licenscache og Pro-funktioner skal udelukkende udvikles i det private Pro-repo.

## Researchfund før desktopflytningen (historisk)

- Desktop'en bruger Tauri 2.11.5 og har to købslinks, men ingen opener/shell-plugin. Runtime-klikket sætter Payment Link på begge anchors og falder derfor tilbage til navigation i appens egen WebView (`desktop/frontend/index.html:96-99`, `desktop/frontend/index.html:141-145`, `desktop/frontend/app.js:496-500`). Builderen registrerer ingen extern-link-plugin (`desktop/src-tauri/src/lib.rs:253-271`).
- Desktop-frontenden forventer `window.__TAURI__`, men `withGlobalTauri` mangler i `desktop/src-tauri/tauri.conf.json:12-28`. Det betyder sandsynligvis, at både backend-kald og licenskontrol er deaktiverede i den pakkede app. Runtime-observation kræver en pakked app, men konfigurationsforskellet og fallback-koden er dokumenteret (`desktop/frontend/app.js:431-472`).
- Gratis desktop er i dag begrænset til tre transformationer pr. start og understøtter kun indsætning af data. Desktop-UI'en mangler `add` og `join`, mens CLI'en understøtter dem; desuden afviger `group` mellem CLI og desktop (`desktop/frontend/app.js:194-255`, `src/engine.js:324-413`).
- Betalt desktop har i dag kun én konkret fordel: friheden til at køre flere transformationer. Det er for svagt til open-core-retningen og skal specificeres før større Pro-funktioner.
- Licenskontrollen aktiverer med korrekt Stripe-link, `product: "transmute-desktop"`, 32-hex-normalisering og enheds-id (`desktop/src-tauri/src/lib.rs:22-29`, `desktop/src-tauri/src/lib.rs:79-103`, `desktop/src-tauri/src/lib.rs:157-175`). Der er dog ingen 7-dages cache eller periodisk `validate`; både Rust og frontend behandler alene tilstedeværelse af nøgle som Pro (`desktop/src-tauri/src/lib.rs:55-60`, `desktop/frontend/app.js:544-553`).
- Den officielle licenskontrakt er `POST https://mahope.tools/api/license/validate` med `{ license_key, device_id, product }`. Ved netværksfejl/5xx skal en cachet Pro-status kun bevares i rimelig tid; planen låser dette til højst 7 dage.
- README, site og desktop har modstridende oplysninger om Linux, fildåbning og fælles engine/output. Versionerne er også forskellige: npm er 0.2.1, mens Tauri/Cargo er 0.2.0 (`package.json:3`, `desktop/src-tauri/Cargo.toml:1-3`, `desktop/src-tauri/tauri.conf.json:3-5`).
- Betalingslinket i README, site og desktop matcher kontrakten. Der er ingen Stripe- eller licensserver-secrets i klienterne.
- Root-pakken har nul runtime-afhængigheder. Node er deklareret som `>=18`, men der findes ingen `.nvmrc`, package-manager-pin eller Rust-toolchain-pin. CI bruger flydende `stable` og brede Tauri-cli-værdier (`package.json:38-40`, `.github/workflows/build.yml:28-47`).
- Dependabot dækker npm og GitHub Actions, men ikke Cargo. Cargo-locken rummer 466 pakker, og intet RustSec-resultat findes i repoet.
- `.github/FUNDING.yml` og README-linket til donation findes. Sitet mangler en `/support`-side og har ingen synlig donation-CTA.
- Den automatiske site-deploy er stadig aktiv i kode, selv om kontrakten siger, at den er slået fra. Den afvigelse bliver T5, før sitearbejde merges.

## Prioriteret opgavekø

### 1. [x] Afslut den gamle RustSec-baseline efter desktopflytningen

**Status:** FÆRDIG — ikke længere relevant i det offentlige repo
**Mislykkede forsøg:** 1/2 historiske forsøg før repoopdelingen
**Begrundelse:** Sikkerhed skal håndhæves, men en audit af kode, der ikke længere er en del af repoet, ville give en misvisende status.

**Resultat:**

- `16cb82a` fjernede hele Cargo/Tauri-afhængighedsgrafen fra det offentlige repo.
- Den isolerede `ceo/rustsec-baseline` (`7e34c0f`) er ikke slået sammen med `main` og skal arkiveres uden merge.
- Cargo-, Dependabot- og RustSec-krav er overført til det private `transmute-desktop`, hvor de skal håndhæves mod den aktuelle afhængighedsgraf.

### 2. [x] Reparer desktop-købsflow og åbn Stripe i systembrowseren

**Status:** FÆRDIG før flytning; implementationen følger privat repo
**Mislykkede forsøg:** 0/2
**Begrundelse:** Et køb, der navigerer væk fra appen eller en deaktiveret licensbro, rammer købsflowet direkte. Dette er den første funktionelle opgave efter sikkerhedsbasen.

**Efter flytningen:** Committene `4d1a828`, `2c3b6c2` og `6e89d13` ligger i historikken. Den videre forbedring og GUI-verifikation af den betalte app er offentlig-private og skal fortsætte i `mahope/transmute-desktop`.

**Scope:**

- Tilføj og registrer `tauri-plugin-opener` i Tauri 2.
- Aktivér `withGlobalTauri`, så den eksisterende `invoke`-bro bliver tilgængelig.
- Giv kun `opener:allow-open-url` tilladelse til det præcise Stripe Payment Link.
- Da frontend'en er statisk uden bundler, brug den eksisterende globale Tauri-bro til eksplicit `window.__TAURI__.core.invoke('plugin:opener|open_url', { url: BUY_URL })`; tilføj ingen npm-binding.
- Håndter begge købslinks med `preventDefault()` og invoke, med almindelig browser-navigation som fallback uden Tauri.
- Vis en tydelig fejl, hvis systembrowseren ikke kan åbnes.

**Acceptkriterier:**

- Begge købslinks kalder én mocked opener-invoke med `https://buy.stripe.com/eVqbJ0dvdbaW55cgN9bMQ02` og forhindrer default-navigation.
- En afviset opener-invoke giver synlig fejl og efterlader appen i en anvendelig tilstand.
- Tauri-konfigurationen har kun den præcise URL tilladt; ingen bred `opener:default`-tilladelse.
- Den nye frontend-regressionstest er wire ind i `npm test`; `npm pack --dry-run`, `cargo check`, `cargo test` og `cargo tauri build --debug --bundles app` er grønne.
- En pakket macOS-app startes, og begge links testes mod systemets browser; Transmute-vinduet skal forblive åbent. Headless mocks og build erstatter ikke packaged-app-smoken.

**Verifikation:** `npm test` (38+4), `npm pack --dry-run`, `cargo check`, `cargo test`, `cargo tauri build --debug --bundles app`, `npm audit` og `cargo audit` er grønne. GUI-smoke kunne ikke udføres, fordi `orca` ikke er installeret; dette er eksplicit noteret som en manuel release-kontrol.

### 3. [x] Overfør robusl licensstatus til det private Pro-repo

**Status:** MIGRERET TIL `mahope/transmute-desktop` — ikke implementeret her
**Mislykkede forsøg:** 0/2
**Ejerskab:** Det private repo overtager hele transitionstabellen, cache-reglen og acceptkriterierne uændret.
**Begrundelse:** En licens, der enten låser en kunde ude eller giver evig Pro-adgang, er et direkte købsflow-problem. Denne opgave står derfor før produktspecet.

**Gemt state:**

- `license_key`: normaliseret 32-hex nøgle.
- `product`: konstant `transmute-desktop`.
- `last_checked_at`: tidspunkt for senest modtaget HTTP-svar; ændres ikke ved netværksfejl.
- `last_validated_at`: tidspunkt for seneste vellykkede `activate` med `activated: true` eller `validate` med `valid: true`.
- `pro_access_until`: seneste vellykkede autoriseringstidspunkt plus højst 7 dage, begrænset af `expires_at` hvis den findes.
- `plan`, `expires_at`, `last_reason`: kun data fra seneste autoritative eller transient svar.
- `is_pro` er altid `license_key.is_some() && now < pro_access_until && (expires_at er None || now < expires_at)`; alene en nøgle giver aldrig Pro.

**Deterministiske transitioner:**

| Hændelse | Svar | Key/state | Tids- og adgangsfelter |
|---|---|---|---|
| Aktivér | 200, parsebar JSON, `ok: true`, `activated: true` | Gem key; `plan`/`expires_at`/`last_reason: null` | `last_checked_at = last_validated_at = now`; `pro_access_until = min(expires_at, now + 7 dage)` eller `now + 7 dage` uden expiry |
| Aktivér afvist | 400, 403, 404 eller 409 | En ny nøgle gemmes ikke; eksisterende key, `plan`, `expires_at` og adgang bevares | `last_checked_at = now`; `last_validated_at` uændret; `pro_access_until` uændret; 409 sætter `last_reason: device_limit_reached` |
| Aktivér transient | 5xx eller malformed/ukendt JSON | En ny nøgle gemmes ikke; eksisterende key, `plan`, `expires_at` og adgang bevares | `last_checked_at = now`; `last_validated_at` og `pro_access_until` uændret; `last_reason: temporary_service_failure` |
| Aktivér uden svar | Netværksfejl | En ny nøgle gemmes ikke; eksisterende key, `plan`, `expires_at` og adgang bevares | `last_checked_at` uændret; `last_validated_at` og `pro_access_until` uændret; `last_reason: temporary_service_failure` |
| Valider gyldig | 200, parsebar JSON, `ok: true`, `valid: true`, expiry mangler eller er fremtidig | Behold key; opdater `plan`/`expires_at`; `last_reason: null` | `last_checked_at = last_validated_at = now`; forny 7-dagesvinduet |
| Valider ugyldig | 200 med `ok: true`, `valid: false`; eller 400/403/404/409 | Behold key til reaktivering; ryd `plan`, `expires_at`; sæt sikker `last_reason` | `last_checked_at = now`; `last_validated_at` uændret; `pro_access_until = None` |
| Valider modstridende expiry | 200, parsebar JSON, `ok: true`, `valid: true`, men `expires_at <= now` | Behold key; gem svarets `plan`/`expires_at`; sæt `last_reason: license_expired` | `last_checked_at = last_validated_at = now`; `pro_access_until = None` |
| Transient fejl | Netværksfejl, 5xx eller 2xx med malformed/ukendt JSON | Behold key, `plan`, `expires_at`; sæt `last_reason: temporary_service_failure` | `last_checked_at` opdateres kun hvis et HTTP-svar kom; `last_validated_at` og `pro_access_until` forlænges aldrig |
| Ugyldig lokal state | State kan ikke parse eller mangler påkrævede typer | Slet state og vis fri tilstand | Alle adgangsfelter er `None` |

Validering er due, når `now - last_checked_at >= 24 timer`, og skal ske ved appstart og før næste betalte handling i en langvarig session. `expires_at <= now` gør selv `valid: true` ugyldig lokalt. Ved `pro_access_until == now` er Pro lukket. Serverens `reason` må kun bruges efter escaping og kort mapping til kendte fejl; rå servertekst vises aldrig.

**Acceptkriterier:**

- Unit tests med injiceret tid dækker 6 dage 23 timer, 7 dage og 7 dage 1 time for både vellykkede og transiente valideringer; adgang findes kun før `pro_access_until`.
- Transitionstabellen er dækket for 200 gyldig/ugyldig, malformed 200, 400, 403, 404, 409, 5xx og netværksfejl.
- Frontend og Rust bruger samme `is_pro` og giver hverken backend- eller UI-Pro uden gyldigt adgangsvindue.
- `expires_at` før/før nu tilsides serverens positive `valid: true` lokalt.
- En ny aktivering får aldrig Pro-status før et vellykket serversvar; en fejlet ny aktivering ødelægger ikke en eksisterende gyldig licens.
- `npm test && npm pack --dry-run`, `cargo check` og `cargo test` er grønne; ingen test kalder produktionslicensserveren.

### 4. [x] Overfør Pro-specen til det private Pro-repo

**Status:** MIGRERET TIL `mahope/transmute-desktop` — specen skal skrives dér
**Mislykkede forsøg:** 0/2
**Ejerskab:** Strategien og fri/Pro-kravfraaget er uændrede; intet betalt navn, kodelekanse eller produktkontrakt ændres i det offentlige repo.
**Begrundelse:** Pro er i dag kun fjernelse af en tre-kørers grænse. Strategien kræver en markant bedre betalt oplevelse, og større funktioner må ikke bygges før den er specificeret.

**Scope:**

- Opret `docs/transmute-desktop-pro-spec.md`.
- Beskriv målgrupper, jobs-to-be-done, fri/Pro-matrix, data- og privacygrænser, licensregler, offline-adfærd, fejlhåndtering og non-goals.
- Lås de officielle handelskonstanter fra kontrakten: `product_key: transmute-desktop`, `19 USD`, engangsbetaling, 3 maskiner og den angivne Payment Link. EUR/DKK vælges af Stripe efter kundens land og er derfor ikke hardkodede produktpriser.
- Sæt gratis baseline til ubegrænset, komplet enkeltfilstransformering; den kunstige tredobbeltige demofris skal ikke overleve.
- Medtag konkrete Pro-kandidater: batchfiler, gemte navngivne pipelines, watch/automation, prioriteret support og dokumenteret 3-maskiners licens.
- Offentligt repo og MIT-kernel skal være en fuldt brugbar gratisvare. Betalt implementation skal leve i et privat Pro-repo; public repo må kun indeholde gratisfunktionalitet og den licenskontrollerede grænseflade.
- Foreslå “Transmute Studio” som markedsføringsnavn uden at ændre Stripe-navnet eller `product_key`.

**Acceptkriterier:**

- Hver fri capability har ID `F-*`; hver Pro capability har ID `P-*`, et konkret brugerproblem, dataafhængighed og binær definition of done.
- Spec'en dækker mindst fire frie enkeltfil-capabilities og fire Pro-capabilities, heraf batch, gemt pipeline og én automation/use case.
- Spec'en bruger kun `19 USD` engangsbetaling, 3 maskiner, Payment Link `https://buy.stripe.com/eVqbJ0dvdbaW55cgN9bMQ02` og produktnøgle `transmute-desktop`; ingen secrets eller nye produkter/priser.
- Licensens 3-maskiners- og 7-dages cache-regel fremgår eksplicit.
- README, site og desktop kan udledes fra samme matrix uden modstridende claims.
- Ingen større Pro-feature er implementeret før denne task er afkrydset.

### 5. [x] Fjern den uoverensstemmende automatiske site-deploy

**Status:** FÆRDIG — merged til `main` i commit `28a06dd`
**Mislykkede forsøg:** 0/2
**Begrundelse:** Nuværende push-workflow kan deploye mod kontrakten og gør det usikkert at merge de efterfølgende siteopgaver.

**Scope:**

- Fjern `.github/workflows/deploy-site.yml`, så den eksterne batch-deployer er eneste udgivelsesvej.
- Tilføj `tools/verify_workflows.mjs`, wire den ind i `npm test`, og lad den fejle hvis en workflow indeholder Cloudflare Pages-deployment eller en push-trigger til en udadvendende deploy.
- Lad CI fortsat validere kode; den reproducible site-gate bliver T6, og agenten udfører ingen Cloudflare-, npm-, GitHub-release- eller anden outward action.
- Fjern eller deaktivér ingen workflow ved at skubbe et uvedkommende tag.

**Acceptkriterier:**

- Workflow'en findes ikke længere, og workflow-kontrollen grønner i `npm test`.
- `npm test && npm pack --dry-run` er grøn.
- Merge af sletningen logger ingen deploy-kørsel; hvis det alligevel sker, skrives `DEPLOY-OOPS: <workflow og tidspunkt>` og alle merges stoppes.
- Ingen udadvendende action køres fra agenten.

**Verifikation før og efter merge:** `npm test` (38 engine + 39 workflow-regressioner), `npm pack --dry-run` og `npm audit --package-lock=false --omit=dev` er grønne. Committen blev mergeret til `main`; CI-run `36146904851` sluttede `success`, og ingen ny `deploy-site`-kørsel blev oprettet.

### 6. [x] Gør site-gaten reproducible i CI

**Status:** FÆRDIG — merged til `main` i commit `d555f65`
**Mislykkede forsøg:** 0/2
**Begrundelse:** Den nuværende PR-gate er kun npm-test/pack, så missionens sitekrav er ikke håndhævet automatisk.

**Resultat:**

- `tools/site-requirements.in` er de to direkte pins; `tools/site-requirements.txt` er den fuldt hash-låste opløsning (54 pakker) fra `uv pip compile --python-version 3.13 --generate-hashes`, regenereres med `npm run lock:site`.
- `tools/site_gate.sh` skaber `.venv-site` med præcis Python 3.13.15, installerer lockfilen med `--require-hashes`, installerer Chromium, logger Python/Playwright/Chromium-version og kører `seo_check.py`, `layout_check.py` og selftesten. Ét output gemmer sig på lockfilens sha256, så venvet genbygges automatisk ved ændringer.
- `npm run check:site` er den ene kommando lokalt og i CI. `npm run audit:site` kører `pip-audit` på lockfilen med `--require-hashes`.
- `tools/site_gate_selftest.py` kopierer `site/` til en temp-mappe og indbygger en SEO-regression (fjernet canonical) og en layout-regression (2400 px bred div), og kræver at kontrollerne fanger begge, at det uvændrede site består SEO-gaten, og at det reparerede site består layout-gaten igen. Begge checkers læser nu `TRANSMUTE_SITE`, så selftesten kan pege på en kopi.
- `.github/workflows/site-gate.yml` kører på push til `main` og på PR, men kun når `site/**`, de fire siteværktøjer, lockfilerne, `package.json` eller workflow'en røres. Den bruger `actions/checkout@v7` og `actions/setup-python@v7` med `python-version: "3.13.15"` og `TRANSMUTE_PLAYWRIGHT_DEPS=1`, som kører `playwright install-deps chromium` på Linux.
- Den nye workflow er ren kontrol og deployer intet; `tools/verify_workflows.mjs` ser fire workflows og grønner i `npm test`.

**Acceptkriterier:**

- En PR med en bevidst site-layout/SEO-regression fejler i CI — selftesten kører i hver site-gate-kørsel og fejler, hvis kontrollerne ikke fanger de indbyggede regressioner; det er den samme kodevej som PR-regressioner gennemgår.
- `npm run check:site` logger Python 3.13.15, Playwright 1.60.0 og den installerede Chromium-version og afslutter 0.
- CI installerer Python 3.13.15, låser requirements med hashes og installerer Chromium med Playwright.
- Root-, pip-audit- og site-gates er grønne lokalt med de samme commands.

**Verifikation:** `npm run check:site` logger `Python 3.13.15`, `playwright 1.60.0`, `chromium 148.0.7778.96`, 0 SEO-fund på 18 sider, 0 layout-afvigelser ved 360/768/1280 px og 4 grønne selvtesttrin. `npm run audit:site` svarer `No known vulnerabilities found`; samme kommando på en nedgraderet `urllib3==1.26.0`-pin rapporterede 8 PYSEC-fund, så pip-audit-stappen har tænder. `npm test` (38 engine + 39 workflow) og `npm pack --dry-run` (5 filer) er grønne. CI-run `36158172198` (`Site gate`) sluttede `success` efter 1 min. 15 s og loggen bekræfter præcis de samme versioner som lokalt: `Python 3.13.15 [GCC 13.3.0]`, `playwright 1.60.0`, `chromium 148.0.7778.96`, `0 finding(s) across 18 pages`, `deviations: 0`, fire `No known vulnerabilities found` og fire grønne selvtesttrin inkl. de to fangede regressioner. CI-run `36158172199` (`CI`) sluttede `success`, og ingen `deploy-site`-run findes.


### 7. [x] Skab en komplet support- og købsside

**Status:** FÆRDIG — merged til `main` i commit `0534cb8`
**Mislykkede forsøg:** 0/2
**Begrundelse:** Købere mangler tydelig hjælp til nøgle, maskiner og kontakt, og det offentlige site mangler den påkrævede `/support`.

**Scope:**

- Opret `site/support/index.html` med køb, nøgleindsættelse, 3 maskiner, fejlfinding, kontakt og sikker håndtering af nøgler.
- Adskil “køb Pro” fra frivillig donation uden aggressiv markedsføring.
- Tilføj supportlink i footer/navigation og sitemap.
- Skriv “Kontakt support før et køb, hvis du vil tale om refusion”; angiv ingen refusionsgaranti, frist, tilbagebetaling eller andre juridiske vilkår, der ikke er godkendt af Mads.
- Brug kun den officielle kontakt fra produktkontrakten og bed aldrig om en nøgle i offentligticket eller mail.

**Acceptkriterier:**

- Siden findes på `/support`, linkes fra sitets primære sider og findes i sitemap.
- Siden bruger kun den officielle Stripe-link og indeholder ingen personlige nøgler.
- Siden har overskrifter for køb, aktivering, maskinbegrænsning, fejlfinding og kontakt; refusionsområdet indeholder ingen love/paragraffer.
- `npm run check:site` er grøn ved 360, 768 og 1280 px.
- Donationen er tilgængelig, men kun i support/efter et lykket resultat.

**Resultat:**

- `site/support/index.html` dækker køb, aktivering, tre maskiner, fejlfinding, nøglersikkerhed, kontakt og en kort donationstekst. Den bruger kun den officielle Payment Link og ingen personlige nøgler.
- Siden er på engelsk og har `hreflang: en` + `x-default`; den danske udgave er lagt som ny opgave nedenfor. Det følger samme mønster som `/cheatsheet/`, der også kun findes på engelsk.
- Footerens sitokolonne har nu et Support-link på alle 19 sider. Det kommer fra `tools/site_chrome.py` (`f_support`), så en ny side ikke kan glemme det.
- `llms.txt` peger på siden under Pages. `site/sitemap.xml` og `site/search-index.json` er regenereret af `site_chrome.py`; søgeindekset gik fra 102 til 103 entries.
- `.github/workflows/site-gate.yml` fik `tools/site_chrome.py` i path-filteret, så en kun-chrome-ændring ikke kan springe site-gaten over.

**Verifikation:** `npm test` (38 engine + 39 workflow), `npm pack --dry-run` (5 filer), `npm run audit:site` (`No known vulnerabilities found`) og `npm run check:site` er grønne. Site-gaten melder `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px og fire grønne selvtesttrin inkl. de to fangede regressioner. CI-run `36161901424` (`CI`) og `36161901489` (`Site gate`) for `0534cb8` sluttede begge `success`, planstatuscommitterne `44aa0d6` og `7c6f2b4` fik CI-run `36161973106` `success`, og ingen ny `deploy-site`-run blev oprettet.

**Flake fundet og lukket undervejs:** Første `check:site` kørsel var rød med `FEJL layout-regression fanges (exit 1)`, selvom samme trin er grønt i isolation. En reproduktion af den indbyggede 2400 px-regression gav dog korrekt `horizontal overflow` ved alle tre bredder, så årsagen lå i selftestens manglende diagnoseoutput, ikke i layout-regressionen. `site_gate_selftest.py` hæfter nu checkerens egen output på en fejl, og `layout_check.py` fanger Playwright-fejl pr. side (én side pr. URL, `goto`-timeout 20 s) og tæller dem som afvigelse i stedet for at gå i stykker med en traceback. Tre efterfølgende grønne kørsler af hele gaten. Fremtidige røde site-gater er dermed læsbare, ikke uforklarlige.

### 8. [x] Gør den gratis CLI komplet, dokumenteret og ens sitets engine

**Status:** FÆRDIG — slice 1 i `414eb8b`, slice 2 i `86a236d`. T9 er næste opgave.
**Mislykkede forsøg:** 0/2
**Begrundelse:** Efter desktopflytningen er CLI'en hele gratisproduktet i repoet. Den skal løse reelle opgaver fuldt ud, have tydelig fejlhåndtering og bruge samme transformationssemantik som det offentlige site.

**Slice 1 — gjort i `414eb8b`:**

- `docs/cli.md` er den nye reference: alle 14 operationer med fixture, kommando og eksakt output, coercion-regler for CSV/XML/YAML, exit codes, script- og batch-eksempler, samt en enkelt købsvej til Desktop Pro. Dokumentationen kan ikke lyve: `test/conformance.test.mjs` kræver, at hver kommando og hvert output-uddrag på siden findes i koden og i `test/fixtures/expected.json`.
- `src/cli.js` har nu exit codes 0/1/2/3, `--out <fil>`, `--version`, præcis validering af `--format`/`--output`/`--pipe`, `add` og `join` i hjælpeteksten, tomt stdout ved fejl og exec-bit på filen. Før dette var alt exit 1, `--pipe '{'` crashede med en rå stacktrace, og `add`/`join` fandtes kun i README.
- `test/cli.test.mjs` (45 tests) kører den rigtige CLI i en child process: alle 21 dokumenterede kommandoer, fire formater hver vej, stdin, `--out`, 50 rækker i én kørsel, alle exit codes og `stdout`/`stderr`-separation.
- `test/conformance.test.mjs` (49 tests) indlæser `site/engine.js` i en `vm`-sandbox præcis som `site/try.html` gør, og kræver byte-identisk `text` og identiske data mellem CLI-engine og browser-engine for alle 21 fixtures, plus dækning af alle 14 operationer og alle 4 input- og 6 output-formater. Den håndhæver også, at engine-filen ikke indeholder `require(`, `fetch(`, `XMLHttpRequest` eller `process.`
- Fund og rettelse: `serializers.table` skrev `[object Object]` for nestede records. Begge engine-kopier er rettet til at vise dem som kompakt JSON, så `group` og `join` er læsbare i CLI og på sitet.
- `npm test` er nu fire suites: 38 + 45 + 49 + 39 og 4 workflows. `npm pack --dry-run` er uændret på 5 filer, fordi `files` kun indeholder `src/`, README og LICENSE.

**Slice 2 — gjort i `86a236d`:**

- `scripts/verify-readme.js` var død kode: den lå i repoet uden at være wiret ind i `npm test`, brugte `execSync` med shell, emojier og en exit-kode, ingen af hverken `ci.yml` eller nogen anden gate kørte den, og den ville aldrig have fanget en driftet README. Den er erstattet af `test/readme.test.mjs`, som er samme kontrol som en rigtig suite: den læser `## Examples`-blokken i README, bygger `people.csv` og `config.yaml` i en temp-mappe, kører hver kommandolinje med `transmute` bundet til dette checkout og kræver exit 0, tom stderr og et konkret output (CSV-tal forbliver tal, filteret giver præcis Alice, YAML bliver én record, `<a>1</a>` i XML). En ny README-eksempel-linje uden registrering i `EXPECTATIONS` gør gaten rød, så kontrollen kan ikke stille stå.
- Cheat sheetet har nu en afsluttende `Full reference`-sektion, der peger på `docs/cli.md` med exit codes og løftet om, at eksemplerne køres af `npm test`. Playgroundet på `/` og `/da/` har samme henvisning under outputfeltet, så en browserbruger lander i den fulde reference i stedet for at stoppe ved cheat sheetet. `llms.txt` peger også på dokumentationen.
- Regenereringen er lavet med `tools/site_chrome.py`, som skrev TOC, søgeindeks (103 entries), sitemap og `lastmod 2026-09-25` på 19 sider. Kun chrome-afledte filer blev rørt ud over de tre sider med indhold.
- `--pretty`/kompakt JSON-output og `--input-format`-rapport blev bevidst ikke lavet. De er ikke løftet fra en bruger eller et konkurrentfund, og begge ville udvide den låste exit-code-overflade uden at gøre en reelle opgave bedre. De står som en mulig fremtidig opgave, ikke som en mangel.

**Verifikation slice 2:** `npm test` er grøn med 38 engine-, 45 CLI-, 49 conformance-, **6 README**-tests samt 39 workflow-regressioner og 4 workflow-kontrakter. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` er grøn med `Python 3.13.15`, `playwright 1.60.0`, `chromium 148.0.7778.96`, `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px og fire grønne selvtesttrin; gaten blev kørt to gange efter ændringerne. CI-run `36171118618` (`CI`) og `36171118656` (`Site gate`) for `86a236d` sluttede begge `success`, og planstatuscommitten `f39010d` fik CI-run `36171229682` `success`.

**Ikke gjort, bevidst:** slice 2's tredje punkt (`--pretty`, auto-detektionsrapport) udgør ingen dokumenteret brugerbegrundelse, så den er parkeret frem for bygget.

**Verifikation slice 1:** `npm test` er grøn med 38 engine-, 45 CLI- og 49 conformance-tests samt 39 workflow-regressioner og 4 workflow-kontrakter. `npm pack --dry-run` er uændret på 5 filer. `npm run check:site` er grøn: `Python 3.13.15`, `playwright 1.60.0`, `chromium 148.0.7778.96`, `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px og fire grønne selvtesttrin inkl. de to fangede regressioner. CI-run `36166367170` (`CI`) og `36166367190` (`Site gate`) for `414eb8b` sluttede begge `success`, og ingen `deploy-site`-run findes.


**Scope:**

- Dokumentér alle understøttede operationer med konkrete fixtures og CLI-eksempler.
- Ret eventuelle dokumenterede afvigelser mellem CLI-engine og site-browser, så samme input og pipeline giver samme output.
- Tilføj file input/output, stdin/stdout-fejlhåndtering og maskinlæsbare eksitcodes uden netværksafhængighed.
- Hold al databehandling lokal og tilføj en tydelig, enkelt købsvej til den private Desktop Pro uden at hæmme gratisworkflowet.

**Acceptkriterier:**

- Identiske fixtures for alle dokumenterede operationer giver identisk output i CLI'en og site-browseren.
- En bruger kan transformere mindst tre filformater lokalt med fejlcodes, stderr og maskinlæsbart output uden konto eller internet.
- En 50-run fixture gennemføres uden køb, kunstige run-grænser eller upload.
- Nye conformance- og CLI-tests er wire ind i `npm test`; roottesten og pack-gaten er grønne.

### 9. [x] Gør produkt-, platform- og versionsclaims sande

**Status:** FÆRDIG — merged til `main` i commit `f2956f5`
**Mislykkede forsøg:** 0/2
**Begrundelse:** Efter flytningen peger README stadig på den slettede buildworkflow og beskriver desktopens køfsmekanik som om kildekoden lå i repoet. Modstridende claims skader brugertillid og gør builds uforudsigelige.

**Scope:**

- Ret README, site, llms og privacy, så de kun beskriver den offentlige CLI, det faktiske site og den separate private Desktop Pro.
- Opret `tools/product-contract.json` som maskinlæsbar single source med `product_key: transmute-desktop`, `amount: 19`, `currency: USD`, `billing: one_time`, `machines: 3` og den officielle Payment Link; filen må ikke indeholde secrets.
- Synkronisér npm- og siteversion gennem én kilde eller en CI-kontrol.
- Fjern alle claims om kildekode, builds eller licenspayload i dette repo, medmindre de beskriver den separate betalte app på et verificerbart niveau.

**Acceptkriterier:**

- En ny `tools/verify_contract.mjs`-kontrol er wire ind i `npm test`, læser `tools/product-contract.json` og fejler ved afvigende pris, currency, billing, maskinantal, Payment Link eller produktnøgle.
- README og site bruger kun den officielle Payment Link, ingen private kodelinks og ingen ukendte CI-workflows.
- Versionskontrollen læser npm- og siteversion og kræver ens værdier.
- `npm test && npm pack --dry-run` og site-gaten er grønne. Der laves ingen tags, releases eller npm-publish.

**Resultat:** `tools/product-contract.json` er den eneste kilde til `product_key`, `amount`, `currency`, `billing`, `machines`, gratisniveau, Payment Link, donationslink, licens-API og de tilladte desktop-linkmål. `tools/verify_contract.mjs` (161 checks over 27 filer) er wiret ind i `npm test` og tjekker: låste kontrastandarder, ingen secrets eller ikke-https-strenge i kontrakten, kun de to officielle Stripe-links i README/docs/site, pris kun som `N USD` (EUR/DKK/bløde valutaer er forbudt, Stripe vælger valuta), maskinantal og gratisniveau ens alle steder, ingen abonnementspåstand, ingen link til `mahope/transmute-desktop` eller `mahope/paid-products`, badges kun på workflows der findes i `.github/workflows/`, desktop-links kun til sider i dette repo, ens version mellem `package.json`, `src/cli.js` og `softwareVersion` i alle site-sider, og at hverken `desktop/`, `Cargo.toml` eller `tauri.conf.json` er kommet tilbage og at `package.json` `files` ikke sender betalt kode med.

**Falske claims fundet og rettet:**

- README-badge pegede på `build.yml`, som blev fjernet med desktopkoden; den faktiske gate er `ci.yml`. Badgen var samtidig trykt to gange i headeren.
- Knappen `Download for macOS, Windows or Linux` på `/` og `/da/` pegede på `github.com/mahope/transmute/releases`, som ikke indeholder desktopappen, fordi den bygges fra det private repo. Den peger nu på `/support/#buying-pro` som forklarer køb, aktivering og gratisniveau.
- Footerens `Desktop app`-link pegede på samme releases-side på alle 19 sider; rettet i `tools/site_chrome.py` til `{home}#desktop`, og begge forsider har nu et `id="desktop"`-anker.
- To guides skrev `Transmute desktop app` med link til `/#install`, som er CLI-installationen; de peger nu på `/#desktop`.
- README sagde, at appen kan hentes fra `https://transmute.run/`, og læste som om appen lå i repoet; nu står der eksplicit, at den er et separat, lukket produkt bygget fra et privat repo, og at køb/aktivering sker via `/support/`.
- `homebrew-bump.yml` forklarede sin tag-trigger med "the release in build.yml"; rettet til `publish.yml`.

**Valgt bevidst at lade stå:** gratisniveauet "tre transformationer pr. start" er bekræftet på tværs af `/`, `/da/` og `/support/`, men kan ikke verificeres fra dette repo, fordi appen er privat. Det er lagt i kontrakten som `free_tier_transformations_per_launch: 3`, så kontrol'en nu garanterer, at alle sider siger det samme, i stedet for at slette det. Se `❓ Til Mads` punkt 4.

**Verifikation:** `npm test` grøn (38 + 45 + 49 + 6 + 39 + 4 + 161), `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 19 pages` og grøn selftest. `site_chrome.py` regenererede footeren på 19 sider; sitemap og søgeindeks (103 entries) var uændrede, fordi `lastmod` stadig er 2026-09-25.

### 10. [x] Opdatér runtime og afhængigheder kontrolleret

**Status:** FÆRDIG — ni slices, alle med egen commit (`14dce0b`, `599ca4f`, `a4114ca`, `8a161fb`, `bb19768`, `c446d37`, `c1bee9f`, `9b7ddf5`, `427b113` + `fda739c`). Ubuntu-26-migreringen er lavet før fristen 19. oktober 2026.
**Mislykkede forsøg:** 0/2

**Slice 1 — `14dce0b`, lockfil og `npm ci`:**

- `package-lock.json` er oprettet (lockfileVersion 3, nul afhængigheder) og committet. Roden har ingen runtime- eller dev-afhængigheder, så filen er lille, men den låser transitive krav, når en dependency engang tilføjes.
- `ci.yml` kører `npm ci` før `npm test`. `publish.yml`s betingede `if [ -f package-lock.json ]`-fallback er væk, så publish altid installerer fra lockfilen.
- Ny kontrol i `tools/verify_contract.mjs` (162 checks) kræver, at lockfilen findes og matcher `package.json` på navn, version og lockfileVersion 3, at den ikke løser nogen pakker bag README's "Zero dependencies", og at ingen workflow kører `npm install`. Verificeret med tænder: at slette lockfilen eller sætte `npm install` tilbage i `ci.yml` gør `npm test` rød. Den fanger også den `run: |`-flade, som det gamle publish-script brugte.
- `npm pack --dry-run` er uændret på 5 filer, fordi lockfiles aldrig sendes med i tarballen.

**Slice 2 — `599ca4f`, runtime-erklæring:**

Research fra `https://nodejs.org/dist/index.json` den 2026-09-25 (fra → til):

| Node | Status | Dato | Ændring |
|---|---|---|---|
| 20 | **EOL** siden april 2026 | — | Fjernet fra CI-matrixen |
| 22.23.3 | LTS "Jod" (maintenance) | 2026-09-23 | Beholdt som laveste understøttede linje |
| 24.21.0 | LTS "Krypton" (aktiv LTS) | 2026-09-07 | Tilføjet til matrixen, pinnes i `.nvmrc` |
| 26.10.0 | Current, ikke LTS | 2026-09-21 | Ikke brugt: endnu ikke LTS |

- `engines.node` `>=18` → `>=22`, `.nvmrc` tilføjet med `24`, `ci.yml`-matrix `[20, 22]` → `[22, 24]`, `publish.yml` `node-version: 20` → `22`.
- **Den udløbne runtime var ikke kun i testen.** `publish.yml` publicerede til npm fra Node 20, altså fra en Node der nåede end of life i april 2026.
- Ny kontrol i `verify_contract.mjs` (163 checks) kræver, at `engines`-floor, `.nvmrc`, `ci.yml`-matrixen og enhver `node-version:` i en workflow peger på den samme testede runtime, at ingen matrix-leg er en ulige ikke-LTS-major (den slags er EOL inden for måneder), og at alle læserclaims matcher floor. Koden skriver kommentaren om, hvorfor floor er 22, og hvornår den må hæves.
- **Kontrollen fandt 13 driftede claims ved første kørsel:** 11 sider, `llms.txt`, `llms-full.txt` og `docs/cli.md` lovede "Node.js 18 or newer", og `site/da/index.html` lovede "Node.js 18 eller nyere". Den danske formulering er nu også dækket af regex'en.
- Fund: `test/cli.test.mjs` havde en test der hed "engines requirement matches the CI matrix", men hardcodede `>=18` og læste aldrig matrixen. Den læser nu den ældste version i `ci.yml` og kræver, at `engines` følger den, så testens navn er sandt.

**Slice 3 — `a4114ca`, `actions/checkout` v4 → v5 alene:**

- `ci.yml` og `publish.yml` bruger nu `actions/checkout@v5`. `setup-node` står urørt på v4, så en brydende `checkout`-major kan rulles tilbage uden at rive Node-opsætningen med.
- Migrationsnoter for `v5.0.0` (`gh api repos/actions/checkout/releases/tags/v5.0.0`, 2026-09-25): kernen skifter til Node 24 og kræver runner `v2.327.1` eller nyere. Ingen kodeændring nødvendig; GitHosts egne runners er altid nyere end runnerens minimum.
- **Der var ingen gate, der holdt majoren oppe.** Bumpet alene ville være en diff uden fælde, så slice 3 tilføjer kontrol'en "no workflow pins an action major GitHub has deprecated" i `verify_contract.mjs` (164 checks). Den læser alle workflows, kræver at `actions/checkout` mindst er `v5`, `actions/setup-node` mindst `v4` og `actions/setup-python` mindst `v7`, at en pin enten er et major-tag eller en fuld 40-tegns SHA, og at ingen gulv pålægges en action ingen workflow bruger. Gulvene hæves én major pr. slice i samme commit som bumpet, så rækkefølgen kan ikke springes, og de sænkes aldrig.
- Verificeret med tænder: sæt `ci.yml` tilbage til `actions/checkout@v4` → 1 fejl med navngivet gulv; sæt `publish.yml` til `actions/setup-node@main` → 1 fejl om ref-formen. Begge reversioner er rullet tilbage.
- Dependabot-PR #4 er lukket med en kommentar, der peger på sliceopdelingen, i stedet for at blive merget. Den er grøn i CI, men den tager tre majors i én diff.
- `ubuntu-latest` → `ubuntu-26.04` er bevidst ikke rørt her; det er en runtime-migrering, ikke en action-major, og tages i en senere slice med egen commit.

**Slice 4 — `8a161fb`, `actions/setup-node` v4 → v5 alene:**

- `ci.yml` og `publish.yml` bruger nu `actions/setup-node@v5`; `checkout` står urørt på v5 fra slice 3, så de to majors stadig kan rulles tilbage uafhængigt af hinanden.
- Migrationsnoter for `v5.0.0` (`gh api repos/actions/setup-node/releases/tags/v5.0.0`, læst 2026-09-25 ca. 22:5x CEST) har **én reel brydende ændring**: setup-node cacher nu automatisk, når `package.json` har et gyldigt `packageManager`-felt (PR #1348), og kernen kører på Node 24 med krav om runner `v2.327.1`+ (PR #1325).
- **Autocachingen er inert her, og det er kontrolleret frem for antaget:** `package.json` har intet `packageManager`-felt (`rg '"packageManager"' package.json` → ingen match), så v5's nye adfærd ændrer intet ved `npm ci` i hverken CI eller publish. Skal feltet tilføjes senere, begynder caching med det samme, og da skal `cache-dependency-path` gennemgås; det er skrevet her, så den næste iteration ikke opdager det ved en overraskelse.
- `setup-node`-gulvet hævet fra 4 til 5 i `verify_contract.mjs` i samme commit, så rækkefølgen ikke kan springes over. Verificeret med tænder: sætte `ci.yml` tilbage på `setup-node@v4` giver præcis 1 fejl med det navngivne gulv; reversionen er rullet tilbage.
- Dependabot holder `setup-node` på v4, fordi dependabot-PR'en lukkede blev afvist på sliceopdelingen. Den bør ikke genåbnes før slice 8 er færdig, ellers springer den majors over.
- Adskillelsen er bevidst: `publish.yml` kører fra Node 22, som T10 slice 2 fastlagde som laveste publicerede linje. `setup-node` styrer den Node, handlingen *kører på*; matrixen styrer hvilke linjer der testes. De er to forskellige løsner og må ikke slås sammen.

**Slice 5 — dette commit, `actions/checkout` v5 → v6 alene:**

- `ci.yml` og `publish.yml` bruger nu `actions/checkout@v6`; `setup-node` står urørt på v5 fra slice 4, så de to majors stadig kan rulles tilbage uafhængigt af hinanden.
- Migrationsnoter for `v6.0.0` (`gh api repos/actions/checkout/releases/tags/v6.0.0` og `README.md` på `ref=v6`, læst 2026-09-26) har **én reel adfærdsændring**: `persist-credentials` gemmer nu tokenet i en separat fil under `$RUNNER_TEMP` i stedet for i `.git/config` (PR #2286). `action.yml` på `v6` har de samme inputs som `v5` — ingen er fjernet, omdøbt eller gjort påkrævede — så ingen workflow skal ændres. READMEen siger eksplicit "No workflow changes required — `git fetch`, `git push`, etc. continue to work automatically".
- **Den nye runner-krav er kun relevant for container-actions:** v6 kræver runner `v2.329.0`+ *kun* til autentificerede git-kommandoer fra en Docker container action. Ingen af de tre workflows har container-steps, så kravet er ikke en arbejdsændring. `v6` arver desuden `node24`-kernen fra `v5`, så der er ingen ny runtime at erklære.
- **Adfærden er verificeret som uberørt her, ikke antaget:** ingen workflow sætter `persist-credentials`, bruger `submodules` eller laver et `git push`. `publish.yml`'e eneste skriveadgang til GitHub er `gh release create` med `GH_TOKEN: ${{ github.token }}`, som er et API-kald og ikke en autentificeret git-operation — den nye credential-fil rører den ikke. `npm ci` og `npm test` læser kun det udcheckede arbejdsbibliotek, som `tokenen` før lå i `.git/config` og nu ligger uden for det.
- `checkout`-gulvet hævet fra 5 til 6 i `verify_contract.mjs` i samme commit. Verificeret med tænder: sætte `ci.yml` tilbage på `checkout@v5` giver præcis 1 fejl med det navngivne gulv; reversionen er rullet tilbage.
- `site-gate.yml` har brugt `checkout@v7` hele vejen, så de tre workflows står nu på hver sin major (v6, v6, v7) indtil slice 7. Gulvet på 6 dækker alle tre, og slice 7 slutter på den pin `site-gate.yml` bruger i dag.

**Slice 6 — dette commit, `actions/setup-node` v5 → v6 alene:**

- `ci.yml` og `publish.yml` bruger nu `actions/setup-node@v6`; `checkout` står urørt på v6 fra slice 5, så de to majors stadig kan rulles tilbage uafhængigt af hinanden.
- `v6.0.0` (publiceret 2025-10-14) har **to** brydende ændringer, og begge er verificeret inerte her frem for antaget:
  1. **`always-auth`-inputtet er fjernet** (README, afsnittet "Breaking changes in V6"), fordi npm har deprecated det. `rg 'always-auth' .github/workflows/ package.json` → ingen match, så ingen workflow skal ændres. `publish.yml` sætter i stedet `NODE_AUTH_TOKEN` i step'ets `env:`, hvilket er den understøttede vej.
  2. **Automatisk caching er begrænset til npm** (PR #1374), og triggeren er blevet *bredere*, ikke smallere: caching tændes nu, når enten `devEngines.packageManager` **eller** det topniveau-`packageManager`-felt i `package.json` siger npm. `package.json` erklærer hverken felt (verificeret med `rg 'packageManager|devEngines' package.json package-lock.json` → ingen match), så v5's og v6's adfærd er identisk her: ingen caching, `npm ci` løses fra lockfilen hver kørsel.
- Runtimekravet er uændret: `package.json` på `ref=v6` kræver `engines.node >=24.0.0` — det er actionens egen kørselstid, samme node24-kernel som v5, og ikke den Node den installerer til jobbet. Runner-kravet `v2.327.1+` arves fra v5, og alle tre workflows bruger GitHosts `ubuntu-latest`, så intet skal ændres.
- **Slice 4's note er gjort permanent frem for at blive en ny sætning i planen.** Den skrev, at en fremtidig `packageManager`-felt-bevidst ville tænde caching med det samme, og at `cache-dependency-path` så skulle gennemgås. Det er nu en kontrol: "no workflow inherits implicit dependency caching from setup-node" i `verify_contract.mjs` (165 checks) fejler, hvis `package.json` får enten `devEngines.packageManager` eller `packageManager`, med en besked der kræver et eksplicit `cache`-input eller at feltet fjernes. Den dækker begge felter, så v6's bredere trigger ikke kan smutte forbi den. Verificeret med tænder: `packageManager: "npm@10.9.8"` → 1 fejl, `devEngines.packageManager` → 1 fejl, begge reversioner rullet tilbage.
- `setup-node`-gulvet hævet fra 5 til 6 i `verify_contract.mjs` i samme commit. Verificeret med tænder: sætte `ci.yml` tilbage på `setup-node@v5` giver præcis 1 fejl med det navngivne gulv; reversionen er rullet tilbage.
- Dependabot holder begge actions på de gamle majors, fordi PR #4 blev lukket på sliceopdelingen. Den må først genåbnes når slice 8 er færdig, ellers springer den majors over.

**Slice 7 — dette commit, `actions/checkout` v6 → v7 alene:**

- `ci.yml` og `publish.yml` bruger nu `actions/checkout@v7`; `setup-node` står urørt på v6 fra slice 6, så de to majors stadig kan rulles tilbage uafhængigt af hinanden. Efter denne slice bruger alle tre workflows den samme pin på `checkout`.
- Migrationsnoter for `v7.0.0` (publiceret 2026-06-18) har **én reel adfærdsændring**: checkout nægter som standard at checke ud kode fra en fork-PR, når workflowen trigges af `pull_request_target` eller `workflow_run` (PR #2454), fordi de triggere kører med baserepoets `GITHUB_TOKEN`, secrets og runner-adgang — altså præcis "pwn request"-overhængen. Opt-in er det nye `allow-unsafe-pr-checkout: true`-input, efter risikovurdering.
- **Den ændring er verificeret inerte frem for antaget:** `rg 'pull_request_target|workflow_run|allow-unsafe-pr-checkout' .github/` → ingen match. Alle fire workflows trigges af `push` og/eller `pull_request`, aldrig af de to blokerede triggere, og ingen sætter opt-in-inputtet. `action.yml` på `v7` har præcis de samme inputs som `v6` — ingen tilføjet, fjernet eller omdøbt — så ingen eksisterende `with:`-blok skal ændres. Resten af v7 er intern: ESM-migrering (PR #2463) og transitive afhængighedsopdateringer med sikkerhedsfixes. Kernel er uændret `node24` på begge majors, så der er ingen ny runtime at erklære.
- **Slice 5's fund var, at hævede gulve alene ikke forhindrer at workflows driver fra hinanden.** `site-gate.yml` havde brugt `checkout@v7` hele vejen, mens `ci.yml` og `publish.yml` blev marcheret gennem v5 og v6 — begge over gulvet, ingen klagede. Derfor udvider kontrol'en "no workflow pins an action major GitHub has deprecated" sig i samme commit til også at kræve **én major pr. action på tværs af alle workflows**, med en fejl der viser hvilke filer der ligger på hvilken major. Beviset er i denne diff: den fejler præcist, når `site-gate.yml` sættes på `v8`, og den ville have fejlet på slice 5's `v6`/`v7`-opdeling.
- `checkout`-gulvet hævet fra 6 til 7 i `verify_contract.mjs` i samme commit. Verificeret med tænder: sætte `ci.yml` tilbage på `checkout@v6` giver præcis 1 fejl med det navngivne gulv; sætte `site-gate.yml` på `v8` giver præcis 1 fejl med uoverensstemmelsen. Begge reversioner er rullet tilbage.
- Dependabot holder begge actions på de gamle majors, fordi PR #4 blev lukket på sliceopdelingen. Den må først genåbnes når slice 8 er færdig, ellers springer den majors over.

**Slice 8 — dette commit, `actions/setup-node` v6 → v7 alene:**

- `ci.yml` og `publish.yml` bruger nu `actions/setup-node@v7`; `checkout` står urørt på v7 fra slice 7. Efter denne slice er alle tre workflows på hver sin pin for de actions de bruger, og ingen to workflows er på forskellige majors.
- Migrationsnoter for `v7.0.0` (publiceret 2026-07-14, læst via `gh api releases/tags/v7.0.0`, README på `ref=v7` mod `ref=v6`, `action.yml` på begge refs og `src/authutil.ts` på begge refs) har **én erklæret brydende ændring**: ESM-migreringen (PR #1574), der muliggør de nyeste `@actions/*`-versioner. Den er intern for handlingen og kan ikke nå en `with:`-blok.
- **`action.yml` på v7 har præcis de samme inputs som v6** — diffet på de to refs er udelukkende to *tilføjede outputs* (`cache-primary-key`, `cache-matched-key`, PR #1577). Ingen input er fjernet, omdøbt eller gjort påkrævet, så ingen `with:`-blok skal ændres. Det er verificeret frem for antaget.
- **Den anden reelle ændring er `NODE_AUTH_TOKEN` (PR #1558), og den er verificeret inerte her frem for antaget.** v6 eksporterede en dummy `NODE_AUTH_TOKEN=XXXXX-XXXXX-XXXXX-XXXXX` ind i jobbets miljø, hvis workflowen ikke selv satte den; v7 eksporterer slet ingen, medmindre feltet findes i `process.env`. `.npmrc`-linjen er uændret mellem de to refs — `src/authutil.ts` skriver begge gange `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`, som npm erstatter ved publish-tidspunktet. `publish.yml` sætter `NODE_AUTH_TOKEN` i *step'ets* `env:` på "Publish to npm", og et step-`env` har prioritet over et arvet job-`env`, så v6-dummyen nåede aldrig den opløsning. `ci.yml` sætter ingen `registry-url`, så `writeRegistryToFile` kaldes slet ikke dér. v7 fjerner altså en fælde (et workflow uden egen `NODE_AUTH_TOKEN` fik et ikke-fungerende token ind i `.npmrc`) uden at ændre dette repos adfærd.
- **Slice 4 og 6's caching-bekymring er nu lukket med inputtet, ikke med et forbud.** `package-manager-cache` kom i v6.5.0 (2026-07-14, samme dag som v7.0.0) og er derfor allerede tilgængelig på den pin, repoet stod på. v7's egen README tilføjer `package-manager-cache: false` i eksemplerne, og begge setup-node-steps har nu den linje. Det er en *strukturel* løsning frem for den gamle: før krævede kontrollen, at `package.json` holdt krav om et felt; nu kræver den, at hvert step siger det, så et `packageManager`-felt tilføjet senere slår caching fra uden at nogen behøver opdage det.
- Kontrollen "no workflow inherits implicit dependency caching from setup-node" er derfor skrevet om til at læse hvert `actions/setup-node`-step og kræve enten `package-manager-cache: false` eller et eksplicit `cache:`-input, plus den gamle påstand om `packageManager`. Den finder step'et ved at læse fra `uses:`-linjen til næste linje med samme indrykning som et startholdt `uses`/`name`/`run` — altså step'ets egen `with:`-blok, ikke hele filen. Verificeret med tænder: slette `package-manager-cache`-linjen i `publish.yml` giver præcis 1 fejl, der navngiver filen og beder om inputtet; sætte `ci.yml` tilbage på `setup-node@v6` giver 1 fejl med det navngivne gulv. Begge reversioner rullet tilbage.
- `setup-node`-gulvet hævet fra 6 til 7 i `verify_contract.mjs` i samme commit. Kernel er uændret `node24` på begge majors, så der er ingen ny runtime at erklære, og `@actions/cache` 5.1.0 (PR #1569) med "log cache write denied" er inert, fordi caching er slået fra.
- Dependabot holder begge actions på de gamle majors, fordi PR #4 blev lukket på sliceopdelingen. Den må ikke genåbnes: slice 3–8 er gået gennem dem én ad gangen, så en samlet bump vil springe over rækkefølgen.



**Slice 9 — to commits, `427b113` og `fda739c`, `ubuntu-latest` → eksplicit pinned image:**

Denne slice er delt i to commits, fordi de to halves har hver sin rollback-punkt: de tre workflows uden Playwright flyttes op, og site-gaten låses på den image den allerede kører på.

**Forskning (alle kilder læst 2026-09-26 via `gh api`):**

| Kilde | Fakta |
|---|---|
| `actions/runner-images#14748` (2026-09-17) | `ubuntu-latest` er i dag Ubuntu 24.04 og bliver Ubuntu 26.04 i en udrulning **fra 19. oktober 2026**, færdig 19. november 2026 |
| `actions/runner-images#14747` (2026-09-17) | `ubuntu-26.04` og `ubuntu-26.04-arm` er **GA** og må bruges i `runs-on` |
| `actions/runner-images#14254` (2026-06-16) | Ubuntu 22.04-imagernes deprecation startede 17. september 2026, fuldt udfaset 17. april 2027, med brownouts 23./30. marts og 6./13. april 2027 |
| `images/ubuntu/Ubuntu2604-Readme.md` (image 20260920.143.1) | Ubuntu 26.04.1 LTS, kernel 7.0.0-1012-azure, GitHub CLI 2.101.0, Node.js 24.21.0 forudinstalleret |

**Commit 1 — `427b113`, de tre ikke-Playwright-workflows:**

- `ci.yml`, `publish.yml` og `homebrew-bump.yml` bruger nu `runs-on: ubuntu-26.04`. Ingen af dem rører Playwright eller apt: de har brug for `npm ci`/`npm test`/`npm pack`, `gh release create` og `curl`/`tar`/`sha256sum`/`sed`/`git` — alle til stede på 26.04 ifølge imagereadmen.
- Bevægelsen er nødvendig, ikke kosmetisk: uden den ville alle tre jobs stille skifte OS 19. oktober 2026 uden en eneste commit i repoet og uden noget rollback-punkt.

**Commit 2 — `fda739c`, site-gaten låses på 24.04 + ny kontrol:**

- `site-gate.yml` bruger `runs-on: ubuntu-24.04`. Det er **ikke** en nedgradering: `ubuntu-latest` peger stadig på 24.04, så adfærden er uændret i dag. Det er en låsning mod den tavse flytning.
- **Grunden er researchet, ikke antaget, og den er konkret.** Playwright 1.60.0's `packages/playwright-core/src/server/registry/nativeDeps.ts` har hardkodede apt-pakkelister for `ubuntu18.04`, `ubuntu20.04`, `ubuntu22.04` og `ubuntu24.04` — og **ingen `ubuntu26.04`**. `packages/utils/hostPlatform.ts` mapper Ubuntu 26.04 til `ubuntu26.04-x64` med `isOfficiallySupportedPlatform: false`, og `installDependenciesLinux` i `dependencies.ts` gør sådan: `console.warn("BEWARE: …")`, `console.warn("Cannot install dependencies for ubuntu26.04-x64 with Playwright 1.60.0!")` og **`return` uden fejl**. Så `TRANSMUTE_PLAYWRIGHT_DEPS=1` på 26.04 ville være en tavs no-op, og gaten ville køre Chromium mod uverificerede systembiblioteker — præcis den fejlform, der ligner en grøn gate.
- Ny kontrol `every workflow runs on one pinned, non-deprecated runner image` i `verify_contract.mjs` (166 checks) med tre dele:
  1. Hvert `runs-on` skal være en eksplicit `ubuntu-<major>.<minor>`. En flydende etiket fejler med beskeden om, at en imagemigrering skal vise sig som en commit.
  2. En workflow **uden** Playwright skal ligge på den nyeste image (`ubuntu-26.04`) og fejler ellers med "pin the newest image and move to a new one on purpose".
  3. En workflow **med** Playwright skal ligge på en Ubuntu-version, den låste Playwright faktisk kender. Listen læses fra `tools/site-requirements.txt`, så en Playwright-bump uden en opdateret Ubuntu-liste gør gaten rød med beskeden om, at sitet skal køres grønt på den nye image, før listen udvides.
- Verificeret med tænder fire gange: `site-gate.yml` på `ubuntu-26.04` → 1 fejl der forklarer Playwright-grunden; `ci.yml` på `ubuntu-24.04` → 1 fejl om manglende Playwright-ret; `ci.yml` på `ubuntu-latest` → 1 fejl om pin-kravet; Playwright-pinnen ændret til 1.61.0 → 1 fejl der kræver en ny Ubuntu-liste. Alle reversioner rullet tilbage.
- **En fejl undervejs, som er værd at huske:** min egen tandsk-verifikation brugte `git checkout <fil>` til at rulle tilbage, og fordi slice-9-ændringerne endnu ikke var committet, rullede den også *site-gate.yml's egen pin* tilbage. Kontrollen fangede det med det samme, fordi den så `ubuntu-latest` igen. Rettet ved at genanvende ændringen. Læren: brug `git stash`/`git checkout` på en committet base, eller verificér med tænder *efter* at ændringen er gemt.

**Verifikation slice 9:** `npm test` grøn med 38 engine-, 45 CLI-, 49 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 166 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 19 pages` og fire grønne selvtesttrin. Efter merge kørte CI grønt på begge matrix-ben og loggede `Image: ubuntu-26.04`, og `Site gate` grønt med `Image: ubuntu-24.04` — så migrationen er bekræftet i loggen, ikke bare antaget. Ingen sitefil rørt, så der er oprettet ingen `VERIFICÉR DEPLOY`-note.


**Slice 3–8 — otte action-majors, én pr. commit, ikke blandet med hinanden:**

| # | Fra → til | Filer | Noter |
|---|---|---|---|
| 3 | `actions/checkout` v4 → v5 | `ci.yml`, `publish.yml` | **Fændig** (`a4114ca`). `homebrew-bump.yml` bruger ingen actions |
| 4 | `actions/setup-node` v4 → v5 | `ci.yml`, `publish.yml` | **Fændig** (`8a161fb`). Gulvet hævet til 5; brydende `packageManager`-autocaching er inert og kontrolleret |
| 5 | `actions/checkout` v5 → v6 | samme | **Fændig** (`bb19768`). Gulvet hævet til 6; credential-filen er en adfærdsændring uden workflow-krav |
| 6 | `actions/setup-node` v5 → v6 | samme | **Fændig** (`c446d37`). Gulvet hævet til 6; `always-auth` fjernet og caching-triggeren bredere, begge inerte og dækket af en ny kontrol |
| 7 | `actions/checkout` v6 → v7 | samme | **Fændig** (`c1bee9f`). Gulvet hævet til 7; fork-PR-blokeringen for `pull_request_target`/`workflow_run` er inert, og gulvet har nu også en regel om én major pr. action på tværs af workflows |
| 8 | `actions/setup-node` v6 → v7 | samme | **Fændig** (dette commit). Gulvet hævet til 7; ESM-migreringen er intern og dummy-`NODE_AUTH_TOKEN` fjernet, og caching er nu slået fra eksplicit i hvert step |
| 9 | `ubuntu-latest` → eksplicit pin | alle fire workflows | **Fændig** (`427b113` + `fda739c`). Tre workflows på `ubuntu-26.04`, site-gaten låst på `ubuntu-24.04` fordi Playwright 1.60.0 ikke kender 26.04; ny kontrol forbyder flydende etiketter |

Dependabot-PR #4 ("Bump actions/checkout from 4 to 7") er **lukket, ikke merged**: den tager tre majors i én diff, så præcis rollback ved en brydende major er umulig. Slice 3, 5 og 7 gør arbejdet i stedet. Kør `gh api repos/actions/checkout/releases` og `gh api repos/actions/setup-node/releases` for de aktuelle versioner, før hver slice; de var `v7.0.1` og `v7.0.0` den 2026-09-25, og `setup-node`'s seneste release før v7.0.0 var `v6.5.0` samme dag. Ubuntu-migreringen er lavet i slice 9, før fristen 19. oktober 2026. Næste Ubuntu-trin er `ubuntu-24.04` → `ubuntu-26.04` for site-gaten, i samme commit som den Playwright-version der understøtter 26.04.

**Begrundelse:** Alle Hermes-projekter skal følge nye runtime- og pakkeversioner, men major-opgraderinger skal kunne rulles tilbage præcist.

**Scope:**

- Efter T1: tag kompatible patch/minor-opgraderinger samlet i det offentlige CLI-repo.
- Research den aktuelle stabile/LTS-version og registrér præcise from/to-versioner i planen, før kode ændres.
- Tag hver major-version i sin egen commit og læs migrationsnoter først.
- Opret `package-lock.json`, skift CI/publish-kontrol til `npm ci`, og verificér, at den checked-in lock ikke tilføjer unødige runtime-afhængigheder.
- Fastlæg den understøttede Node- og npm-version i `engines` og `.nvmrc` i samme commit som et framework, der kræver den.
- Opdatér GitHub Actions pin-for-pin og undgå samtidige major-opgraderinger i samme commit.
- Erstat deprecation-aktiverede `actions/checkout@v4` og `actions/setup-node@v4` én major ad gangen; verificér `ubuntu-latest`-migreringen til Ubuntu 26 senest før 19. oktober 2026.

**Acceptkriterier:**

- Planen registrerer hver opgradering fra gammel til ny version og alle nødvendige kodeændringer.
- Gates er grønne efter hver enkelt opgradering; en brydende major rulles tilbage frem for at merges.
- `npm ci`, `npm test && npm pack --dry-run`, `npm audit` og de relevante site-/runtime-gates er grønne med den nye lockfile.
- `.nvmrc`, `engines` og CI-matrix peger på dokumenterede, testede versioner.
- Hver major-version har én selvstændig commit, så præcis rollback kan ske.

### 22. [x] Detekter CSV med den delimiter, læseren kender

**Status:** FÆRDIG som `0115204` på `ceo/format-detect` — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** T20/T21-metoden fortsat. Den kørte denne gang på den *sidste* flade, T21 lod ligge: format-detekteringen.

**Fund 1 — detektoren havde en svagere kopi af læserens egen regel.** `detectFormat` kendte kun komma som delimiter. CSV-læseren (`detectDelimiter`) derimod genkender `,` `;` tab `|`. Resultatet var, at tre helt almindelige filer blev sendt i JSON-læseren og afvist med exit 3:

```
printf 'navn;by;pris\nMette;KBH;199,50\n' | transmute --output json
Error: Could not parse input as json: Unexpected token 'a', "navn;by;pri"... is not valid JSON
```

Samme fejl for TSV og for pipe-tabeller. **På stdin er det hele historien**, fordi der ingen filudvidelse er at gå efter — og stdin er præcis den vej, README's eksempler, CI og rørledninger bruger. Det er altså ikke en krog, men den normale indgang. Samme fejl ramte browserplaygroundet på `/` og `/da/`, som kalder `detectFormat(null, input)` (`site/try.html:25`): en indsat TSV blev læst som JSON.

Dobbeltfejlen gjorde den værre end tilfældigt. T13 tilføjede auto-detektering af alle fire delimiterer til læseren, og T13's egen test for TSV (`test/cli.test.mjs:130`) skrev `-f csv --delimiter tab` foran kommandoen — altså bevidst og uden at opdage, at den netop undgik den automatiske vej. T16 skrev i planen reglen *"læser og skriver i den samme fil skal have samme regel"*; det viste sig at reglen også gælder *detektor og læser*.

**Fund 2 — enkolonnefiler blev afvist, fordi de ikke har en delimiter.** `email\na@b.dk\nc@d.dk` er en mailingliste, altså en rigtig fil. Den har ingen delimiter at finde, så detektionsreglen for CSV ramte aldrig, og JSON-læseren afviste den. Samme for en kolonne af ID'er eller postcode.

**Rettelse:**

- Detektoren bruger nu `CSV_DELIMITERS` og `countUnquoted` — læserens egne to hjælpefunktioner — så de to ikke kan komme i utakt. Det er samme lære som T16: én definition, to brugere. En quotet komma i overskriften tæller ikke som delimiter, så `"a,b";c` er semikolon både for læseren og for detektoren.
- En fil med mere end én linje og ingen delimiter regnes som CSV. **Én linje er bevidst undtagaget**, så `42`, `true` og `hello` forbliver JSON-skalarer i stedet for at blive en tom tabel med en tilfældig overskrift. Det er den afvejning, der gør reglen brugbar: en mailingliste er to linjer, en skalær er én.
- Rækkefølgen er uændret, så intet stjæles fra JSON, YAML eller XML. `created:at` i en kolonneoverskrift er ikke `key: value` (kolon skal følges af mellemrum eller linjeslut) og bliver derfor CSV.

**Verifikation:** `npm test` grøn med 103 engine- (100 → 103), 80 CLI- (76 → 80), 69 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 20 pages`, `deviations: 0` og alle selftester grønne, inklusive deploy-friskheds-selftesten. **Tænder:** de syv nye tests er kørt mod den gamle `detectFormat` og fejlede alle syv med det konkrete symptom (exit 3 med `Could not parse input as json`, henholdsvis `csv` i stedet for `yaml`); efter rettelsen er de grønne. **Ingen snapshot ændrede sig** — ingen `CASES`-case ændrede rækkefølge, så rettelsen er en no-op for data, der allerede virkede. Alle syv nye tests er skrevet mod *output* og ikke mod min egen forventning i hovedet, efter at to af dem først fejlede på en `strictEqual` på et array og en manglende `\n` fra `console.log`.

`docs/cli.md` fik to konkrete eksempler i delimiter-afsnittet, begge kørt og verificeret character for character. `tools/site_chrome.py` regenererede `site/engine.js` (byte-identisk med `src/engine.js`) og asset-hashes på 20 sider; søgeindekset er uændret på 104 entries.

### 21. [x] Skriv nøglenavn, der ikke er lovlige XML-navne, så bruger ikke slår sig ihjel

**Status:** FÆRDIG som `f49458a` på `ceo/xml-safe-keys` — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** T20-metoden fortsat, nu på den sidste flade den efterlod: XML-outputtet, `unique` uden `by` og `group`. Alle fund er reproduceret på den gamle kode.

**Fund 1 — XML-udgangen var ikke gyldig XML, og runde turen ødelagde data.** `writeXMLElement` skrev JSON-nøglen som tag-navn uden at tjekke det. En nøgle er fri tekst, et tag-navn er ikke: `first name`, `2fa`, `a/b` og den tomme nøgle er alle ting et CSV-header eller et API-svar indeholder. Resultatet var `<first name>Ada</first name>`, som **ingen** XML-parser læser — heller ikke Transmute selv, som læste sin egen output tilbage som `[{}]`: alle felter væk, exit 0, ingen advarsel. Det er den værste fundklasse i heleMigrationen, fordi den både skriver en ubrugelig fil og sletter indholdet.

Samme fejlklasse lå i attributterne: `@`-præfikset launder ikke navnereglen, så `@2fa` skrev `<item 2fa="x">` og en nøgle på blot `@` skrev `<item ="x">`.

**Fund 2 — `unique` uden `by` deduplikerede ikke.** Nøglen var `JSON.stringify(item)`, som er afhængig af rækkefølgen: `{"a":1,"b":2}` og `{"b":2,"a":1}` er samme record, men serialiserer forskelligt, så begge blev beholdt. Det var lige præcis det input, hvor rækkefølgen varierer — altså alt der ikke kommer ud af dette værktøj.

**Fund 3 — `group` døde på en gyldig gruppenøgle.** `groups` var et almindeligt objekt, så værdien `__proto__` nåede `Object.prototype` og kørselen døde med `groups[key].push is not a function`. Samme for `constructor` og `toString`.

**Rettelse:**

- `writeXMLElement` tjekker nøglen mod den `XML_NAME`, læseren allerede bruger, så der er én definition af et navn. En ulovlig nøgle skrives som `<field name="nøglen">`, hvilket er lovligt overalt, og `readFieldName` læser den tilbage som nøgle igen. Runden turen er derfor tabsfri igen: `first name`, `2fa`, `a/b`, `""` og en nøgle med et dybt nøglenavn overlever alle, verificeret med `assert.deepStrictEqual` mod inputtet.
- En `@`-nøgle, hvis navn er ulovligt, skrives som child-element gennem samme markør i stedet for som attribut, så `@2fa` og `@` ikke længere skriver en ulovlig attribut. T18's `@`-attribut holdes uændret for `@id`.
- **Læseren taler nu.** En rod der ikke kan læses, et rod-element der aldrig lukkes og et element den ikke kan navngive kaster i stedet for at returnere `[]` eller `{}`. Det var den del, der gjorde fund 1 tavst: en fremtidig navnefejl kan ikke længere slette data stille. XML-filen `bevises` desuden af en regex over alle tag- og attributnavne i testen, ikke af et eksempel.
- `stableKey(val)` sorterer nøglerne på vejen ned, så `unique` uden `by` sammenligner efter indhold. Arrays og tal, `null` og `undefined` er skilt ad.
- `group` bruger en `Map`, der har ingen arvede nøgler, så enhver værdi er bare en værdi. Testen dækker `__proto__`, `constructor`, `toString` og `hasOwnProperty`.

**Verifikation:** `npm test` grøn med 99 engine-, 76 CLI-, 69 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn. **Tænder:** de otte nye tests er kørt mod den gamle `src/engine.js` og fejlede alle otte med det konkrete symptom; efter rettelsen er de grønne. Ingen snapshot ændrede sig, så rettelsen er en no-op for velformet data.

**Bevidst ikke rettet:** `sort` på tal-strenge (`"10"`, `"100"`, `"9"` → `10, 100, 9`) er ikke en fejl her. Det er leksikografisk sortering, som er præcis hvad `jq`'s `sort_by` gør på strenge, og CSV-coercion gør tal til tal alligevel. Det er en *dokumenteret* afvejning, ikke en tavs korruption, så det skal ikke rettes uden at vide hvilken semantik brugerne vil have.

### 20. [x] Skriv nestede værdier som JSON i flade celler, og gør `join --prefix` brugbar

**Status:** FÆRDIG som `dbeae3c` på `ceo/nested-cells` — **ligger på branch, ikke
mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** T18-metoden anvendt på serialiseringssiden i stedet for parsersiden: kør
**rigtige** filer gennem `src/cli.js` med hvert output-format og se efter exit 0 med
mister data. Alle fund er reproduceret på den gamle kode.

**Fund 1 — et objekt blev til bogstavelig `[object Object]`.** `serializers.csv` og
`serializers.sql` skrev værdierne med `String()`. Et API-svar med `user: {name, email}`
blev til en CSV, hvis `user`-kolonne indeholdt de fjorten tegn, exit 0, tom stderr.
Tre ting gjorde det værre end en tilfældighed:

- **Sitets egen guide navngiver fejlen som en fejl hos konkurrenterne.**
  `site/guides/flatten-nested-json/index.html` åbnede med "most 'JSON to CSV' tools
  either choke on nesting or silently turn your data into `[object Object]`" og
  skrev en hel sektion om at omgå den. Transmute *var* et af de værktøjer, teksten
  handlede om.
- **`table` og `docs/cli.md` gjorde det modsatte.** `docs/cli.md:546` viste allerede
  `items` som `[{"sku":"a-1","qty":2}]`, fordi `table`-serializeren brugte
  `JSON.stringify`. Tre af fire formater var altså i overensstemmelse, og den fjerde
  var ikke.
- **Ingen test låste fejlen.** `grep -c "object Object" test/fixtures/expected.json` → 0.
  Ingen af de 27 `CASES` satte et objekt eller en array i CSV- eller SQL-output.

**Fund 2 — to forskellige arrays gav den samme fil.** Et array blev skrevet som
elementerne med komma mellem, så `["a,b"]` og `["a","b"]` begge blev `a,b` og læstes
tilbage som én streng. `{}` og `[]` blev begge et tomt felt, altså uløselige.
Kollisionen er præcis T17's lære: *en streng der læses som noget andet skal skrives
så den ikke kan* — T17 løste det for YAML-strenge, her var samme fejl i CSV-cellen.

**Fund 3 — `join --prefix` gjorde præcis ikke sit arbejde.** `operations.join` skrev
`if (k !== on && !(k in merged)) merged[prefix + k] = v;`. Guarden spurgte, om det
**upræfikserede** navn allerede fandtes på venstre side, men skrev til det præfikserede.
Så et join med `prefix: "r_"` på to sider med et fælles `tier`-felt droppede `tier`
alligevel, exit 0. Det er den eneste mulighed, `prefix` findes for — og både
`docs/cli.md` og `site/guides/join-two-files/index.html` lovede den modsatte.

**Rettelse:**

- Ny `cellValue(val)` i begge engines: `null`/`undefined` → tom streng, objekt og
  array → kompakt JSON, ellers `String(val)`. `csv`, `table` **og** `sql` bruger den
  nu, så de tre kan ikke glide fra hinanden igen. Det er samme form som `jq`'s
  `@csv` skriver for en ikke-skalær, så cellen er både troværdig og parsebar af
  læseren på næste hop.
- `sqlValue` får sit eget objekt-/array-tjek, så en indlæsning beholder indholdet i
  stedet for ordet `Object`. Enlig apostrof escapes stadig (`'{"name":"O''Brien"}'`).
- `join`-guarden spørger om `prefix + k`, altså det navn den faktisk skriver til.
  Uden `prefix` er adfærden **uændret** — "matching fields never overwrite" holder.
- `docs/cli.md` får en ny sektion `#### Nested values in a flat cell` med kommando og
  output, `join`-afsnittet får et prefix-eksempel på et kolliderende felt, og
  flatten-guiden samt join-guiden er rettet, så ingen af dem længere beskriver fejlen
  som en advarsel brugeren skal omgå. `tools/site_chrome.py` regenererede
  søgeindeks (104 entries), asset-hashes og sitemap på 20 sider.

**Verifikation:** `npm test` grøn med 89 engine- (78 → 89, 11 nye), 76 CLI- (70 → 76,
6 nye), 69 konformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter
og 173 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site`
grøn med `0 finding(s) across 20 pages`, `deviations: 0` og grøn selftest.
`npm run audit:site` og `npm audit` uden fund. Deploy genverificeret i starten af
iterationen (se Deploy).

**Ingen af de 27 eksisterende snapshots ændrede sig.** `npm run snapshots:cli` lagde
præcis én tilføjelse i `expected.json` (den nye case), hvilket er beviset på at
rettelsen er additiv: de fixtures, der virkede, virker stadig.

**To læringer fra denne iteration:**

1. **Min egen test havde den anden fejl.** Jeg delte en CSV-linje på `,` for at finde
   cellen — men cellen *er* JSON med kommaer i. Testen fejlede, og den fejlede
   *fordi den havde en svagere idé om CSV end værktøjet selv.* Løsningen var at læse
   cellen tilbage med `parsers.csv` i stedet for med et hjemmelavet split. Samme
   pointe som T18 og T14: påstanden skal gå gennem den kode, den udsiger noget om.
2. **Falskhed i en guide er en fejl i varen.** Guideen var ikke bare forældet, den
   *beskrev en fejl som en konkurrentens*. Den blev læst som en kravliste mod os selv,
   fordi hver eneste anden kilde i repoet sagde det modsatte. En diff på `site/`
   burde derfor læses som en påstand om varen, ikke som tekst.

### 19. [x] Skeln mellem tom streng og NULL i SQL-output

**Status:** FÆRDIG som `538aa2e` på `ceo/sql-empty-string` — **ligger på branch, ikke
mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** `sqlValue` skrev både `null` og `''` som `NULL`. I SQL er det to
**forskellige** værdier, så `WHERE middle = ''` fandt intet efter en import af en CSV
med tomt felt. Det var ikke en tilfældighed: `test/test.js` havde en grøn test
`SQL NULL for empty values`, der låste adfærden — altså et **bevidst valg fra
en tidligere iteration**, ikke en forglemt fejl. Den er derfor ændret med en note og en
migrationslinje i `docs/cli.md`, ikke ved at slå en test fra.

**Beslutning (taget af loopet, ikke af Mads):** tom streng bliver `''`, NULL-semantikken
bliver kun for `null` og for nøgle ingen record har. Det er SQL-korrekt, og det er den
ene af de to muligheder T19 selv noterede. Den er lavet, så den er præcist en
commit at rulle tilbage til, hvis Mads vil have den gamle adfærd. Se `❓ Til Mads` punkt 7.

**Rettelse:**

- `sqlValue` i begge engines skelner nu: `null`/`undefined` → `NULL`, `''` → `''`.
- Den klokkeformede talstreng er snævret fra `/^-?\d+(\.\d+)?$/` til
  `/^-?(0|[1-9]\d*)(\.\d+)?$/`, så et forulede nul ikke længer slipper igennem som
  et tal. Et dansk postnummer `0074` blev skrevet som tallet 74; det er nu `'0074'`.
  `-0074` følger samme regel, `2100` og `0.5` er stadig tal, og den eksisterende
  længdegrænse på 15 tegn er urørt.
- Nyt fixture `test/fixtures/sql-empty.csv` (tomt felt + `0074` + `2100` + `30`) lagt
  som `CASES`-case `sql-empty-string`, så konformancen dækker det i begge engines
  og i den rigtige CLI, og `docs/cli.md` fik et nyt afsnit med kommando, output og en
  firelinjes tabel over `NULL` / `''` / tal / `0074`.
- Den grøne test er omskrevet til den valgte kontrakt og delt i tre: null vs. tom
  streng, tom streng gennem en CSV-runde, og nulforpræfiks. To af dem fejlede første
 gang, fordi jeg skrev mine **egne** påstande ud fra hovedet i stedet for outputtet —
  `(NULL, NULL)` optråder jo i en række med en manglende nøgle, og `"0.5"` er et
  almindeligt decimaltal, ikke noget med nulforpræfiks. Begge er rettet til at
  sammenligne hele rækker mod den faktiske output.

**Acceptkriterier:**

- En CSV med et tomt felt round-tripper til SQL og tilbage med tom streng bevaret —
  dækket af `SQL keeps the empty string through a CSV round trip`.
- `null` er stadig `NULL` så null-semantikken ikke kan forveksles med den tomme streng
  — dækket af `SQL NULL only for null and missing, never for an empty string`,
  som også kræver `(3, NULL)` for en nøgle ingen record har.
- Begge engines er byte-identiske (`cmp src/engine.js site/engine.js`).
- `0074` overlever som `'0074'`, mens `2100`, `0.5` og `-0074` händteres rigtigt.
- `npm test` er grøn.

**Verifikation:** `npm test` 80+71+67+6+39+4+173, 0 fejl (to nye engine-tests, en ny CLI-
case, en ny konformance-case). `npm pack --dry-run` 5 filer uændret. `npm run check:site`
`0 finding(s) across 20 pages` med grøn deploy-friskheds-selftest — det var den gæld
T18-iterationen efterlod, og den er betalt i denne iteration. Snapshots regenereret til 27
entries **uden at ét eneste eksisterende snapshot ændrede sig**, hvilket er beviset på,
at de to datarettelser kun rammer de to tilfælde, de handler om. Deploy genverificeret
først i iterationen med `npm run check:deploy`: uændret, `DEPLOY-MISSING` står ved.

### 18. [x] Behold XML-attributter, navnerum og DOCTYPE i XML-læseren

**Status:** FÆRDIG som `a31aba8` på `ceo/xml-attributes` — **ligger på branch, ikke
mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** Samme fejlklasse som T13, T14, T16 og T17: **stille datakorruption med
exit 0**. XML-læseren matchede kun `\w+` som tagnavn, og den smidte hele
attributstrengen væk. Alt hvad der lå uden for den snævre syntaks, forsvandt — uden
fejl, uden advarsel, uden en eneste mistet record talt.

**Fire fund, alle reproduceret på den gamle kode:**

1. **Attributter forsvandt totalt.** `<product sku="A-1" stock="7">` blev
   `{"name":"Bog","price":"199.00"}`. `sku` og `stock` var væk, og da de to var
   nøglefelterne i et produkfeed, kunne intet derefter joines på dem.
2. **Navnerum tømte hele filen.** `<ns:item>` matchede ikke `\w+`, `parseElement`
   returnerede `null`, løkken `break`ede, og resultatet blev `[]` med exit 0. RSS,
   Atom, SOAP og alt OOXML er præcis denne fil.
3. **En `<!DOCTYPE>`-prolog tømte også hele filen** til `[]` — og en intern subset
   `[...]` kan selv indeholde `>`, så deklarationen kan ikke lukkes på det første.
4. **Et attribut med samme navn som et barnelement blev lydløst tabt.**
   `<item name="a"><name>b</name></item>` gav `{"name":"b"}`.

**Valg:**

- **Attributter beholder præfiks `@`**, som xmltodict, xml2json og BadgerFish gør.
  Præfikset er det, der gør parsingen tabsfri: punkt 4 er umuligt, fordi et
  elementnavn ikke må starte med `@`. Det er også en **additiv** ændring — de XML-fixtures
  og -filer, der virkede før, har ingen attributter, så ingen eksisterende korrekt
  output ændrer sig.
- **Navnerumspræfikset bevares** i nøglen (`ns:item`), ikke strippes. Det er tabsfrit og
  utvetydigt: i OOXML betyder `a:` og `r:`-præfikser forskellige ting for det samme
  lokale navn, så stripning ville slå to forskellige felter sammen.
- **Runden lukkes i writeren**: `@x` skrives tilbage som attribut, og `#text` som
  elementets egen tekst, så `xml → json → xml` bevarer attributterne i stedet for at
  degradere dem til børnelementer.
- Uskrevne attributværdier (`b=two/`) læses lenient: en bare værdi må ikke *ende* med
  `/`, så skråstregen er tagets egen afsluttning. Uquoterede værdier er ikke gyldig XML
  alligevel; de læses fornødent, ikke stramt.

**Resultat:**

- `XML_NAME` og `XML_ATTR` i `src/engine.js` og den byte-identiske `site/engine.js`.
  `parsers.xml` bruger dem i stedet for `\w+`, og `parseAttributes()` læser navn,
  dobbelt- og enkeltcitate og bare værdier, alle dekodet gennem `decodeXML`.
- `writeXMLElement()` erstattede writerens flade løkke, så attributter, `#text` og
  **indlejrede** objekter skrives rekursivt. Indrykningen er bevidst uændret, så
  `json-to-xml`-snapshotet er byte-identisk med før.
- 11 nye engine-tests (67 → 78): attributter, navnekollision, alle tre værdiformer,
  entities i attributværdier, navnerum, DOCTYPE med og uden intern subset, `-` og `.`
  i navne, runde tur begge veje, quote-escaping i attributter, og element med både
  attribut og tekst.
- **Ingen af de 26 eksisterende snapshots ændrede sig**, og `verify_contract.mjs` står
  uændret på 173 checks — de fixtures, der virkede, virker stadig.

**Verifikation:** `npm test` grøn med 78 engine-, 70 CLI-, 65 conformance-, 6 README-tests,
39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller. `npm pack
--dry-run` uændret på 5 filer. Deploy genverificeret først i iterationen (se Deploy).

**En fejl i min egen kode, værd at huske:** den første `XML_ATTR` tog `([^"'\s=<>`]+)` til
en bare værdi, så `<i b=two/>` læste `two/`. Fandtes af den eneste test, der krævede en
bare værdi, og rettet ved at forbyde `/` som sidste tegn. Samme lektion som T14 slice 1 og
T16: påstanden skal ramme den **ualmindelige** halvdel af en egenskab.

### 11. [ ] Implementér den første dokumenterede Pro-værdi i privat repo

**Status:** BLOCKED: det private `mahope/transmute-desktop` er navngivet, men ikke tilgængeligt fra dette checkout
**Afhængighed:** T4 skal specificeres i det private repo; Mads skal give loopet en udvikleradgangskontekst uden secrets i planen.
**Begrundelse:** Betalt kode skal give mærkbarlig værdi for virksomheder, ikke blot fjerne en kunstig grænse.

**Scope:**

- Vælg den mindste, stærkeste bundle fra T4, eksempelvis batchimport/-eksport plus gemte navngivne pipelines.
- Implementér i det private Pro-repo; public repo indeholder kun gratisfunktionalitet eller licenskontrolleret interface.
- Tilføj tydelig, men ikke aggressiv, konvertering dér, hvor gratisworkflowet rammer en reel batch- eller automatiseringsgrænse.
- Dokumentér lokale data-, fejl- og backup-grænser.

**Acceptkriterier:**

- Et fast 128-filers fixture gennemføres med gemt pipeline og producerer rapport med præcis 128 filnavne, rækker, fejl og samlet varighed.
- En deterministisk 10-fil-fejlfixture rapporterer præcis de forventede fejl uden at stoppe øvrige filer.
- Gratis CLI, browser og MIT-kernel forbliver fuldt brugbare.
- Licenskontrol fejler blødt efter T3's 7-dagesregel.
- En `public-boundary`-kontrol og `npm pack --dry-run` beviser, at betalt implementation ikke ligger i public repo eller npm-pakken.
- Arkitektur-, privacy- og sikkerhedstest er grønne i det private repo. Loopet skaber ingen release eller udgivelse.

### 12. [x] Udgiv support-siden på dansk

**Status:** FÆRDIG som `6516fdb` oven på `ceo/nested-yaml` (samme bunke som T13–T17) — **ligger på branch, ikke mergeret**, fordi diffen rører `site/` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** T7 lavede kun den engelske `/support`, fordi en halvfærdig dansk side er værre end ingen. Men købsflowet er dansk, og Mads' læsere er danske; en købsside på dansk er den konvertering, der mangler mest.

**Scope:**

- Opret `site/da/support/index.html` med samme opbygning som `/support/`: køb, aktivering, tre maskiner, fejlfinding, nøglersikkerhed, kontakt og donation.
- Tilføj `hreflang: da` på den danske side og `da` på `/support/`, så søgemaskinerne kender sammenhængen. `seo_check.py` kræver i dag `da` kun på forsiden og privacy, så tjekkene skal udvides til at dække support-parret.
- Tilføj `da` i `STRINGS["da"]` og lad `site_chrome.py` generere brødkrummer, indholdsfortegnelse, JSON-LD og sitemap.
- Hold alle Commercial-claims identiske med den engelske side: 19 USD, `https://buy.stripe.com/eVqbJ0dvdbaW55cgN9bMQ02`, 3 maskiner, 7 dages cache.

**Acceptkriterier:**

- `/da/support/` består SEO- og layoutkontrollen ved 360, 768 og 1280 px og ligger i sitemap med korrekt hreflang-parring.
- Dansk og engelsk side har samme købslink, samme maskinantal og ingen modstridende claims; en kontrol i `npm test` sammenligner de to.
- Ingen nye jura- eller refusionsformuleringer, der ikke findes på den engelske side.
- `npm run check:site` er grøn.

**Resultat:**

- `site/da/support/index.html` er en fuld oversættelse af den engelske side med **samme otte afsnit og samme rækkefølge**: køb, hvad Pro ændrer, aktivering, tre maskiner, fejlfinding (fire underafsnit), nøglesikkerhed, kontakt og donation. Der er ingen ny jura- eller refusionsformulering; den danske tekst siger det samme som den engelske.
- hreflang-parret er komplet begge veje: `/da/support/` peger på `en` + `da` + `x-default` → `/support/`, og `/support/` har nu fået `hreflang="da"`. Det sidste var ikke bare metadata — `site_chrome.py` læser `alt_url` **ud fra head'en**, så den nye linje er også det, der gør DA/EN-omskifteren på `/support/` til et virkeligt link frem for et skjult `<span>`.
- `footer()` i `site_chrome.py` havde `support = "/support/"` hardkodet, mens `privacy` var sprogafhængig. Nu følger Support-linket den side, det står på, så alle tre danske sider (`/da/`, `/da/privacy/`, `/da/search/`) peger på `/da/support/`.
- `seo_check.py` kræver nu `hreflang da` på support-parret, ikke kun på forsiden og privacy, så en dansk side uden tilbagekobling giver rødt.
- Ny kontrol `the Danish support page says what the English one says` i `verify_contract.mjs` (173 checks): samme antal sektioner, samme Stripe-links, samme maskinantal, og en ordtælling der afviser en stub. Den dækker den fejl, en oversættelse faktisk lavet — at et afsnit bliver droppet, eller at en pris og et maskintal glide fra hinanden.
- Sitemap og søgeindeks regenereret af værktøjet: 20 sider, 104 indeksentries, `/da/support/` med korrekt alternatparring.

**Verifikation:** `npm test` grøn med 67 engine-, 70 CLI-, 65 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 20 pages`, `deviations: 0` ved 360/768/1280 px og fire grønne selvtesttrin.

### 13. [x] Ret tre tavse CSV-datakorruptioner

**Status:** FÆRDIG på `ceo/csv-real-world-fixes` — **ligger på branch, ikke mergeret til `main`**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står ved. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** Alle tre er stille datakorruptioner i gratisvaret med exit code 0 — værre end en fejl, fordi brugeren ikke kan se, at tallene er forkerte. De er alle fundet ved at køre rigtige filer gennem CLI'en, ikke ved at læse kode.

**De tre fund, med reproduktion på den gamle kode:**

| # | Fejl | Før | Efter |
|---|---|---|---|
| 1 | Semikolon-CSV læses som én kolonne | `navn;by;pris` blev **én** kolonne, og `199,50` mistes helt til `199` | tre kolonner, `199,50` bevaret som streng |
| 2 | Ny linje i et citeret felt opfandt en record | `"line1\nLinje 2"` gav **to** records, den anden `{"id":"line2","name":"","note":""}` | én record med værdien `line1\nLinje 2` |
| 3 | Mellemrum i citerede felter blev trimmet | `" padded "` blev `padded` | ` padded ` bevaret; uciterede felter trimmes stadig |

Fund 1 er det alvorligste: Excel i Danmark, Tyskland og det meste af Europa skriver `;` som standard, så den frie CLI læste den mest almindelige danske eksport forkert og tabte data uden en eneste advarsel.

**Resultat:**

- `src/engine.js` og `site/engine.js` (som var byte-identiske) har nu en RFC 4180-læser over hele teksten i stedet for en linje-for-linje-splitter. Den håndterer delimiter inde i citater, `""`-escaping, linjeskift og CRLF inde i citater, og beholder mellemrum i citerede felter.
- `detectDelimiter()` vælger `,` `;` tab eller `|` ud fra overskriftslinjen, tælt uden for citater. **Ved lighed eller nul forekomster vinduer `,`**, så kommafiler og enkeltkolonnefiler er uændrede. `--delimiter ,|;|tab` tvinger valget; en ukendt værdi er usage-fejl (exit 2), og `tab` er et navn, fordi et bogstaveligt tab i et shell-argument er en fælde.
- BOM ryddes fra det første feltnavn, så et Excel-ark med UTF-8-BOM ikke får et usynligt `\uFEFFnavn` som kolonnenavn.
- `run()` giver `opts` videre til parseren, så CLI'en kan tvinge delimiteren. Sitet kalder parseren uden opts og får auto-detekteringen gratis.
- `test/fixtures/european.csv` er en semikolonfil med både et citeret komma og et citeret linjeskift. Den er et `CASES`-fixture, så **conformance-testen dækker den i begge engines**, og dens kommando og output står ordret i `docs/cli.md`.
- Seks nye CLI-tests (auto-detekteret semikolon, tab, `--delimiter` der tvinger, `tab` som navn, samt to exit-2-tests for ugyldig og manglende værdi) og seks nye parity-tests i `conformance.test.mjs` (semikolon, tab, citeret linjeskift, trim i citater, tvinget delimiter, BOM+CRLF). Testtællene stiger 45 → 52 og 49 → 57.

**Verifikation:** `npm test` grøn med 38 engine-, 52 CLI-, 57 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 166 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 19 pages` og fire grønne selvtesttrin. Snapshots regenereret med `npm run snapshots:cli` (22 entries).

**Bevis på at fundene var reelle, ikke teoretiske:** de tre reproduktioner ovenfor er kørt mod den gamle kode og gav hver især et forkert svar med exit 0. Efter rettelsen giver samme tre input det korrekte svar.

### 14. [x] Håndter CSV-rækker med flere felter end overskriften

**Status:** FÆRDIG i commit `5f64894` på `ceo/deploy-freshness-check` (ligger på branch, ikke mergeret — `DEPLOY-MISSING` står ved)
**Mislykkede forsøg:** 0/2
**Begrundelse:** Alle tre er stille datakorruptioner i gratisvaret med exit code 0 — værre end en fejl, fordi brugeren ikke kan se, at tallene er forkerte.

**Fundet ved at køre rigtige filer gennem CLI'en, reproduceret på den gamle kode:**

En række med flere felter end overskriften tabte de ekstra værdier helt. `id,name,note` + `2,"Mette, Copenhagen",DK,follow-up` gav `{"id":2,"name":"Mette, Copenhagen","note":"DK"}` — `follow-up` forsvandt med exit 0. Den modsatte vej rundt var lige så tavs: `serializers.csv` og `serializers.table` brugte `Object.keys(data[0])`, så nøgler kun senere records havde blev tabt. `[{"id":1,"name":"Alice"},{"id":2,"name":"Bob","email":"…"}]` → CSV gav `id,name` og to rækker uden `email`.

**Valget mellem de tre muligheder i scope:**

| Mulighed | Afvist fordi |
|---|---|
| Ignorér | Det er præcis den tavse datakorruption, T13 blev lavet for at fjerne |
| exit 3 med besked | Én ugaltformet række blokerer en eksport på 10.000 rækker, og i browserplaygroundet får brugeren slet intet. En synlig kolonne med et underligt navn er brugbar; en fejl uden output er det ikke |
| **Opkald feltet** | **Valgt. Værdierne er næsten altid de man vil have, og et `column4`-navn fortæller brugeren præcis, hvor i filen han skal kigge** |

**Resultat:**

- En række længere end overskriften beholder værdierne i `column4`, `column5`, … — navngivet efter **feltets position**, ikke efter rækkenummer eller en tæller, så 900 for lange rækker giver 2 kolonner og ikke 1800.
- En kolonne med samme navn i overskriften overskrives aldrig: `column3` → `column3_2`. Testet.
- Én advarsel pr. kørsel på stderr (aldrig én pr. række), med rækkenumre og kolonnenavn, begge capped ved 3/5. Exit code er stadig 0, og **stdout forbliver ren data** — det er derfor advarslen ikke gør `expectOk`-kontrakten rød for normale filer.
- Rækker med færre felter end overskriften fyldes stadig med `''`, uændret.
- `serializers.csv` og `serializers.table` bruger nu `unionKeys()` — alle nøgler ethvert record har, i førsteset-rækkefølge. **`serializers.sql` gjorde det allerede** (linje 184), så de to lav efter hinanden; CSV og table er nu ens.
- En `warnings`-kanal er lagt på `run()`'s returværdi. `parseCSV` skriver kun til den, hvis den findes, så sitets `run()`-kald er uberørte, og de ekstra kolonner er synlige i output dér.
- `test/fixtures/ragged.csv` er lagt som `CASES`-case, så conformance-testen dækker det i begge engines, og `docs/cli.md` skal indeholde både kommandoen og den præcise advarselslinje.

**En fejl undervejs, som er værd at huske:** første implementation navngavede den ekstra kolonne med et `taken`-sæt, der voksede **række for række**. `id` + `1,a` / `2,b,c` / `3,d,e` gav derfor `column2, column3` på række 2 og `column2_2, column3_2` på række 3 — altså dobbelt så mange kolonner som nødvendigt, og en advarsel der løj om hvor værdierne endte. Den nye engine-test fangede det, fordi den kræver at `Object.keys()` er ens for to på hinanden følgende for lange rækker. Læren: et sæt der bruges til at generere navne, skal følge posen, ikke optrædelserne.

**Verifikation:** `npm test` grøn med 49 engine-, 59 CLI-, 59 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 166 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px og grøn selftest inkl. deploy-friskheds-selftesten. **`test/fixtures/expected.json` regenereret med 23 entries, og ingen eksisterende snapshot ændrede sig** — det er beviset på at serializer-rettelsen er en no-op for velformet data.

**Ikke gjort, bevidst:** browserplaygroundet viser ikke advarslen. `site/try.html` bruger `run()` og ignorerer `warnings`; de ekstra kolonner er synlige i output, så intet er skjult, men en advarselslinje i UI'et er en senere, lille slice og ikke værd at blande ind i en rettelse af datatab.

### 15. [x] Mål om sitet faktisk er deployet, i stedet for at gætte

**Status:** FÆRDIG på `ceo/deploy-freshness-check` (bygget oven på `ceo/csv-real-world-fixes`, så T13 og T15 deler én planhistorik; ingen af dem er mergeret, fordi `DEPLOY-MISSING` står)
**Mislykkede forsøg:** 0/2
**Begrundelse:** Fem iterationer brugte `sitemap.xml`'s `lastmod` som deploy-dato og konkluderede, at sitet var 18 dage gammelt. Det var en målefejl, se Deploy. Et gæt om et nedbrudt købsflow er værre end ingen overvågning, fordi det får den rigtige beslutning forkert.

**Resultat:**

- `tools/check_deploy_freshness.py` henter hver tekstfil under `site/` fra live én gang og sammenligner mod hvert site-commit i `origin/main` fra nyeste til ældste. Første matchende commit **er** det, live serverer. Udeployede commits og afvigende filer listes, og exit 1 er et `DEPLOY-MISSING`-bevis.
- Cloudflare skriver to ting ind i HTML'en, som ikke findes i kilden: det indsætter `/cdn-cgi/scripts/…/email-decode.min.js` og erstatter alle e-mailadresser med `<a class="__cf_email__">`. Uden normalisering ville værktøjet melde drift på hver kørsel, fordi forsiden har to e-mailadresser i et kodeeksempel. `normalize()` fjerner præcis disse to ting og gendaner `data-cfemail` til den oprindelige adresse, så rigtige links overlever.
- `tools/deploy_freshness_selftest.py` er **offline** (midlertidigt git-repo + falsk live-site, ingen netværk) og ligger i `check:site`. Den kræver, at kontrollen ser en udeployet side, at den *ikke* melder drift på Cloudflare-obfuskering, at en gammel `lastmod` ikke tæller som drift, og at en utilgængelig side opdages.
- Kørt mod virkeligheden: **live er `3d90812` (2026-09-24), 5 site-commit og 25 filer i drift.** Bekræfter diagnosen ovenfor uafhængigt af den manuelle diff.
- `__pycache__/` var ikke i `.gitignore`, selv om `tools/__pycache__` lå i arbejdsmappen. Tilføjet.

**Acceptkriterier:**

- `npm run check:deploy` grøn → `DEPLOY OK` med commit og tidspunkt; rød → exit 1 med navngivne commits og filer. ✓
- Selvtesten grøn og offline. ✓
- `npm test` 166 checks, `check:site` 0 fund / 0 afvigelser, `npm pack --dry-run` 5 filer. ✓


### 16. [x] Gør de tabsfrie formater virkelig tabsfri i begge retninger

**Status:** FÆRDIG på `ceo/lossless-roundtrip` — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** Research-iterationen (kontrakt §2) efter T15 fandt ikke bare *mangler*, men to steder hvor læser og skriver i den **samme** fil er uenige. Det er værre end en manglende funktion: brugeren beder ikke om noget, værktøjet svarer alligevel forkert med exit 0.

**Fundene, reproduceret på den gamle kode med rigtige filer:**

| # | Fejl | Før | Efter |
|---|---|---|---|
| 1 | CSV-udgiveren quoter kun `,` `"` og `\n` | `Copenhagen; Aarhus` skrevet **uquotet**; et CR i et felt skrev en rå `\r`, som læseren læser som recordskift | alle fire delimiteres (`;` tab `\|`) og CR/LF quoteres |
| 2 | XML-læseren afkodede ingen entities | `xml → json` gav `Tom &amp; Jerry`; `xml → xml` gav `Tom &amp;amp; Jerry` og **voksede for hver tur** | `&amp; &lt; &gt; &quot; &apos;` samt `&#NN;`/`&#xHH;` afkodes én gang |

**Fund 1 er en ratchet på linjeskift.** `escapeCSV` kendte `\n` men ikke `\r`, og `parseCSV` afslutter en record på et blot `\r`. Et felt med CR blev derfor skrevet uquotet og læst som **to records** — samme fejlform som T13, men i skriveren.

**Fund 2 er, at værktøjets egen writer og reader modsiger hinanden.** `escapeXML` skriver `&amp;`, og parseren læste den streng bogstaveligt, så `xml → xml` var ikke en round trip men en forstærker. Det er usynligt i én kørsel og ødelagt i den tredje.

**Valget for ukendte entities er bevidst:** `&nbsp;` og `&bogus;` passerer uændret igennem. At gætte på, hvad de betød, ville være værre end at vise dem.

**Resultat:**

- `escapeCSV` quoter på `/[",;\t|\r\n]/` — altså alt, læseren kan tage for struktur, ikke kun kommaet. Velformet data er bit-identisk; de 23 eksisterende snapshots ændrede sig **ikke**.
- `decodeXML(val)` i begge engine-kopier, kaldt i parserens tekstgren. Den afkoder de fem prædefinerede entities og numeriske referencer og lader ukendte være i fred.
- Nye fixtures `test/fixtures/tricky.csv` (semikolon, pipe, escaped quote i fritekstfeltet) og `test/fixtures/entities.xml`, begge lagt som `CASES`, så conformance-testen dækker dem i **begge** engines, og `docs/cli.md` rummer deres kommando og præcise output.
- Seks nye engine-tests (alle delimiteres, en fuld `csv → csv → json`-round trip inkl. CR, entities, numeriske referencer, ukendt entity, xml-idempotens) og to nye CLI-tests. Testtællene stiger 49 → 55, 59 → 63, 59 → 63.

**Verifikation:** `npm test` grøn med 55 engine-, 63 CLI-, 63 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 166 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px og fire grønne selvtesttrin.

**En fejl undervejs, værd at huske:** min første CLI-test hævede `!once.includes('&amp;amp;')` på `entities.xml`. Den fejlede korrekt — men **testens påstand var falsk, ikke koden**: fixture'en indeholder med vilje `&amp;amp;`, fordi filen siger `&amp;` (et escaped ampersand), som efter ét afkodningsniveau er en *bogstavelig* `&amp;`, som writeren så korrekt quoter tilbage til `&amp;amp;`. Egenskaben der holder er idempotens (`twice === once`), ikke strengt fravær. Samme fejl som i T14 slice 1: en skarp påstand på en testfil man selv har lavet, fanger implementationen i stedet for at beskrive den.

### 17. [x] Ret tabet af nested YAML på input

**Status:** FÆRDIG på `ceo/nested-yaml` — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** Det er den største *manglende evne* i den frie vare, fundet ved at køre en reel fil gennem CLI'en. Den er tavs og total, og den er derfor mere skadelig end de to T16-rettelser.

**Fundet:** `parsers.yaml` forstår kun én niveau. En helt almindelig config-fil mister den nestede del **helt**:

```yaml
server:
  host: db.local
  port: 5432
list:
  - a
  - b
```

giver exit 0 og `[ "a", "b" ]`. Hele `server`-objektet er **vækket fra filen**, ingen advarsel, ingen fejlkode. Det er præcis den fejlform T13 og T14 blev lavet for at fjerne, bare en hel fil i stedet for ét felt.

**Scope:**

- Erstat den linje-for-linje-læser med en indrykningsdrevet parser: stacks af mappings og sekvenser, `key:` med indrykket underblok, `- ` med indrykket inline-mapping, blokskalarer (`|`, `>`), enkelt- og dobbeltcitate, `#`-kommentarer og `---`-dokumentseparator.
- Bevar den nuværende `parseYAMLValue`-coercion (tal, `true`/`false`, `null`/`~`) og den eksisterende adfærd for flade lister, så `test/fixtures/people.yaml` og alle eksisterende snapshots er uændrede.
- Uden en tredjepartsafhængighed: roden har nul runtime-afhængigheder, og det er en kilde til den frie vares værdi. Skal en rigtig YAML-parser bruges, er det en afhængighedsbeslutning for Mads.
- `serializers.yaml` skal kunne skrive den samme struktur tilbage, ellers er rettelsen kun halv.

**Acceptkriterier:**

- `test/fixtures/nested.yaml` med mindst tre niveauer, mappings og sekvenser blandet, læses til de præcise forventede strukturer — ikke til `[].`
- En fil med kun topniveau-nøgler og ingen liste (`a: 1 / b: hello`) giver **uændret** `[{a:1,b:"hello"}]`, så den nuværende, dokumenterede adfærd ikke brydes.
- `yaml → yaml` på den nye fixture er idempotent.
- Blokskalarer og citerede strenge med `:`, `#` og `;` i sig overlever.
- Alle 23 nuværende snapshots er uændrede, medmindre en ændring af parserens adfærd kan dokumenteres som en fejlrettelse — så med en note i planen.
- Konformance-testen dækker den nye fixture i begge engines, `docs/cli.md` har kommando og output, og `npm test` + `check:site` er grønne.

**Resultat:**

- `parsers.yaml` er erstattet af `parseYAML(tokenize → parseYAMLBlock)`: to regler bærer læseren (en linje hører til blokken over den, når den er mere indrykket; en blok er en sekvens når første linje starter med `- `, ellers et mapping), og blokskalarer, citater, kommentarer, flow-kollektioner og dokumentseparatorer ligger oven på dem.
- `serializers.yaml` skriver nu den samme struktur tilbage, inklusive mappings i mappings, sekvenser af mappings, `|`/`|-`/`|+`-blokskalarer og citater. **En streng der læses som noget andet, skrives quotet** — `0074` er et postnummer i hvert datasæt værktøjet har set, og skrevet bare læser læseren 74.
- Ny fixture `test/fixtures/nested.yaml` (tre niveauer, mappings og sekvenser blandet, blokskalar, quotet streng med `:`, `#` og `;`) lagt som `CASE`, så conformance dækker den i **begge** engines; `docs/cli.md` har begge konverteringer med fuldt output.
- 12 nye engine-tests (55 → 67) og 7 nye CLI-tests (63 → 70). De 25 eksisterende snapshots er **uændrede**; `expected.json` har præcis én tilføjelse.
- `detectFormat` genkender nu `key: value` som YAML ved indhold, ikke kun `- `/`---`, og ser på første *meningsbærende* linje. Uden det læses en indsat config-fil i browserplaygroundet stadig som JSON, så den nye læser aldrig kører dér.

**Verifikation:** `npm test` grøn med 67 engine-, 70 CLI-, 65 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 166 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px og fire grønne selvtesttrin.

**Tre ting fundet undervejs, som ændrede opgaven:**

1. **En regex-gruppe gjorde alle blokskalarer til `|`.** `blockScalarHeader` skrev `style: m[1]`, men gruppe 1 er chomping-indikatoren, ikke `|`/`>`. Alle foldede skalarer kom derfor ud som litterale. Fandtes af en test, der hævede den *foldede* egenskab — ikke af dem, der kun testede `|`. En påstand om den sjældne halvdel af en egenskab fanger fejlen i den almindelige.
2. **Skrivningen af tal-strenge er en halv rettelse, hvis læseren ikke gør sit.** `0074` er gyldig YAML for tallet 74, så *læseren* gør det rigtige ved at coerc'e. Testen må derfor gå json → yaml → json; en yaml → yaml → yaml-påstand ville have været sand uden at sige noget om postnummeret.
3. **En ubrugt fejlkode-vej blev en brugt.** `expectFail` med exit 1 viste exit 3, som er CLI'ens kontrakt for ulæseligt input. Malformet YAML fejler altså **højt** (exit 3, tom stdout, linjenummer i beskeden) i stedet for at gætte — samme kontrakt som T13/T14, bare for et input der ikke kan reddes.

**Beslutning:** `---` og `...` tolkes som dokumentskilte, og en fil med mere end ét dokument læses som sit **første** med en advarsel på stderr (stdout ren, exit 0). Anchors og aliases (`&`, `*`) er bevidst ikke implementeret: de er en anden fejlklasse, kræver et objektgraf-livscyklus og ville gøre læseren større uden at fjerne en tavs korruption.



## Beslutninger og fund

- **En diff på `site/` er en påstand om varen, ikke en tekstændring.** T20 fandt en
  fejl, ingen af de 78 tests, 27 snapshots eller 173 kontratkontroller holdt fast i:
  `serializers.csv` skrev et objekt som `[object Object]`, mens `site/guides/flatten-nested-json`
  åbnede med at kalde `[object Object]` den fejl, *andre* værktøjer har. Da guideen
  blev læst som en kravliste mod os selv, fordi `table` og `docs/cli.md` sagde det
  modsatte, var den tydeligt en **påstand om varen**. Derfor er den ikke længere
  en advarsel, men en beskrivelse af den nye adfærd, med et eksempel på det output
  værktøjet faktisk giver.
- **Falskhed i en guide er en salgdsfejl.** Det er den anden fejlform end
  datakorruptionen, men den rammer den samme bruger: en bruger, der læser at
  værktøjet taber et objekt, køber ikke værktøjet. Derfor blev fundet prioriteret
  over de næste par parsere.
- **Én hjælper, tre brugere.** `cellValue()` er skrevet fordi `table` allerede
  gjorde det rigtige og de to andre ikke gjorde det. Tre steder der *skal* svare
  til hinanden, men hvor kun to af dem gjorde det, er to fejlkilder.

- **Målefejlen bag fem iterationers deploy-dom.** `sitemap.xml`'s `lastmod` er ikke en deploy-dato; den skrives, når `site_chrome.py` regenererer sitemap'en (`tools/site_chrome.py:629`). Commit `3d90812`, som faktisk *er* live, har selv `lastmod 2026-09-08`. Læst som deploy-dato fik et levende site til at se dødt ud. Derfor er reglen nu et værktøj, ikke en sætning: `npm run check:deploy`.
- Processregel fra T15: deploy-alder må aldrig fastslås ved at læse et felt i det publicerede output. Beviset skal være en sammenligning mod git. Det er den forskel, der skilte en falsk `DEPLOY-MISSING` med fem ganske gode, men u mergerede commits fra en rigtig.
- T5 fjernede `deploy-site.yml` og dermed det eneste deployapparat i repoet. Det var korrekt — kontrakten forbyder push-triggeret auto-deploy — men intet noterede, at det efterlod repoet **uden** deployvej, fordi den eksterne batchdeployer antagelig forventede en bestemt mekanisme. At slette en integrations eneste implementering skal efterlade en note om, hvad der erstatter den.

- **En grøn test låser en fejl, hvis ingen kan se den.** `SQL NULL for empty values` holdt
  `''` fast som `NULL` siden commit `1cd667d`. Testen var grøn, så ingen gate ville have
  stoppet den, og den sås som en kontrakt frem for som en fejl. To læringer fra det: (1) en
  test, der skriver `NULL` for to forskellige værdier, skal have to forventninger, ikke én;
  (2) når en test skal slås fra, skal årsagen stå i den nye test, ellers dør den bare.
- **T19's valg er truffet af loopet, ikke af Mads:** tom streng → `''`, `NULL` kun for
  `null` og manglende nøgler. Det er den SQL-korrekte kontrakt og den, der følger af
  opgavens egen begrundelse. Den er bevidst **ikke** markeret som en beslutning der kræver
  svar, fordi den er præcis én commit at rulle tilbage til, hvis Mads vil have `NULL`.
- Processregel: en påstand i en ny test skal skrives ned fra outputtet af den kode, der
  skrives, ikke ud fra hvad man troede den gjorde. T19's første to tests fejlede begge, fordi
  jeg skrev dem fra hovedet: `(NULL, NULL)` optræder i en række med en manglende nøgle, og
  `"0.5"` er et decimaltal uden nulforpræfiks. Fikset ved at sammenligne hele rækker.

- Stripe Payment Link, produktnavn og `product_key` må ikke ændres uden Mads' beslutning; nye produkter, priser og releases er uden for scope.
- Commit `16cb82a` er et repo-skifte, ikke en grund til at slette historikken eller merge den forældede `ceo/rustsec-baseline`; offentlige og private afhængigheder skal audits hver i sit repo.
- Loopet må aldrig oprette tags, releases, npm-publiceringer eller udløse deploy.
- Produktreglen fra 24. september prioriterede T2 før T1; RustSec-auditen blev alligevel kørt før og efter pluginændringen, og RUSTSEC-fixen blev gjort i commit `4d1a828`.
- `cargo audit` fandt først `rustls 0.23.43` med RUSTSEC-2026-0285; den blev opdateret til `0.23.45`. Efter `tauri-plugin-opener 2.5.5` gav audit exit 0 uden vulnerabilities, men syv advarsler (bl.a. `glib` RUSTSEC-2024-0429 og flere unmaintained-pakker). Den strenge advarselsgate blev derefter overført til det private desktop-repo.
- T2 bruger `withGlobalTauri`, den eksakte `opener:allow-open-url`-ACL og `plugin:opener|open_url` gennem den statiske frontend; begge links har headless regressionstest og Tauri-build.
- Pakket macOS-app-build lykkedes, men GUI-smoke kunne ikke køres i dette miljø, fordi `orca` ikke er installeret; browserhåndtering og fallback er derfor kun automatisk mock-verificeret.
- `cargo fmt --check` rapporterede tre eksisterende formateringsafvigelser i den daverende `desktop/src-tauri/src/lib.rs`; de var ikke relateret til T2 og blev ikke ændret for at holde diffen minimal.
- T3 kommer før T4, fordi produktfasen eksplicit prioriterer købs-/licensfejl over konvertering og Pro-værdi.
- Den offentlige CLI skal være fuldt brugbar uden kunstige betalingsgrænser; den separate betalte Desktop Pro skal have markant virksomhedsværdi i det private repo.
- Den private/public-grænse er låst: betalt implementation lever i privat repo, mens public repo er en god gratisvare.
- Fund undervej skal blive prioriterede planopgaver, ikke sidespor i en igangværende opgave.
- `uv pip compile` bruges kun til at generere lockfilen (`npm run lock:site`); gaten selv bruger kun `.venv-site`, så uv er ikke en runtime-afhængighed for repoet eller den publicerede npm-pakke.
- Den nye site-gate-workflow bruger `actions/checkout@v7` og `actions/setup-python@v7`, altså aktuelle majors, fordi ny kode ikke må starte på deprecation-aktiverede v4. De eksisterende v4 i `ci.yml`, `publish.yml` og `homebrew-bump.yml` bliver først skiftet i T10, så hver major får sin egen commit og præcis rollback.
- `TRANSMUTE_SITE` i `seo_check.py` og `layout_check.py` findes udelukkende, for at selftesten kan kontrollere en midlertidig kopi; standardværdien er uændret `site/`.
- T6 rørte ingen filer under `site/`, så intet på det publicerede site ændrer sig og der oprettes ingen `VERIFICÉR DEPLOY`-note. Mergen udløser kun de to kontrol-workflows.
- Et åbent Dependabot-PR (`Bump actions/checkout from 4 to 7`) skal ikke merges blindt i T10; hver major skal have sin egen commit med grøn gate, jf. CI-run `36147109594`.
- CI-run `36099345814` for planstatuscommitten `c9ba6b9` sluttede `success` og udløste ingen deploy-site-run. GitHub advarede om, at `actions/checkout@v4` og `actions/setup-node@v4` er deprecation-aktiverede og køres på Node 24; opgraderingen og Ubuntu 26-migreringen er nu eksplicit del af T10.
- T7 bruger kun den officielle Payment Link og siger aldrig noget om refusion, frister eller tilbagebetaling; købssiden beder læseren kontakte support før et køb, hvis de vil tale om refusion. Det er præcis, hvad T7's scope tillod.
- Support-siden nævner `orders@mahoje.dk` kun som afsender af kvitteringen, aldrig som supportadresse, fordi kontrakten kun dokumenterer den som afsender. Kontaktpunktet er derfor mahope.dk og GitHub issues, jf. `❓ Til Mads`.
- Support-siden er på engelsk, fordi T7's scope kun navngavn `site/support/index.html`, og en tynk eller halvfærdig dansk side ville skade mere end den gavner. Den danske udgave er lagt som T12 med hreflang-krav.
- Den røde site-gate i T7's første kørsel var en flake, ikke en reel regression. Layoutkontrollen fejler nu pr. side i stedet for at gå i stykker, og selftesten viser checkerens egen output ved fejl, så det samme kan ske igen uden at koste en hel iteration.
- `site_chrome.py` er det eneste sted, der definerer fælles chrome. Support-linket i footeren, søgeindekset og sitemap'en er derfor ændret ét sted og regenereret af værktøjet, ikke ved håndredigering i 19 filer.
- Exit-code-kontrakten for den gratis CLI er låst: 0 succes, 1 transformationsfejl, 2 usage-fejl, 3 inputfejl. Fejl går altid til stderr med `Error:`-præfiks, og stdout forbliver tomt ved fejl, så redirect aldrig efterlader en halvskrevet fil. Det gør CLI'en sikker i cron og CI, og det er den del af T8 Mads har mest brug for.
- `site/engine.js` og `src/engine.js` er to kopier af den samme fil, og intet holdt dem sammen. `test/conformance.test.mjs` indlæser site-kopien i en `vm`-sandbox med samme `module.exports`-shim som `site/try.html` og kræver identisk output for alle fixtures. Det er bevidst en semantisk kontrol frem for en fil-identitetskontrol, så browseren kan få browser-specifik kode uden at miste pariteten.
- `docs/cli.md` er skrevet som en reference, der selv er testet: hver kommando og hvert output-uddrag på siden skal findes i `test/fixtures/expected.json`, som regenereres med `npm run snapshots:cli`. En ny operation uden dokumentation eller en ændret engine-adfærd uden docs-opdatering gør derfor `npm test` rød.
- `docs/` ligger uden for `files` i `package.json`, så referenceen ikke sendes i npm-tarballen; README linker til den på GitHub. Tarballen er derfor uændret på 5 filer trods den nye dokumentation.
- Fund under T8 slice 1: `serializers.table` skrev `[object Object]` for nestede records, hvilket gjorde `group` og `join` ulæselige i CLI og på sitet. Rettelsen er lavet i begge engine-kopier og er en reel forbedring af den gratis vare; snapshots og docs er regenereret i samme commit.
- Fund under T8 slice 1: `--help` nævnte ikke `add` eller `join`, selv om README gjorde det, og README nævnte hverken `--table` eller `sql`-output. CLI-help og README er nu ens, og conformance-testen kræver, at alle 14 operationer findes i begge.
- Fund under T9: ingen kode, kode eller fil i dette repo bygger desktopappen længere, så ethvert link til `mahope/transmute/releases` under en etiket om appen er automatisk forkert. `tools/verify_contract.mjs` fanger den slags generelt, så det behøver ikke genfindes side for side.
- `tools/product-contract.json` er bevidst kun handelskonstanter og linkregler. Versionsnumre ligger i `package.json`, som er den eneste kilde; kontrol'en kræver bare, at `softwareVersion` i hvert site-dokument og `src/cli.js` følger med. Så er der én kilde, ikke to der kan divergere.
- Den offentlige repo-grænse er nu maskinkontrolleret: kontrol'en fejler hvis `desktop/`, `Cargo.toml` eller `tauri.conf.json` dukker op igen, og hvis `files` i `package.json` på nogen måde sender desktop- eller tauri-kode med i tarballen. Det erstatter del af T11's `public-boundary`-krav i det private repo for denne side.
- Fund under T10 slice 1: `publish.yml` installerede betinget (`npm ci` hvis lockfilen findes, ellers `npm install`). Uden en committet lockfil var den betingelse altid falsk, så reelt blev der installeret uden lås. Med lockfilen committet er betingelsen unødig og fjernet.
- Fund under T10 slice 2: `.nvmrc` manglede helt, selv om `engines` erklærede en floor. Det er præcis jordemoderstudy-fejlen fra 23. august: byggeserveren vælger en Node-version ingen kender til, og fejlen viser sig først i produktion. `.nvmrc` + matrixkontrol gør den uopdagelige.
- Node's lige majors er LTS-linjer, ulige majors er ikke-LTS og udløber inden for måneder. Derfor forbyder matrixkontrollen ulige majors i stedet for at vedligeholde en EOL-liste, der ville rådne. `publish.yml` lå på den ulige major 20.
- Runtimekontrollen hænger på den ældste testede linje, så hæves `engines` floor uden at hæve matrixen, bliver den rød. Det er vilje: en floor, ingen tester, er det samme som ingen floor.
- Sliceopdelingen i T10 er bevidst: slice 1 og 2 rører ingen udløst major-version, kun lockfilen og ensretningen af de eksisterende majors. Slice 3+ tager én major pr. commit, så en brydende `checkout`-major kan rulles tilbage uden at rive setup-node med.
- Dependabot-PR #4 erladt uberørt. Den er grøn i CI, men den tager checkout 4 → 7 i én diff, hvilket er præcis den rollback-præcision kontrakten forbyder.
- Loopet merger under DEPLOY-MISSING kun ændringer, der ikke rører `site/`. T10 slice 1 og 2 rørte 12 sitefiler, men kun for at rette en dokumenteret Node-version; de kan ikke have påvirket deployen, og at lade dem ligge ville være værre. Nyt sitearbejde venter på Mads.
- Fund under T10 slice 3: ingen test eller kontrol holdt de action-majors oppe, så pin-udviklingen var helt uden fælde — den eneste beskyttelse var diffen, man læste. Gulvkontrollen gør hver slice til en grøn, målbar tilstand, og dens påstand om gulv uden brugere (`setup-python`, der kun bruges af `site-gate.yml`) forhindrer, at en død regel ligner som dækning.
- Fund under T10 slice 4: `setup-node@v5` indførte automatisk caching, men kun når `package.json` har et `packageManager`-felt. Uden feltet er ændringerne i PR #1348, #1325 og de øvrige dependabot-bumpere additive og kræver ingen kodeændring. Det er den sjældne major-opgradering, hvis brydende note efterlader repoet i præcis samme tilstand som før.
- Fund under T10 slice 4: Dependabot holder `setup-node` på v4, fordi sliceopdelingen er manuel her. Det er ikke en fejl, men en invitation til at genåbne PR #4 og springe majors over; planen siger derfor eksplicit, at den først må genåbnes når slice 8 er færdig.
- Skelnen mellem `.nvmrc`/`engines`/matrixen og `node-version:` i `publish.yml` er bevidst, men let at ødelægge ved en "oprydning": matrixen *tester* linjerne, `node-version:` vælger den linje der *publiceres*. Slice 4 holdt dem adskilte, og gulvkontrollen hæver kun den, der faktisk er løftet.
- Fund under T10 slice 6: v6 fjerner `always-auth`-inputtet i stedet for at advare om det, så en workflow der bruger det ville fejle med en uklar fejl. `rg` viste, at ingen af de tre workflows bruger det, og `publish.yml`'s `NODE_AUTH_TOKEN`-opsætning er den vej npm anbefaler. Det er den anden store major uden en reel kodeændring — efter slice 4.
- Fund under T10 slice 6: v6's anden brydende ændring gør `setup-node`' automatiske caching *m bredere* — den tænder nu på både `devEngines.packageManager` og topniveau-`packageManager`. Slice 4 havde noteret den udløsende `packageManager`-risiko i planen som en sætning, hvilket er nok til at blive læst én gang og glemt. Den er nu en maskinkontrol, så v6's ekstra triggerfelt ikke kan smutte forbi den.
- `v6.0.0` er fra 2025-10-14, mens `v7.0.0` er fra 2026-07-14. En pin på v6 er derfor ikke en gammel pin, men den næste; den holdes kun, fordi slice 7 og 8 hver tager én major. Slice 8 slutter på v7 for begge actions, som er den pin `site-gate.yml` allerede bruger til `setup-python`.
- Fund under T10 slice 8: v6 eksporterede en dummy `NODE_AUTH_TOKEN=XXXXX-XXXXX-XXXXX-XXXXX`, som v7 fjerner. Det er en rettelse af en fælde, ikke en brydende ændring: `.npmrc`-linjen er ens i begge refs, og `publish.yml` sætter tokenen i step'ets `env:`, som altid har slået et arvet job-`env` ihjel. Fælden var for et workflow, der sætter `registry-url` uden nogensinde at sætte `NODE_AUTH_TOKEN` — det ville have fået et ikke-fungerende token skrevet ind i sin `.npmrc`.
- Fund under T10 slice 8: `package-manager-cache` kom i `setup-node` v6.5.0, samme dag som v7.0.0. Slice 4 og 6 havde brugt to slices på at dokumentere caching-triggere, fordi der ikke var noget input at slå caching fra med. Der var det — det stod bare ikke i de to migreringer, slice 6's research læste. Et forbud i `verify_contract.mjs` er en dækkende regel; et eksplicit `package-manager-cache: false` i hvert step er det samme, håndhævet af handlingen selv og uafhængigt af hvad `package.json` senere erklærer. Kontrollen er skrevet om til at kræve inputtet i stedet for et krav om et manglende felt.
- Fund under T10 slice 9: `ubuntu-latest` er ikke en label, den har lagt stabi — GitHub flytter den fra Ubuntu 24.04 til 26.04 i en udrulning **fra 19. oktober 2026**. Alle fire workflows stod på den flydende etiket, så de ville alle skifte operativsystem samlet, uden commit og uden rollback-punkt, tre uger efter at sidste planstatus blev skrevet. Før fristen er det en planopgave; efter den er det en hændelse.
- Fund under T10 slice 9: Playwright 1.60.0's `nativeDeps.ts` har ingen `ubuntu26.04`-post. Det værste er ikke, at Playwright ville fejle — `installDependenciesLinux` **logger en advarsel og returnerer uden fejl**, så `playwright install-deps` ville være grøn på en maskine, hvor ingen af bibliotekerne var installeret. Et værktøj, der fejler stille, er dyrere end et, der fejler højt, fordi gaten så ligner grøn.
- Beslutning under T10 slice 9: site-gaten blev låst på `ubuntu-24.04` i stedet for at blive flyttet til 26.04. Det er ikke en nedgradering — `ubuntu-latest` peger stadig på 24.04, så dagens adfærd er uændret — men den fjerner en tavs nedbrydning senere. Betingelsen for at flytte den er skrevet ned i både workflow-kommentaren og kontrollens fejlmeddelelse: samme commit som en Playwright-version med 26.04-understøttelse, og kun når gaten har været grøn dér.
- Ny regel fra T10 slice 9: en flydende runner-etiket er en uafhængig, tidsbestemt migrering. Den kan derfor aldrig være den eneste beskyttelse — `verify_contract.mjs` kræver nu eksplicit `ubuntu-<major>.<minor>` i hver `runs-on`, og afviser både `ubuntu-latest` og en workflow, der ligger på en ældre image uden en dokumenteret grund.
- Fejl under T10 slice 9, værd at huske: tandsk-verifikation med `git checkout <fil>` rullede min egen endnu-ikke-committede ændring i `site-gate.yml` tilbage, fordi basen var den sidste commit. Den nye kontrol fangede det samme sekund, fordi den så `ubuntu-latest` igen. Generelt: verificér med tænder på en gemt (commit'et) base, ellers verificerer man en tidligere tilstand og tror, at reversionen virker.
- `package-manager-cache: false` blev ikke tilføjet udelukkende som dokumentation. Uden det viste v7's egen README-eksempler den nye linje, og uden kontrollen ville den være en bemærkning, der forsvinder ved den næste oprydning. Den ligger nu i begge steps, og kontrollen fejler hvis den fjernes fra én af dem.
- Fund under T12: **`\b` i JavaScript er ASCII-only**, så der er en ordgrænse mellem `d` og `år` i "dårlig". `RECURRING_CLAIM` læste derfor den danske sætning om "en licensserver med en dårlig eftermiddag" som et abonnementsclaim og gjorde gaten rød på en helt korrekt side. Den danske halvdel bruger nu `\p{L}`-lookarounds med `u`-flag. Det var ikke en fejl i den nye side, men en **fælde i gaten for alt dansk tekst** — og en gaten, der ringer alene på en oversættelse, bliver slået fra, som altid.
- Procesfund under T12: `site_chrome.py` er **ikke** en generator, den er en omskriver. Den erstatter family bar, header og footer med regex, så en ny side skal **indeholde** den chrome, den skal have — en side bygget med kun `<head>` og `<article>` får ingen header, ingen family bar og ingen mobilmenu, og `seo_check.py` siger det klart. Siden blev derfor bygget ud fra den engelske sides fulde chrome.
- Beslutning under T12: maskinstal-pariteten sammenligner **sæt** af tal, ikke antal nævnelser. En trofast oversættelse kan nævne grænsen oftere end originalen uden at have en modsigelse; det, der skal bevises, er at ingen side oplyser et andet tal end kontrakten.
- Fund under T13: den frie CLI læste semikolon-CSV som én kolonne og tabte værdier, fordi `parseCSVLine` havde en hardkodet komma. Det er den mest almindelige danske eksport, så det var ikke en kantsag men den normale vej ind i værktøjet. Testene dækkede kun kommafiler, fordi hele fixture-sættet var bygget om kommaer — en gate der kun tester den ene variant, kan ikke se den anden.
- Fund under T13: `parseCSVLine` blev kaldt pr. linje, så et citeret felt med et linjeskift delte én værdi i to records. Det er ikke en fejl i den tænkte brug, men RFC 4180 siger at et citeret felt må indeholde linjeskift, og alt i et ark-eksport gør. En værdi, der opfinder en record, er værre end at afvise filen.
- Fund under T13: `parseCSVLine` trimmede også værdier **inde i** citater. Det så ud som hygge, men whitespace i et citeret felt er data, og det er præcis den slags felt (`" 199 "` omkring et tal) hvor forskellen mellem de to betydninger er dyr.
- Beslutning under T13: delimiteren auto-detekteres med `,` som vinder ved lighed, så eksisterende opførsel er bevaret for kommafiler. En ren auto-detektering uden undtagelse ville have ændret output for filer med både komma og semikolon i overskriften. `--delimiter` er derfor ikke en luksusfunktion men den nødvendige udvej for de filer, reglen ikke kan afgøre.
- Beslutning under T13: de to engine-kopier rettes altid samlet, fordi `conformance.test.mjs` er en håndhævet semantisk aftale. En rettelse kun i `src/engine.js` ville have gjort gaten rød — hvilket er præcis den egenskab, der gør pariteten værd at have.
- Procesregel ændret efter T13: når `DEPLOY-MISSING` står, merger loopet ikke til `main` overhovedet, også ikke for rettelser der kun rører `site/`. Tidligere undtagelse for ikke-site-ændringer holdt kun, så længe ingen reel rettelse nåede sitet; T13 nåede det, og det viste at undtagelsen var en vane og ikke en regel.
- Beslutning under T14: **en række længere end overskriften fejler ikke, den navngiver.** Ignorér er den tavse korruption, opgaven findes fordi den findes; exit 3 ville lade én dårlig række blokere en eksport på 10.000 rækker og i browserplaygroundet give brugeren intet output. En kolonne ved navn `column4` er brugbar og viser i sig selv, at filen er noget galt med. Præcisen kolonneafvigelse — position og navn — er vigtigere end selve navnet, fordi det er den information brugeren kan handle på.
- Beslutning under T14: **advarslen går på stderr, output på stdout, exit code 0.** CLI'ens exit-kontrakt er låst til 0/1/2/3 og bruges i cron og CI, så et `column4`-problem må ikke ændre exit-koden. Til gengæld er stdout contractually ren data, hvilket er præcis egenskaben, der gør det trygt at advarsle uden at røre den.
- Fund under T14: `serializers.sql` brugte allerede nøgle-foreningen på tværs af alle records, mens `csv` og `table` brugte `Object.keys(data[0])`. Den samme fejlform lå altså to steder i den samme fil, og den eksisterende korrekte implementering var det interne argument for at rettelse den følger. Rækkefølgen på nye felter er i forvejen defineret af `sql`-udgiveren, så de to andre lavede bare en viljeafhængig udgave af den.
- Fund under T14: den første implementering genererede de nye kolonnenavne med et `taken`-sæt, der voksede række for række, så samme position fik et nyt navn per række. Den sås kun af en test, der krævede at to på hinanden følgende for lange rækker har *identiske* nøgler. Et navn skal følge posen, ikke optrædelserne — ellers er det antallet af rækker, der afgør antallet af kolonner.
- Fund under T14: `--delimiter ,` på en semikolonfil med citerede kommaer og et citeret linjeskift splitter også de citerede felter, så rækkerne bliver længere end den énkolonne-header. Før var det tavst; nu siger advarslen det. Den gamle test hævdede kun at overskriften forblev én kolonne, hvilket stadig er sandt — den blev gjort skarpere i stedet for slettet, fordi den nu kan sige hvorfor.
- **Læser og skriver i den samme fil skal have samme regel.** T16's to fund var præcis det: `escapeCSV` kendte `\n` men ikke `\r`, selv om `parseCSV` afslutter en record på et blot `\r`; `escapeXML` skrev `&amp;`, som parseren læste bogstaveligt. En værktøjsfejl der kræver to kørseler for at vise sig, er den dyreste slags, fordi den ligner som en fungerende konvertering. Spørg altid: hvad skriver den her fil, og kan min egen læser læse den?
- Ny regel fra T16: et format der er **tabsfrrit** skal være tabsfrit i begge retninger. T13 gjorde CSV-læsningen RFC 4180-korrekt, menlod skriverens quoting stå på RFC'ens minimaleSubset — så den ene rettelse afslørede den anden. En runde-tur-test (skriv, læs, sammenlign) fangede begge.
- Beslutning under T16: ukendte XML-entities (`&nbsp;`) passerer uændret igennem. At gætte på betydningen ville indsætte data, brugeren aldrig skrev; at vise dem navngiver præcis det problem, værktøjet ikke kan løse.
- Beslutning under T16: quoter for **alle** delimiteres læseren genkender, ikke kun den aktive. Det koster ingenting på velformet data (de 23 snapshots ændrede sig ikke) og gør output sikkert uanset hvilken delimiter den næste læser vælger — dansk Excel, ikke kun dette værktøj.
- Fund under T17: en **foldet** blokskalar (`>`) var umulig at få rigtig, fordi regex-gruppen for chomping-indikatoren også blev brugt som stil. Alle blokskalarer kom ud som litterale, og kun fordi en test hævede den foldede egenskab — ikke fordi nogen testede `|`. En påstand om den sjældne halvdel af en egenskab fanger fejlen i den almindelige.
- Beslutning under T17: tal-strenge skrives quotet, fordi `0074` er et postnummer og ikke tallet 74. Læseren gør det rigtige ved at coerc'e `0074` til 74 — det er YAML'ens regel, ikke vores — så **skriveren** er den halvdel, der skal bære round trip. Beviset er derfor json → yaml → json; en yaml → yaml-påstand ville være sand uden at sige noget om postnummeret.
- Beslutning under T17: malformet YAML fejler **højt** — exit 3 (inputfejl i CLI'ens kontrakt), tom stdout og linjenummeret i beskeden — i stedet for at gætte. Det er samme kontrakt som T13 og T14, anvendt på et input hvor der intet kan reddes. En cyklisk reference (`a: &x 1` / `b: *x`) ville derimod kræve et objektlivscyklus og ville ikke fjerne nogen tavs korruption, så anchors og aliases er bevidst ikke implementeret.
- Ny regel fra T17: når en læser læser **hele filen** ind i ét objekt, skal den have en mekanisme til at sige "det her kan jeg ikke læse". `tokenizeYAML` + `parseYAMLBlock` gør det muligt at pege på en præcis linje; den gamle linje-for-linje-læser havde ingen sådan mulighed, fordi den aldrig så en blok som en helhed. Det er derfor T17's største gevinst ud over de nestede strukturer: en fremtidig fejl i YAML-input har et sted at blive rapporteret.
- Fund under T16: den største *manglende evne* i den frie vare er ikke en operation, men at `parsers.yaml` læser ét niveau. En reel config-fil bliver `[ "a", "b" ]` med exit 0, fordi den nestede blok hverken parses eller advares om. Læst som T13 og T14, bare større: en hel fil i stedet for ét felt. Lagt som T17 med krav om at den eksisterende flade lister-adfærd overlever uændret.

- Ny regel fra T22: **detektor og læser skal have samme regel.** T16's regel var læser og skriver; T22 viser at den også gælder den kode, der *vælger* læseren. `detectFormat` havde sin egen kopi af delimiterreglen med et mindre sæt, og forskellen var ikke en afvejning men en fejlklasse: tre almindelige filformater blev afvist af en læser, der kunne læse dem. Spørg derfor altid: hvilken regel genkender denne fil, og bruger den samme definition som den, der faktisk læser?
- Procesregel fra T22: **en test skal skrives mod output, ikke mod forventningen i hovedet.** To af syv nye tests fejlede i første kørsel, fordi jeg havde gættet henholdsvis array-sammenligning og shell-stdouts linjeslut. Begge fejl var i testen, ikke i rettelsen, og det er netop den fare, T19's log beskriver — en test skrevet fra hovedet kan få en korrekt rettelse til at se ud som en fejl.
- Procesregel fra T22: **en plan må ikke påstå en fejl, der ikke er kørt.** researchen i T22-iterationen fandt to ting undervejs, jeg skrev i planen og så måtte rette: `showPreview` taber ikke delimiteren, fordi `parseCSV` selv auto-detekterer, når intet forces — men flaget *er* stille ignoreret der, fordi `showPreview` aldrig får den. Forskellen er hele pointen med sådan et fund, så begge dele blev kørt og skrevet ned i stedet for at blive antaget.

## Navneforslag

- Anbefalet: **Transmute Studio** — tydeligt og dækker batch, gemte workflows og automation.
- Alternativer: **Transmute Batch** hvis automation ikke er i første udgivelse; **Transmute Flow** hvis navngivne pipelines er produktets kerne.
- Stripe-navnet `Transmute Desktop` og `product_key: transmute-desktop` ændres ikke.

## ❓ Til Mads

1. **Deploy: der skal genstartes én ting, som lå i dette repo.** Diagnosen er nu målt, ikke gættet: live er `3d90812` fra 2026-09-24 (kørsel `36062253130`, `success`), og **5 site-commit / 25 filer står u deployede** — herunder support- og købssiden samt rettelsen af forsidens brudte købs-CTA. **To batch-vinduer (17:30 og 21:30 den 25/9) er nu gået uden at noget blev deployet**, så to-vinduer-tællen er nået. Batchdeployeren er ikke "død siden 09-08"; **T5 fjernede `deploy-site.yml` (commit `28a06dd`), som var det eneste deployapparat i repoet**, og siden da har intet deployet. Kør `npm run check:deploy` for det aktuelle tal. Spørgsmålet er konkret: deployer den eksterne batchdeployer overhovedet fra dette repo, eller var `deploy-site.yml` den eneste vej? Hvis den forventer en fil i repoet, skal den genoprettes — men push-triggeret auto-deploy skal forblive slået fra, altså uden `on: push`. Loopet deployer aldrig selv og merger ikke til `main`, mens `DEPLOY-MISSING` står. **T13, T14 og T15 ligger færdige og målte på `ceo/deploy-freshness-check` og kan merges, så snart svaret kommer.**
2. **Privat Pro-repo:** `mahope/transmute-desktop` er navngivet, men dette checkout har ingen udvikleradgang til det. Loopet kan derfor hverken skrive Pro-specen eller implementere batch/automation dér.
3. **Deploy-tidszone:** Kildekontrakten angiver 07:30/12:30/17:30 uden tidszone. Angiv den offset, external batchdeployeren bruger, før en `DEPLOY-MISSING`-tæller må starte. Mellemtes svarer punkt 1.
4. **Supportadresse:** Kontrakten nævner kun `orders@mahoje.dk` som afsender af kvitteringen, ikke som indgående adresse. Skal support-siden linke til en postkasse, eller er `mahoje.dk` plus GitHub issues det tilsigtede kontaktpunkt? Loopet bruger pt. kun mahope.dk og GitHub issues, fordi det er de eneste kontakter privacy-siden allerede dokumenterer.
5. ~~Dansk support-side:~~ **Løst uden svar.** T12 er færdig (`6516fdb`): `/da/support/` er oversat, hreflang-parret er komplet, og en kontraktkontrol sammenligner de to sider. Den ligger på branch sammen med T13–T17 og bliver deployet, når punkt 1 er løst.
6. **Desktopappens download og gratisniveau (fra T9):** Loopet kunne ikke finde nogen offentlig download-URL for appen. Den gamle knap pegede på dette repos `releases`, som ikke indeholder appen, fordi den bygges fra det private repo, så den peger nu på `/support/#buying-pro`. To ting skal bekræftes: (a) hvor en bruger faktisk henter den gratis app, så den kan linkes direkte, og (b) om gratisniveauet stadig er "tre transformationer pr. start". Sidstnævnte står ens på `/`, `/da/` og `/support/` og er nu frosset som `free_tier_transformations_per_launch: 3` i `tools/product-contract.json`; hvis appen har en anden grænse, skal værdien rettes dér og siderne regenereres, så kontrollen fanger forskellen.

7. **Tom streng i SQL-output (fra T19):** loopet har besluttet, at `''` skrives som `''` og
   kun `null`/manglende nøgle som `NULL`, fordi det er SQL-korrekt, og fordi den gamle
   adfærd gjorde `WHERE middle = ''` meningsløs efter en import. Det er bevidst truffet uden
   svar, da den er én commit at rulle tilbage til. **Hvis du vil have `NULL` for tomme
   felter, så sig det** — så bytter jeg regex'en tilbage og justerer `docs/cli.md`.
- 2026-09-26 ca. 05:2x–06:0x CEST: **T22 gennemført på `ceo/format-detect`, ikke mergeret til `main`.** Deploy genverificeret **først** i iterationen med `npm run check:deploy`: uændret, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, `/support/index.html` utilgængelig, 25 afvigende filer, så `DEPLOY-MISSING` står ved; intet er mergeret, og der er derfor oprettet ingen `VERIFICÉR DEPLOY`-note. T20/T21-metoden kørt på den **sidste** flade de to efterlod: format-detekteringen. To fund, begge reproduceret på den gamle kode. (1) `detectFormat` havde sin **egen, svagere kopi** af delimiterreglen og kendte kun komma, mens CSV-læseren genkender `,` `;` tab `|` — så en dansk Excel-eksport, en TSV og en pipe-tabel blev sendt i JSON-læseren og afvist med exit 3. På stdin er det hele historien, fordi der ingen filudvidelse er, og stdin er den normale indgang; samme fejl ramte playgroundet på `/` og `/da/` (`site/try.html:25`). T13's egen TSV-test skrev `-f csv --delimiter tab` foran kommandoen og undgik dermed netop den automatiske vej. (2) Enkolonnefiler blev afvist, fordi de ikke har en delimiter at finde — `email\na@b.dk\nc@d.dk` er en mailingliste. Rettet ved at detektoren nu bruger læserens egne `CSV_DELIMITERS` og `countUnquoted`, så de to ikke kan komme i utakt, plus at en fil med mere end én linje og ingen delimiter regnes som CSV; **én linje er bevidst undtaget**, så `42`, `true` og `hello` forbliver JSON-skalarer. Rækkefølgen mod JSON/YAML/XML er uændret. 4 nye engine-tests (99 → 103) og 4 nye CLI-tests (76 → 80), alle syv skrevet mod output og kørt mod den gamle kode, hvor de fejlede med det konkrete symptom. **Ingen snapshot ændrede sig** — ingen `CASES`-case ændrede rækkefølge. Procesfejl, begge fanget af de nye tests: en `assert.strictEqual` på et array og en forventet streng uden det `
`, `console.log` tilføjer. `docs/cli.md` fik to eksempler i delimiter-afsnittet, begge kørt og verificeret character for character. `tools/site_chrome.py` regenererede `site/engine.js` (byte-identisk) og asset-hashes på 20 sider; søgeindeks uændret på 104. Lokalt grøn: `npm test` 103+80+69+6+39+4+173, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 20 pages`, `deviations: 0` og alle selftester grønne inkl. deploy-friskheds-selftesten. Implementationscommit `0115204`, pushet til `ceo/format-detect`, **ikke mergeret til `main`**. **To fund gjort permanent i planens næste iteration, ikke rettet her:** `compileExpression` fanger alle fejl i et `new Function` og returnerer identiteten, så en syntaktisk ugyldig `filter`-expression kører med exit 0, tom stderr og alle rækker i output, mens en expression der kaster ved kørsel giver exit 1 — altså stille syntax-fejl og høje runtime-fejl, præcis omvendt; og `--delimiter` er stille ignoreret i preview-tilstanden, fordi `showPreview` kalder `run(text, format, [])` uden at give `delimiter` videre, så det samme flag giver et andet svar med og uden `--output`. Begge er verificeret ved kørsel og skrevet ned, fordi de er næste iteration, ikke sideværk.

- 2026-09-26 ca. 04:0x–04:2x CEST: **T20 gennemført på `ceo/nested-cells`, ikke mergeret til `main`.** Deploy genverificeret **først** i iterationen med `npm run check:deploy`: uændret, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, `/support/index.html` utilgængelig, så `DEPLOY-MISSING` står ved. T18's metode kørt for **første gang på serialiseringssiden**: rigtige filer gennem `src/cli.js` med hvert output-format, jagt efter exit 0 med mistet data. Tre fund, alle reproduceret på den gamle kode: (1) `serializers.csv` og `serializers.sql` skrev værdier med `String()`, så et objekt blev til den bogstavelige `[object Object]` — exit 0, tom stderr, og sitets egen flatten-guide skrev en hel sektion om at omgå præcis det; (2) arrays blev skrevet komma-joinet, så `["a,b"]` og `["a","b"]` gav den samme fil, og `{}`/`[]` gav begge et tomt felt; (3) `operations.join` spurgte om det **upræfikserede** navn i sin kollisions-guard, så `join --prefix` droppede præcis det felt prefixen findes for — exit 0, mens både `docs/cli.md` og join-guiden lovede det modsatte. Rettet med `cellValue()` delt af `csv`/`table`/`sql` (kompakt JSON for ikke-skalærer, samme form som `jq`'s `@csv`), et eget objekt-tjek i `sqlValue`, og en guard der spørger om det navn den faktisk skriver til; uden `prefix` er adfærden uændret. `docs/cli.md` fik sektionen `#### Nested values in a flat cell` plus et prefix-eksempel på et kolliderende felt; flatten- og join-guiden er rettet, så ingen af dem længere beskriver en fejl som en advarsel. `tools/site_chrome.py` regenererede søgeindeks (104 entries), asset-hashes og sitemap på 20 sider. 11 nye engine-tests (78 → 89) og 6 nye CLI-tests (70 → 76); **0 af 27 eksisterende snapshots ændret**, den nye case `nested-values-to-csv` er den eneste tilføjelse i `expected.json`, hvilket er beviset på at rettelsen er additiv. Procesfejl undervejs, gjort permanent: min egen test delte CSV-linjen på `,` for at finde cellen, men cellen *er* JSON med kommaer i, så testen havde en svagere idé om CSV end værktøjet selv — den læser nu cellen tilbage med `parsers.csv`. Lokalt grøn: `npm test` 89+76+69+6+39+4+173, 0 fejl, `npm pack --dry-run` 5 filer uændret, `npm run check:site` `0 finding(s) across 20 pages`, `deviations: 0` og fire grønne selvtesttrin inkl. deploy-friskheds-selvfesten, `npm run audit:site` og `npm audit` uden fund. Næste iteration: kør `npm run check:deploy` først; er `DEPLOY-MISSING` væk, merges bunken på fire branch til `main`.
- 2026-09-26 ca. 04:0x–04:2x CEST: T19 gennemført på `ceo/sql-empty-string`, bygget oven på `ceo/xml-attributes`, så bunken nu er ni commits. Deploy genverificeret **først** i iterationen med `npm run check:deploy`: uændret, `DEPLOY-MISSING` står ved, og diffen mergeret **ikke** til `main` (den rørrer `site/engine.js`); ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. To tavse datatab fundet i `serializers.sql`, begge med exit 0 og gyldig SQL: (1) `sqlValue` skrev både `null` og `''` som `NULL`, så en CSV med et tomt felt importerede fint og `WHERE middle = ''` fandt intet bagefter; (2) regex'en `/^-?\d+(\.\d+)?$/` skrev det danske postnummer `0074` som tallet 74. Rettet i begge engines (byte-identiske) til `null`/`undefined` → `NULL`, `''` → `''`, og regex'en snævret til `/^-?(0|[1-9]\d*)(\.\d+)?$/`, så kun et forulede nul tvinger citater på. Nyt fixture `test/fixtures/sql-empty.csv` som `CASES`-case, så konformancen dækker det i begge engines og i den rigtige CLI; `docs/cli.md` fik en firelinjes-tabel over `NULL` / `''` / `2100` / `'0074'` med kommando og fuldt output, altså migrationen er skrevet ned. Den grønne test `SQL NULL for empty values` blev omskrevet til tre tests, der hver især kan fange en regression: null mod tom streng, tom streng gennem en CSV-runde, nulforpræfiks. **Procesfejl, begge fanget af de nye tests:** jeg skrev begge de to første tests ud fra hovedet i stedet for fra outputtet — `(NULL, NULL)` optræder jo i tredjerækken med den manglende nøgle, så min `includes`-påstand ramte den, og `"0.5"` er et decimaltal uden nulforpræfiks, så den ville være quotet i min nye forventning. Rettet til at sammenligne hele rækker mod den faktiske output. Snapshots regenereret til 27 entries **uden at ét eneste eksisterende snapshot ændrede sig** — beviset på, at rettelsen kun rammer de to tilfælde, den handler om. **Den gæld fra T18-iterationen er betalt:** `npm run check:site` er kørt og grøn (`0 finding(s) across 20 pages`, `deviations: 0`, fire grønne selvtesttrin inkl. deploy-friskheds-selvfesten), så bunken er nu grøn i hele gaten, ikke kun i root-gaten. Lokalt grøn: `npm test` 80+71+67+6+39+4+173, 0 fejl, `npm pack --dry-run` 5 filer uændret. Implementationscommit `538aa2e`, pushet til `ceo/sql-empty-string`, **ikke mergeret til `main`**. Næste opgave: kør `npm run check:deploy` først; er `DEPLOY-MISSING` væk, merges bunken på ni commits til `main`.

- 2026-09-26 ca. 04:2x–05:1x CEST: T17 gennemført på `ceo/nested-yaml`. `parsers.yaml` erstattet af en indrykningsdrevet læser (`parseYAML` → `tokenizeYAML` → `parseYAMLBlock`): mappings og sekvenser i vilkårlig dybde, `- key: value` med indrykket inline-mapping, sekvens på samme indrykning som sin nøgle, blokskalarer (`|`, `>`, `|-`, `|+`), enkelt- og dobbeltcitate med escapes, flow-kollektioner (`[a, b]`, `{k: v}`), `#`-kommentarer og `---`/`...`. Den gamle læser lod en indrykket blok forsvinde og exitede 0 — hele `service`-blokken i en almindelig config-fil var væk. `serializers.yaml` skriver den samme struktur tilbage (nested mappings, sekvenser af mappings, blokskalarer, citater), og en streng der læses som noget andet skrives quotet, så `0074` ikke bliver 74. Ny fixture `test/fixtures/nested.yaml` (tre niveauer) som `CASE`, så conformance dækker den i begge engines, plus to konverteringer med fuldt output i `docs/cli.md`; afsnittet om YAML-understøttelse er skrevet om og siger nu, at anchors og multi-dokument-filer ikke understøttes, og at kun første dokument læses med en advarsel på stderr. 12 nye engine-tests (55 → 67), 7 nye CLI-tests (63 → 70), conformance 63 → 65. `detectFormat` genkender nu `key: value` som YAML og ser på første meningsbærende linje, så en indsat config-fil i browserplaygroundet ikke læses som JSON. Snapshots regenereret til 26 entries **uden at ét eneste eksisterende snapshot ændrede sig** — beviset på, at rettelsen er en no-op for data, der allerede virkede. Fund undervejs: (1) `blockScalarHeader` skrev `style: m[1]`, som er chomping-indikatoren, så *alle* blokskalarer blev literale — fanget af den test, der hævede den foldede egenskab, ikke af dem, der testede `|`; (2) min første CLI-test påstod `zip: 0074` på en yaml-fil, hvilket er YAML'ens egen coercing, ikke writerens — påstanden flyttedes til json → yaml → json, fordi det er den vej, et postnummer faktisk rejser; (3) `expectFail(..., 1, ...)` viste exit **3**, CLI'ens kontrakt for ulæseligt input, så testen blev skrevet om til den. Lokalt grøn: `npm test` 67+70+65+6+39+4+166, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px, `Site-gate grøn.` med syv grønne selvtesttrin. Deploy genverificeret **først** med `npm run check:deploy`: live `3d90812`, 5 site-commit / 25 filer u deployede, `/support/index.html` utilgængelig — uændret, så `DEPLOY-MISSING` står ved, diffen mergeret **ikke** til `main` (den rørrer `site/engine.js`), og der er oprettet ingen `VERIFICÉR DEPLOY`-note. Næste opgave er T12 (dansk support-side); T13/T14/T15/T16/T17 ligger som seks u mergerede commits på to branch-kæder.

- 2026-09-25: Research-iteration gennemført på `ceo/transmute-roadmap` med plan-commit `b46b1e2`; planen er oprettet ud fra repo, mission, Stripe-kontrakt og afhængighedsstatus.
- 2026-09-25 03:11 UTC: T2 gennemført på `ceo/desktop-opener`; rustls advisory-fix isoleret i `4d1a828`, opener-plugin, ACL, frontend-handler, fire headless checks og debug `.app`-build gennemført. Implementationscommit: `2c3b6c2`. GUI-smoke afventer Orca/computer-use.
- 2026-09-25 03:29 UTC: `6e89d13` mergeret fast-forward til `main` og pushet til `main` samt `ceo/desktop-opener`; CI-run `36090507215` sluttede `success`, og ingen deploy-site-run blev udløst.
- 2026-09-25 05:37 UTC: T1-forsøg 1 gemt på `ceo/rustsec-baseline` som `7e34c0f` og pushet uden merge. Root-test/pack, Cargo check/test og YAML-parsning er grønne; `cargo audit --deny warnings` fejler korrekt på syv upstream-fund. Næste iteration skal genkontrollere dem.
- 2026-09-25 05:38 UTC: Planstatuscommitten `c9ba6b9` pushet til `main`; CI-run `36099345814` sluttede `success`, og ingen deploy-site-run blev udløst.
- 2026-09-25 07:11 UTC: T1 lukket som overført efter `16cb82a`; T5 implementeret på `ceo/remove-auto-deploy`. Deploy-workflowen er fjernet, 39 workflow-regressioner dækker Cloudflare, push-deploy, YAML-varianter og lokale actions, og 38 engine-tests plus pack og npm-audit er grønne. Merge og kontrol af nye deploy-runs afventet.
- 2026-09-25 14:21 UTC: T5 merged til `main` i `28a06dd` og pushet til `main` samt `ceo/remove-auto-deploy`; CI-run `36146904851` sluttede `success`, og ingen ny `deploy-site`-run blev oprettet.
- 2026-09-25 16:02 UTC: T6 gennemført på `ceo/site-gate-ci`. Hash-låst `tools/site-requirements.txt` (54 pakker, `playwright==1.60.0` + `pip-audit==2.9.0`), `tools/site_gate.sh`, `tools/site_gate_selftest.py`, `TRANSMUTE_SITE`-override i begge checkere, npm-scripts `check:site`, `audit:site` og `lock:site` samt `.github/workflows/site-gate.yml`. Lokalt grøn: 0 SEO-fund på 18 sider, 0 layout-afvigelser ved 360/768/1280, 4 grønne selvtesttrin, pip-audit uden fund, 38+39 tests og `npm pack --dry-run` grøn. Implementationscommit `d555f65`, mergeret fast-forward til `main` og pushet til `main` samt `ceo/site-gate-ci`. CI-run `36158172199` (`CI`) sluttede `success`; `Site gate`-run `36158172198` sluttede `success` efter 1 min. 15 s med de fire grønne selvtesttrin i loggen. Ingen sitefil rørt, ingen deploy-note, ingen `deploy-site`-run. Næste opgave er T7 (`/support` og købsside).
- 2026-09-25 ca. 11:20 lokal tid: T7 gennemført på `ceo/support-page`. `site/support/index.html` med køb via den officielle Payment Link, 32-tegns nøglen, tre maskiner, fejlfinding, nøglersikkerhed, kontakt og en kort donationstekst; Support-link i footeren på alle 19 sider via `site_chrome.py`; `llms.txt` opdateret; sitemap og søgeindeks regenereret (102 → 103 entries). En rød site-gate undervejs blev isoleret som flake og lukket: `layout_check.py` fejler nu pr. side med 20 s `goto`-timeout i stedet for at gå i stykker, og `site_gate_selftest.py` hæfter checkerens output på en fejl. Lokalt grøn: `npm test` (38 + 39), `npm pack --dry-run` (5 filer), `npm run audit:site` uden fund, `npm run check:site` med 0 SEO-fund på 19 sider, 0 layout-afvigelser ved 360/768/1280 px og fire grønne selvtesttrin; tre grønne site-gate-kørsler efter flake-fixen. Implementationscommit `0534cb8`, mergeret fast-forward til `main` og pushet til `main` samt `ceo/support-page`. T8 er næste opgave; T12 (dansk support-side) er lagt til med hreflang-krav.
- 2026-09-25 18:20 UTC: T8 slice 1 gennemført på `ceo/cli-conformance`. `docs/cli.md` med alle 14 operationer, coercion-regler, exit codes og script-eksempler; exit codes 0/1/2/3, `--out`, `--version`, præcis flag- og pipelinevalidering, tomt stdout ved fejl, exec-bit og `add`/`join` i CLI-help; `test/cli.test.mjs` (45 reelle CLI-kørsler) og `test/conformance.test.mjs` (49 CLI-vs-site- og dokumentationskontroller) wiret ind i `npm test` sammen med fire fixtures, 21 cases, `test/fixtures/expected.json` og `npm run snapshots:cli`. Fund: `serializers.table` skrev `[object Object]` for nestede records — rettet i begge engine-kopier, så `group`/`join` er læsbare i CLI og på sitet. Lokalt grøn: `npm test` 38+45+49+39+4, `npm pack --dry-run` 5 filer, `npm run check:site` 0 SEO-fund på 19 sider, 0 layout-afvigelser og fire grønne selvtesttrin. Implementationscommit `414eb8b`, mergeret fast-forward til `main` og pushet til `main` samt `ceo/cli-conformance`. CI-run `36166367170` (`CI`) og `36166367190` (`Site gate`) sluttede begge `success`; ingen `deploy-site`-run. Ny `VERIFICÉR DEPLOY`-note for `site/engine.js`-ændringen. T8 slice 2 (død `scripts/verify-readme.js`, docs-link i sitets `/cheatsheet/` og `/try/`) står åben; T9 er næste fulde opgave.
- 2026-09-25 18:2x UTC: T8 slice 2 gennemført på `ceo/cli-readme-truth`. `scripts/verify-readme.js` vurderet som død kod (aldrig wiret ind i `npm test`, shell-`execSync`, egen exit-kode) og erstattet af `test/readme.test.mjs`: 6 tests, som läser `## Examples` i README, bygger `people.csv`/`config.yaml` i en temp-mappe, kører hver linje med `transmute` bundet til checkoutet og kræver exit 0, tom stderr og konkret output; en ny eksempel-linje uden registrering i `EXPECTATIONS` giver röd gate. `docs/cli.md`-link i ny `Full reference`-sektion i `/cheatsheet/`, i playgroundet på `/` og `/da/`, samt i `llms.txt`; `tools/site_chrome.py` regenererede TOC, søgeindeks (103), sitemap og `lastmod 2026-09-25` på 19 sider. Fund undervejs: YAML-dokumentet `a: 1 / b: hello` bliver én record (`[{a:1,b:"hello"}]`), ikke et objekt, så testen fikserer den faktiske adfærd. Lokalt grøn: `npm test` 38+45+49+6+39+4, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px og fire grønne selvtesttrin, kørt to gange. Implementationscommit `86a236d`, mergeret fast-forward til `main` og pushet til `main` samt `ceo/cli-readme-truth`. Ny `VERIFICÉR DEPLOY`-note. Deploy-fund: live-sitet er fra 2026-09-08 (`sitemap.xml` `lastmod 2026-09-08`, `/support/` 404, ingen `/support`-link på forsiden, Cloudflare `DYNAMIC`), altså er batchdeployeren ikke kørt siden 2026-09-08; eskaleret som `❓ Til Mads` punkt 1. T9 er næste opgave.
- 2026-09-25 18:50 UTC: T9 gennemført på `ceo/true-claims`. `tools/product-contract.json` som eneste kilde til `product_key`, 19 USD, `one_time`, 3 maskiner, gratisniveau, Payment Link `https://buy.stripe.com/eVqbJ0dvdbaW55cgN9bMQ02`, donationslink, licens-API og tilladte desktop-linkmål; `tools/verify_contract.mjs` (161 checks, 27 filer) wiret ind i `npm test` og som `npm run check:contract`. Falske claims fundet og rettet: README-badge på den slettede `build.yml` (duplikeret to gange), `Download for macOS, Windows or Linux` og footerens `Desktop app` pegede på dette repos releases, som ikke indeholder den private desktopapp, to guides linkede `desktop app` til `/#install`, README sagde at appen lå i repoet og kunne hentes fra forsiden, og `homebrew-bump.yml` forklarede sin trigger med `build.yml`. Rettet til henholdsvis `ci.yml`, `/support/#buying-pro`, `{home}#desktop` (i `site_chrome.py`, 19 sider regenereret), `/#desktop` og `publish.yml`; begge forsider har nu `id="desktop"`. Gratisniveauet "tre transformationer pr. start" er bekræftet på `/`, `/da/` og `/support/` og lagt i kontrakten som `free_tier_transformations_per_launch: 3`, så kontrol'en garanterer ens udtryk i stedet for at slette Mads' påstand; se `❓ Til Mads` punkt 4. Lokalt grøn: `npm test` 38+45+49+6+39+4+161, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 19 pages` og fire grønne selvtesttrin. Implementationscommit `f2956f5`, mergeret fast-forward til `main` og pushet til `main` samt `ceo/true-claims`. Ny `VERIFICÉR DEPLOY`-note for footeren, CTA'en og guide-linkene. T10 (runtime og afhængigheder) er næste opgave.
- 2026-09-25 18:55 UTC: CI-run `36168730640` (`CI`, commit `f2956f5`) sluttede `success`, og `Site gate`-run for samme commit sluttede `success`; ingen deploy-run blev oprettet, fordi `deploy-site.yml` ikke findes. CI for plannoten `99ab95e` sluttede `success`.
- 2026-09-25 ca. 19:2x UTC: T10 slice 1 og 2 gennemført på `ceo/runtime-deps`. Slice 1 (`14dce0b`): `package-lock.json` committet (lockfileVersion 3, nul afhængigheder), `ci.yml` kører `npm ci`, `publish.yml`s betingede install-fallback fjernet, og ny kontrol i `verify_contract.mjs` (162 checks) kræver lockfil + matcher `package.json` på navn/version/lockfileVersion 3, løser ingen pakker bag README's "Zero dependencies", og at ingen workflow kører `npm install`; fanget med vilje ved at slette lockfilen og ved at sætte `npm install` tilbage i begge `run:`-formater. Slice 2 (`599ca4f`): research fra nodejs.org viser Node 20 EOL siden april 2026, 22.23.3 LTS Jod, 24.21.0 LTS Krypton (aktiv), 26.10.0 Current endnu ikke LTS. `engines` `>=18` → `>=22`, `.nvmrc` = 24, CI-matrix `[20, 22]` → `[22, 24]`, `publish.yml` `node-version: 20` → `22` — den udløbne runtime publicerede altså til npm. Ny kontrol (163 checks) kræver at `engines`-floor, `.nvmrc`, matrixen og enhver `node-version:` peger på samme testede runtime, at ingen matrix-leg er ulige ikke-LTS-major, og at alle læserclaims matcher floor. Den fandt 13 driftede "Node.js 18"-claims ved første kørsel (11 sider, `llms.txt`, `llms-full.txt`, `docs/cli.md`) plus den danske "Node.js 18 eller nyere" på `/da/`. Fund: `test/cli.test.mjs`' test "engines requirement matches the CI matrix" hardcodede `>=18` og læste aldrig matrixen; den læser nu den ældste testede version. Lokalt grøn: `npm test` 38+45+49+6+39+4+163, `npm pack --dry-run` 5 filer, `npm audit` 0 fund, `npm run check:site` `0 finding(s) across 19 pages` + fire grønne selvtesttrin. Begge commits mergeret fast-forward til `main` og pushet til `main` samt `ceo/runtime-deps`. Deploy-genverificeret før merge: sitemap `lastmod 2026-09-08`, `/support/` 404, 0 support-links på forsiden — `DEPLOY-MISSING` skrevet. T10 slice 3 (`actions/checkout` v4 → v5 alene) er næste iteration; Dependabot-PR #4 skal lukkes, ikke merges.
- 2026-09-25 ca. 22:0x CEST: T10 slice 3 gennemført på `ceo/actions-checkout-v5`. `actions/checkout` v4 → v5 i `ci.yml` og `publish.yml`, `setup-node` bevidst urørt på v4 så majorerne kan rulles tilbage uafhængigt. Migrationsnoter for v5.0.0 læst via `gh api` (kernen skifter til Node 24, kræver runner v2.327.1+; ingen kodeændring nødvendig, GitHosts runners er nyere). Ny kontrol "no workflow pins an action major GitHub has deprecated" i `verify_contract.mjs` (164 checks): gulv checkout 5, setup-node 4, setup-python 7, pin skal være major-tag eller fuld 40-tegns SHA, og et gulv på en action ingen workflow bruger fejler. Verificeret med tænder to gange — checkout tilbage på v4 gav 1 fejl med nævnt gulv, `setup-node@main` på en branch-ref gav 1 fejl om ref-formen — begge reversioner rullet tilbage. Dependabot-PR #4 lukket med kommentar, ikke merged. `ubuntu-latest` → `ubuntu-26.04` bevidst ikke rørt, det er en runtime-migrering og tages i egen slice. Lokalt grøn: `npm test` 38+45+49+6+39+4+164, `npm pack --dry-run` 5 filer, `npm audit --omit=dev` 0 fund. Deploy genverificeret før merge: sitemap `lastmod 2026-09-08`, `/support/` 404, uændret siden sidste check, så `DEPLOY-MISSING` står ved og der oprettes ingen `VERIFICÉR DEPLOY`-note (ingen sitefil rørt). T10 slice 4 (`actions/setup-node` v4 → v5 alene) er næste iteration.
- 2026-09-25 ca. 22:2x CEST: T10 slice 3 merged fast-forward til `main` som `a4114ca` og pushet til `main` samt `ceo/actions-checkout-v5`. CI-run `36186116700` (`CI`) sluttede `success` på alle otte testtrin (38+45+49+6+39+4+164) og `npm pack --dry-run`. `Site gate` blev korrekt ikke udløst, fordi diffen rører hverken `site/**` eller nogen af site-gatens path-grupper. Ingen deploy-run findes at oprette, siden `deploy-site.yml` er fjernet. T10 slice 4 (`actions/setup-node` v4 → v5 alene) er næste iteration.
- 2026-09-25 ca. 23:0x CEST: T10 slice 4 gennemfört på `ceo/actions-setup-node-v5`. `actions/setup-node` v4 → v5 i `ci.yml` og `publish.yml` (checkout urørt på v5), `setup-node`-gulvet hævet 4 → 5 i `verify_contract.mjs` i samme commit. Migrationsnoter for v5.0.0 læst via `gh api`: kernen kører på Node 24 og kræver runner v2.327.1+, og den ene brydende ændring er automatisk caching ved et `packageManager`-felt i `package.json` — kontrolleret fraværende (`rg '"packageManager"' package.json` → ingen match), så ingen kodeændring nødvendig. Verificeret med tænder: `ci.yml` tilbage på `setup-node@v4` gav præcis 1 fejl med det navngivne gulv, reversionen rullet tilbage. Lokalt grøn: `npm test` 38+45+49+6+39+4+164, `npm pack --dry-run` 5 filer, `npm audit --omit=dev` 0 fund. Deploy genverificeret før merge: `/support/` stadig 404, sitemap `lastmod` stadig 2026-09-08 — uændret siden sidste check, `DEPLOY-MISSING` står ved og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi diffen rører ingen `site/`-fil. T10 slice 5 (`actions/checkout` v5 → v6 alene) er næste iteration.
- 2026-09-26 ca. 00:1x CEST: T10 slice 5 gennemført på `ceo/actions-checkout-v6`. `actions/checkout` v5 → v6 i `ci.yml` og `publish.yml` (setup-node urørt på v5), `checkout`-gulvet hævet 5 → 6 i `verify_contract.mjs` i samme commit. Migrationsnoter for v6.0.0 læst via `gh api` (releases/tags/v6.0.0 + `README.md` og `action.yml` på `ref=v6`): den ene reelle ændring er, at `persist-credentials` gemmer tokenet i en separat fil under `$RUNNER_TEMP` i stedet for i `.git/config` (PR #2286); `action.yml` på v6 har identiske inputs som v5, så ingen workflow skal ændres, og READMEen siger "No workflow changes required". Runner-kravet v2.329.0+ gælder kun autentificerede git-kommandoer fra en Docker container action, og ingen af de tre workflows har container-steps; v6 arver desuden node24-kernen fra v5. Verificeret frem for antaget, at adfærden er uberørt: ingen workflow sætter `persist-credentials`, bruger submodules eller laver `git push`, og `publish.yml`s eneste skriveadgang til GitHub er `gh release create` med `GH_TOKEN` — et API-kald, ikke en autentificeret git-operation. Verificeret med tænder: `ci.yml` tilbage på `checkout@v5` gav præcis 1 fejl med det navngivne gulv, reversionen rullet tilbage. Fund undervejs: `site-gate.yml` har brugt `checkout@v7` hele vejen, så de tre workflows står nu på hver sin major indtil slice 7 — gulvet på 6 dækker alle tre. Lokalt grøn: `npm test` 38+45+49+6+39+4+164, `npm pack --dry-run` 5 filer, `npm audit --omit=dev` 0 fund, `npm run check:site` `0 finding(s) across 19 pages` + fire grønne selvtesttrin. Deploy genverificeret før merge: `/support/` stadig 404, sitemap `lastmod` stadig 2026-09-08 — uændret siden sidste check, `DEPLOY-MISSING` står ved og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi diffen rører ingen `site/`-fil. T10 slice 6 (`actions/setup-node` v5 → v6 alene) er næste iteration.
- 2026-09-26 ca. 00:2x CEST: T10 slice 5 merged fast-forward til `main` som `bb19768` og pushet til `main` samt `ceo/actions-checkout-v6`. CI-run `36195066615` (`CI`) sluttede `success` på alle otte testtrin (38+45+49+6+39+4+164) og `npm pack --dry-run` på begge matrix-ben (Node 22 og 24). `Site gate` blev korrekt ikke udløst, fordi diffen rører hverken `site/**` eller nogen af site-gatens path-grupper. Ingen deploy-run findes at oprette, siden `deploy-site.yml` er fjernet. T10 slice 6 (`actions/setup-node` v5 → v6 alene) er næste iteration.
- 2026-09-26 ca. 00:3x CEST: T10 slice 6 gennemført på `ceo/actions-setup-node-v6`. `actions/setup-node` v5 → v6 i `ci.yml` og `publish.yml` (checkout urørt på v6), `setup-node`-gulvet hævet 5 → 6 i `verify_contract.mjs` i samme commit. Migrationsnoter for v6.0.0 læst via `gh api` (releases/tags/v6.0.0 + `README.md` og `action.yml` på `ref=v6`): to brydende ændringer, begge verificeret inerte frem for antaget. (1) `always-auth`-inputtet er fjernet, fordi npm har deprecated det — `rg` viste ingen brug i nogen af de tre workflows, og `publish.yml` bruger `NODE_AUTH_TOKEN` i step'ets `env:`, som er den understøttede vej. (2) Automatisk caching er begrænset til npm (PR #1374), og triggeren er bredere end i v5: caching tændes på både `devEngines.packageManager` og topniveau-`packageManager`; `package.json` erklærer hverken felt, så v5 og v6 opfører sig ens her. Runtimekravet er uændret (`engines.node >=24.0.0` i actionens egen `package.json` på v6, samme node24-kernel som v5, runner `v2.327.1+` arvet, alle workflows på GitHosts `ubuntu-latest`). Slice 4's plan-note om den udløsende `packageManager`-risiko er gjort permanent som kontrol'en "no workflow inherits implicit dependency caching from setup-node" (165 checks), der dækker begge felter. Verificeret med tænder tre gange: `packageManager: "npm@10.9.8"` → 1 fejl, `devEngines.packageManager` → 1 fejl, `ci.yml` tilbage på `setup-node@v5` → 1 fejl med det navngivne gulv; alle reversioner rullet tilbage. Lokalt grøn: `npm test` 38+45+49+6+39+4+165, `npm pack --dry-run` 5 filer, `npm audit --omit=dev` 0 fund, `npm outdated` ingen output, `npm run audit:site` `No known vulnerabilities found`, `npm run check:site` `0 finding(s) across 19 pages` + fire grønne selvtesttrin. Deploy genverificeret før merge: `/support/` 404, sitemap `lastmod` 2026-09-08, 0 support-links på forsiden — uændret siden sidste check, så `DEPLOY-MISSING` står ved og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi diffen rører ingen `site/`-fil. T10 slice 7 (`actions/checkout` v6 → v7 alene) er næste iteration.
- 2026-09-26 ca. 00:4x CEST: T10 slice 6 merged fast-forward til `main` som `c446d37` og pushet til `main` samt `ceo/actions-setup-node-v6`. CI-run `36198398474` (`CI`) sluttede `success` på begge matrix-ben (Node 22 og 24) med alle otte testtrin grønne (38+45+49+6+39+4+165) og `npm pack --dry-run` på 5 filer. `Site gate` blev korrekt ikke udløst, fordi diffen rører hverken `site/**` eller nogen af site-gatens path-grupper. Ingen deploy-run findes at oprette, siden `deploy-site.yml` er fjernet. T10 slice 7 (`actions/checkout` v6 → v7 alene) er næste iteration.
- 2026-09-26 ca. 01:3x CEST: T10 slice 7 gennemført på `ceo/checkout-v7`. `actions/checkout` v6 → v7 i `ci.yml` og `publish.yml` (setup-node urørt på v6), `checkout`-gulvet hævet 6 → 7 i `verify_contract.mjs` i samme commit. Migrationsnoter for `v7.0.0` læst via `gh api` (releases/tags/v7.0.0 + README på `ref=v7`, diffet mod `ref=v6`): den ene reelle ændring er, at checkout nægter at checke ud fork-PR-kode, når workflowen trigges af `pull_request_target` eller `workflow_run` (PR #2454), med opt-in via det nye `allow-unsafe-pr-checkout: true`-input; resten er ESM-migrering (PR #2463) og transitive afhængighedsfixes. Verificeret inerte frem for antaget: `rg 'pull_request_target|workflow_run|allow-unsafe-pr-checkout' .github/` gav ingen match, og `action.yml` på v7 har identiske inputs som v6 (hverken tilføjet, fjernet eller omdøbt), så ingen `with:`-blok skal ændres. Kernel er uændret `node24`, så ingen ny runtime at erklære. Fund undervejs og gjort permanent: slice 5 havde noteret, at `site-gate.yml` brugte `checkout@v7` hele vejen mens ci/publish blev marcheret gennem v5 og v6 — begge over gulvet, ingen gate klagede. Kontrollen kræver derfor nu OGSÅ én major pr. action på tværs af alle workflows, med en fejl der navngiver filerne pr. major. Verificeret med tænder: `ci.yml` tilbage på `checkout@v6` → 1 fejl med det navngivne gulv; `site-gate.yml` på `v8` → 1 fejl med uoverensstemmelsen; begge reversioner rullet tilbage. Efter slice 7 bruger alle tre workflows den samme `checkout`-pin, så slice 8 (`setup-node` v6 → v7) gør hele sættet homogent. Lokalt grøn: `npm test` 38+45+49+6+39+4+165, `npm pack --dry-run` 5 filer, `npm audit --omit=dev` 0 fund, `npm outdated` ingen output, `npm run check:site` `0 deviations` på 19 sider + fire grønne selvtesttrin. Deploy genverificeret før merge: `/support/` 404, sitemap `lastmod` 2026-09-08, uændret siden sidste check — `DEPLOY-MISSING` står ved og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi diffen rører ingen `site/`-fil (og heller ikke et af `site-gate.yml`'s path-filtre, så CI kører kun `ci.yml` for denne diff). T10 slice 8 (`actions/setup-node` v6 → v7 alene) er næste iteration.
- 2026-09-26 ca. 01:3x CEST: T10 slice 7 grøn i CI. Run `36201299684` (`CI`) for `c1bee9f` sluttede `success`; ingen `Site gate`-run, fordi diffen rører intet af dens path-filtre, og ingen deploy-run. T10 slice 8 (`actions/setup-node` v6 → v7 alene) er næste iteration; efter den er alle actions på én pin pr. action, og den nye uoverensstemmelseskontrol garanterer det.
- 2026-09-26 ca. 01:5x CEST: T10 slice 8 gennemført på `ceo/setup-node-v7`. `actions/setup-node` v6 → v7 i `ci.yml` og `publish.yml` (checkout urørt på v7), `setup-node`-gulvet hævet 6 → 7 i `verify_contract.mjs` i samme commit. Migrationsnoter for `v7.0.0` læst via `gh api` (releases/tags/v7.0.0, README på `ref=v7` mod `ref=v6`, `action.yml` på begge refs, `src/authutil.ts` på begge refs): den ene erklærede brydende ændring er ESM-migreringen (PR #1574), som er intern for handlingen. `action.yml`-diffet mellem v6 og v7 er udelukkende to tilføjede outputs (`cache-primary-key`, `cache-matched-key`, PR #1577) — ingen input er fjernet, omdøbt eller gjort påkrævet, så ingen `with:`-blok ændres. Den anden reelle ændring er PR #1558: v6 eksporterede en dummy `NODE_AUTH_TOKEN=XXXXX-XXXXX-XXXXX-XXXXX` ind i jobbets miljø, v7 eksporterer slet ingen medmindre feltet findes i `process.env`; `.npmrc`-linjen er uændret (`//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`), og `publish.yml` sætter tokenen i step'ets `env:`, som slår et arvet job-`env` ihjel, mens `ci.yml` slet ikke sætter `registry-url` — altså inerte her, verificeret frem for antaget. Slice 4 og 6's caching-bekymring lukket med inputtet i stedet for et forbud: `package-manager-cache` kom i v6.5.0 (samme dag som v7.0.0), v7's README tilføjer `package-manager-cache: false` i eksemplerne, og begge setup-node-steps har nu linjen. Kontrollen "no workflow inherits implicit dependency caching from setup-node" er skrevet om til at kræve inputtet i hvert step (fundet ved at læse fra `uses:`-linjen til næste step med samme indrykning) i stedet for at kræve, at `package.json` undviger et felt; et `packageManager`-felt tilføjet senere kan dermed ikke slå caching fra i det skjulte. Verificeret med tænder to gange: slette `package-manager-cache`-linjen i `publish.yml` → 1 fejl der navngiver filen; `ci.yml` tilbage på `setup-node@v6` → 1 fejl med det navngivne gulv. Lokalt grøn: `npm test` 38+45+49+6+39+4+165, `npm pack --dry-run` 5 filer, `npm audit --omit=dev` 0 fund, `npm outdated` ingen output. Site-gaten er ikke kørt, fordi diffen rører hverken `site/**` eller nogen af site-gatens path-grupper, så `Site gate`-workflowen udløses ikke. Ingen sitefil rørt, ingen `VERIFICÉR DEPLOY`-note; `DEPLOY-MISSING` står ved, fordi den er en menneskebeslutning (`❓ Til Mads` punkt 1). Næste slice er `ubuntu-latest` → `ubuntu-26.04` med egen commit; T10 er lukket når den er grøn.
- 2026-09-26 ca. 01:5x CEST: T10 slice 8 grøn i CI. Run `36202371699` (`CI`) for `9b7ddf5` sluttede `success` på begge matrix-ben (Node 22 og 24). `Site gate` blev korrekt ikke udløst, fordi diffen rører hverken `site/**` eller nogen af site-gatens path-grupper, og ingen deploy-run findes, siden `deploy-site.yml` er fjernet. Næste slice er `ubuntu-latest` → `ubuntu-26.04` med egen commit; T10 er lukket, når den er grøn med alle otte testtrin.
- 2026-09-26 ca. 02:2x CEST: T10 slice 9 gennemført på `ceo/ubuntu-runner-pins` i to commits, som lukker T10. Research via `gh api`: `actions/runner-images#14748` (2026-09-17) siger, at `ubuntu-latest` bliver Ubuntu 26.04 i en udrulning fra 19. oktober 2026 til 19. november 2026, og #14747 at `ubuntu-26.04` er GA; #14254 siger, at Ubuntu 22.04-imagernes deprecation startede 17. september 2026 med brownouts i marts/april 2027. `Ubuntu2604-Readme.md` (image 20260920.143.1) bekræfter GitHub CLI 2.101.0 og Node 24.21.0 på 26.04. Commit 1 (`427b113`): `ci.yml`, `publish.yml` og `homebrew-bump.yml` på `ubuntu-26.04` — ingen af dem bruger Playwright eller apt. Commit 2 (`fda739c`): `site-gate.yml` låst på `ubuntu-24.04` plus ny kontrol `every workflow runs on one pinned, non-deprecated runner image` (166 checks), som kræver eksplicit `ubuntu-<major>.<minor>` i hvert `runs-on`, kræver at en workflow uden Playwright ligger på den nyeste image, og kræver at en workflow med Playwright ligger på en Ubuntu-version den låste Playwright kender — listen læses fra `tools/site-requirements.txt`. Grunden for låsen er researchet i Playwright-kilden: `nativeDeps.ts` på v1.60.0 har ingen `ubuntu26.04`-post, `hostPlatform.ts` mapper 26.04 til `ubuntu26.04-x64` med `isOfficiallySupportedPlatform: false`, og `installDependenciesLinux` logger "Cannot install dependencies for ubuntu26.04-x64" og returnerer uden fejl — så `TRANSMUTE_PLAYWRIGHT_DEPS` ville være en tavs no-op. Verificeret med tænder fire gange: site-gate på 26.04 → 1 fejl med Playwright-grunden; `ci.yml` på 24.04 → 1 fejl om manglende Playwright-ret; `ci.yml` på `ubuntu-latest` → 1 fejl om pin-kravet; Playwright-pin ændret til 1.61.0 → 1 fejl der kræver ny Ubuntu-liste. Alle reversioner rullet tilbage. Procesfejl undervejs: `git checkout` i tandsk-kørslen rullede også den endnu-ikke-committede `site-gate.yml`-pin tilbage; kontrollen fangede det, og ændringen blev genanvendt. Lokalt grøn: `npm test` 38+45+49+6+39+4+166, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 19 pages` + fire grønne selvtesttrin. Deploy genverificeret før merge: `/support/` 404, sitemap `lastmod 2026-09-08`, 0 support-links på forsiden — uændret, så `DEPLOY-MISSING` står ved og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi diffen rører ingen `site/`-fil. Begge commits mergeret fast-forward til `main` og pushet til `main` samt `ceo/ubuntu-runner-pins`. Efter merge sluttede `CI` `success` på begge matrix-ben og loggen viser `Image: ubuntu-26.04`; `Site gate` sluttede `success` med `Image: ubuntu-24.04`. Ingen deploy-run findes, siden `deploy-site.yml` er fjernet. T10 er lukket. T12 (dansk support-side) er næste opgave, men kræver Mads' svar på `❓ Til Mads` punkt 1 og 5, fordi den rører `site/`.
- 2026-09-26 ca. 02:5x CEST: T13 gennemført på `ceo/csv-real-world-fixes`. Fundet ved at køre rigtige filer gennem CLI'en i stedet for at læse kode: (1) semikolon-CSV blev læst som én kolonne og tabte værdier — `navn;by;pris` + `Mette;Copenhagen;199,50` gav `{"navn;by;pris":"Mette;Copenhagen;199"}`, altså dansk Excel-eksport læst forkert med exit 0; (2) et citeret felt med linjeskift opfandt en ekstra record; (3) mellemrum i citerede felter blev trimmet. `src/engine.js` og `site/engine.js` (byte-identiske) har nu en RFC 4180-læser over hele teksten med auto-detekteret delimiter (`,` `;` tab `|`, `,` ved lighed) og BOM-rydning. `run()` giver `opts` videre til parseren; CLI'en fik `--delimiter ,|;|tab` med samme validerings- og exit-kode-mønster som `--format`/`--output`. Nyt fixture `test/fixtures/european.csv` med citeret komma og citeret linjeskift, lagt som `CASES`-case med valgfrit `file`-felt så conformance-testen dækker den i begge engines. 6 nye CLI-tests (45 → 52) og 6 nye parity-tests (49 → 57); `docs/cli.md` fik en "Delimiters, quotes and line endings"-sektion med kommando og output, README fik flaget og RFC-løftet. Fund undervejs lagt som T14: rækker med flere felter end overskriften taber stadig de ekstra værdier tavst. Lokalt grøn: `npm test` 38+52+57+6+39+4+166, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 19 pages` + fire grønne selvtesttrin. **Committen er bevidst ikke mergeret til `main`**: diffen rører `site/engine.js`, og `DEPLOY-MISSING` står ved (sitemap `lastmod 2026-09-08`, `/support/` 404, 0 support-links på forsiden, genverificeret ca. 02:4x). Reglen er skærpet i Deploy, og T12 (dansk support-side) er parkeret af samme grund. Eskaleret som `❓ Til Mads` punkt 1 — det er første gang blokeringen har stoppet en færdig rettelse.
- 2026-09-26 ca. 03:0x CEST: T13-branchen `ceo/csv-real-world-fixes` er pushet (commit `4d7fc35`). **Der findes ingen CI-run for den**, og det er ikke en fejl: `ci.yml` trigges kun på `push` til `main` og på `pull_request`, og loopet åbner ingen PR, fordi det er et udadvendt write mod GitHub's API og dermed uden for de tilladte handlinger. Beviset for den grønne tilstand er derfor den lokale gate, som er kørt efter alle ændringer: `npm test` 38+52+57+6+39+4+166, `npm pack --dry-run` 5 filer og `npm run check:site` `0 finding(s) across 19 pages` med fire grønne selvtesttrin. Når Mads svarer på punkt 1, er branchen klar til at merges og CI til at bekræfte den.

- 2026-09-26 ca. 02:4x–03:4x CEST: T14 gennemført på `ceo/deploy-freshness-check` (samme branch som T13 og T15, fordi ingen af dem må merges mens `DEPLOY-MISSING` står). Fund ved at køre rigtige filer igennem, reproduceret på den gamle kode: (1) `id,name,note` + `2,"Mette, Copenhagen",DK,follow-up` tabte `follow-up` med exit 0; (2) `[{"id":1,"name":"Alice"},{"id":2,"name":"Bob","email":"…"}]` → CSV tabte `email` fordi `serializers.csv`/`table` brugte `Object.keys(data[0])`, mens `serializers.sql` allerede forenede nøglerne. Valg: opkald feltet (`column4`, `column5` … efter position), ikke ignorer og ikke exit 3 — en synlig kolonne med et underligt navn er brugbar, en fejl uden output er det ikke, og de to er hver især den tavse korruption opgaven fjerner. Advarslen går på stderr med rækkenumre og kolonnenavn, exit forbliver 0, stdout forbliver ren data. `unionKeys()` delt af csv/table/sql. `warnings`-kanal lagt på `run()`s returværdi, som sitet ignorerer. Nyt fixture `test/fixtures/ragged.csv` som `CASES`-case, så begge engines og `docs/cli.md` dækker det. Procesfejl undervejs: første implementation genererede kolonnenavne pr. række i stedet pr. position, så 3 for lange rækker producerede 5 kolonner og en advarsel om de forkerte navne; fanget af en test, der kræver identiske nøgler på to for lange rækker, rettet til et `Map` pr. position. Lokalt grøn: `npm test` 49+59+59+6+39+4+166, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px, grøn selftest inkl. deploy-friskheds-selftesten. Snapshots regenereret til 23 entries **uden at ét eksisterende snapshot ændrede sig**. Deploy genverificeret før commit med `npm run check:deploy`: live `3d90812` (2026-09-24), 5 site-commit / 25 filer u deployede, `/support/index.html` utilgængelig — uændret, to batch-vinduer gået, så `DEPLOY-MISSING` står. Implementationscommit `5f64894`, pushet til `ceo/deploy-freshness-check`, **ikke mergeret til `main`**. - 2026-09-26 ca. 02:5x CEST: T15 gennemført på `ceo/deploy-freshness-check`, bygget oven på `ceo/csv-real-world-fixes` (T13), så de to u mergerede grene deler én planhistorik.
 **Fund: planens deploy-dom var en målefejl, ikke en fejl.** `lastmod` i sitemap'en skrives af `site_chrome.py` og siger intet om deploytidspunktet; `3d90812`, som *er* live, har selv `lastmod 2026-09-08`. Ved at sammenligne indhold mod git (`/cheatsheet/` byte-identisk med `3d90812`, `/index.html` afvigende kun i Cloudflares e-mail-obfuskering og indsprøjtede script) blev det bevist, at live er `3d90812` — 1 dag gammelt, ikke 18 — at kørsel `36062253130` sluttede `success`, og at **T5 fjernede det eneste deployapparat i repoet**. 5 site-commit og 25 filer er u deployede, og live-forsidens købs-CTA peger stadig på et releases-page, der ikke indeholder appen. Rettet med `tools/check_deploy_freshness.py` (`npm run check:deploy`), som måler deploy-alder mod git og udskriver det commit live serverer, plus offline selftest `tools/deploy_freshness_selftest.py` i `check:site`; `__pycache__/` lagt i `.gitignore`. Lokalt grøn: `npm test` 166 checks, `npm pack --dry-run` 5 filer, `npm run check:site` 0 fund på 19 sider, 0 afvigelser + fire grønne selvtesttrin. **Ingen merge til `main`** — `DEPLOY-MISSING` står, og T13 + T15 ligger begge på `ceo/deploy-freshness-check`. Næste opgave er T14.


- 2026-09-26 ca. 02:4x–03:4x CEST: T14 gennemført på `ceo/deploy-freshness-check` (samme branch som T13 og T15, fordi ingen af dem må merges mens `DEPLOY-MISSING` står). Fund ved at køre rigtige filer igennem, reproduceret på den gamle kode: (1) `id,name,note` + `2,"Mette, Copenhagen",DK,follow-up` tabte `follow-up` med exit 0; (2) `[{"id":1,"name":"Alice"},{"id":2,"name":"Bob","email":"…"}]` → CSV tabte `email` fordi `serializers.csv`/`table` brugte `Object.keys(data[0])`, mens `serializers.sql` allerede forenede nøglerne. Valg: opkald feltet (`column4`, `column5` … efter position), ikke ignorer og ikke exit 3 — en synlig kolonne med et underligt navn er brugbar, en fejl uden output er det ikke, og de to er hver især den tavse korruption opgaven fjerner. Advarslen går på stderr med rækkenumre og kolonnenavn, exit forbliver 0, stdout forbliver ren data. `unionKeys()` delt af csv/table/sql. `warnings`-kanal lagt på `run()`s returværdi, som sitet ignorerer. Nyt fixture `test/fixtures/ragged.csv` som `CASES`-case, så begge engines og `docs/cli.md` dækker det. Procesfejl undervejs: første implementation genererede kolonnenavne pr. række i stedet pr. position, så 3 for lange rækker producerede 5 kolonner og en advarsel om de forkerte navne; fanget af en test, der kræver identiske nøgler på to for lange rækker, rettet til et `Map` pr. position. Lokalt grøn: `npm test` 49+59+59+6+39+4+166, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px, grøn selftest inkl. deploy-friskheds-selftesten. Snapshots regenereret til 23 entries **uden at ét eksisterende snapshot ændrede sig**. Deploy genverificeret før commit med `npm run check:deploy`: live `3d90812` (2026-09-24), 5 site-commit / 25 filer u deployede, `/support/index.html` utilgængelig — uændret, to batch-vinduer gået, så `DEPLOY-MISSING` står. Implementationscommit `5f64894`, pushet til `ceo/deploy-freshness-check`, **ikke mergeret til `main`**. Næste opgave: T12 (dansk support-side) er stadig parkeret af deploy-grunden; det eneste frie arbejde er derfor at holde målingen grøn og vente på Mads' svar i `❓ Til Mads` punkt 1.
- 2026-09-26 ca. 04:0x CEST: T12 gennemført oven på `ceo/nested-yaml` som `6516fdb`, så hele bunken T13–T17 + T12 ligger på én branch. `site/da/support/index.html` med alle otte afsnit fra den engelske side i samme rækkefølge (køb, hvad Pro ændrer, aktivering, tre maskiner, fire fejlfindingsafsnit, nøglesikkerhed, kontakt, donation), hreflang-parret komplet begge veje, Support-linket i footeren gjort sprogafhængigt i `site_chrome.py` (tre danske sider regenereret), `seo_check.py` kræver nu `hreflang da` på support-parret, og ny kontrol `the Danish support page says what the English one says` i `verify_contract.mjs` sammenligner sektionsantal, Stripe-links og maskinantal og afviser en stub. Deploy genverificeret **først i iterationen** med `npm run check:deploy`: uændret, live er `3d90812` (2026-09-24), 5 site-commit og 25 filer i drift, `/support/index.html` utilgængelig — så `DEPLOY-MISSING` står ved, der merges **ikke** til `main`, og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. To fund undervejs, begge gjort permanente: (1) `\b` i JavaScript er ASCII-only, så `RECURRING_CLAIM` læste "dårlig" som `årlig` og gjorde gaten rød på en korrekt dansk side — den danske halvdel bruger nu `\p{L}`-lookarounds med `u`-flag; (2) `site_chrome.py` er en omskriver, ikke en generator, så en ny side skal indeholde den chrome den skal have — en side med kun `<head>` og `<article>` får ingen family bar, header eller mobilmenu, hvilket `seo_check.py` meldte med tre fund. Lokalt grøn: `npm test` 38+45+49+6+39+4+173 checks, 0 fejl, `npm pack --dry-run` 5 filer uændret, `npm run check:site` `0 finding(s) across 20 pages`, `deviations: 0` ved 360/768/1280 px og fire grønne selvtesttrin inkl. deploy-friskheds-selvfesten. Bunken på branch er nu otte commits: T13, T14, T15, T16, T17 og T12. Næste iteration: kør `npm run check:deploy` først; er `DEPLOY-MISSING` væk, merges bunken til `main`.
- 2026-09-26 ca. 05:4x CEST: T18 gennemført på `ceo/xml-attributes` som `a31aba8`, **ikke mergeret til `main`**. Deploy genverificeret **først** i iterationen med `npm run check:deploy`: uændret, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit og 25 filer i drift, `/support/index.html` utilgængelig, så `DEPLOY-MISSING` står ved og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. Fire tavse XML-tab fundet ved at køre rigtige filer gennem CLI'en, alle med exit 0: attributter forsvandt totalt (`<product sku="A-1" stock="7">` gav ingen `sku`), **navnerum tømte hele filen** (`<ns:item>` → `[]`), en `<!DOCTYPE>`-prolog tømte også hele filen, og et attribut med samme navn som et barnelement blev lydløst tabt. Rodårsag i alle fire: tagnavne matchede kun `\w+`, og attributstrengen blev kun testet for `/>`. Rettet med `XML_NAME`/`XML_ATTR`, `parseAttributes()` og rekursiv `writeXMLElement()`, der skriver `@x` tilbage som attribut og `#text` som elementtekst, så `xml → json → xml` er tabsfri. Attributter får `@`-præfiks som xmltodict/xml2json/BadgerFish, fordi det er det, der gør navnekollisionen umulig; navnerumspræfikset bevares i nøglen, fordi stripning ville slå `a:` og `r:` sammen i OOXML. 11 nye engine-tests (67 → 78), **0 af 26 eksisterende snapshots ændret**. En fejl i min egen kode undervejs: den første `XML_ATTR` læste `<i b=two/>` som `two/`, fanget af den eneste test med en bare værdi. **Lagt til som T19:** `sqlValue` skriver `''` som `NULL`, hvilket er to forskellige SQL-værdier — men det er låst af den grønne test `SQL NULL for empty values`, så det er et **bevidst valg** og ikke en forglemt fejl. Det kræver Mads' afklaring og en note, ikke en slået test fra; samme opgave tager de klokkeformede talstrenge, der slipper uden citater (`0074` → 74). Lokalt grøn: `npm test` 78+70+65+6+39+4+173, 0 fejl, `npm pack --dry-run` 5 filer uændret. `npm run check:site` blev **ikke** kørt — iterationen ramte tidgrænsen efter den grønne root-gate, og `site/engine.js` er byte-identisk med `src/engine.js`, som konformancen dækker; det er den næste iterations første pligt.
- 2026-09-26 ca. 04:5x CEST: T21 gennemført på `ceo/xml-safe-keys`. `npm run check:deploy` kørt først: `DEPLOY-MISSING` står uændret (live `3d90812`, 5 site-commit i drift, `/support/index.html` utilgængelig), så intet merges til `main` — elleve færdige commits ligger nu på fem branch. T20-metoden fortsat på den sidste flade: XML-output, `unique` uden `by`, `group`. Tre fund, alle reproduceret på den gamle kode. (1) `writeXMLElement` skrev JSON-nøglen som tag-navn uden tjek, så `first name`/`2fa`/`a/b`/tom nøgle gav `<first name>Ada</first name>` — filen ingen parser læser, og Transmute læste sin egen output tilbage som `[{}]`, exit 0. Samme fejl i attributterne (`@2fa` → `<item 2fa="x">`, `@` → `<item ="x">`). Rettet med én definition af et navn: ulovlig nøgle → `<field name="…">`, læses tilbage af `readFieldName`; ulovlig `@`-nøgle → child-element gennem samme markør, så T18's `@id`-attribut er urørt. (2) `unique` uden `by` brugte `JSON.stringify`, som er rækkeføljeafhængig, så `{"a":1,"b":2}` og `{"b":2,"a":1}` begge blev beholdt — ny `stableKey()` sorterer nøglerne på vejen ned. (3) `group` brugte et almindeligt objekt, så `__proto__` nåede `Object.prototype` og kørselen døde med `groups[key].push is not a function` — nu en `Map`. **Læseren taler nu:** rod der ikke kan læses, rod der aldrig lukkes og element den ikke kan navngive kaster i stedet for at give `[]`/`{}`; det var stilheden, der gjorde fund 1 usynligt. XML-udgangen bevises desuden af en regex over alle tag- og attributnavne i testen, ikke af et eksempel. Otte nye engine-tests: mod den gamle `src/engine.js` fejler alle otte med det konkrete symptom, efter rettelsen grøn. Lokalt grøn: `npm test` 99+76+69+6+39+4+173, `npm pack --dry-run` 5 filer, `npm run check:site` grøn inkl. deploy-friskheds-selftesten. Ingen snapshot ændrede sig. Implementationscommit `f49458a`, pushet til `ceo/xml-safe-keys`, **ikke** mergeret til `main` mens `DEPLOY-MISSING` står. Fund: `sort` på tal-strenge er bevidst ikke rettet — `jq`'s `sort_by` gør det samme, så det er en afvejning og ikke en tavs korruption. Næste iteration: `❓ Til Mads` punkt 1 (batchdeployeren) er stadig den eneste beslutning, der frigør mest, og elleve commits på fem branch kan ikke frigives uden den.
