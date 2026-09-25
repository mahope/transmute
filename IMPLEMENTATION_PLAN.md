# IMPLEMENTATION_PLAN

Opdateret: 2026-09-25

## Mission

Transmute er et gratis, lokalt og open source værktøj til at transformere JSON, CSV, YAML og XML via CLI, browser og desktop. Den betalte desktopudgave skal være markant bedre for teams, bureauer og virksomheder — især batch/automatisering, genbrugelige workflows, flere maskiner og prioriteret support. Hele udviklingen skal ske på `ceo/*`-branch og merges til `main`.

## Iterationsstatus

T1 er `I GANG` efter ét mislykket forsøg. Den strenge RustSec-gate er fortsat rød på syv upstream-fund, så ingen senere TODO må starte, før T1 er `FÆRDIG` eller `BLOCKED`. CI- og Dependabot-ændringerne er isoleret på `ceo/rustsec-baseline` og er ikke merged.

## Kvalitetsgate

Den obligatoriske gate er denne, i den angivne rækkefølge:

1. Root: `npm test && npm pack --dry-run`.
2. Rust-kode eller Rust-afhængigheder: derefter `cargo check && cargo test` i `desktop/src-tauri`.
3. Sitefiler efter T6: `npm run check:site`, som skal køre SEO- og layoutkontrollerne i den fastlåste Python/Playwright-miljø.
4. Efter en ekstern batch-deploy: `npm run verify:live -- --no-report` plus indholdskontrol af den konkrete ændring. `--no-report` er obligatorisk, fordi live-scriptet ellers kan sende en outward BugBottle-rapport.

Repoet har ingen root scripts for lint eller typecheck. Den nuværende PR-CI bruger Node 20 og 22 og kører kun `npm test` efterfulgt af `npm pack --dry-run`; T6 gør Rust- og site-gatene reproducible i CI. `npm run release`, tag-triggerede workflows og workflow-dispatch må ikke køres af loopet, fordi de kan publicere eller oprette releases. Nye frontendtests skal wire ind i `npm test`, så de faktisk er en del af gaten.

## Deploy

Loopet må aldrig trigge deploy, webhook, Dokploy-API eller andre udadvendte writes. Kontrakten siger, at kun den eksterne batch-deployer må deploye, men repoet afviger: `.github/workflows/deploy-site.yml:6-12` deployer `site/**` ved push til `main`. Derfor må ingen `site/**`-ændring merges, før T5 har fjernet denne workflow. Denne research-iteration ændrer ikke sitefiler eller deploy-workflows og udløser ingen deploy.

Efter merge af en live-siteændring skal planen få `VERIFICÉR DEPLOY: <ændring> <commit-sha> <tidspunkt med UTC-offset>`. Den eksterne batchdeploy forventes ca. kl. 07:30, 12:30 og 17:30. Kildekontrakten angiver ikke tidszone, så to-vinduer-tællen må først begynde, når den faktiske offset er observeret og skrevet i noten. HTTP 200 er ikke tilstrækkelig; indholdet skal sammenlignes. Efter to dokumenterede deploy-vinduer uden den forventede live-ændring skrives `DEPLOY-MISSING: <detaljer>`, og yderligere merges til `main` stoppes. En uventet deploy fra repo-workflows skrives `DEPLOY-OOPS: <workflow og tidspunkt>` og stopper også merges. Aktuelle deploy-notes: ingen.

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

## Researchfund

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

### 1. [ ] Etablér grøn RustSec-baseline før nye Rust-afhængigheder

**Status:** I GANG
**Mislykkede forsøg:** 1/2
**Sikkerhedsstop:** Produktfasen giver T2 en enkelt undtagelse som første prioritet; T1’s resterende Dependabot/CI-arbejde skal færdiggøres, før T3 eller senere opgaver starter. Efter to mislykkede iterationer markeres T1 `BLOCKED: <RustSec-ID'er og årsag>`, hvorefter næste TODO i køen kan fortsætte.
**Begrundelse:** Sikkerhedshuller skal ordnes før andet. Den nye opener-plugin må ikke føjes til en ubedømt afhængighedsgraf.

**Forsøg 1 (2026-09-25):** `cargo-audit 0.22.2` er installeret lokalt. Nul vulnerabilities og nul yanked, men `cargo audit --deny warnings` fejler korrekt på syv upstream-fund: seks unmaintained-crates gennem Tauri Utils’ `urlpattern 0.3.0` samt `glib 0.18.5` med RUSTSEC-2024-0429 gennem Tauri 2’s Linux/GTK3-kæde. Nyeste stabile Tauri 2.11.6 blev testet i en isoleret lockfile og fjerner ingen af dem. Tauri Utils 2.9.3 kræver `urlpattern ^0.3`, mens 0.6.0 ikke kan bruges som patch, og GTK3/glib har ingen patch i 0.18. Der bruges derfor ingen baseline, ignore-liste, versionsspoofing eller lokal fork. CI- og Dependabot-ændringerne ligger på `ceo/rustsec-baseline` (`7e34c0f`), men merges ikke, fordi den strenge gate er rød. Næste iteration skal genkontrollere upstream; hvis fundene er uændrede, markeres T1 `BLOCKED` med RustSec-ID'erne, og resten af køen kan fortsætte.

