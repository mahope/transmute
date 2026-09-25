# IMPLEMENTATION_PLAN

Opdateret: 2026-09-25

## Mission

Dette offentlige repo leverer den gratis, lokale og open source CLI til at transformere JSON, CSV, YAML og XML samt det offentlige site. Den betalte desktopudgave, licenslogikken og al Pro-implementation ligger i det private `mahope/transmute-desktop` og udvikles i loopet `transmute-desktop`. Her er målet at gøre CLI'en fuldt brugbar og gøre vejen til Desktop Pro tydelig. Hele udviklingen skal ske på `ceo/*`-branch og merges til `main`.

## Iterationsstatus

Desktopkoden blev flyttet til `mahope/transmute-desktop` i commit `16cb82a`. T1's RustSec-afhængigheder findes derfor ikke længere i dette offentlige repo, og den uafsluttede `ceo/rustsec-baseline` skal ikke merges hertil. T1 er lukket som overført uden en ny audit af en afhængighedsgraf, der ikke længere findes. T5 er færdig med commit `28a06dd`, T6 med `d555f65` og T7 med `0534cb8`. T8 er næste opgave.

## Kvalitetsgate

Den obligatoriske gate er denne, i den angivne rækkefølge:

1. Root: `npm test && npm pack --dry-run`.
2. Site: `npm run check:site` (opbygger `.venv-site` med Python 3.13.15, Playwright 1.60.0 og Chromium, kører SEO-, layout- og selftesten) og `npm run audit:site` (`pip-audit` på den hash-låste lockfil). Begge er T6 og kører med præcis samme kommando lokalt og i CI.
3. Efter en ekstern batch-deploy: `.venv-site/bin/python tools/verify_live.py --no-report` plus indholdskontrol af den konkrete ændring. `--no-report` er obligatorisk, fordi live-scriptet ellers kan sende en outward BugBottle-rapport.

Repoet har ingen root scripts for lint eller typecheck. Den nuværende PR-CI bruger Node 20 og 22 og kører kun `npm test` efterfulgt af `npm pack --dry-run`; T6 har lagt site-gaten i `.github/workflows/site-gate.yml`, som kun kører på site- og værktøjsændringer. `npm run release`, tag-triggerede workflows og workflow-dispatch må ikke køres af loopet, fordi de kan publicere eller oprette releases. Nye frontendtests skal wire ind i `npm test`, så de faktisk er en del af gaten.

## Deploy

VERIFICÉR DEPLOY: `/support/` + Support-link i footeren på alle 19 sider + `lastmod` 2026-09-24 i sitemap, commit `0534cb8`, push 2026-09-25T16:35Z (18:35 CEST). Tidszonen for batchdeployeren er stadig ukendt, så to-vinduer-tællen kan ikke begynde, før Mads svarer.

Loopet må aldrig trigge deploy, webhook, Dokploy-API eller andre udadvendte writes. Den tidligere `.github/workflows/deploy-site.yml` deployed `site/**` ved push til `main` og blev fjernet i commit `28a06dd`. `tools/verify_workflows.mjs` er nu en del af `npm test` og afviser Cloudflare Pages eller kendte push-triggerede deploymekanismer. T5 rørte ingen sitefiler, så der forventes ingen ekstern batch-deploy og der er oprettet ingen `VERIFICÉR DEPLOY`-note.

Før T5-merge var seneste `deploy-site`-kørsel run `36062253130` med commit `3d90812ee423d61da7dc9096f5f9985da6e90a75`, oprettet `2026-09-24T21:33:38Z`. Efter merge af `28a06dd` blev ingen ny `deploy-site`-kørsel oprettet; CI-run `36146904851` for committen sluttede `success` den `2026-09-25T14:21:13Z`.

Efter merge af en fremtidig live-siteændring skal planen få `VERIFICÉR DEPLOY: <ændring> <commit-sha> <tidspunkt med UTC-offset>`. Den eksterne batchdeploy forventes ca. kl. 07:30, 12:30 og 17:30. Kildekontrakten angiver ikke tidszone, så to-vinduer-tællen må først begynde, når den faktiske offset er observeret og skrevet i noten. HTTP 200 er ikke tilstrækkelig; indholdet skal sammenlignes. Efter to dokumenterede deploy-vinduer uden den forventede live-ændring skrives `DEPLOY-MISSING: <detaljer>`, og yderligere merges til `main` stoppes. Aktuelle deploy-notes: ingen.

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

**Verifikation:** `npm test` (38 engine + 39 workflow), `npm pack --dry-run` (5 filer), `npm run audit:site` (`No known vulnerabilities found`) og `npm run check:site` er grønne. Site-gaten melder `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px og fire grønne selvtesttrin inkl. de to fangede regressioner. CI-run afventer notering.

**Flake fundet og lukket undervejs:** Første `check:site` kørsel var rød med `FEJL layout-regression fanges (exit 1)`, selvom samme trin er grønt i isolation. En reproduktion af den indbyggede 2400 px-regression gav dog korrekt `horizontal overflow` ved alle tre bredder, så årsagen lå i selftestens manglende diagnoseoutput, ikke i layout-regressionen. `site_gate_selftest.py` hæfter nu checkerens egen output på en fejl, og `layout_check.py` fanger Playwright-fejl pr. side (én side pr. URL, `goto`-timeout 20 s) og tæller dem som afvigelse i stedet for at gå i stykker med en traceback. Tre efterfølgende grønne kørsler af hele gaten. Fremtidige røde site-gater er dermed læsbare, ikke uforklarlige.

### 8. [ ] Gør den gratis CLI komplet, dokumenteret og ens sitets engine

**Status:** TODO
**Mislykkede forsøg:** 0/2
**Begrundelse:** Efter desktopflytningen er CLI'en hele gratisproduktet i repoet. Den skal løse reelle opgaver fuldt ud, have tydelig fejlhåndtering og bruge samme transformationssemantik som det offentlige site.

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

### 9. [ ] Gør produkt-, platform- og versionsclaims sande

**Status:** TODO
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

### 10. [ ] Opdatér runtime og afhængigheder kontrolleret

**Status:** TODO
**Mislykkede forsøg:** 0/2
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

### 12. [ ] Udgiv support-siden på dansk

**Status:** TODO
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

## Beslutninger og fund

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

## Navneforslag

- Anbefalet: **Transmute Studio** — tydeligt og dækker batch, gemte workflows og automation.
- Alternativer: **Transmute Batch** hvis automation ikke er i første udgivelse; **Transmute Flow** hvis navngivne pipelines er produktets kerne.
- Stripe-navnet `Transmute Desktop` og `product_key: transmute-desktop` ændres ikke.

## ❓ Til Mads

1. **Privat Pro-repo:** `mahope/transmute-desktop` er navngivet, men dette checkout har ingen udvikleradgang til det. Loopet kan derfor hverken skrive Pro-specen eller implementere batch/automation dér.
2. **Deploy-tidszone:** Kildekontrakten angiver 07:30/12:30/17:30 uden tidszone. Angiv den offset, external batchdeployeren bruger, før en `DEPLOY-MISSING`-tæller må starte.
3. **Supportadresse:** Kontrakten nævner kun `orders@mahoje.dk` som afsender af kvitteringen, ikke som indgående adresse. Skal support-siden linke til en postkasse, eller er `mahoje.dk` plus GitHub issues det tilsigtede kontaktpunkt? Loopet bruger pt. kun mahope.dk og GitHub issues, fordi det er de eneste kontakter privacy-siden allerede dokumenterer.
4. **Dansk support-side:** T12 er klar til at blive taget, men kræver en beslutning om, om det danske købsflow er vigtigt nok til at prioriteres frem for T8 (CLI-dokumentation) og T9 (sandhedsdygtige claims).

## Iterationlog

- 2026-09-25: Research-iteration gennemført på `ceo/transmute-roadmap` med plan-commit `b46b1e2`; planen er oprettet ud fra repo, mission, Stripe-kontrakt og afhængighedsstatus.
- 2026-09-25 03:11 UTC: T2 gennemført på `ceo/desktop-opener`; rustls advisory-fix isoleret i `4d1a828`, opener-plugin, ACL, frontend-handler, fire headless checks og debug `.app`-build gennemført. Implementationscommit: `2c3b6c2`. GUI-smoke afventer Orca/computer-use.
- 2026-09-25 03:29 UTC: `6e89d13` mergeret fast-forward til `main` og pushet til `main` samt `ceo/desktop-opener`; CI-run `36090507215` sluttede `success`, og ingen deploy-site-run blev udløst.
- 2026-09-25 05:37 UTC: T1-forsøg 1 gemt på `ceo/rustsec-baseline` som `7e34c0f` og pushet uden merge. Root-test/pack, Cargo check/test og YAML-parsning er grønne; `cargo audit --deny warnings` fejler korrekt på syv upstream-fund. Næste iteration skal genkontrollere dem.
- 2026-09-25 05:38 UTC: Planstatuscommitten `c9ba6b9` pushet til `main`; CI-run `36099345814` sluttede `success`, og ingen deploy-site-run blev udløst.
- 2026-09-25 07:11 UTC: T1 lukket som overført efter `16cb82a`; T5 implementeret på `ceo/remove-auto-deploy`. Deploy-workflowen er fjernet, 39 workflow-regressioner dækker Cloudflare, push-deploy, YAML-varianter og lokale actions, og 38 engine-tests plus pack og npm-audit er grønne. Merge og kontrol af nye deploy-runs afventet.
- 2026-09-25 14:21 UTC: T5 merged til `main` i `28a06dd` og pushet til `main` samt `ceo/remove-auto-deploy`; CI-run `36146904851` sluttede `success`, og ingen ny `deploy-site`-run blev oprettet.
- 2026-09-25 16:02 UTC: T6 gennemført på `ceo/site-gate-ci`. Hash-låst `tools/site-requirements.txt` (54 pakker, `playwright==1.60.0` + `pip-audit==2.9.0`), `tools/site_gate.sh`, `tools/site_gate_selftest.py`, `TRANSMUTE_SITE`-override i begge checkere, npm-scripts `check:site`, `audit:site` og `lock:site` samt `.github/workflows/site-gate.yml`. Lokalt grøn: 0 SEO-fund på 18 sider, 0 layout-afvigelser ved 360/768/1280, 4 grønne selvtesttrin, pip-audit uden fund, 38+39 tests og `npm pack --dry-run` grøn. Implementationscommit `d555f65`, mergeret fast-forward til `main` og pushet til `main` samt `ceo/site-gate-ci`. CI-run `36158172199` (`CI`) sluttede `success`; `Site gate`-run `36158172198` sluttede `success` efter 1 min. 15 s med de fire grønne selvtesttrin i loggen. Ingen sitefil rørt, ingen deploy-note, ingen `deploy-site`-run. Næste opgave er T7 (`/support` og købsside).
- 2026-09-25 ca. 11:20 lokal tid: T7 gennemført på `ceo/support-page`. `site/support/index.html` med køb via den officielle Payment Link, 32-tegns nøglen, tre maskiner, fejlfinding, nøglersikkerhed, kontakt og en kort donationstekst; Support-link i footeren på alle 19 sider via `site_chrome.py`; `llms.txt` opdateret; sitemap og søgeindeks regenereret (102 → 103 entries). En rød site-gate undervejs blev isoleret som flake og lukket: `layout_check.py` fejler nu pr. side med 20 s `goto`-timeout i stedet for at gå i stykker, og `site_gate_selftest.py` hæfter checkerens output på en fejl. Lokalt grøn: `npm test` (38 + 39), `npm pack --dry-run` (5 filer), `npm run audit:site` uden fund, `npm run check:site` med 0 SEO-fund på 19 sider, 0 layout-afvigelser ved 360/768/1280 px og fire grønne selvtesttrin; tre grønne site-gate-kørsler efter flake-fixen. Implementationscommit `0534cb8`, mergeret fast-forward til `main` og pushet til `main` samt `ceo/support-page`. T8 er næste opgave; T12 (dansk support-side) er lagt til med hreflang-krav.