**Scope:**

- Installér lokalt `cargo-audit` 0.22.2 med locked dependencies og kør `cargo audit` i `desktop/src-tauri` mod den nuværende `Cargo.lock`.
- Føj Cargo til Dependabot og fastlås `cargo-audit` 0.22.2 i PR-auditen.
- Ret alle fund som del af T1, én major-version pr. commit. Efter to mislykkede iterationsforsøg på samme advisory bliver T1 `BLOCKED: <advisory og årsag>`.

**Acceptkriterier:**

- Den kørende `cargo audit` har exit 0 og nul fund; der bruges ingen baseline, ignore-liste, unexposed-undtagelse eller “åben task”-undtagelse.
- PR-workflowet installerer `cargo-audit` 0.22.2 med `--locked` og kører audit på den checked-in lockfil.
- Dependabot dækker `desktop/src-tauri/Cargo.toml` uden at gruppere urelaterede majors.
- `npm test && npm pack --dry-run`, `cargo check` og `cargo test` er grønne efter alle rettelser.
- Hvert advisory-fix er en selvstændig commit med højst én major-version.

### 2. [x] Reparer desktop-købsflow og åbn Stripe i systembrowseren

**Status:** FÆRDIG
**Mislykkede forsøg:** 0/2
**Begrundelse:** Et køb, der navigerer væk fra appen eller en deaktiveret licensbro, rammer købsflowet direkte. Dette er den første funktionelle opgave efter sikkerhedsbasen.

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

### 3. [ ] Gør licensstatus tidsbegrænset og robust mod licensserverfejl

**Status:** TODO
**Mislykkede forsøg:** 0/2
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

### 4. [ ] Skriv spec for en reelt værdifuld betalt desktopudgave

**Status:** TODO
**Mislykkede forsøg:** 0/2
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

### 5. [ ] Fjern den uoverensstemmende automatiske site-deploy

**Status:** TODO
**Mislykkede forsøg:** 0/2
**Begrundelse:** Nuværende push-workflow kan deploye mod kontrakten og gør det usikkert at merge de efterfølgende siteopgaver.

**Scope:**

- Fjern `.github/workflows/deploy-site.yml`, så den eksterne batch-deployer er eneste udgivelsesvej.
- Tilføj `tools/verify_workflows.mjs`, wire den ind i `npm test`, og lad den fejle hvis en workflow indeholder Cloudflare Pages-deployment eller en push-trigger til en udadvendende deploy.
- Lad CI fortsat validere kode og site, men udfør ingen Cloudflare-, npm-, GitHub-release- eller anden outward action fra agenten.
- Fjern eller deaktivér ingen workflow ved at skubbe et uvedkommende tag.

**Acceptkriterier:**

- Workflow'en findes ikke længere, og workflow-kontrollen grønner i `npm test`.
- `npm test && npm pack --dry-run` er grøn.
- Merge af sletningen logger ingen deploy-kørsel; hvis det alligevel sker, skrives `DEPLOY-OOPS: <workflow og tidspunkt>` og alle merges stoppes.
- Ingen udadvendende action køres fra agenten.

### 6. [ ] Gør Rust- og site-gatene reproducible i CI

**Status:** TODO
**Mislykkede forsøg:** 0/2
**Begrundelse:** Den nuværende PR-gate er kun npm-test/pack, så missionens Rust- og sitekrav er ikke håndhævet automatisk.

**Scope:**

- Etablér Python 3.13.15, `playwright==1.60.0` og Chromium som reproducerbart siteværktøjssæt i en hash-låst requirements-fil.
- Fastlås `pip-audit==2.9.0`, kør det på requirements-filen, og løs alle fund før commit.
- Tilføj `npm run check:site`, så lokale og CI-kommandoer er identiske.
- Kør Rust-gaten på PR/push, når `desktop/**` eller Rust-afhængigheder ændres.
- Kør site-gaten på PR/push, når `site/**`, siteværktøjer eller deres låste dependencies ændres.
- Hold Tauri-appbuild til T2 og den eksisterende manualt udløste release-workflow; loopet udløser den aldrig.

**Acceptkriterier:**

- En PR med en bevidst Rust-regression fejler i CI; en PR med en bevidst site-layout/SEO-regression fejler i CI.
- `npm run check:site` logger Python 3.13.15, Playwright 1.60.0 og den installerede Chromium-version og afslutter 0.
- CI installerer Python 3.13.15, låser requirements med hashes og installerer Chromium med Playwright.
- Root-, Rust-, pip-audit- og site-gates er grønne lokalt med de samme commands.

### 7. [ ] Skab en komplet support- og købsside

**Status:** TODO
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

### 8. [ ] Gør den gratis desktop fuldt brugbar og ens alle klienter

**Status:** TODO
**Mislykkede forsøg:** 0/2
**Begrundelse:** Gratisudgaven må være et godt værktøj, ikke en demo. Den nuværende paste-grænse og drift mellem CLI, browser og desktop svækker tillid og konvertering.

**Scope:**

- Følg fri/Pro-matrixen fra T4.
- Ret manglende `add`/`join` og ensret `group`-semantik.
- Tilføj basal filåbning, filgemning/download og copy af output uden serverupload.
- Definer én canonical engine eller en maskinlæsbar conformance-kontrakt for alle klienter.

**Acceptkriterier:**

- Identiske fixtures for alle 14 dokumenterede operationer giver identisk output i CLI, browser og desktop.
- En bruger kan åbne én lokal fil, transformere den i mindst tre steps, kopiere resultatet og gemme det uden konto eller internet.
- Den frie desktop har ingen arbitrær run-grænse; et lokalt 50-run fixture gennemføres uden køb.
- Nye frontend- og conformance-tests er wire ind i `npm test`; hele roottesten og pack-gaten er grønne.

### 9. [ ] Gør produkt-, platform- og versionsclaims sande

**Status:** TODO
**Mislykkede forsøg:** 0/2
**Begrundelse:** Modstridende claims om Linux, fildåbning og fælles engine skader brugertillid og gør builds uforudsigelige.

**Scope:**

- Beslut om Linux skal understøttes reelt eller fjernes fra alle claims.
- Opret `tools/product-contract.json` som maskinlæselig single source med `product_key: transmute-desktop`, `amount: 19`, `currency: USD`, `billing: one_time`, `machines: 3` og den officielle Payment Link; filen må ikke indeholde secrets.
- Ret README/site/llms/privacy, så de kun beskriver eksisterende funktioner og korrekt licenspayload.
- Synkronisér npm-, Cargo-, Tauri- og siteversion, inklusive siteens `softwareVersion`, gennem én kilde eller en CI-kontrol.
- Tilføj dokumentation af SQL-output og tablenavn, som README mangler.

**Acceptkriterier:**

- En ny `tools/verify_contract.mjs`-kontrol er wire ind i `npm test`, læser `tools/product-contract.json` og fejler ved afvigende pris, currency, billing, maskinantal, Payment Link, produktnøgle, platform, licenspayload eller versioner.
- Kontrollen læser npm-, Cargo-, Tauri- og siteversion, inklusive siteens `softwareVersion`, og kræver ens værdier.
- Hvert reklameret downloadformat findes i den verificerede byggematrix; hvis Linux ikke får et grønt build, fjernes alle Linux-claims samlet.
- README, site, desktop og privacy matcher den faktiske kode og licens-API.
- Versionskontrollen fejler, når versionerne ikke er ens før et build.
- `npm test && npm pack --dry-run`, site-gaten og — hvis Tauri-konfigurationen røres — Rust-gaten er grønne. Der laves ingen tags, releases eller npm-publish.

### 10. [ ] Opdatér runtime og afhængigheder kontrolleret

**Status:** TODO
**Mislykkede forsøg:** 0/2
**Begrundelse:** Alle Hermes-projekter skal følge nye runtime- og pakkeversioner, men major-opgraderinger skal kunne rulles tilbage præcist.

**Scope:**

- Efter T1: tag kompatible patch/minor-opgraderinger samlet.
- Research den aktuelle stabile/LTS-version og registrér præcise from/to-versioner i planen, før kode ændres.
- Tag hver major-version i sin egen commit og læs migrationsnoter først.
- Opret `package-lock.json`, skift CI/publish-kontrol til `npm ci`, og verificér, at den checked-in lock ikke tilføjer unødige runtime-afhængigheder.
- Fastlæg den understøttede Node-, npm- og Rust-version i `engines`, `.nvmrc`/package-manager-pin og Rust-toolchainfil i samme commit som et framework, der kræver den.
- Opdatér GitHub Actions pin-for-pin og undgå samtidige major-opgraderinger i samme commit.

**Acceptkriterier:**

- Planen registrerer hver opgradering fra gammel til ny version og alle nødvendige kodeændringer.
- Gates er grønne efter hver enkelt opgradering; en brydende major rulles tilbage frem for at merges.
- `npm ci`, `npm test && npm pack --dry-run`, `npm audit`, Rust-audit, pip-audit og de relevante runtime-gates er grønne med den nye lockfile.
- `.nvmrc`, `engines`, Rust-toolchainfil og CI-matrix peger på dokumenterede, testede versioner.
- Hver major-version har én selvstændig commit, så præcis rollback kan ske.

### 11. [ ] Implementér den første dokumenterede Pro-værdi i privat repo

**Status:** BLOCKED: kræver navngivet privat Pro-repo og udvikleradgang fra Mads
**Afhængighed:** T4 er specificeret; Mads skal levere repo-sti og adgangskontekst uden secrets i planen.
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

## Beslutninger og fund

- Stripe Payment Link, produktnavn og `product_key` må ikke ændres uden Mads' beslutning; nye produkter, priser og releases er uden for scope.
- Loopet må aldrig oprette tags, releases, npm-publiceringer eller udløse deploy.
- Produktreglen fra 24. september prioriterede T2 før T1; RustSec-auditen blev alligevel kørt før og efter pluginændringen, og RUSTSEC-fixen blev gjort i commit `4d1a828`.
- `cargo audit` fandt først `rustls 0.23.43` med RUSTSEC-2026-0285; den blev opdateret til `0.23.45`. Efter `tauri-plugin-opener 2.5.5` gav audit exit 0 uden vulnerabilities, men syv advarsler (bl.a. `glib` RUSTSEC-2024-0429 og flere unmaintained-pakker); T1’s strenge advarsel-/Dependabot-gate er derfor stadig åben.
- T2 bruger `withGlobalTauri`, den eksakte `opener:allow-open-url`-ACL og `plugin:opener|open_url` gennem den statiske frontend; begge links har headless regressionstest og Tauri-build.
- Pakket macOS-app-build lykkedes, men GUI-smoke kunne ikke køres i dette miljø, fordi `orca` ikke er installeret; browserhåndtering og fallback er derfor kun automatisk mock-verificeret.
- `cargo fmt --check` rapporterer tre eksisterende formateringsafvigelser i `desktop/src-tauri/src/lib.rs`; de er ikke relateret til T2 og blev ikke ændret for at holde diffen minimal.
- T3 kommer før T4, fordi produktfasen eksplicit prioriterer købs-/licensfejl over konvertering og Pro-værdi.
- Gratis desktop skal ifølge strategien være fuldt brugbar; den nuværende tredobbeltige demofris er ikke en gyldig langsigtigfri/Pro-grænse.
- Den private/public-grænse er låst: betalt implementation lever i privat repo, mens public repo er en god gratisvare.
- Fund undervej skal blive prioriterede planopgaver, ikke sidespor i en igangværende opgave.

## Navneforslag

- Anbefalet: **Transmute Studio** — tydeligt og dækker batch, gemte workflows og automation.
- Alternativer: **Transmute Batch** hvis automation ikke er i første udgivelse; **Transmute Flow** hvis navngivne pipelines er produktets kerne.
- Stripe-navnet `Transmute Desktop` og `product_key: transmute-desktop` ændres ikke.

## ❓ Til Mads

1. **Privat Pro-repo:** T11 kan ikke begynde, før Mads har oprettet eller navngivet et privat repo og givet de nødvendige udviklere adgang. Loopet opretter ikke selv eksterne repos.
2. **Deploy-tidszone:** Kildekontrakten angiver 07:30/12:30/17:30 uden tidszone. Angiv den offset, external batchdeployeren bruger, før en `DEPLOY-MISSING`-tæller må starte.
3. **Linux:** anbefales at fortsætte med Linux-builds, fordi README og site lover det. Alternativet er at fjerne løftet, indtast en verificeret Linux-pipeline er klar.

## Iterationlog

- 2026-09-25: Research-iteration gennemført på `ceo/transmute-roadmap` med plan-commit `b46b1e2`; planen er oprettet ud fra repo, mission, Stripe-kontrakt og afhængighedsstatus.
- 2026-09-25 03:11 UTC: T2 gennemført på `ceo/desktop-opener`; rustls advisory-fix isoleret i `4d1a828`, opener-plugin, ACL, frontend-handler, fire headless checks og debug `.app`-build gennemført. Implementationscommit: `2c3b6c2`. GUI-smoke afventer Orca/computer-use.
- 2026-09-25 03:29 UTC: `6e89d13` mergeret fast-forward til `main` og pushet til `main` samt `ceo/desktop-opener`; CI-run `36090507215` sluttede `success`, og ingen deploy-site-run blev udløst.
- 2026-09-25 05:37 UTC: T1-forsøg 1 gemt på `ceo/rustsec-baseline` som `7e34c0f` og pushet uden merge. Root-test/pack, Cargo check/test og YAML-parsning er grønne; `cargo audit --deny warnings` fejler korrekt på syv upstream-fund. Næste iteration skal genkontrollere dem.
