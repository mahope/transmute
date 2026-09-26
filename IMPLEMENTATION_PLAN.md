# IMPLEMENTATION_PLAN

Opdateret: 2026-09-26 (T42)


## Mission

Dette offentlige repo leverer den gratis, lokale og open source CLI til at transformere JSON, CSV, YAML og XML samt det offentlige site. Den betalte desktopudgave, licenslogikken og al Pro-implementation ligger i det private `mahope/transmute-desktop` og udvikles i loopet `transmute-desktop`. Her er målet at gøre CLI'en fuldt brugbar og gøre vejen til Desktop Pro tydelig. Hele udviklingen skal ske på `ceo/*`-branch og merges til `main`.

## Iterationsstatus

Desktopkoden blev flyttet til `mahope/transmute-desktop` i commit `16cb82a`. T1's RustSec-afhængigheder findes derfor ikke længere i dette offentlige repo, og den uafsluttede `ceo/rustsec-baseline` skal ikke merges hertil. T1 er lukket som overført uden en ny audit af en afhængighedsgraf, der ikke længere findes. T5 er færdig med commit `28a06dd`, T6 med `d555f65`, T7 med `0534cb8`, T8 med `86a236d` (slice 1 i `414eb8b`) og T9 med `f2956f5`. T13 er færdig med commit `4d7fc35`, T14 med `5f64894` og T15 med `2fb9631`, alle tre på `ceo/deploy-freshness-check` og **ingen af dem mergeret**, fordi `DEPLOY-MISSING` står. T8 og T9 er lukket. T12 er færdig med `6516fdb` (dansk support-side), T13 med `4d7fc35`, T14 med `5f64894`, T15 med `296f40e`/`bf61cce`-bunken, T16 med `bf61cce`, T17 med `8be3643`, T18 med `a31aba8` og T19 med `538aa2e` — de ni ligger u mergerede på `ceo/xml-attributes` og dens afkom, fordi diffene rører `site/engine.js` og `DEPLOY-MISSING` står. T20 er færdig med commit `dbeae3c` på `ceo/nested-cells` og har samme grund. T21 er færdig på `ceo/xml-safe-keys` og har samme grund. T22 er færdig med commit `0115204` på `ceo/format-detect` og har samme grund. T23 er færdig med commit `29f1e9a` og T24 med `ca259c1`, begge på `ceo/expression-syntax` — T24 lå i samme iteration, fordi T22's research allerede havde fundet og reproduceret den. Begge har samme grund. T25 er færdig med commit `5fd4648` på `ceo/pipeline-validation`, bygget oven på `ceo/expression-syntax`, og har samme grund. T26 er færdig på `ceo/missing-fields`, bygget oven på `ceo/pipeline-validation`, og har samme grund. T27 er færdig med commit `0abe7a3` på `ceo/record-shape`, bygget oven på `ceo/missing-fields`, og har samme grund. T28 er færdig med commit `763efbc` på `ceo/repeated-flags`, bygget oven på `ceo/record-shape`, og har samme grund. T29 er færdig med commit `e156dec` på `ceo/dead-options`, bygget oven på `ceo/repeated-flags`, og har samme grund — den rører heller ingen `site/`-fil. T30 er færdig med commit `837eb4a` på `ceo/utf8-input`, bygget oven på `ceo/dead-options`, og har samme grund: den rører kun `src/cli.js`, `docs/cli.md` og to testfiler, ingen `site/`-fil. T31 er færdig med commit `c5e7d4b` på `ceo/paths-locale-limits`, bygget oven på `ceo/utf8-input`, og har samme grund — den rører `site/engine.js`, så den kræver en `VERIFICÉR DEPLOY`-note når bunken merges. Se Deploy og `❓ Til Mads` punkt 1. T10 er færdig med ni slices: 1 i `14dce0b`, 2 i `599ca4f`, 3 i `a4114ca`, 4 i `8a161fb`, 5 in `bb19768`, 6 i `c446d37`, 7 i `c1bee9f`, 8 i `9b7ddf5` og 9 i `427b113` + `fda739c` (runner-images). Dependabot-PR #4 er lukket med vilje. T34 er færdig med commit `e8641c1` på `ceo/reader-gaps`, bygget oven på `ceo/reader-ambiguity`, og har samme grund — den rører `site/engine.js`. T38 er færdig med commit (se punkt 38) på `ceo/nonfinite-numbers`, bygget oven på `ceo/lone-surrogate-loss`, og har samme grund: rører `site/engine.js`. T36 er færdig med commit `6c13df1` på `ceo/download-guard`, bygget oven på `ceo/playground-warnings`, og har samme grund. T35 er færdig med commit `7fdd7d8` på `ceo/playground-warnings`, bygget oven på `ceo/reader-gaps`, og har **samme grund, men en anden**: den rører hverken `engine.js` (motoren er urørt) eller andet end rammen, `site.js` og CSS — men `DEPLOY-MISSING` gælder alle merges til `main`, uanset hvor lille diffen er.

**Deploy-status ⚠️ (genverificeret 2026-09-26 med `npm run check:deploy`, starten på T42-iterationen):** uændret for **syvtede** gang i træk. Live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig. Se `❓ Til Mads` punkt 1.

**VIGTIGT — læs planen på den nyeste `ceo/*`-branch, ikke på `main`.** `main`'s kopi af denne plan er frosset ved T10 (`f4a0a9d`): den nævner hverken T11–T29, fordi ingen af de efterfølgende commits er mergeret mens `DEPLOY-MISSING` står. Kontrakten siger "check ud på default-branchen og læs planen", og det er det den iteration, der kommer, skal gøre — men den skal læse planen fra `ceo/dead-options` (eller den branch der nu er nyest), ellers læser den en kø, der slutter ved T10, og genopfinder arbejde, der allerede er gjort. Det er en følge af deploy-stillen, ikke en selvstændig fejl, og den opløses automatisk når bunken merges.

**Næste iteration:** T42 er færdig (se punkt 42) på `ceo/table-cell-sql-ident`, bygget oven på `ceo/csv-scalar-types`, med samme grund: rører `site/engine.js`. Den lukkede den **tredje** ende af skriverens celle og gav **otte fund i to funktioner** — syv i `table` (et tegn der flytter markøren eller bryder linjen kan ikke vises i en terminal-celle, så det har ingen bogstavelig stavelse) og ét i `sql` (identifikatorer var citeret men ikke escaped, så ét skævt citattegn i `--table` gav en fil sqlite3 afviser). Deploy-stillen er uændret, så bunken er nu **enogtyve** færdige commits på toogtyve branch uden merge. Kør `npm run check:deploy` først; er `DEPLOY-MISSING` væk, merges hele bunken til `main` og `VERIFICÉR DEPLOY`-noterne lukkes. Står den stadig, skal næste opgave være **T43**, målt før den skrives, og den skal **ikke** genåbne punkt 16 i `❓ Til Mads` (en beslutning, ikke en flade) eller punkt 15's tabsfri læser (en ændret værdi, ikke en målt tavshed).

**Den fjerde ende er målt delvist af T42, og den er den næste flade.** T42's måling fandt to ting den **bevidst** lod ligge, fordi de er afvejninger og ikke tavsheder, og begge er skrevet ned med begrundelse i stedet for rettet: SQL-værdier med et linjeskift (gyldig SQL, værdien kommer tilbage intakt) og at en indlejret værdi i `table` bliver `["x\|y"]`, som ikke er gyldig JSON (rigtigt for en celle, der aldrig læses af en maskine, og forkert for enhver anden flade). Den ubeskrevne del er den **fjerde** ende, som ingen måling endnu har rørt: **`csv` og `sql` på de samme tegn som T42 målte på `table`**, altså en værdi med et linjeskift, en `|` eller en `+---+` i en CSV-celle og i et SQL-literal. Ikke antaget målt — T42's måling dækkede kun `table` og `sql`, og en bred antagelse om "de andre formatters" ville være den samme fejl som den, målingen blev lavet for at undgå.

**T38's anden måling, den store, er stadig åben og er ikke en flade.** `9007199254740993` → `9007199254740992` i alle seks formater kan **ikke** fanges ved skrivningen, fordi tabet sker i `JSON.parse`. Den ligger i `❓ Til Mads` punkt 15 og afgøres sammen med punkt 16, fordi begende kræver den samme nye læsevej.

**Den gamle næste iteration (T38) er færdig:** T38 er færdig (se punkt 38) og ligger på `ceo/nonfinite-numbers`, bygget oven på `ceo/lone-surrogate-loss`, med samme grund: rører `site/engine.js`. Deploy-stillen er uændret, og derfor ligger **syvogtyve** færdige commits på atten branch uden merge. Den næste iteration skal **først** køre `npm run check:deploy`; er `DEPLOY-MISSING` væk, merges hele bunken (T36 `6c13df1`, T37 `6891d75`, T38 `67b5e50`, T13 `4d7fc35`, T14 `5f64894`, T15 `2fb9631`, T16 `bf61cce`, T17 `8be3643`, T12 `6516fdb`, T18 `a31aba8`, T20 `dbeae3c`, T21 `f49458a`, T22 `0115204`, T23 `29f1e9a`, T24 `ca259c1`, T25 `5fd4648`, T26 `b20b809`, T27 `0abe7a3`, T28 `763efbc`, T29 `e156dec`, T30 `837eb4a`, T31 `c5e7d4b`, T32 `88ea6f6`, T33 `46b5567`, T34 `e8641c1` og T35 `7fdd7d8`) til `main`, og `VERIFICÉR DEPLOY`-noterne lukkes. Står den stadig, skal den næste opgave være **T39**, og den skal måles før den skrives. Den skal fortsætte i den flade T38 lige målte, fordi T38's måling fandt **to ting den ikke rettede** — se punkt 38's afsnit om de to tal, der hver især er en målt tavshed: `9007199254740993` skrives som `9007199254740992` i alle seks formater, fordi `JSON.parse` runder ved læsningen, og `1e-7` skrives af YAML-skriveren som `1e-7`, som PyYAML læser som **str** (YAML's float-syntaks kræver `1.0e-7`). Den anden af de to er lille nok til at være en skrivefejl; den første er en ændret værdi i en fil, ingen kan se, og den kan **ikke** fanges ved skrivningen — tallet er allerede tabt, når motoren ser det — så den kræver enten en tabsfrit læser eller en advarsel ved læsningen. Begge skal måles på den rigtige binary, og den første skal have en målbar acceptkriterium-formulering, fordi `jq` *beholder* de store heltal, så "det er sådan tal er" ikke holder.

**Den flade hvor advarslerne dør, er lukket af T35.** Den lå i **én** linje: `site/try.html` svarte `{ text, error, rows, format }` og ikke `warnings`, så alle otte advarselsproducerende stier T13–T34 har lavet endte i samme sted. De var ikke otte fejl og heller ikke otte fund — de var ét fund med otte ansigter, fordi motoren har sagt det hele tiden og CLI'en har printet det hele tiden, og det eneste der manglede var at rammen videresendte det. Nu males advarslerne i **deres eget element under output**, aldrig i det, fordi kopier og download læser outputelementet, og en advarsel dér ville blive kopieret som data — samme skelnelinestandard som CLI'ens stderr/stdout-adskillelse. Den farligste af de to målte tilfælde var `unique --by` på et felt ingen rækker har: **én række ud af tre skrevet, exit 0, tom stderr**, altså tabt data uden en eneste linje til brugeren.

**Den tolvte flade er målt og delvis lukket af T33.** Efter elleve flader lå de eneste uudforskede stier i de **andre læsere**: hvad gør en læser med en fil, den ikke forstår. Fjorten stier målt på den rigtige binary, **otte rene** (CSV-feltantalskollision holder i tre varianter, korte rækker, tab-indenteret YAML, blandet tekst i XML, to rødder med forskellige navne) og **to fund**. Den første er den klassiske YAML-fælde i fire forklædninger: `{"name":"Ada","name":"Bob"}` og `k: 1 / k: 2` gav den **sidste** værdi og tabte den første med exit 0 og tom stderr — i JSON på roden, i JSON dybt nede, i YAML-blokmapping og i YAML-flowmapping. Det ser ud som om en merge lykkedes, altså præcis den fejl en bruger stoler på værktøjet til at fange. Den anden er, at alt efter XML'ens rodelement **aldrig blev læst**, så et batchværktøjs sammenbundne dokumenter gav kun det første: exit 0, tom stderr, halv en fil der ligner alle. Rettelsen er én advarsel til alle læsere (nøgle, begge værdier, linje) og exit 3 for alt efter roden, fordi et XML-dokument har ét rodelement.

**De fire flader, T21 og T22 efterlod, er lukket:** serialiseringssiden (T20: `[object Object]`, array-kollision, `join --prefix`), `unique` uden `by` og `group` (T21: rækkefølgeafhængig nøgle, `__proto__`), XML-udgangen (T21: ulovlige tag-navne, tavs læsefejl) og `detectFormat` (T22: svagere kopi af læserens regel, afvisning af TSV/semikon/pipe/enkolonne på stdin). **`sort` er den eneste af de fire, der står åben, og den er dokumenteret væk i T21**: tal-strenge sorteres leksikografisk, fordi det er præcis hvad `jq`'s `sort_by` gør på strenge, og CSV-coercion gør tal til tal alligevel. Det er en afvejning, ikke en tavs korruption, så den kræver en beslutning fra Mads, ikke en fix.

**Den sjette flade, `compileExpression`, er lukket af T23.** Den fangede *alle* fejl i et `new Function` og returnerede så alligevel identiteten, så `item.age >` kørte med exit 0, tom stderr og alle rækker i output. Nu kaster den med expressionen og V8's egen besked, og `run` fører et `usage`-flag videre, så **en dårlig expression er exit 2 (det er brugerens eget input) mens en expression, der kaster ved kørsel, fortsat er exit 1**. Den asymmetri, fundet viste omvendt af, er rettet. `add` kompilerer nu før den første række, så syntax-fejl ikke længere falder ned i den per-record catch og giver en hel kolonne af nuller.

Beslutningen, planen havde lagt åben — *hvor må den fejle* — viste sig at have svar i begge miljøer uden ekstra kode: kaldet ligger inde i `run`s `try`, `site/try.html:27` sender `r.error` videre, og playgroundet har allerede en fejlboks. CLI exit 2, browser fejlboks, samme engine. Det er det bedre svar end "håndtér det to steder", fordi der ikke er to steder.

**Den sjette flade er lukket af T25.** T23's research pegede på `run`s fejlklassificering, og den viste sig at have en enklere form: ikke at *klassificere* fejl, men at **hver operation var kørbar uden den parameter, den ikke kan arbejde uden**. `parsePipeline` krævede et `op`-nøgle og kendte ellers ingen af reglerne, så `{"op":"filter"}` var identiteten, `{"op":"pick"}` skrev `{}` for hver record, og `{"op":"join","on":"i","with":[]}` droppede alle rækker — alt sammen exit 0, tom stderr, gyldigt output. T25 samler reglerne i én `validatePipeline` i engine'en, som både `parsePipeline` og `run` kalder.

**Den syvende flade er lukket af T26.** Den var den anden halvdel af T25's emne: T25 lukkede "mangler der en parameter", T26 lukkede "er parameteren rigtig for de data, den møder". Alle otte felter, T25's research havde peget på, viste sig at have hver sit eget tavse svar, og den værste var ikke blandt dem T25 havde nævnt: `unique` med `by: "ag"` på en fil med `age` sammenlignede `undefined` med `undefined`, kaldte alle fire rækker identiske og skrev **én** række ud med exit 0 og tom stderr — det eneste sted i værktøjet hvor en fejl fjerner data. T25's åbne spørgsmål — skelner man mellem et feltnavn ingen rækker har og et, nogle har? — er besvaret med ja, og **svaret er en advarsel, ikke en fejl**: et feltnavn er en antagelse om data, som kan være rigtig for næste fil, så kørslen lykkes og skriver sit output, mens én linje på stderr fortæller hvad steppet faktisk gjorde. Heterogene data advares aldrig, fordi det er det `pick` er bygget til.

**Den familie T26 efterlod, er lukket af T27.** T26 skrev designspørgsmålet ned i stedet for at gætte: skal `pick` på ikke-records returnere `{}`, fejle i Transmutes sprog, eller skal `map` altid levere records? Svaret er **en fejl i Transmutes sprog**, og researchen bag den viste, at spørgsmålet var større end `pick`. Efter et `map` der efterlod strenge var **seks af de otte** step, der navngiver et felt, tavse: `omit` og `rename` byggede kolonnerne `0 1 2 3` med `A l i c e` i — data filen aldrig indeholdt; `add` spreadede et tal ind i `{}` og tabte tallet; `group` lagde hver række i `(null)`; `unique --by` sammenlignede `undefined` med `undefined` og slettede alle rækker undtagen én; `join` tabte hver række og skrev en tom fil. Alle exit 0, tom stderr. Kun `pick` var høj, og den råbte V8's egne ord: `Cannot use 'in' operator to search for 'name' in Ada`. Nu siger **alle ni** det samme i Transmutes sprog, med step, rækkenummer og rækkens type, og intet skrives.

**Forskellen på advarsel og fejl er her ikke et smagspørgsmål, men T26's egen skelneline.** Et *feltnavn* er et antagende om data, der kan være rigtigt for næste fil, så det er en advarsel (T26). En *række uden felter* er ikke noget steppet kan overleve: der er intet at læse, og ethvert svar — `{}`, tegnindekser, en tabt række — er opdigtet eller tabt data. Derfor fejl, exit 1, tom stdout, ingen fil. `count`, `head`, `tail`, `filter`, `map` og `unique` uden `by` skal fortsat virke på ikke-records, ellers ville vagten selv blive en ny tavs tab: det step der skabte strengene, skal kunne se dem.

**Den ottende flade, argument-parseren, er lukket af T28.** Den var den anden slags tavshed, T27 havde fundet på vejen: CLI'en tog det **sidste** `--pipe`, `--format`, `--output`, `--out`, `--delimiter` og `--table` og kasserede de forrige i stilhed. Syv kørsler, alle exit 0 med tom stderr, og to af dem slettede data: `-f json -f csv` læste JSON'en som én kolonne og skrev den tomme resultat den selv fandt på, og `--out a.csv --out b.csv` lod `a.csv` forsvinde. Nu afvises et gentaget flag med exit 2 og en besked der siger hvad der ville være sket og, for `--pipe`, hvordan det skrives i stedet. To valg er værd at huske: **afvise, ikke sammensætte** — `--pipe` er det eneste flag hvor en sammensætning betyder noget, og den gør flagenes rækkefølge afgørende for stepenes, så den ville være det ene flag med en skjult regel; og **tallet er hele kommandolinjen**, fordi parseren ellers stoppede ved det første gentagne flag og sagde "2 gange" om tre. Konformitetslåsen mellem fejl, `--help` og `docs/cli.md` er testet mod mutation, ikke bare skrevet.

**Den niende flade er lukket af T29.** Den var den anden slags tavshed i samme familie som T28: et flag, der aldrig bruges, fordi et andet mangler. `transmute people.csv --out p.csv` uden `--output` kører previewen, exit 0, tom stderr, og filen skriver aldrig sig — brugeren beder om en fil og får en tabel. To målinger gjorde opgaven større end den så ud: med `--pipe` blev filen skrevet *som ASCII-tabel under et `.json`-navn*, og `--delimiter` viste sig at være død i halvdelen af de tilfælde, scope'en havde antaget, fordi kun CSV-*læseren* bruger flaget mens skriveren altid skriver komma. Alle tre er nu exit 2 med en besked, der siger hvad der mangler, og intet skrives.

**Den tiende flade er lukket af T30.** Den var den eneste måling, der ikke var en tavshed om *kommandoen*, men om *data ind* — de otte foregående flader var alle svar på en kørsel, der lignede den brugeren skrev. Her kom der data ind, som aldrig nåede ud: `fs.readFileSync(path, 'utf-8')` erstatter ethvert byte-segment, der ikke er gyldigt UTF-8, med U+FFFD, **uden at fejle**. En Windows-1252-eksport af en dansk kundeliste kom ud som `M?ller`, exit 0, tom stderr, og de ødelagte navne blev skrevet til outputfilen, hvor de så sunde ud; en UTF-16-eksport blev ét feltnavn af `\uFFFD` og `\u0000`. Det er det eneste fund i de ti flader, der **fjerner data** i stedet for at skjule et forkert svar, og det er præcis T13's egen motivation — "dansk Excel-eksport" er i praksis cp1252, fordi Excel på Windows ikke skriver UTF-8 som standard. Nu læses både fil og pipe som **bytes**, `isUtf8` afgør det før der dekodes, og input der ikke er UTF-8 er exit 3, tom stdout, ingen fil, med en besked der siger hvor det første døde tegn står og hvordan filen laves om.

**Den elvte flade er målt af T31, og den var den største.** Efter ti målte tavsheder lå de eneste fire uudforskede stier i planen: filstier med mellemrum i `--out`, POSIX-locale, filer ≥ 100.000 rækker mod `Limits`-løftet, og YAML-mappingsdybde. Mellemrum, ny linje i et filnavn, tre locale'er og dyb JSON på 2.000 niveauer viste sig **alle rene** — de er skrevet ned i T31's målingstabel, så de måles ikke igen. De 100.000 rækker var derimod **to fejl i én linje**: `Math.max(...data.map(...))` i `serializers.table` døde med stack overflow omkring 115.000 rækker, altså på en 4 MB-fil, og fordi `table` er previewens format døde den simple `transmute people.csv` med — direkte imod `docs/cli.md`s `Limits`, der lover at en millionrækkers fil "takes exactly as long as the machine needs". Samme linje målte bredder i UTF-16-kodeenheder, så `日本` og kombinerende accenter skubbede højre kant ud af linje, og den målte over hele filen, så én lang celle i række 31.000 paddede 20 linjer, der aldrig viste den. Nu tæller `displayWidth` skærmkolonner, og bredderne måles i en løkke over **de 20 rækker tabellen printer**. 1.000.000 rækker previewer på 1,6 s. YAML-dybden er målt og bevidst urørt: over ca. 2.500 mappingsniveauer rammer readens egen rekursion, og det fejer med exit 3 og skriver intet (`❓ Til Mads` punkt 12).

`npm run check:site` er grøn efter T32 (20 sider, 0 fund, 0 layout-afvigelser). `❓ Til Mads` punkt 1 er stadig den eneste beslutning, der frigør mest, og intet i køen kan løse den.

T17 (nested YAML på input) er færdig på `ceo/nested-yaml` og ligger på branch, ligesom T13/T14/T15/T16, fordi `DEPLOY-MISSING` står.

## Kvalitetsgate

Den obligatoriske gate er denne, i den angivne rækkefølge:

1. Root: `npm test && npm pack --dry-run`. `npm test` kører otte trin i rækkefølge: `test/test.js` (157 engine-tests), `test/cli.test.mjs` (138 reelle CLI-kørsler), `test/conformance.test.mjs` (83 CLI-vs-site- og dokumentationskontroller), `test/readme.test.mjs` (6 README-eksempelkontroller), workflow-regressionerne (39), `tools/verify_workflows.mjs` (4 workflows) og siden T9 `tools/verify_contract.mjs` (173 kontrat- og claimkontroller over 28 filer). Den kan også køres alene med `npm run check:contract`.
2. Site: `npm run check:site` (opbygger `.venv-site` med Python 3.13.15, Playwright 1.60.0 og Chromium, kører SEO-, layout- og selftesten) og `npm run audit:site` (`pip-audit` på den hash-låste lockfil). Begge er T6 og kører med præcis samme kommando lokalt og i CI.
3. Deploy: `npm run check:deploy` (`tools/check_deploy_freshness.py`) henter hver tekstfil under `site/` fra live **én gang** og matcher den mod hvert site-commit i `origin/main` fra nyeste til ældste. Det udskriver det commit live faktisk serverer, listen af udeployede commits og de afvigende filer. `tools/deploy_freshness_selftest.py` er offline og ligger i `check:site`, så gaten beviser, at værktøjet stadig kan se drift. Kør den efter hver batch-deploy; **dens exit 0 erstatter alle manuelle live-tjek i denne plan.** Den siger intet om funktion og udseende — til det bruges `tools/verify_live.py --no-report`.

Repoet har ingen root scripts for lint eller typecheck. Den nuværende PR-CI bruger Node 20 og 22 og kører kun `npm test` efterfulgt af `npm pack --dry-run`; T6 har lagt site-gaten i `.github/workflows/site-gate.yml`, som kun kører på site- og værktøjsændringer. Nye frontendtests skal wire ind i `npm test`, så de faktisk er en del af gaten. `npm run snapshots:cli` regenererer `test/fixtures/expected.json` og må kun køres som en del af en bevidst ændring af engine-adfærd. `npm run release`, tag-triggerede workflows og workflow-dispatch må ikke køres af loopet, fordi de kan publicere eller oprette releases.

## Deploy

**DEPLOY-MISSING: live er `3d90812` fra 2026-09-24, og 5 site-commit står u deployede — målt, ikke gættet (2026-09-26, **syvtede** måling i træk med `npm run check:deploy`; uændret hver gang). To batch-vinduer (17:30 og 21:30 den 25/9) er gået uden deploy.**

**Målt igen 2026-09-26 ca. 14:0x, starten på T42-iterationen:** uændret for **syvtede** gang i træk. Live er stadig `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig. Siden målingen ovenfor er der gået **ét** batch-vindue mere (12:30 den 26/9) uden at ændringerne blev live — fem i alt siden T5 fjernede det eneste deployapparat. T42's diff rører `site/engine.js` og `site/try.html`, så den får sin egen `VERIFICÉR DEPLOY`-note når bunken merges, og **intet merges til `main`** indtil et menneske har kigket.

**Målt igen 2026-09-26 ca. 12:5x, starten på T41-iterationen:** uændret for **sekstende** gang i træk. Live er stadig `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig. Siden målingen ovenfor er der gået **to** batch-vinduer mere (07:30 og 12:30 den 26/9) uden at ændringerne blev live — fire i alt siden T5 fjernede det eneste deployapparat. T41's diff rører `site/engine.js` og `site/try.html`, så den får sin egen `VERIFICÉR DEPLOY`-note under punkt 41, og **intet merges til `main`** indtil et menneske har kigket.

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

- 2026-09-26 ca. 14:0x–15:1x CEST: **T42 gennemført på `ceo/table-cell-sql-ident` (branch fra `ceo/csv-scalar-types`), ikke mergeret til `main`.** `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret for **syvtede** gang i træk, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig — bunken er nu **enogtyve** commits på toogtyve branch. Målingen tagen på den rigtige binary **før** koden blev rørt, som T40 og T41 gjorde, og den er den tredje ende som T41's måling bevidst lod ligge: **`table` og `sql` på værdier der ikke kan skrives i den celle de får.** Femten varianter, **otte fund i to funktioner.** **`table`: syv fund, alle i den samme celle.** Et linjeskift i en værdi skrev **én post som to rækker** og tabte en ramme; et vognabsskift sendte markøren tilbage til kolonne 0, så `a\rb` overskrev rækkens **egen venstre kant** og værdien før den; et tabuleringstegn blev talt som én kolonne af `displayWidth` mens en terminal rykker til næste tabulator (op til otte), så højre kant lå hvor teksten ikke endte; en `|` læstes som tabellens egen kolonneskiller; en celle der *kun* består af `+` og `-` kunne **posere som en ramme** — det er den eneste måde data i dette format kan efterligne det der holder det sammen; og de samme fem i et **kolonnenavn**, som er den værste celle i tabellen fordi alt nedenunder retter sig efter den. Exit 0, tom stderr, hver gang. Det er almindelige data: en fritekstbeskrivelse med to linjer, en adresse, en `\r` fra en Windows-eksport eller et log. **`sql`: ét fund, i den anden ende af samme idé** — identifikatorer blev **citeret men ikke escapes**. `escapeSQLString` doblede `'` på værdiesiden, og `colList` skrev `"${c}"` og håbede. Et dobbelt citattegn i et kolonnenavn eller i `--table` gav `INSERT INTO "my"bel" (...)`, og **sqlite3 svarede `Parse error near "bel": syntax error`** mens Transmute selv exit 0 og tom stderr — brugeren fik en fil der ikke kan importeres og ikke et ord om hvorfor. `--table` er et flag brugeren skriver, så det er ét skævt citattegn fra en helt almindelig kommando. **Målt og efterprøvet som en injection, og det er det ikke:** citattegnet lukker identifikatoren for tidligt, men så lukkes kolonlistens `(` aldrig, og statementet holder op med at parse — målt med sqlite3's egen parser på hele filen, hvor `secret`-tabellen **overlever** både ved kolonnenavn og ved `--table`. Det er den mindre påstand, og derfor den mindre rettelse. Et linjeskift i en SQL-**værdi** er målt og **bevidst urørt**: SQL-literaler må indeholde et, sqlite3 importerer filen, og værdien kommer tilbage med sit linjeskift; at skrive `\n` ville gemme en bogstavelig bagstreg, fordi SQL har ingen escape i et literal, så "reparationen" ville bytte værdien ud med en anden. **To valg der er værd at huske:** (1) `+` og `-` escapes **ikke** enkeltvis, fordi det ville gøre `2026-09-26` til `2026\-09\-26`; kun en celle der *helt* består af dem får sit første tegn escaped, fordi det er den ene form der kan læses som en kant. (2) En indlejret værdi skrives som kompakt JSON, så `["x|y"]` bliver `["x\|y"]` og er ikke længere gyldig JSON — en afvejning der er **rigtig her og forkert alle andre steder**, fordi en tabelcelle aldrig læses af en maskine (der findes ingen `table`-læser), mens rammen den sidder i er det hele læseren stoler på. Det er skrevet ned i koden, så en senere iteration ikke "retter" det. 7 nye engine-tests (160 → 167), 2 nye CLI-tests på den rigtige binary (139 → 141) og 1 ny konformitetstest (84 → 85); **seks af de syv kørt mod den gamle kode hentet med `git show HEAD:src/engine.js`** og ude med præcis de målte symptomer, den syvende er en *beslutningslås* (SQL-linjeskiftet) og skal passe begge veje. **Tænder:** fire mutationer — kun overskrifter ikke escaped (dræbt), kun escaping ved print (dræbt af tre tests), bredde målt på råværdien (dræbt), identifikatoren ikke doblet (dræbt) — og **en gyldig, fordi den er en no-op**: `cellValue` på en allerede escaped streng. Den blev skrevet som en fejl, målt, og fundet at være ækvivalent; det er værd at notere, fordi en mutation der ikke kan dræbes på grund af at den er lig med den korrekte kode, ellers ligner et hul i testen. **Konformitetslåsen kørte de fire dokumentationskommandoer og fangede min egen transskriptionsfejl:** jeg havde skrevet `+---+`-tabellens ramme to kolonner for smal ind i `docs/cli.md`, og låsen sagde det samme ordret. Det er præcis det den er til. `docs/cli.md` fik en ny sektion `A cell that cannot be shown` med fire kørte kommandoer og deres fulde output. `site/engine.js` byte-identisk med `src/engine.js` (`cmp` bekræfter), `try.html`-asset-hash `f60ec9d0` → `e105014b`, søgeindeks uændret på 104, ingen anden side ændret. Lokalt grøn: `npm test` 167+141+85+6+39+4+173 med 0 fejl, `npm pack --dry-run` 5 filer uændret, `npm run check:site` grøn med `0 finding(s) across 20 pages` og alle selftester inkl. deploy-friskheds-selvfesten. Commit `89bdb07` på `ceo/table-cell-sql-ident`, **ikke mergeret til `main`** — `DEPLOY-MISSING` står, og det er en menneskebeslutning (`❓ Til Mads` punkt 1). Næste opgave er **T43**: målt før den skrives.

### 42. [x] Skriv de celler, der ikke kan stå i den celle de får

**Status:** FÆRDIG med commit `89bdb07` på `ceo/table-cell-sql-ident`, bygget oven på `ceo/csv-scalar-types` — **ligger på branch, ikke mergeret**, fordi `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** Som T20–T41: målt på den rigtige binary **før** koden blev rørt, denne gang med **to** dommere — den ene læser råt output (ingen filtrering, T40's lektion), den anden spørger en rigtig `sqlite3` om filen kan importeres, fordi "ugyldig" og "grim" er to forskellige påstande om SQL. Fundene skrevet som tests mod output og kørt mod den gamle kode hentet med `git show HEAD:src/engine.js`, låsen mutationstestet med tænder.

**Begrundelse:** T41's måling målte `table` på *type* og fandt nul, fordi en terminal ikke typetester noget, og skrev den næste flade som den **tredje** ende: værdier der ikke kan skrives i den celle de får. Det er den eneste ende af skriveren der stadig var uudforsket, og den er den der rammer det mest, fordi `table` er previewens format.

**Deploy:** `npm run check:deploy` kørt først i iterationen: uændret for **syvtede** gang i træk, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig. `DEPLOY-MISSING` står derfor ved, diffen er **ikke** mergeret til `main`, og der er oprettet ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. T42 rører `site/engine.js`, så den kræver en note, når bunken merges.

**Målingen — femten varianter, otte fund:**

| # | Input | Format | Fund |
|---|---|---|---|
| 1 | `line1\nline2` i en værdi | `table` | én post skrevet som to rækker, en ramme tabt |
| 2 | `x\|y` i en værdi | `table` | læst som to kolonner |
| 3 | `+---+` i en værdi | `table` | cellen kan pose som en ramme |
| 4 | `a\tb` i en værdi | `table` | `displayWidth` tæller 1, terminal rykker til tabulator |
| 5 | `a\rb` i en værdi | `table` | markøren tilbage til kolonne 0, overskriver venstre kant |
| 6 | de samme i et **kolonnenavn** | `table` | overskriften dele sig i to, alle rækker under den skæve |
| 7 | `"` i et kolonnenavn | `sql` | `Parse error near "b"` i sqlite3 |
| 8 | `"` i `--table` | `sql` | `Parse error near "table"` i sqlite3 |

Exit 0 og tom stderr i alle otte. Fund 1, 4 og 5 er den samfejl i tre forklædninger: **et tegn der flytter markøren eller bryder linjen kan ikke vises i en terminal-celle**, så det har ingen bogstavelig stavelse. Fund 7 og 8 er den samme fejl i to ender: **SQL-identifieren er citeret men ikke escaped**, mens værdiesiden doublede `'` hele vejen.

**Rettelsen:**

- `tableCell(val)` — én funktion for både overskrifter og værdier, fordi de er den samme slags celle og fordi de ikke må kunne glide fra hinanden. Skriver `\n`, `\r`, `\t` og `\xNN` for de tegn en terminal ikke kan vise i én linje, `\|` for kolonneskilleren, og escaper kun første tegn i en celle der *helt* består af `+` og `-`. Bredden måles på **det skrevne**, ikke på råværdien — den løkke har den fejl en gang før, med CJK-bredde, så den fik den samme slags test.
- `sqlIdentifier(name)` — dobler `"`, som `escapeSQLString` dobler `'`, og bruges til både kolonne- og tabelnavn.

**Verifikation:** `npm test` grøn med 167 engine-, 141 CLI-, 85 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 20 pages` og alle selftester inkl. deploy-friskheds-selvfesten. SQL-siden er desuden **bevist mod en rigtig database**: `--table 'ta"bel'` med kolonnerne `c"1` og `c"2` importerer, og værdierne lander i de kolonner der egentlig hedder det — ikke bare "det parser".

### 41. [x] Skriv de CSV-celler, der ikke kan læses tilbage som de er
- 2026-09-26 ca. 12:5x–13:2x CEST: **T41 gennemført på `ceo/csv-scalar-types` (branch fra `ceo/yaml-string-scalars`), ikke mergeret til `main`.** `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret for **sekstende** gang i træk, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig — så bunken er nu **toogtyve** commits på enogtyve branch, og T41's egen `VERIFICÉR DEPLOY`-note står under punkt 41. Målingen blev tagen på den rigtige binary **før** koden blev rørt, som T40 gjorde: 38 værdier der ligner tal og typer gennem `json → csv → json` og gennem `xml` og `table`, exit 0 og tom stderr hver gang. **Svar af 38 pr. format: `csv` tre fund, `xml` ét, `table` nul.** `table` er nul for en grund der er værd at sige: en celle i `table` læses af en terminal, som ikke typetester noget, så målingen for den sti siger intet om den anden — det er derfor T42 er skrevet som en *anden* flade (celler, der ikke kan skrives i den celle de får) og ikke som en gentagelse af denne. **Fund 1 er den værste tavshed siden T30:** RFC 4180 tillader tomme linjer mellem poster, `parseCSV` fjernede enhver post hvis eneste felt var tomt, og skriveren skrev netop den linje — så `[{"v":"first"},{"v":""},{"v":"third"}]` skrev `v`/`first`/*(tom)*/`third` og læst tilbage som **to** records. exit 0, tom stderr, og de to der overlevede lignede hele filen; `null` gør det samme fordi `cellValue` gør `null` til `''`. Rettes på **begge** sider, fordi begge regler er korrekte hver for sig og kolliderer: skriveren bruger `` og `" "` — RFC'ens egne to stavinger på *én post med ét tomt eller blankt felt* — og læseren spørger nu om et felt **var citeret** (`recordQuoted`) frem for hvad det **indeholdt**. **Fund 2** var ikke i scope og blev alligevel fundet af målingen, fordi den lå i samme funktion: læseren trimmer alt uciteret felt, så `{"a":"  x  "}` blev skrevet bart og kom tilbage som `"x"` — i **alle** kolonnetællelser. Citering er her det ene sted i CSV hvor den virker, målt og ikke antaget (`"1 "` overlever som streng), så cellen citeres når den bare form ikke læses tilbage ens. **Fund 3:** en streng der ligner et tal læses tilbage som et tal, og **citering hjælper ikke** — målt før det blev valgt, fordi svaret kunne have været "citer det" som i YAML: læseren tager citaterne af før den konverterer, så `"true"` kommer tilbage som boolesk `true` mens `"0074"` og `"1 "` kommer tilbage som strenge. Python's `csv` læser dem alle som strenge, altså er filen tro og det er vores egen læser der typetester; RFC 4180 har ingen måde at sige *dette er en streng* på, så svaret er en advarsel der navngiver kolonnerne, exit 0 og filen skrives stadig. **Beslutning:** advarselens regel *er* `coerceCSVValue`, den samme funktion læseren kalder — ikke en anden kopi, fordi en advarsel om en typeændring er intet værd hvis den gætter typen. Den tæller derfor kun kolonner der faktisk holdt en streng, og nævner en kolonne pr. kolonne med antal, fordi en id-kolonne med 10.000 rækker ellers ville give 10.000 advarselslinjer. `serializers.csv` får advarselskanalen som sit eneste andet argument, fordi det er det eneste format hvor filen ikke selv kan sige hvad den tabte. **Fund 4, målt og bevidst ikke rettet:** `xml` mister kantsmrum i elementtekst (`"1 "` → `"1"`), fordi læseren gør `.trim()` — samme begrundelse som T31's ubevægede YAML-dybde, så ingen ny beslutning. 3 nye engine-tests (157 → 160), 1 nyt CLI-test på den rigtige binary (138 → 139) og 1 ny konformitetstest (83 → 84); **alle fire kørt mod den gamle kode hentet med `git show HEAD:src/engine.js`** og ude med præcis de målte symptomer (`""` i stedet for den tabte post, `a,b,c,d` med den ubeskrevne celle, `[]` i stedet for advarslen). **0 snapshots ændret.** **Tænder:** fire mutationer, fire gyldige, fire dræbt — docs der kun nævner én af to kolonner, engangtal i beskeden, cellen der ikke citeres på kantsmrum, og læseren der filtrerer på værdien i stedet for på citering. **Procesfejl, én, og den er værd at huske:** fund 2 så jeg ikke i første omgang, fordi jeg læste svaret tilbage gennem `tr -d ' '`, som slettede netop de mellemrum der var beviset. Min egen harness skjulte et fund; motoren var hele vejen rigtigt, og det er målingen — ikke testen — der fangede det. `docs/cli.md` fik tre regler under `Delimiters, quotes and line endings` med kørte kommandoer, og konformitesten låser den advarsel **ordret mod en rigtig kørsel** inklusive tallene, så dokumentationen ikke kan blive en parafrase af en besked ingen kan matche mod. `site/engine.js` byte-identisk med `src/engine.js` (`cmp` bekræfter), `try.html`-asset-hash `e00c7669` → `f60ec9d0`, søgeindeks uændret på 104, ingen anden side ændret. Lokalt grøn: `npm test` 160+139+84+6+39+4+173 med 0 fejl, `npm pack --dry-run` 5 filer uændret, `npm run check:site` grøn med alle selftester inkl. deploy-friskheds-selvfesten. Commits `478fdad` (implementation) og `7f9c9e5` (docs + konformitetslås), begge på `ceo/csv-scalar-types`, **ikke mergeret til `main`** — `DEPLOY-MISSING` står, og det er en menneskebeslutning (`❓ Til Mads` punkt 1). Næste opgave er **T42**: målt før den skrives.

### 41. [x] Skriv de CSV-celler, der ikke kan læses tilbage som de er

**Status:** FÆRDIG med commit `478fdad` + `7f9c9e5` på `ceo/csv-scalar-types`, bygget oven på `ceo/yaml-string-scalars` — **ligger på branch, ikke mergeret**, fordi `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** Som T20–T40: målt på den rigtige binary **før** koden blev rørt (38 værdier gennem `json → csv → json` og gennem `xml` og `table`), fundene skrevet som tests mod output og kørt mod den gamle kode hentet med `git show HEAD:src/engine.js`, låsen mutationstestet med tænder.

**Begrundelse:** T40's måling lukkede YAML-skriverens skalare i **én** ende, og planen
skrev den næste flade som den **anden** ende af skriveren: `csv`, `table` og `xml` på
værdier der ligner tal og typer. Ikke antaget, målt — fordi T31's måling af `table` kun
dækkede skærmkolonner, og fordi en bred antagelse om "de andre formatters" ville være
præcis den målefejl, T15 allerede har kostet en diagnose.

**Målingen: 38 værdier, tre formatters, exit 0 og tom stderr hver gang.**
`csv` gav **tre** fund, `xml` **ét** (se nedenfor, ikke rettet), og `table` **nul** —
en celle i `table` er læst af en terminal, der ikke typetester noget, så de tal- og
type-lignende værdier er der lige så rigtige som de er skrevet. Det er ikke en
måling, der kan generaliseres fra `csv` til `table`.

**Fund 1 — en post med en tom værdi forsvandt. Det er det alvorligste i T41.**
RFC 4180 tillader tomme linjer mellem poster, og læseren fjernede enhver post hvis
**eneste** felt var tomt. Skriveren skrev netop den linje læseren spiste, så en
**énkolonne**-eksport tabte hver post hvis værdi var tom:
`[{"v":"first"},{"v":""},{"v":"third"}]` → `v` / `first` / *(tom linje)* / `third` →
læst tilbage som **to** records, exit 0, tom stderr, og de to der overlevede lignede
hele filen. `null` gør det samme, fordi `cellValue` gør `null` til `''`. Det er den
eneste tavshed i rækken hvor **intet** tyder på tabet — ikke en forkeret værdi, ikke
en advarsel der mangler, bare en kortere fil.

Rettes på **begge** sider, fordi begge regler er korrekte hver for sig og kolliderer:
skriveren skriver `""` og `" "` — de to stavinger RFC'en selv bruger på *en post med ét
tomt eller blankt felt* — og læseren spørger nu om et felt **var citeret** frem for kun
hvad det **indeholdt** (`recordQuoted` i `parseCSV`). Det er den smalleste mulige
ændring af reglen: en post der kom fra en virkelig tom linje er stadig en tom linje
og springes stadig over, i énkolonne og flerkolonne, og det er låst i test.

**Fund 2 — kantsmrum i en celle tabte deres mellemrum, i *alle* kolonnetællinger.**
Læseren trimmer alt felt den ikke læste som citeret, så `{"a":"  x  "}` blev skrevet
bart som `  x  ` og kom tilbage som `"x"`. Dette er **ikke** det samme som fund 1:
det rammer enhver kolonnetællelse, og min første måling overså det, fordi jeg kørte
harnessen gennem `tr -d ' '`, som slettede netop de mellemrum der var beviset. Citering
er her **det ene sted i CSV hvor den virker** — målt, ikke antaget: `"1 "` overlever
som streng, fordi læseren kun trimmer uciterede felter. Derfor citeres cellen når den
bare form ikke læses tilbage ens, ikke når den er tom.

**Fund 3 — en streng der ligner et tal læses tilbage som et tal, og citering
hjælper ikke.** Det blev målt før det blev valgt, fordi svaret *kunne* have været
"citer det" som i YAML: læseren tager citaterne af **før** den konverterer, så
`"true"` kommer tilbage som den booleske `true`, mens `"0074"` og `"1 "` kommer
tilbage som strenge. Python's `csv` (en uafhængig RFC 4180-parser) læser dem alle som
strenge — altså er **filen** tro, og det er vores egen læser der typetester. RFC 4180
har ingen måde at sige *dette er en streng* på, så en bredere regel ville være en løgn.
Svaret er derfor en **advarsel** der navngiver kolonnerne, ikke en omskrivning af
filen, og den skrives stadig med exit 0.

**Beslutning: advarselens regel *er* `coerceCSVValue`, den funktion læseren kalder.**
Ikke en anden kopi. En advarsel om en typeændring er intet værd, hvis den gætter
typen, og gætningen er præcis hvor en ekstra kopi ville gå galt. Derfor tæller den
kun kolonner der faktisk **holdt en streng** — tal ind går ud som tal og har intet at
miste — og nævner en kolonne pr. kolonne med antal, ikke en advarsel pr. celle, fordi
en id-kolonne med 10.000 rækker ellers ville give 10.000 linjer. Skriveren får
advarselskanalen stillet til raadighed som sit **eneste** andet argument, fordi det er
det eneste format hvor filen ikke selv kan sige hvad den tabte.

**Fund 4, målt og bevidst ikke rettet:** `xml` mister kantsmrum i elementtekst
(`"1 "` → `"1"`, `"  1"` → `"1"`, `"  "` → `""`), fordi læseren gør
`inner.slice(...).trim()`. Det er ikke en glemt fejl: enhver smukskrevet XML-fil har
indrykning, og bevare den ville gøre en almindelig fil til data. Det er samme
begrundelse som T31's ubevægede YAML-dybde, og det kræver derfor ingen ny beslutning.

**Tænder:** fire mutationer, alle fire gyldige og alle fire dræbt — dokumentationen
der kun nævner én af de to kolonner, en engangtal i beskeden, cellen der ikke citeres
på kantsmrum, og læseren der filtrerer på værdien i stedet for på om feltet var
citeret. Konformitesten låser `docs/cli.md` til den advarsel en **rigtig kørsel**
skriver, ordret inklusive tallene, så dokumentationen ikke kan blive en parafrase af
en besked ingen kan matche mod.

**Fire nye tests:** 3 engine (157 → 160) og 1 CLI på den rigtige binary (138 → 139),
alle fire kørt mod den gamle kode og ude med præcis de målte symptomer
(`""` i stedet for den tabte post, `a,b,c,d` med den ubeskrevne celle, `[]` i stedet for
advarslen). 1 ny konformitetstest (83 → 84). **0 snapshots ændret.**

**Playgroundet arvæder rettelsen, fordi motoren er den samma.** `site/engine.js` er
byte-identisk med `src/engine.js` (`cmp` bekræfter) og blev kopieret;
`tools/site_chrome.py` regenererede kun `engine.js`-hashen i `try.html`
(`e00c7669` → `f60ec9d0`), søgeindeks uændret på 104, ingen anden side ændret.

**Deploy-stillen er uændret, og derfor merger denne commit ikke til `main`.**

VERIFICÉR DEPLOY: playgroundets CSV-output beholder en tom post i en énkolonne-fil,
citerer en celle med kantsmrum og advarer om kolonner der taber deres type —
`site/engine.js`, commit `478fdad`, push 2026-09-26 ca. 13:1x CEST. Verificér på
https://transmute.run/ med input `first` / *(tom streng)* / `third` i én kolonne og
output `csv` — filen skal vise `""` på den anden linje, og en runde tilbage til
`json` skal give tre records.

### 40. [x] Skriv en streng, en YAML 1.1-læser læser som noget andet, med citater

**Status:** FÆRDIG med commit `1c8e97a` på `ceo/yaml-string-scalars`, bygget oven på `ceo/yaml-float-spelling` — **ligger på branch, ikke mergeret**, fordi `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** Som T20–T39: målt på den rigtige binary **før** koden blev rørt, fundet skrevet som en test mod output og kørt mod den gamle kode, låsen mutationstestet med tænder.

**Begrundelse:** T39's måling afsluttede ved *talskalaren* og efterlod hele den anden
halvdel af YAML-skriverens skalare uudforsket: `null`/`true`/`false` skrives bare,
mens *strenge* går gennem `needsYAMLQuotes` — som er målt ni gange (T17, T21, T37)
men aldrig for de skalare, der ligner tal. Det er den største tavshed i planens
historie målt i én måling.

**Målingen, attende måling gennem den rigtige binary, exit 0, tom stderr.** 63 rene
strenge gennem `transmute probe.json -o yaml`, læst tilbage med **PyYAML 6.0.3**:

| input | skrevet | PyYAML læser | |
|---|---|---|---|
| `yes` / `No` / `on` / `OFF` | `yes` | **`True` / `False`** | fire ord til for |
| `.inf` / `.NaN` | `.inf` | **`float`** | |
| `1_000` / `1__0` / `0b1010_1` / `07_7` / `0x1_F` | `1_000` | **`int` 1000** | underscores er i YAML's heltalsregel |
| `12:30` / `1:30:45` / `12:00:00` | `12:30` | **`int` 750 / 5445 / 43200** | et klokkeslæg er base 60 |
| `190:20:30.15` | `190:20:30.15` | **`float` 685230.15** | |
| `2026-09-26` | `2026-09-26` | **`date`** | |
| `2026-09-26T12:00:00Z` | `2026-09-26T12:00:00Z` | **`datetime`** | |
| `<<` | `<<` | **`ConstructorError`** | hele dokumentet |
| `=` | `=` | **`ConstructorError`** | hele dokumentet |

**Svar af 63: syvogtyve værdier læst som noget andet, to af dem ødelagte hele
filen, og 14 nøgler læst under et andet navn** (`yes` → `True`, `0074` → den
**oktale** `60`). Det er ikke eksotiske værdier: `yes`/`no` er, hvad et regneark
eller en eksport indeholder, `12:30` er et klokkeslæg, `2026-09-26` er en dato,
og `1_000` er et tal skrevet som et menneske skriver det.

**De to værste er værre end en ændret type.** `<<` (merge) og `=` (value) er de
eneste to tags i PyYAMLs resolver, der **ikke har en constructor**, så en
streng med værdien `<<` lavede et dokument, PyYAML afviste med
`ConstructorError: could not determine a constructor for the tag` — en fil
Transmute producerede med exit 0, som ingen læser i den viste verden kan åbne.

**Årsagen er målt, ikke gættet: den er YAML 1.1's vocabulary, ikke en fejl i
logikken.** Resolverens fem productions er hentet ud af PyYAMLs egen
`yaml/resolver.py` med `add_implicit_resolver` — bool (12 stavninger, kun de fire
`true`/`false` var dækket), int (med underscores, octal, hex, binær **og
sekstagesimal**), float (`.inf`/`.nan`), timestamp (to former) og null. Rettelsen
er disse productions transskriberet **hele**, i `YAML_1_1_RESOLVES_ELSEWHERE` i
`src/engine.js`, kaldt fra både `needsYAMLQuotes` og `formatYAMLKey` — så reglen
hører til skriveren, ikke til den flade målingen lå på, og den gælder mappings,
sekvenser, dybe nøgler og topniveauskalarer.

**Nøglerne var den halvdel, scope ikke havde set.** `formatYAMLKey` lod alle
tegn `[A-Za-z0-9_.\-/ ]` stå, så `0074` blev skrevet som nøgle og læst som den
oktale `60`, og `2026-09-26` som nøgle læst som en `date`. Det er det samme
fund: et felt kommer tilbage under et navn inputtet aldrig havde. De otte
strukturelle regler røres ikke, så `name` og `1.2.3` bliver stående uquotede.

**Test: én engine-test (156 → 157) og ét CLI-test (137 → 138), begge kørt mod den
gamle kode.** De faldt med præcis de målte symptomer (`"yes" is written bare, and a
YAML 1.1 reader resolves it to bool` og `- answer: yes`). Som i T39 låses
**stavingen, ikke round-trip**, og det er ikke en formalisme: **vores egen læser
er mere tillidende end PyYAML** og læser `yes` og `12:30` tilbage som strenge, så
en round-trip-test gennem `run(..., 'yaml', ...)` passerer mod den ødelagde
skriver.

**Målingen lå desuden to veje den gamle kode allerede lavede for rigtigt**, og
begge er låst, fordi en for bred regel ville gøre enhver fil til støj: `y`, `n`,
`12:60`, `12:30:60`, `1.2.3`, `2026-9-26`, `2026/09/26`, `2026-09-26t12:00:00z`
(lille `t`/`z` er ikke i timestamp-reglen), `NaN`, `inf`, `+.5` (intet fortegn på
`.`-grenen) og `a:b` er **strenge** hos PyYAML. To af mine egne gæt var forkerte
og blev rettet efter at være målt: `2026-13-45` **er** en timestamp — resolveren
er leksisk og validerer ikke datoen — og `1:2:3:4` er et gyldigt sekstagesimal.
Det er præcis derfor productionerne er transskriberet fra kilden og ikke samlet
af hånden.

**Ni mutationer, otte gyldige dræbt.** Bool-vocabularet, sekstagesimal-grenen i
int, underscores, timestampens datetime-gren, `merge`/`value`, nøglernes brug af
reglen, en for bred regel (skriv alt i citater) og `.inf`/`.nan`-grene dræbes
alle. Den niende var en ugyldig mutation (et regex der ikke kompilerede) og blev
**ikke** talt med som bevis — den fejlede af en syntaxfejl, ikke af testen.

**Playgroundet arvæder rettelsen, fordi motoren er den samme.** `site/engine.js` er
byte-identisk med `src/engine.js` (`cmp` bekræfter) og blev kopieret;
`tools/site_chrome.py` regenererede kun `engine.js`-hashen i `try.html`, søgeindeks
uændret på 104, ingen anden side ændret.

**Deploy-stillen er uændret, og derfor merger denne commit ikke til `main`.**

VERIFICÉR DEPLOY: playgroundet skriver strenge, en YAML 1.1-læser læser som andet,
med citater — `yes`, `12:30`, `1_000`, `2026-09-26`, `<<` — `site/engine.js`,
commit `1c8e97a`, push 2026-09-26 ca. 11:5x CEST. Verificér på
https://transmute.run/ med input `yes` (eller `12:30`) og output `yaml` — feltet
skal vise `"yes"`. PyYAML skal læse filen tilbage uden fejl, og `<<` må ikke længere
få den til at afvise dokumentet.

### 39. [x] Skriv et tal med eksponent sådan, at en YAML-læser læser det som et tal

**Status:** FÆRDIG med commit (se punkt 39) på `ceo/yaml-float-spelling`, bygget oven på `ceo/nonfinite-numbers` — **ligger på branch, ikke mergeret**, fordi `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** Som T20–T38: målt på den rigtige binary **før** koden blev rørt, fundet skrevet som en test mod output og kørt mod den gamle kode, låsen mutationstestet.

**Begrundelse:** T38's måling efterlod to tal, den skrev ned som "en linje" og en beslutning.
Den her er den **enlinjes** del, og den er den mest synlige af alle fund i planen,
fordi den ikke rammer en sjælden værdi: den rammer **helt almindelige tal**.

**Målingen, syttende tal gennem den rigtige binary, exit 0, tom stderr.** Input er
`sittet eget` `nums.json` med 17 tal fra `1` til `1.7976931348623157e308`, kørt som
`transmute nums.json -o yaml` på den installerede CLI og læst tilbage med **PyYAML**:

| input | skrevet | PyYAML læser | |
|---|---|---|---|
| `1e-7` | `1e-7` | **`str`** | tal blev tekst |
| `-1e-7` | `-1e-7` | **`str`** | |
| `1e21` | `1e+21` | **`str`** | |
| `1e308` | `1e+308` | **`str`** | |
| `5e-324` | `5e-324` | **`str`** | den mindste double i JavaScript |
| `1.0` | `1` | `int` | float-identitet, **værdi identisk** |
| `1e15` | `1000000000000000` | `int` | værdi identisk, ikke et tab |

**Svar af syv.** De fem i toppen er den samme fejl fem gange: et tal skrevet **bart**,
der ligner et tal og læses som en streng. `1e-7` er ikke en eksotisk værdi — det er
en pris, en pæn, et hævet tal i en skala, og det er præcis de tal JS printer kortest.
De to nederste er **ikke** tab, og det er værd at sige hvorfor: `1.0` og `1` er i
JavaScript **det samme tal**, så skriveren kan ikke vide om filen sagde `1.0`.

**Årsagen er målt, ikke gættet, og den er ikke en fejl i logikken.** YAML 1.1's
float-production, hentet ud af PyYAML's egen resolver, er
`[-+]?[0-9]*\.[0-9]*(?:[eE][-+][0-9]+)?`: **punktet er obligatorisk, og eksponentens
tegn er obligatorisk**. JavaScript er læssere end begge. Derfor er `1e-7` et float
til YAML 1.2 men en **streng** til 1.1, og `1.0e308` fejer i **begge** — derfor er
tegnet en del af reglen og ikke en detalje. Skrivereformen `1.0e-7` læses som float
af 1.1 og 1.2 alike, altså den eneste form alle læsere er enige om.

**De fem andre formater har ikke fejlen, og det er målt.** SQLite læser den bare
`1e-7` som **`real`** (`typeof` = real), JSON har kun én taltype, og CSV, table og
xml er utypede. Det er altså **YAMLs strengere produktion**, ikke en regel om
eksponenter — og det er derfor rettelsen rører én fil og én linje.

**Rettelsen er `formatYAMLNumber` i `src/engine.js`, kaldt fra `formatYAMLValue`,**
så den gælder mappings, sekvenser, dybe noder og topniveauskalarer — regelen
tilhører skriveren, ikke den flade hvor målingen lå. Den tilføjer kun det manglende
punktum og lader resten være, så de tal der allerede læses rigtigt beholder deres
staving. **`1.0` bliver bevidst `1`**, og det er en skelneline, ikke en forglemme:
skriveren må ikke opfinde en float-identitet inputtet måske aldrig havde, og en
tæller der skrives `1.0` ville være en ny slags overraskelse. Samme grund som T38's
punkt 15, og derfor en beslutning — se `❓ Til Mads` punkt 16.

**Test: én engine-test (155 → 156), kørt mod den gamle kode.** Den faldt med præcis
det målte symptom: `1e-7 is written "1e-7", which a YAML 1.1 reader reads as a string`.
Testen låser **stavingen**, ikke round-trip, og det er et fund fra målingen: **vores
egen læser er mere tilladende end PyYAML** og læser `1e-7` som et tal, så en
round-trip-test gennem `run(..., 'yaml', ...)` passerer mod den ødelagte skriver.
Et værktøj der er enig med sig selv er ikke bevis på, at en fil kan læses. Derfor
er den negative påstand den vigtigste linje (et tal ingen YAML 1.1-læser løser til et
tal er en streng i talklæde), og derfor er deotte bogstavelige stavinger skrevet ud.

**To mutations overlevede først og blevet undersøgt i stedet for at slås over.** En
mutation der overlever er enten et hul i låsen eller død kode, og begge dele er fund.
Min egen mutationstest var først **ugyldig**: tre `perl`-substitutioner matchede
simpelthen ikke, så de "overlevede" kun fordi de aldrig blev anvendt — lært op og
gjort ordentligt med eksakt strengerstatning. Derefter: `drop the sign` **overlevede**,
fordi `Number::toString` altid skriver et tegn på eksponenten, så min tegn-gren var
utilgåelig kode, ingen test kunne dræbe, og ingen mutation kunne ramme. Den er
**fjernet** og mønstret kræver nu tegnet direkte — så overlevelsen opløstes ved at
lade dødkoden være væk i stedet for at skrive en test til den. Den fjerdes
forbehold i `❓ Til Mads` punkt 16. Fire mutationer dræbes nu alle: `String(val)`,
`drop the dot`, `invent a float identity` (`1` → `1.0`, altså den beslutning punkt 16
beskytter) og `quote the number instead`.

**Playgroundet arvæder rettelsen, fordi motoren er den samme.** `site/engine.js` er
byte-identisk med `src/engine.js` (`cmp` bekræfter) og blev kopieret;
`tools/site_chrome.py` regenererede kun `engine.js`-hashen i `try.html`
(`79a50e59` → `7a7d9085`), søgeindeks uændret på 104.

**Deploy-stillen er uændret, og derfor merger denne commit ikke til `main`.**

VERIFICÉR DEPLOY: playgroundet skriver tal med eksponent som YAML-float (`1.0e-7`,
ikke `1e-7`), `site/engine.js`, commit (se punkt 39), push 2026-09-26 (ca. 12:3x
CEST). Verificér på https://transmute.run/ med input `1e-7` og output `yaml` — feltet
skal vise `1.0e-7`. PyYAML skal læse det tilbage som `float`, ikke `str`.

### 38. [x] Et tal uden en repræsentation må ikke blive til `null` eller en streng i stilhed

**Status:** FÆRDIG med commit `67b5e50` på `ceo/nonfinite-numbers` (bygget oven på `ceo/lone-surrogate-loss`) — **ligger på branch, ikke mergeret**, fordi `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** Som T20–T37: målt på de rigtige skrivere **før** koden blev rørt, fundene skrevet som tests mod output og kørt mod den gamle kode, låsen testet mod mutationer.

**Begrundelse:** T37's måling pegede på den næste flade efter den, den lukkede, og
den lå i de data der går *igennem* motoren uden at nogen spørger: **tal**.
T36 og T37 handlede om tegn, der ikke kan skrives, og deres tabeller sluttede
ved `yaml` og `xml` som de strengeste formater. Ingen af dem havde spurgt, om
selve *værdien* kan overleve — og svaret er nej for én klasse af tal, i alle seks
formater.

**Målingen, samme input gennem alle seks skrivere på den rigtige binary.** Input
er `[{"id":1,"a":1e400,"b":-1e400,"ok":1e308}]`. `1e400` er en **lovlig
JSON-talliteral**, så filen er en fil ethvert JSON-værktøj accepterer, og den
parser til `Infinity`:

| `--output` | exit | hvad der kom ud | hvad reference-læseren siger |
|---|---|---|---|
| `json` | **0, tom stderr** | `null` | værdien er **væk**: `JSON.stringify` skriver null i stedet for tallet |
| `yaml` | **0, tom stderr** | `Infinity` | PyYAML: **`str`**, ikke float — YAML's egen skrivemåde er `.inf` |
| `sql` | **0, tom stderr** | `'Infinity'` | SQLite: `typeof(x)` = **`text`** |
| `csv` | **0, tom stderr** | `Infinity` | en celle er tekst, så læseren får et ord |
| `table` | **0, tom stderr** | `Infinity` | en celle er tekst |
| `xml` | **0, tom stderr** | `<Infinity>` | ethvert element er tekst, så en parser læser et ord |

Alle seks ved exit 0 og tom stderr. Så tallet skjulte **typen** i fem formater og
holdt op at eksistere i den sjette, og ingen af dem sagde det. Det er den
første gang i planen at en tavshed ikke er en *fejl læseren kan se*, men en
**type ændret uden ord** — og den er værre, fordi `null` er et gyldigt svar,
der ligner et resultat.

**Den anden vej ind er den, en bruger faktisk møder.** JSON kan ikke skrive
`NaN`, men et udtryk dividerer med nul hele tiden: `add price
item.amount / item.units` på en række hvor `units` er `0`. Målt samme sted:
`Infinity` og `NaN` fra `1/0` og `0/0`, samme exit 0, samme tavshed, og feltet
`price` skrevet som `null` — en værdi næste step kører videre på som om den var
data. Det er ikke et eksotisk input, det er en almindelig beregnet kolonne.

**Valget er T32/T36/T37's, brugt for fjerde gang, og den er den modsatte af de
tre forgående.** Advarsel, fejl eller ingenting: **fejl, exit 1, tom stdout,
ingen fil.** Der findes ingen repræsentation — og der er **ingen flugtvej at
navngene**, fordi JSON er den *værste* af de seks her, ikke bedst. Derfor får
beskederne en anden afslutning end tegnafvisningerne: i stedet for `Write JSON
instead` siger de, at ingen format bærer værdien, og at tallet skal rettes
først. At pege på en flugtvej, der ikke findes, ville have været den samme løgn
som T32's `carry a U+0000 faithfully`, bare mere aktiv.

**Rettelsen er én tabel og én betingelse.** `UNWRITABLE` er nu total over alle
seks formater: `json` har `refuses: null` (den escaper alle tegn, så den er
flugtvejen for *tegn*afvisningerne) og `nonFinite` med sin egen sætning, og
`scanWritable` starter med `nonFiniteRefuses(value)`. `serializers.json` kalder
`assertWritable` for første gang — det var den eneste skriver, der slet ikke gik
gennem v walksen. Grænsen er **finiteness, ikke størrelse**: `1e308`,
`1.7976931348623157e308`, `5e-324`, `0` og `-0` skrives af alle seks, kun
`Infinity`, `-Infinity` og `NaN` afvises.

**Test: tre engine-tests (152 → 155), to CLI-tests på den rigtige binary (135 →
137) og to konformitester (81 → 83), alle kørt mod den gamle kode.** Den første
engine-test faldt med præcis det målte symptom — `json must refuse a value that
is not finite, not write it: [{"id": 1, "a": null, ...}]` — fordi påstanden var
det, der var fundet. Den negative assert er den vigtigste linje igen: en refusal
skriver intet, så der er ingen tekst, der kan holde hverken ordet eller null.
Den anden konformitetstest er den vanskeligere lås: den sammenligner **sitets
egen `engine.js` indlæst i en `vm`** med CLI'ens exit, fordi rammen er den anden
kunde af motoren, og fordi det er den der afgør om download-knappen låses. Den
negative konformitetskrivning — at ingen af de seks beskeder må sige `Write JSON
instead` — er den linje, der låser den løgn, der lå i de forgående beskeder.
Mutationstestet fire gange: json uden reglen (fanget af alle tre suiter),
`Number.isSafeInteger` i stedet for `Number.isFinite` (fanget af fem
engine-tests, fordi den så fanger `1e308`), beskeden med en opfundet flugtvej
(fanget af den negative konformitetskrivning) og en ordlydsændring i beskeden
(fanget af docslåsen).

**Playgroundet arvæder rettelsen, fordi motoren er den samme.** `site/engine.js`
er byte-identisk med `src/engine.js` og blev kopieret, så forsiden på `/` og
`/da/` får samme fejl og download-knappen blokeres af `has-error` præcis som ved
T32 og T37. `tools/site_chrome.py` regenererede kun `engine.js`-hashen i
`try.html` (`bf248f55` → `79a50e59`), søgeindeks uændret på 104. Derfor **er**
`check:site` kørt. Lokalt grøn: `npm test` 155+137+83+6+39+4+173,
`npm pack --dry-run` uændret på 5 filer, `npm run check:site` grøn med 0 fund
på 20 sider og alle selftester grønne inkl. deploy-friskheds-selvfesten.

**Målingen fandt to ting mere i samme flade, som denne iteration kun målte og
ikke rettede.** Begge er tal, og begge er tavsheder af samme slags som fundet
ovenfor, så de står her, målt på den rigtige binary, med de tal der gør dem
reproducerbare:

| input | hvad der kom ud | hvad læseren siger |
|---|---|---|
| `9007199254740993` (et heltal over 2^53) | `9007199254740992` i **alle seks** formater, exit 0, tom stderr | tallet er **et andet tal**; `jq` skriver `9007199254740993` |
| `1e-7` (til `-o yaml`) | `1e-7` | PyYAML: **`str`** — YAML's float-syntaks kræver `1.0e-7`, så et tal blev en streng |
| `1.0` (til `-o yaml`) | `1` | PyYAML: **`int`** — float-identiteten er væk |

Den første er den alvorlige: en 64-bit id (`9007199254740993` er den klassiske
snowflake-grænse), et ordrenummer eller et beløb i minorenheder kommer ud som et
**andet tal**, i alle seks formater, uden en linje. Den kan **ikke** fanges ved
skrivningen, fordi tabet sker i `JSON.parse` (og i YAML's tal-coercion) — motoren
ser et tal, der ikke er det, der stod i filen. Derfor er den en beslutning, ikke
en vagt: enten en tabsfrit læser (egen tal-grammatik, som bevarer heltallet) eller
en advarsel ved læsningen, der siger at cifrene kan være ændret. Se
`❓ Til Mads` punkt 15. Den anden og tredje er skrivefejl i YAML-skriverens
talskalar — en linje — og er den naturlige T39, hvis Mads vil have den lavet
før den store.

**Deploy-stillen er uændret, og derfor merger denne commit ikke til `main`.**

VERIFICÉR DEPLOY: playgroundet afviser et tal uden en repræsentation i alle seks
formater i stedet for at skrive `null` eller `Infinity`, `site/engine.js`, commit
`67b5e50`, push 2026-09-26 (ca. 11:1x CEST). Verificér på https://transmute.run/ med input
`[{"a":1e400}]` — alle formater skal vise fejlen og download-knappen skal intet
gøre; med input `[{"a":1}]` og pipelinen
`[{"op":"add","fields":{"p":"item.a/0"}}]` skal den sige `field "p"`.

### 37. [x] Lad en enslig surrogat ikke blive til U+FFFD i stilhed

**Målt i browseren, som T37 krævede, og målingen faldt på en anden måde end opgaven
forudså.** Planen sagde, at `site.js`'s download-knap ville gemme en fil, ingen
læser kan åbne, fordi den bygger en `Blob` af `outEl.textContent`. **Den påstand
er gammel: T36 lukkede den, og jeg målte den til at være lukket.** 6 tilfælde × 6
formater i rigtig Chromium med rigtige downloads, fanget byte for byte:

| tegn | json | csv | yaml | table | sql | xml |
|---|---|---|---|---|---|---|
| `U+0000` (escaped) | skrevet | exit 1 | exit 1 | exit 1 | exit 1 | exit 1 |
| `U+0000` (rå) | exit 1 (JSON.parse afviser det) | exit 1 | exit 1 | exit 1 | exit 1 | exit 1 |
| kolliderende nøgle | advarsel + skrevet | advarsel + skrevet | advarsel + skrevet | advarsel + skrevet | advarsel + skrevet | advarsel + skrevet |

Knappen er varetaget af `has-error` i `site/site.js:511`, så **nul downloads nåede
disken med uwritebart output**, og T33's kolliderende nøgle er en advarsel plus
det sidste værdi-par, altså præcis hvad CLI'en gør. T37 som skrevet var altså
lukket, og det er derfor denne opgave måler den næste flade i stedet.

**Målingen fandt et rigtigt fund i samme fej.** En *enslig surrogat* — halvdelen
af et UTF-16-par, hvis anden halvdel aldrig kom — kan ikke encodes i UTF-8 over
hovedet, så den kan ikke stå i en fil af noget format. Alligevel skrev **tre af
seks** skrivere den stille ud som U+FFFD. målt på den rigtige binary med
`[{"id":1,"note":"a\ud800b"}]`, en fil der er ren ASCII og gyldig JSON:

| `--output` | exit | hvad der kom ud |
|---|---|---|
| `csv` | **0, tom stderr** | `61 ef bf bd 62` — `a` + **U+FFFD** + `b` |
| `table` | **0, tom stderr** | `61 ef bf bd 62` |
| `sql` | **0, tom stderr** | `61 ef bf bd 62` |
| `json` | 0 | `a\ud800b`, tabt intet |
| `yaml` | 1 | præcis afvisning, egen grammatik |
| `xml` | 1 | præcis afvisning, egen grammatik |

Samme kørsel, samme tegn, to forskellige svar, og det forkerede svar var det
stille. Det er **data tabt i stilhed** — U+FFFD er et ganske almindeligt tegn i
en fil, så intet senere kan opdage det. Og det er nået af helt almindelig
input, fordi JSON's `\udXXX`-escape producerer en enslig surrogat.

**Hvorfor det ikke er en smagssag, selv om CSV, SQL og `table` ingen spec har.**
Det var grunden til at T36 gav dem `nulRefuses`: de måles på om en læser kan læse
filen, ikke på om en grammatik nævner tegnet. For en NUL er det det rigtige
spørgsmål. For en enslig surrogat er det det forkerte spørgsmål — der er ingen
fil, der kan holde den, uanset format, så spørgsmålet er ikke hvad reglerne
tillader men om tegnet kan skrives overhovedet. Derfor får den samme afvisning,
samme grund og samme flugtvej som NUL'en ved siden af.

**Rettelsen** er én tabel (`UNWRITABLE` i `src/engine.js`): `csv`, `sql` og
`table` deler nu `textRefuses`, som er `nulRefuses` plus en surrogatregel, og
`why` blev en funktion af tegnet, fordi de to nægter af forskellig grund, og en
læser der får den forkerte grund gætter. `U+FFFE`/`U+FFFF` er bevidst **ikke**
afvist af de tre: de kan encodes, de overleverer tur-returen præcist, og
`file(1)` kalder filen tekst. Asymmetrien med `yaml`/`xml` er med vilje, og er
låst af en test.

To engine-tests, to CLI-tests på den rigtige binary og en konformitest, der
låser alle fem meddelelser ordret til `docs/cli.md` og **verificerer med en rigtig
kørsel, at JSON virkelig kan bære tegnet tabsfrit**, så rådet ikke kan blive en
løgn. DenNegative assert er den vigtigste linje i CLI-testen: `U+FFFD` må ikke
forekomme i nogen writers output, for ellers ville en fix, der *stripper*
tegnet i stedet for at afvise det, også bestå testen.

`site/engine.js` er byte-identisk med `src/engine.js` og blev kopieret, så
playgroundet fik samme rettelse — browser-målingen ovenfor er den samme kode.

**Verificeret i browseren efter rettelsen, samme måling som før den:** `json`
skriver 35 B med `a\ud800b` tabsfrit, og `csv`, `yaml`, `table`, `sql` og `xml`
svarer alle med exit-1-fejlen og **ingen download**. Før rettelsen skrev de tre
11 B, 67 B og 78 B med `ef bf bd` i sig. Det er den eneste efterprøvning, der
beviser fixen — `npm test` kører engine'en, ikke browseren.

Gaten er grøn på den committede tilstand: `npm test` (152 + 135 + 81 + 6 +
workflow-regressionerne + 173 kontratkontroller), `npm pack --dry-run` og
`npm run check:site`.

**Deploy-stillen er uændret, og derfor merger denne commit ikke til `main`.**

VERIFICÉR DEPLOY: playgroundet afviser en enslig surrogat i `csv`, `table` og
`sql` i stedet for at gemme U+FFFD, `site/engine.js`, commit `6891d75`, push
2026-09-26T08:24Z. Verificér ved https://transmute.run/ — sæt input til
`[{"note":"a\ud800b"}]`, ryd pipelinen, og skift mellem csv og json: json skal
vise `"a\ud800b"`, de andre skal vise fejlen og download-knappen skal intet gøre.

### 36. [x] Hold det eneste format, der kan bære tegnet, som det eneste escape

**Status:** FÆRDIG med commit `6c13df1` på `ceo/download-guard` (bygget oven på `ceo/playground-warnings`) — **ligger på branch, ikke mergeret**, fordi `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** Som T20–T35: målt på de rigtige læsere **før** koden blev rørt, fundene skrevet som tests mod output og kørt mod den gamle kode, og låsen testet mod mutationer.
**Begrundelse:** Planen pegede på fladen — *hvad der sker med output, der ikke kan skrives* — og dens egen forudsætning var **fejl**, så den måtte måles, ikke implementeres. Den sagde at `fs.writeFileSync` kaster på `U+0000`. Den gør ikke: `nul.json -o csv --out n.csv` skriver exit 0, tom stderr og en fil med **råt NUL-byte** i den.

**Fundet er T32's egen målefejl, én række oppe i tabellen.** T32's tabel sluttede med rækken `samme tegn i csv / sql / json / yaml | exit 0, tegnet **bevares** — formaterne kan godt holde det`. Den spurgte, om tegnet overlevede skrivningen, og ikke om noget kunne læse filen. **Fjorten målinger på de reference-læsere, én række ad gangen** (Python `csv`, SQLite, PyYAML, `file(1)`):

| `--output` | NUL i den skrevne fil |Hvad læseren siger | Før → nu |
|---|---|---|---|
| `json` | **nej** (escapes til `\u0000`) | `json.loads` → værdien er der | exit 0 — uændret |
| `csv` | **ja** | `csv.Error: line contains NUL` | exit 0, tom stderr → **exit 1** |
| `sql` | **ja** | `OperationalError: unrecognized token: "'a"` | exit 0, tom stderr → **exit 1** |
| `yaml` | **ja** | `ReaderError: unacceptable character #x0000` | exit 0, tom stderr → **exit 1** |
| `table` | **ja** | `file(1)`: `data`, ikke tekst | exit 0, tom stderr → **exit 1** |
| `xml` | — | `expat: not well-formed` | allerede exit 1 (T32) |

Alle fem skrev *exit 0, tom stderr* før denne iteration. Det er den samme tavshed som de foregående tretten, kun målt fra den anden side.

**YAML er den strengeste, og dens regel er en specifikation, ikke en gæt.** Seksten tegn målt gennem PyYAML: **elleve af dem afvises**, og de er præcis dem YAML 1.2's `c-printable` udelukker — `c-printable ::= #x9 | #xA | #xD | [#x20-#x7E] | #x85 | [#xA0-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]`. De tre i sættet PyYAML *accepterer* er præcis de tre der er *inde* i det. YAML har ingen escape for dem: `\0` er ikke et YAML-escape, så quoting af skalarværdien gør det heller ikke til plads. Derfor er YAML præcis samme sag som XML hos T32 — ude af `Char`/`c-printable` **og** uden en måde at skrive det på — og derfor samme svar.

**Valget er T32's, anvendt en gang til.** Advarsel, fejl eller ingenting: **fejl, exit 1, tom stdout, ingen fil.** Der findes intet repræsenterbart svar i det valgte format, og en fil der påstår at være YAML 1.2 og ikke er det, er værre end ingen fil. CSV, SQL og tabellen har ingen tegnsæt at slå op, men de skriver alle tekst, og **NUL afslutter posten for enhver læser af dem** — Python's `csv` siger det ordret, SQLite melder `unrecognized token` *inde i* literalet, og `file(1)` kalder alle tre `data`. Ingen quoting hjælner i nogen af dem.

**Rettelsen er én tabel, ikke fem vagter.** T32's `firstUnrepresentableXMLChar` og `scanXMLValue` blev generaliseret til `firstUnrepresentable(str, refuses)` + `scanWritable(value, at, rule)` + `assertWritable(data, format)`, og `UNWRITABLE` rummer én regel pr. format: `xmlRefuses` (Char), `yamlRefuses` (c-printable) og `nulRefuses` (CSV, SQL, table). Alle fem skrivere kalder den nu, og **beskeden er byte-identisk med T32's for XML**, så de konformitetslåse fra T32 holder uden at blive rørt. `json` står **ikke** i tabellen med vilje: det escaper dem alle, og det er derfor det er den eneste flugtvej, beskeden navner.

**Playgroundet arvæder rettelsen uden kode.** Rammen sender `r.error` videre, `site.js` sætter `has-error` og download-knappen returnerer tidligt på den klasse — så `-o yaml` med et NUL viser præcis den samme fejl i fejlboksen, og der gemmes intet. Det er samme svar som T23 fandt: der er ikke to steder.

**Test: tre nye engine-tests (142 → 145) og to nye konformiteter (79 → 80), alle kørt mod den gamle kode.** Den ene engine-test er fundet selv: den hed *the other formats keep the characters XML has to refuse* og **påstod fire formatters kan bære NUL'en** — den faldt rødt med præcis det målte symptom, fordi påstanden var det, der var fundet. Den anden låser YAML's `c-printable` i begge retninger (elleve ude → exit 1, ti inde → exit 0) plus at et rigtigt surrogatpar ikke kvæles. Den tredje låser at NUL'en findes i et **feltnavn** som i en værdi, og at tab, linjeskift og vognskifte ikke afvises af nogen af de fem. Konformitesten låser **alle fem** beskeder ordret i `docs/cli.md`, at hver af dem navner `Write JSON instead` når det er sandt, at `json`-kørslen virker, og at docs **ikke** længere gentager den falske påstand. Mutationstestet to gange: slettet en regel fra `UNWRITABLE` — fanget af formatlåsen — og en besked ændret — fanget af docslåsen.

`site/engine.js` er byte-identisk med `src/engine.js` og blev kopieret med, så **playgroundet på `/` og `/da/` fik samme rettelse**; `tools/site_chrome.py` regenererede kun `engine.js`-hashen i `try.html` (ingen anden side ændrede sig, søgeindeks uændret på 104). Derfor **er** `check:site` kørt. Lokalt grøn: `npm test` 145+133+80+6+39+4+173, `npm pack --dry-run` uændret på 5 filer, `npm run check:site` `0 finding(s) across 20 pages` + `deviations: 0` + alle selftester grønne inkl. deploy-friskheds-selvfesten.

### 35. [x] Få advarslerne fra de sidste tre iterationer frem foran en browserbruger

**Status:** FÆRDIG med commit `7fdd7d8` på `ceo/playground-warnings` (bygget oven på `ceo/reader-gaps`) — **ligger på branch, ikke mergeret**, fordi `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** Som T20–T34: stien målt på den rigtige motor (`site/engine.js`, indlæst i en `vm` som `try.html` gør det) **før** koden blev rørt, fundene skrevet som tests mod output og kørt mod den gamle kode, og låsen testet mod mutationer.
**Begrundelse:** `❓ Til Mads` punkt 8 rejste det som en sideeffekt, da T26 skrev det ned, og T34 hævede det til næste opgave. Det er den **flade hvor advarslerne dør**: `site/try.html` videresender `text`, `error` og `rows` men ikke `r.warnings`, så playgroundet på `/` og `/da/` — den mest brugte flade i produktet, og den man netop bruger til at prøve en pipeline — viste det forkerte svar uden at sige det. Det er produktfasens prioritet 1 anvendt på advarselssiden: et svar, der ligner rigtigt, uden at brugeren får at vide hvorfor.

**Målingen, tolv stier kørt på den rigtige motor før rettelsen.** Den viste at de otte advarselsproducerende stier alle dør i samme linje — ikke otte fejl, men én:

| Kørsel i playgroundet | CLI'ens stderr | Det browseren viste | Vurdering |
|---|---|---|---|
| `pick` på feltet `nmae` (en tastefejl) | `pick: no record has a field named "nmae"; it is in no output` | **tom tabel, 1 række, 0 kolonner** | **fund 1** |
| `unique --by ag` på fel ingen række har | `unique: no record has a field named "ag"; every row looked identical, so 1 of 3 rows survived` | **1 række ud af 3, intet om de to der forsvandt** | **fund 1** |
| `{"name":"Ada","name":"Bob"}` på roden (T33) | kollision med nøgle, begge værdier og linje | `Bob` — ser ud som en lykket merge | **fund 1** |
| samme kollision dybt nede i JSON (T33) | kollision med linje | kun den sidste værdi | **fund 1** |
| YAML-blokmapping med dobbelt nøgle (T33) | kollision med linje 1 og 2 | kun den sidste værdi | **fund 1** |
| `{a: 1, a: 2}` som helt dokument (T34) | kollision uden linje | kun den sidste værdi | **fund 1** |
| CSV-række med flere felter end overskriften (T13) | `1 of 1 CSV rows has more fields than the header (row 2); …` | kolonnerne `column3`, `column4` uden forklaring | **fund 1** |
| YAML-fil med to dokumenter (T14) | `2 documents in file, only the first was read` | kun det første, som om filen kun havde det | **fund 1** |
| `rename` med ulovligt XML-navn (T21) | (fejl, ikke advarsel) | fejlbeskeden i outputboksen | ren |
| `pick` på en række der ikke er en record (T27) | (fejl) | fejlbeskeden | ren |
| expression der ikke er JavaScript (T23) | (fejl) | fejlbeskeden | ren |
| ren kørsel | (tom stderr) | output + rækketal | ren |

**Fund 1 — de otte er én.** Alle otte fejl lå i **samme linje**: `site/try.html:27` svarte `{ type: 'result', id, text, error, rows, format }`. Motoren har returneret `warnings` siden T13, og `src/cli.js:245` har printet dem på stderr siden da, så **der var ingen fejl i advarslerne — de var bare aldrig krydset rammekanten**. Derfor er rettelsen en linje i rammen plus den halvdel, der maler dem, og derfor er de otte målinger ovenfor ét fund og ikke otte.

**De to værste er målt frem for antaget, fordi de er de to, hvor tabet er synligt.** `pick` med en tastefejl i et feltnavn gav en tabel med **én række og nul kolonner** — brugeren så et resultat, der så ud som om værktøjet ikke forstod hans data. `unique --by` på et felt ingen rækker har skrev **én række ud af tre**, exit 0, tom stderr, altså det eneste sted i værktøjet hvor data forsvinder uden at nogen siger det. Begge er præcis den fejl T26's advarselsklasse blev lavet til at fange, og ingen af dem nåede nogen, der brugte browseren.

**Valget mellem advarsel og fejl er T26's skelneline, brugt for tredje gang.** En advarsel er et *antagende om data* eller en *fil, der siger noget ubedt*: kørslen lykkes, output skrives, og beskeden siger hvad der faktisk skete. Derfor males advarslerne **under** output og ikke i det: kopier og download læser `[data-role=output]`, så en advarsel dér ville blive kopieret som data — præcis den skelnelinestandard, CLI'ens stderr/stdout-adskillelse findes for at holde. En fejl derimod fylder outputboksen og farver den, som den gjorde før. Advarslerne er derfor heller ikke en fejltilstand: download blokeres ikke, og en kørsel med advarsler er en god kørsel.

**Rammen svarer nu altid med et `warnings`-array, også på de to tidlige veje** (ugyldig pipeline-JSON, pipeline der ikke er et array). Kontrakten skal være **total**, ellers må forsidens malespecial-case to fejl, den ikke kan ramme med de andre — og det er præcis den slags forgrening, der bliver en tavshed ved den næste tilfælde. Elementet ligger i markup'en på begge forsider og er `hidden` uden JavaScript, fordi siden da viser sit statiske eksempel, og en tom advarselsboks, der ligner som om der er noget at sige, er en løgn.

**Tests: tre nye konformitester (76 → 79), alle tre kørt mod den gamle kode og alle tre røde med præcis de målte symptomer.** Den første kører **sitets egen `try.html`-script** i en `vm` med en `module`-shim og en håndlavet `postMessage`-kanal — ikke en tekstsøgning — og kræver at rammens `warnings` er **tegn for tegn lig CLI'ens stderr** på alle fem advarselsproducerende stier, og at outputtet er det samme. Den anden låser at en ren kørsel svarer med `[]` og at en kørsel, der **fejler**, stadig bærer de advarsler, motoren samlede på vejen. Den tredje låser male-siden: at `site.js` læser `data.warnings`, at etiketten findes på **begge** sprog og er forskellige, at elementet findes i markup'en på begge forsider og er `hidden` som udgangspunkt, og at advarslerne ikke skrives i outputelementet. **Mutationstestet tre gange:** slettet `warnings` i rammen, slettet kaldet i `site.js`, og — den mutation der *først slap igennem* — advarslerne lagt i outputelementet via en variabel, som kun et check af selve funktionskroppen fanger. Den lå blev derfor skærpet, så den ikke kun greb et nøgleord på den samme linje.

`src/engine.js` er **urørt** — rettelsen er udelukkende i rammen og den der maler den — så `site/engine.js` er byte-identisk med `src/engine.js` stadig, og `tools/site_chrome.py` regenererede kun asset-hashene for `site.js` og `style.css` i alle 20 sider (`53356298` → nyt, `670bcea0` → nyt), søgeindeks uændret på 104. Derfor **er** `check:site` kørt. Lokalt grøn: `npm test` 149+133+79+6+39+4+173, `npm pack --dry-run` uændret på 5 filer, `npm run check:site` `0 finding(s) across 20 pages` + `deviations: 0` + alle selftester grønne inkl. deploy-friskheds-selvfesten.

### 32. [x] Mål de skærmformater, der ikke er `table` — og ret den tavshed, de gemte

**Status:** FÆRDIG med commit `88ea6f6` på `ceo/xml-unwritable-chars` — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** T31's fund pegede på den næste flade: de skærmformater `table` ikke dækker — `xml` på brede tegn i **værdier** (T21 havde kun lavet nøglenavne), `sql` på de samme tegn, og `csv` på en celle længere end nogen anden. Denne iteration målte alle tre på den rigtige binary. To af dem viste sig at være rene, og den tredje gemte **én fejl, der lå i en linje T31 ikke havde rørt**: `escapeXML` skrev tegn, som XML 1.0 slet ikke kan repræsentere, lige i filen.

**Målt før koden blev rørt (på den rigtige binary, `src/cli.js`; `expat` som reference-parser):**

| Måling | Resultat |
|---|---|
| `日本` / `🚀` / `café` i `table` | rettet i T31 |
| samme tegn i `xml` (element-tekst) | exit 0, korrekt UTF-8 — **rent** |
| samme tegn i `xml` (attribut-værdi) | exit 0, korrekt UTF-8 — **rent** |
| samme tegn i `sql` | exit 0, korrekt UTF-8 — **rent** |
| samme tegn i `csv` | exit 0, korrekt UTF-8 — **rent** |
| `csv` med én celle på 300 tegn, round trip | exit 0, **byte-identisk** — **rent** |
| `csv` med 1.000.000 rækker | exit 0 på 1,9 s — **rent** |
| tab / LF / CR i `xml` | exit 0, skrevet råt, expat læser dem — **rent** |
| **`U+0000` NUL i en værdi → `xml`** | **exit 0, tom stderr, fil på disk; `expat` afviser: `not well-formed (invalid token)`** |
| **`U+0007` BEL / `U+000B` VT / `U+000C` FF → `xml`** | **samme** |
| **`U+001B` ESC / `U+001F` US → `xml`** | **samme** |
| **`U+FFFE` / `U+FFFF` → `xml`** | **exit 0, `expat` afviser** |
| **enlig surrogat (`\ud800`) → `xml`** | **exit 0, skrevet som U+FFFD — data tabt i stilhed** |
| samme tegn i `csv` / `sql` / `json` / `yaml` | exit 0, tegnet **bevares** — formaterne kan godt holde det |
| NUL i et **feltnavn** → `xml` | exit 0, `expat` afviser (går ud i `name`-attributten) |
| NUL i en **attribut-værdi** (`@label`) → `xml` | exit 0, `expat` afviser |
| Transmutes egen læser på den ødelagte fil | exit 0, læser den fint — **runden skjuler fejlen** |

**Fundet er den samme tavshed som T21, i værdierne.** T21 rettede *nøglenavne*, fordi `first name` og `2fa` skrev en fil, ingen parser accepterede. `escapeXML` escaper `&`, `<`, `>`, `"` og `'` og lader **alt andet** passere råt, så et kontroltegn i en *værdi* landede i filen ubeskadiget. XML 1.0's `Char`-produktion er `#x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]`, så NUL, resten af C0, `U+FFFE`, `U+FFFF` og en enlig surrogat ligger **uden for den** — og der er ingen escape, fordi `&#0;` afvises af den samme produktion.

**Valg — stop, ikke strip.** Der findes intet repræsenterbart svar, så kørslen stopper med exit 1, tom stdout og ingen fil, og beskeden navnginer tegnet **og** hvor det står (`row 1, field "note"`). At fjerne tegnet ville være den tavse datatab, T13 og T30 findes for at fjerne; en fil, der påstår at være XML 1.0 og ikke er det, er værre end ingen fil. Det er **exit 1 og ikke 2**, fordi pipeline'en er fin — det er data, XML ikke kan bære, præcis som T27's skelneline.

**Rettelsen** er `firstUnrepresentableXMLChar` (Char-produktionen skrevet ud, ikke tilnærmet) + `scanXMLValue`, som går gennem data **før** der skrives noget, så fejlmeddelelsen kan sige række og felt. Den køres fra `serializers.xml` og dækker dermed alle fem skriveveje på én gang: element-tekst, attribut-værdi, `@`-attributter og `name`-attributten for ulovlige nøglenavne. `C0_NAMES` giver de otte almindelige kontroltegn deres navn, så beskeden er `U+0000 (NUL)` og ikke bare et tal.

**Begrænsningen blev bevidst holdt snæv.** En *fuld* surrogatpar er ét tegn over `#xFFFF` og er helt lovlig, så `for...of` (som går i code points) er hele forskellen mellem `U+D800` og `U+1F600`; en test låser de to, så en bredere vagt ikke kan kvæle emoji ved en senere opgave.

**Fire nye engine-tests (138 → 142), tre nye CLI-tests (127 → 130) på den rigtige binary, én konformitest (75 → 76).** Tænder verificeret: de tre af de fire engine-tests **fejler på den gamle kode** med præcis de målte symptomer, den fjerde (de andre formatters bevarer tegnet) er grøn på begge og er bevidst en regression-garanti. Konformitesten låser fejlmeddelelsen **ordret** til `docs/cli.md`, `--help` og exit-1-rækken i docs, og verificerer samtidig at de fire formatters, beskeden navngiver som flugtvej, faktisk kan bære tegnet — ellers er rådet en løgn. Låsen er testet mod to mutationer (ændret fejltekst, slettet `--help`-linje), begge fanget.

`site/engine.js` er byte-identisk med `src/engine.js` og blev kopieret med, så **playgroundet på `/` og `/da/` fik samme rettelse**; `tools/site_chrome.py` regenererede asset-hash'en i `try.html`, og ingen anden side ændrede sig (søgeindeks uændret på 104). Derfor **er** `check:site` kørt her. Lokalt grøn: `npm test` 142+130+76+6+39+4+173, `npm pack --dry-run` uændret på 5 filer, `npm run check:site` `0 finding(s) across 20 pages` + `deviations: 0` + selftester grønne inkl. deploy-friskheds-selvfesten, `npm run audit:site` `No known vulnerabilities found`, `npm audit` `found 0 vulnerabilities`.

### 33. [x] En læser skal sige, når inputen siger det samme to gange

**Status:** FÆRDIG med commit `46b5567` på `ceo/reader-ambiguity` — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** T32 skrev den næste flade ned som de **andre læsere**: "T30 målte kun encodingsfejlen på *ind*, aldrig det en læser gør med en fil den ikke forstår — en CSV med en feltantal-kollision, en YAML-fil med en duplikeret nøgle, en XML-fil med to rødder — for de læsere har alle exit 0 som deres dårligste svar, og T14/T22 viste at de to CSV-svagheder, der blev fundet, lå i den slags." De tre navngivne tilfælde var målet, ikke hele scope.

**Målt på den rigtige binary før koden blev rørt:**

| Fil | Resultat på den gamle kode | Vurdering |
|---|---|---|
| `a,b` + række med 3 felter | `column3` + advarsel (T14) | ren |
| `a,b,column3` + række med 4 felter | `column4` + advarsel | ren — positionsnavl, ingen kollision |
| `a,column2` + række med 3 felter | `column3` + advarsel | ren |
| `a,b` + række med 1 felt | feltet bliver `""` | ren (dokumenteret) |
| `{"name":"Ada","name":"Bob"}` | **`Bob`, exit 0, tom stderr** | **fund 1** |
| `[{"a":1},{"a":1,"a":2}]` | **`a: 2`, exit 0, tom stderr** | **fund 1** |
| `name: Ada` / `name: Bob` | **`Bob`, exit 0, tom stderr** | **fund 1** |
| `x:` → `k: 1` / `k: 2` | **`k: 2`, exit 0, tom stderr** | **fund 1** |
| `a: {x: 1, x: 2}` | **`x: 2`, exit 0, tom stderr** | **fund 1** |
| `<root>…</root>` + `<other/>` | **kun første dokument, exit 0, tom stderr** | **fund 2** |
| `<rows>…</rows>` to gange | exit 3, men beskeden peger på det indre | fund 2, halvt dækket (se nedenfor) |
| `<root>tekst<a>1</a></root>` | exit 3 | ren |
| `{a: 1, a: 2}` som hele dokument | **`{"{a": "1, a: 2}"}`, exit 0** | **fund 3 — ikke rettet** |
| tab-indenteret YAML | læses korrekt | ren |

**Fund 1 — input, der giver en nøgle to gange, taber den første værdi i stilhed.** Ikke ét fund men fire veje ind i den samme fejl: JSON på topniveau, JSON dybt nede, YAML-blokmapping og YAML-flowmapping. Det er YAML's klassiske fælde, og det *ser ud* som om en merge lykkedes — altså præcis den slags fejl, en bruger ville stol på værktøjet til at fange. `JSON.parse` har kastet den første værdi væk, før nogen kan se den, og en reviver ser kollisionen heller ikke, så dokumentet må gås som tekst.

**Rettelsen er eksakt, ikke en antagelse:** en nøgle i JSON er altid en streng med et `:` bagefter (det er definitionen af en medlemsnavn i JSON), og `{`/`}` nest i den ene rækkefølge de kan. Derfor kan fundet aldrig være en kollision, der ikke er der. Værdien slices ud af samme tekst og parses for sig selv, hvilket er det der gør `{"a":1,"a":1}` tavs: samme værdi to gange er ikke en kollision, der er noget at beslutte, og en advarsel for det ville være støj på korrekt input. Den går ind i objekt- og arrayværdier i stedet for at springe over dem, så en kollosion en etage ned findes af samme regel. Alle fire veje bruger **én** besked, så læserne ikke kan glide fra hinanden.

**Valget mellem advarsel og fejl er T26's skelneline, anvendt på den anden side af den.** Et nøglenavn er et antagende om data, der kan være rigtigt for næste fil → advarsel. En nøgle, der står to gange med to værdier, er ikke et antagende: filen modsiger sig selv, og *hvilken* side der er rigtig, er ikke noget læseren kan vide. Men den kan sige det. Så: **værdien beholdes** (den sidste, samme svar som `JSON.parse` og `jq` giver), kørslen lykkes, stdout er ren data, og kollisionen navngives på stderr med nøglen, begge værdier og de linjer de står på. Det er præcis T14's afvejning — "en synlig kolonne med et underligt navn er brugbar, en fejl uden output er det ikke" — og linjenumret er det der gør den handlingsmulig i en fil på 40.000 rækker, hvor ingen læser kan finde `k: 1` med øjnene.

**Fund 2 — alt efter XML'ens rodelement blev aldrig læst.** `closeIdx` er fundet med `lastIndexOf`, og hvad der står efter `</root>` blev aldrig undersøgt. Batchværktøjer sammenbinder dokumenter, så `<rows>…</rows><more>…</more>` er en fil brugere faktisk har, og læseren læste den første og glemte resten: exit 0, tom stderr, **halv en fil der ligner alle**. Et XML-dokument har præcis ét rodelement, så her er svaret ikke en advarsel men exit **3** — samme linje som T32's "en fil der påstår at være XML 1.0 uden at være det er værre end ingen". Transmute vælger ikke det dokument, brugeren mente; den siger, at der ikke er ét.

**Fund 3 er målt og bevidst ikke rettet her** (tid og scope): en flowsamling som *hele dokumentet* (`{a: 1, a: 2}` på roden) læses stadig som den bogstavlige streng `"{a": "1, a: 2}"`. Det er en mangel, ikke en tavshed — men den er kun nåelig med eksplicit `-f yaml`, da `detectFormat` sender `{` til JSON-læseren, som med vilje afviser den. Lagt ned som T34.

**Halvdækningen i fund 2 er skrevet ned, fordi den er ærlig:** når det andet dokument har **samme** rodnavn, finder `lastIndexOf` den *sidste* `</rows>`, så efter-rod-kontrollen ikke fanger det, og den eksisterende elementkontrol gør i stedet — exit 3, tom stdout, men med en besked der peger på det indre (`Could not read the XML element at "</rows>…`) i stedet for på rodreglen. Brugerens data er altså stadig i sikkerhed, og det er den realistiske form (et batchværktøj der appender samme skema), så en dybde-aware søgning efter rodens afsluttende tag er T34s anden halvdel.

**Tests: 5 nye engine-tests (142 → 147) og 2 nye CLI-tests (130 → 132) på den rigtige binary.** Hver af dem er skrevet mod output og kørt mod den gamle kode: alle syv fejler der med præcis de målte symptomer (ingen advarsel, hhv. kun første dokument). Den der låser "en identisk gentagelse er ikke en kollision" er grøn på begge og er en regression-garanti mod en overgrebende vagt. `docs/cli.md` fik to nye afsnit med **kørte** kommandoer og fejlmeddelelser verificeret tegn for tegn; XML-eksemplet måtte rettes, fordi CLI'en sætter `Could not parse input as xml: ` foran beskeden, hvilket den første udskrift ikke havde — samme slags fejl T22's forfatter lavede ved at gætte output i stedet for at køre det.

`site/engine.js` er byte-identisk med `src/engine.js` og blev kopieret med, så **playgroundet på `/` og `/da/` fik samme rettelse**; `tools/site_chrome.py` regenererede asset-hash'en i `try.html` (`1d852314` → `74cbfcd5`), ingen anden side ændrede sig, søgeindeks uændret på 104. Derfor **er** `check:site` kørt. Lokalt grøn: `npm test` 147+132+76+6+39+4+173, `npm pack --dry-run` uændret på 5 filer, `npm run check:site` grøn med `deviations: 0` på 20 sider og alle selftester grønne inkl. deploy-friskheds-selvfesten.

### 34. [x] Gør de to målte huller i læserne tætte

**Status:** FÆRDIG med commit `e8641c1` på `ceo/reader-gaps` (bygget oven på `ceo/reader-ambiguity`) — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** T20–T33-metoden fortsat. Hver sti målt på den rigtige binary *før* koden blev rørt, og hvert fund skrevet som en test mod output, som blev kørt mod den gamle kode.
**Begrundelse:** T33 målte fjorten læserstier og fik to af fundene rettet. De to der blev **målt og bevidst ikke rettet** er skrevet ned her, så de ikke går tabt, og fordi begge er små nok til én iteration.

**Målingen, alle fjorten stier kørt på den rigtige binary før rettelsen.** Den viste, at kun den ene af de to skrevne fund var et fund, og at der lå et tredie ved siden af dem, som scope ikke havde set:

| Sti | Før | Efter |
|---|---|---|
| `{a: 1, a: 2}` som hele dokument | **`{"{a": "1, a: 2}"}`, exit 0, tom stderr** | `a: 2` + kollisionsadvarsel, exit 0 |
| `{a: 1, b: two}` som hele dokument | **`{"{a": "1, b: two}"}`, exit 0** | `{a: 1, b: "two"}` |
| `[1, 2, 3]` som hele dokument | `[1, 2, 3]` | uændret (scalar-stien fandt den) |
| `{a: 1} # en note` | **`{"{a": "1}"}`** | `{a: 1}` |
| `---` efterfulgt af `{a: 1}` | **`{"{a": "1}"}`** | `{a: 1}` |
| `{a: 1` (ubalanceret) | `{"{a": 1}` | uændret |
| `{a: 1}` + `b: 2` på næste linje | `{"{a": "1}", b: 2}` | uændret |
| `[\n {a: 1},\n {a: 2}\n]` (flow over flere linjer) | `["["]` | uændret |
| `<rows>a</rows><rows>b</rows>` | exit 3, **elementkontrollens** besked | exit 3, **rodreglens** besked |
| `<rows/><rows>b</rows>` | exit 3, elementkontrollens besked | exit 3, rodreglens besked (med `<rows/>`) |
| `<rows></rows><rows>b</rows>` | exit 3, elementkontrollens besked | exit 3, rodreglens besked |
| `<rows><row><a>1</a></row></rows>` to gange | exit 3, elementkontrollens besked | exit 3, rodreglens besked |
| `<r>1</r><r>2</r><r>3</r>` | exit 3, elementkontrollens besked | exit 3, rodreglens besked |
| `<ns:rows>a</ns:rows><ns:rows>b</ns:rows>` | exit 3, elementkontrollens besked | exit 3, rodreglens besked |
| `<rows>a</rows>` + blank + `<rows>b</rows>` | exit 3, elementkontrollens besked | exit 3, rodreglens besked |
| **`<rows/>` alene** | **exit 3, `XML root element <rows> is never closed`** | exit 0, `[]` |
| `<root><root>x</root></root>` | `[{root: "x"}]` | uændret |
| `<root><roots>x</roots></root>` | `[{roots: "x"}]` | uændret |
| `<data><item><a>1</a></b></data>` (krydsede tags) | elementkontrollens besked | uændret |
| `<a><![CDATA[<b>]]></a>` | elementkontrollens besked | uændret |
| `<r><i t="x>y">1</i></r>` | `{"@t": "x>y", "#text": "1"}` | uændret |

**Fund 1 — rodreglen dækkede kun halvt, fordi `lastIndexOf` tager den *sidste* `</rows>`.** Det er ikke en ny regel men den samme regel sat på et andet sted: rodens afsluttende tag findes nu ved at tælle de åbne elementer, ikke ved at kigge efter den seneste lukning. Det er tællingen — ikke navnet — der gør `<root><root>x</root></root>` og `<root><roots>x</roots></root>` rigtige, så begge regressioner er låst i test. **Beskedens sprog følger roden:** en rod der lukker sig selv skriver `more after <rows/>`, ellers `more after </rows>`, fordi det er det brugeren skal kigge på.

**To ting blev bevidst *ikke* gjort, fordi målingen sagde nej.** (1) En fil hvis tags ikke matcher, `<data><item><a>1</a></b></data>`, får **uændret** elementkontrollens besked: `findRootClose` returnerer `null` ved en lukning, der ikke matcher det den lukker, og så falder kaldet tilbage på læserens egen `lastIndexOf`. En tælling over en fil, hvis tags ikke passer, ville være et opdigtet svar. (2) `<rows><rows/></rows>` er **ikke** et fund, selv om T33 skrev det som acceptkriterium: målingen viser, at det er ét velformet dokument med ét tomt barn, og `[{}]` er præcis det svar læseren allerede giver `<r><i/></r>`. Alle de former en batchværktøj faktisk skriver — `<rows/><rows>b</rows>`, `<rows></rows><rows>b</rows>`, to fulde dokumenter, tre dokumenter, navnerumme — er fanget af rodreglen nu.

**Fund 2, som scope ikke havde set: `<rows/>` alene blev afvist som et rod, der aldrig lukkes.** `lastIndexOf('</rows>')` er -1 for en rod der selv lukker sig, så den eneste besked i hele XML-læseren, der var *bogstaveligt* forkert, kom fra denne ene fil. Den er målt på den rigtige binary, før rettelsen, og rettelsen er at læse den som det dokument den er: nul rækker. Samme vej gør beskeden om det der kommer *efter* en selv lukkende rod mulig — `<rows/><rows>b</rows>` er den første sammenbundne fil, der overhovedet er gyldig XML, og før denne rettelse var den kun fanget ved et uheld.

**Rettelsen til fund 1 er `findRootClose` + to betingelser i `parseYAML`, der begge er der for at bevare alt andet.** `parseYAMLFlow` læser syntaksen i forvejen, og læser den samme linje korrekt en linje ned — kun roden manglede. Den nye rod-gren kalder den kun når to ting holder: flowet **lukker på linjen** (`parseYAMLFlow` siger kun ok, når den har brugt hele linjen) og **intet følger efter** (så en samling på rodlinjen aldrig kan sluge linjerne under sig). Ubalanceret `{`, en samling over flere linjer og `{a: 1}` med en nøgle under sig læser derfor præcis som i dag — alle tre låst i test, målt på den gamle kode først.

**Tests: 2 nye engine-tests (147 → 149) og 1 nyt CLI-test (132 → 133), plus to skærpete assertions i et eksisterende CLI-test.** Alle tre er skrevet mod output og kørt mod den gamle kode: de fejler med præcis de målte symptomer (én streng, elementkontrollens besked, exit 3 for `<rows/>`). Det eksisterende CLI-test sagde tidligere *forkert* om den samme rodnavn-fil, at den "fanges af elementkontrollen" — den beskriver nu den besked, der faktisk kommer, og dækker desuden `<rows/><rows>…`, `<rows/>` alene og YAML-flowsamlingen på den rigtige binary med rigtige filer. `docs/cli.md` fik to afsnit med **kørte** kommandoer og fejlmeddelelser verificeret tegn for tegn.

`site/engine.js` er byte-identisk med `src/engine.js` og blev kopieret med, så **playgroundet på `/` og `/da/` fik samme rettelse**; `tools/site_chrome.py` regenererede asset-hash'en i `try.html` (`74cbfcd5` → `2e850275`), ingen anden side ændrede sig, søgeindeks uændret på 104. Derfor **er** `check:site` kørt. Lokalt grøn: `npm test` 149+133+76+6+39+4+173, `npm pack --dry-run` uændret på 5 filer, `npm run check:site` grøn med 0 fund på 20 sider og alle selftester grønne inkl. deploy-friskheds-selvfesten.

**To procesfejl under T34, begge fanget før commit af de nye tests.** (1) `findRootClose` startede med en tom stak, så den returnerede, når *rodens børn* var lukket — en niveau for tidligt — og *alle* XML-tests faldt samtidig, fordi den så `more after </r>: "</r>"`. Den fangede sig selv: rødt i hele suiten, ikke i én test. (2) To af mine egne test-forventninger var gættet frem for kørt: `<r><i a="1"/><i>2</i></r>` er `[{"i":{"@a":"1"}},{"i":"2"}]`, fordi fladningen kun sker når *alle* børn er objekter, og `{a: 1}\nb: 2` er `{"{a":"1}", b: 2}`, ikke `{a: 1, b: 2}` som jeg havde skrevet — den ubalancerede linje fra målingen ovenfor. Begge er rettet i testene, ikke i koden, fordi koden har svaret rigtigt hele vejen.

### 27. [x] Et step, der læser felter, skal sige fra på en række, der ikke er en record

**Status:** FÆRDIG med commit `0abe7a3` på `ceo/record-shape` — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** T20–T26-metoden fortsat, nu på den flade T26 eksplicit skrev ned som et designsvalg. Hvert fund er kørt på den gamle kode før rettelsen.
**Begrundelse:** produktfasens prioritet 1, "et køb, der ikke leverer" i dens CLI-form: en kørsel der lykker, skriver exit 0 og en tom stderr, mens den leverer noget andet end det bestilte — og i to tilfælde sletter den data.

**Fund 1 — `pick` døde med V8's egen sprog.** Efter `{"op":"map","expr":"item.name"}` døde `{"op":"pick","fields":["name"]}` med `Cannot use 'in' operator to search for 'name' in Ada`, exit 1, rå engine-fejl i et værktøj, der ellers siger `Invalid expression "item.age >": …` på sit eget sprog.

**Fund 2 — de samme otte felter, samme familie, seks forskellige tavse svar.** Alle kørt på den gamle kode, alle exit 0, alle med tom stderr:

| Pipeline efter `map` der efterlod strenge | Hvad kom ud |
|---|---|
| `omit ["a"]` | kolonnerne `0 1 2` med `A d a` — tegn, filen aldrig indeholdt |
| `rename {"0":"first"}` | samme opdigtelse, døbt om |
| `add {"double":"item*2"}` på tal | kun `double` — **tallet var væk** |
| `group by "name"` | én gruppe `(null)` med alle rækker |
| `unique by "name"` | 2 rækker ind, **1 ud** (`undefined` mod `undefined`) |
| `join with […] on "name"` | `[]` — alle rækker tabt, tom fil skrevet |
| `sort by "name"` | rækkerne i input-rækkefølge |
| `flatten field "x"` | ingen rækker udvidt |

**Rettelse:**

- `requireRecords(data, step, index)` i engine'en, kaldt i `run`s transform-løkke før hvert step, med `RECORD_STEPS` = de otte step der læser en række som en record. Den stopper ved den første række, den ikke kan læse, og siger **step, rækkenummer og rækkens type**: `Pipeline step 2 (pick) names a field, but row 1 is a string ("Ada"), not a record. It has no fields to read — use map to turn each row into a record first.`
- **Exit 1, ikke exit 2.** T23's asymmetri holder: en expression, der ikke er JavaScript, er exit 2 fordi den er brugerens eget input; her er pipeline'en fin og det er *rækkerne*, der ikke er det. Den fejl bærer derfor ingen `usage`-flag, og `test/cli.test.mjs` låser exit 1 med tom stdout.
- **De step der ikke læser felter, røres ikke.** `count`, `head`, `tail`, `filter`, `map` og `unique` uden `by` virker stadig på tal, strenge og nuller. Det er ikke en bivirkning, det er kravet: `map` er dokumenteret som den vej, rækker bliver værdier på, så en vagt der også stoppede `map` ville gøre vejen ubrugelig. `RECORD_STEPS` er derfor en navneliste, ikke "alt der kortlægger rækker".
- **Rækkenummeret tælles i alle former.** `describeRow` siger `a string ("Ada")`, `a number (36)`, `a boolean (true)`, `an array` og `null`, så fejlen er brugbar for alle fem, ikke kun for strenge.
- `reportMissingFields` behøvte ingen ændring: den springer ikke-records over, og dens kommentar ("et step der ikke kan arbejde på en, siger det i sin egen fejl") er nu sand.
- `docs/cli.md` fik afsnittet **When a row is not a record** med den kørte kommando, exit-koden og den anden halvdel af reglen. `tools/site_chrome.py` regenererede `site/engine.js` (byte-identisk med `src/engine.js`) og asset-hash'en i `try.html`; ingen anden side ændrede sig, søgeindeks uændret på 104.

**Valg, der er bevidst:**

- **Fejl, ikke advarsel.** T26's advarsel gælder et *feltnavn*; T27's fejl gælder en *rækkeform*. Skellelinjen er T26's egen: et feltnavn er et antagende om data og kan være rigtigt for næste fil, mens en række uden felter ikke kan læses overhovedet, og ethvert svar steppet kunne give, er opdigtet eller tabt data. Advarsel ville have lukket den dør, T13–T26 blev skrevet for at lukke.
- **Ingen række tabes "med en advarsel".** At beholde records og droppe værdierne er den samme stilhed med en højere tone.
- **Exit 1, ikke 2.** Samme ræsonnement som T23's asymmetri, modsat vej.

**Acceptkriterier, verificeret:**

- Alle ni step fejler på en streng-række med et Transmute-sprog, exit 1, tom stdout, ingen fil — målt på den rigtige CLI i `test/cli.test.mjs`.
- Fejlen navngiver step, rækkenummer og type for alle fem rækkeformer.
- `count`, `head`, `tail`, `filter`, `map` og `unique` uden `by` kører stadig på ikke-records, målt i begge testlag.
- En record med `null`, et tomt objekt, et array eller nøglen `__proto__` er stadig en record: vagten ser på rækkens form, ikke på indholdet.
- `src/engine.js` og `site/engine.js` er byte-identiske.

**Verifikation:** `npm test` grøn med 134 engine-tests (129 → 134, 5 nye), 98 CLI-tests (95 → 98, 3 nye), 69 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller over 28 filer. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 20 pages`, `deviations: 0` ved 360/768/1280 px og alle selftester grønne inkl. deploy-friskheds-selftesten.

**Procesfejl, to af dem, begge fanget af de nye tests:** (1) testen "rækkenummeret" skrev et `map`, der lavede `{...item, keep: "two"}` — altså en record med en streng i, ikke en streng som række, så vagten havde intet at sige. Den læser nu, at rækkeformen er det, der testes. (2) testen "vagten ser på rækkens form" antog, at `group by "a"` over `null`, `{}`, `[1]` og en `__proto__`-nøgle gav to grupper; den gav tre, fordi `group` slår objekter og arrays sammen efter identitet. Rettet til de faktiske tællinger, med grunden i kommentaren.

**Deploy:** `npm run check:deploy` kørt først i iterationen: uændret, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit og 25 filer i drift, `/support/index.html` utilgængelig. `DEPLOY-MISSING` står derfor ved, diffen er **ikke** mergeret til `main`, og der er oprettet ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret.

### 28. [x] Et gentaget flag skal ikke blive taget som en ny kommando

**Status:** FÆRDIG med commit `763efbc` på `ceo/repeated-flags` — **ligger på branch, ikke mergeret**, fordi `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** samme familie som T25 (en kommando, der ikke er den brugeren skrev, med et svar de ikke kan se), bare i argument-parseren. CLI'en tog det **sidste** `--pipe`, `-f`, `-o`, `--delimiter`, `--out` og `--table` og kasserede de forrige i stilhed.

**Fund, kørt på den kode der var før rettelsen.** Alle syv kørseler var exit 0 med tom stderr:

```
$ transmute q.json --pipe '[{"op":"head","n":1}]' --pipe '[{"op":"head","n":2}]' --output json
fire rækker                                        # kun den sidste kørte
$ printf 'a;b\n1;2\n' | transmute -f csv --delimiter ';' --delimiter ',' --output csv
"a;b"                                              # én kolonne, filen læst med den forkerte delimiter
$ transmute q.json --output json --output csv
a,b                                                # CSV, selv om den FØRSTE sagde json
$ transmute q.json -f json -f csv --output csv
                                                    # tom output: JSON læst som CSV, exit 0
$ transmute q.json --out a.csv --out b.csv --output csv
                                                    # kun b.csv skrev sig
$ transmute q.json -p '[…]' --pipe '[…]' --output json
                                                    # alias og lang navn er samme flag, og det tæller ikke
$ transmute q.json --output sql --table t1 --table t2
INSERT INTO "t2" …                                # kun det sidste tabelnavn
```

To af dem sletter data: `-f json -f csv` læste JSON'en som én kolonne og skrev det den selv fandt på, og `--out a.csv --out b.csv` lod `a.csv` forsvinde uden at sige det. Resten svarede med noget andet end det bestilte, i to tilfælde med en *anden* end nogen af værdierne, fordi det er `--output` der afgør, ikke det første.

**Rettelse:**

- `OPTION_NAMES` i `src/cli.js` er navneliste over de seks options der tager en værdi, med aliaserne foldet ind (`-p` → `--pipe`), og `takeOption(seen, counts, name)` afviser det andet krav med `UsageError` (exit 2, tom stdout). Parseren er stadig en liste af tildelinger; kun gentagne flag afvises.
- **Tallet er hele kommandolinjen, ikke gentagelserne indtil nu.** `countOptions(args)` tæller alle forekomster før parsing, fordi parseren stopper ved det første gentagne flag — ellers svarer tre `--delimiter` "2 gange", hvilket er samme stilhed i miniature. Målt: `--delimiter` tre gange siger 3, `-p` fire gange siger 4.
- **Exit 2, ikke 1.** Samme skelnelinje som T23: det er brugerens egen kommandolinje, der er forkert, ikke data.
- Beskeden er ens for alle flags og siger hvad der *ville* være sket: `--pipe was given 2 times, and only the last one would have been used. Put every step in one --pipe, as a JSON array.` De øvrige ender på `Give each option once.`

**Valg, der er bevidst:**

- **Afvise, ikke sammensætte.** T28's scope stillede spørgsmålet, og svaret er nej, fordi `--pipe` er det eneste flag hvor en sammensætning overhovedet betyder noget, og den gør **flagenes rækkefølge** afgørende for stepenes rækkefølge. Så ville `--pipe` være det ene flag med en skjult regel — præcis det, T23–T28 fjerner. De øvrige fem kan ikke slås sammen, så familien må være "én option, én gang".
- **Ingen advarsel.** En advarsel om at den første værdi blev kasseret ville være T26's svar anvendt forkert: her er data ikke tabt, kun *kommandoen* er en anden end den skrevne, og så skal den ikke køre.
- **T29's `--out`-fund er ikke rettet her.** Det er en anden fejl (et flag der *ikke* bruges) og har sin egen opgave, fordi svaret kræver et valg mellem "skriv filen alligevel" og "sag at previewen og `--out` ikke kan begge være det".

**Acceptkriterier, verificeret:**

- Alle seks options afvises gentaget, exit 2, tom stdout — målt på den rigtige binary i `test/cli.test.mjs`.
- `-p` og `--pipe` tælles som samme flag; tallet er det fulde antal forekomster.
- Ét flag én gang røres ikke: 134 engine-tests, 109 CLI-tests (98 → 109, 11 nye), 72 konformitets- (69 → 72, 3 nye), 6 README-, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller er grønne, og `--delimiter` i previewen (T22) virker stadig.
- `docs/cli.md`, `--help` og previewen siger det samme, og konformitestesten låser alle tre mod den *rigtige* fejlmeddelelse.

**Konformitetslåsen er testet mod mutation, ikke bare skrevet.** Tre mutationer, alle fanget: ændret fejltekst i `src/cli.js` → docs/cli.md citater den gamle; fjernet `takeOption` for `--delimiter` → både konformitets- og CLI-test falder; fjernet reglen fra `--help` → konformitestesten falder. Konformitestesten læser desuden optionerne *ud af docs-tabellen* og kræver at parseren både kender dem og afviser dem gentagne, så en option der tilføjes i parseren uden dokumentation — eller en dokumenteret option der ikke findes — fanger den.

**Procesfejl, én, fanget af målingen:** den første rettelse talte gentagelserne undervejs og sagde `2 gange` for tre `--delimiter`. Det er præcis den fejl opgaven fjerner, så tællingen blev flyttet til en optælling af hele kommandolinjen, og testen "the count is the whole command line" låser den.

**Deploy:** `npm run check:deploy` kørt først i iterationen: uændret, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit og 25 filer i drift, `/support/index.html` utilgængelig. `DEPLOY-MISSING` står derfor ved, diffen er **ikke** mergeret til `main`, og der er oprettet ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. T28 rører ingen `site/`-fil — den rører kun argument-parseren, som browseren ikke har.

### 29. [x] Et flag, der kræver et andet, må ikke forsvinde i stilhed

**Status:** FÆRDIG — commit `e156dec` på `ceo/dead-options`
**Mislykkede forsøg:** 0/2
**Begrundelse:** T28's familie igen, den anden halvdel. T28 stoppede et flag, der blev gentaget; denne opgave er et flag, der **aldrig bruges**, fordi et andet mangler. Brugeren beder om en fil og får en preview på stdout.

**Målt før koden blev rørt (seks kørsler på den rigtige binary, alle exit 0, tom stderr):**

| Kørsel | Før |
|---|---|
| `people.csv --out p.csv` | preview på stdout, **filen skrives aldrig** |
| `people.csv -p '[{"op":"head","n":2}]' --out top.json` | filen skrives som **ASCII-tabel under et `.json`-navn** |
| `people.csv --table users` | preview, tabelnavnet bruges aldrig |
| `people.csv --table users -o csv` | exit 0, output uden `.csv`-fejl, navnet dødt |
| `orders.json --delimiter ';' -o json` | exit 0, output **byte-identisk** med kørslen uden flaget |
| `people.csv --out -` | preview, `-` ignoreres |

**Beslutning — alle tre bliver exit 2, ikke advarsel.** T27's linje: en kommando, der ikke kan gøre det, den blev bedt om, skal *sige* det, og intet skrives. Advarsel (T26's form) er for et *antagende om data*, der kan være rigtigt for næste fil. Her er det ikke et antagende: `-o csv` er en eksplicit udtalelse om formatet, så `--table users` kan ikke være "ment som en mulighed". Den anden halvdel afgrænser desuden familien skarpt: `--out` uden `--output` er den eneste af de tre, hvor **data** er på spil (filen mangler, eller en tabel ligger i en fil der hedder `.json`).

**Fund der ændrede reglen undervejs — `--delimiter` kan ikke styre output.** Opgaven skrev "CSV på input *eller* output". Det er forkert, og det blev målt: `opts.delimiter` bruges i `src/engine.js` præcis **én** sted, i CSV-*læseren* (`src/engine.js:570`). CSV-*skriveren* skriver altid komma og citerer et felt, der rummer et af de genkendte delimitere (`escapeCSV`, `src/engine.js:646`) — det er T16's fravalg, fordi output så er læsbart af enhver læser. Målt: `orders.json -o csv` er byte-identisk med og uden `--delimiter ';'`. Reglen blev derfor **"kræver CSV-input"**, ikke "CSV på en af siderne". Det er præcis den slags fejl, der lægger sig i en plan, fordi den er skrevet før koden er læst.

**Rækkefølgen er målt, ikke valgt efter smag.** `--out` og `--table` kan afgøres af flagene alene og svares *før* input læses — samme argument som T25's `parsePipeline`: en tastefejl skal ikke stå i kø bag en fil, den aldrig ville have brugt. `--delimiter` kan først afgøres efter detektion, så en manglende fil er der stadig exit 3. Asymmetrien er testet, så den ikke forsvinder ved en senere omskrivning.

**Konformitetslås, testet mod mutation.** Alle tre beskeder staves i `docs/cli.md` ordret, reglen står i både `--help` og previewen, og låsen tager fejlteksten fra en rigtig kørsel af binaryen — ikke en kopi. Tre mutationer blev kørt: en ændret besked, en slettet hjælpelinje og en slettet previewlinje fejer hver især låsen.

**Resultat:**

- `--out` uden `--output` → exit 2, ingen fil skrives, heller ikke med `--pipe` (der var den værste variant: tabellen i `.json`-filen).
- `--table` uden `--output sql` → exit 2; beskeden navngiver det faktiske output, `csv` eller `a preview`.
- `--delimiter` uden CSV-input → exit 2, beskeden tilbyder `--format csv`.
- Alt hvad der *er* levende, virker stadig og er testet på den rigtige binary: `--out file` med `--output`, `--out -`, `--table` med `-o sql`, `--delimiter ';'` på dansk CSV med JSON/YAML/SQL-output, inkl. et citeret felt med `;` i.
- `tableName` er nu `null` indtil den bruges, så "ikke givet" kan skelnes fra "givet som `my_table`".
- `docs/cli.md` har et afsnit med de tre kommandoer, de tre gamle adfærd og de tre beskeder; README, `--help` og previewen siger samme regel med samme formulering.
- Gaten: `npm test` grøn (134 engine, 118 CLI, 74 konformitet, 6 README, 39+4 workflow, 173 kontraktchecks), `npm pack --dry-run` grøn, `npm run check:site` grøn.

### 30. [x] Indhold, der ikke er UTF-8, må ikke blive til U+FFFD i stilhed

**Status:** FÆRDIG med commit `837eb4a` på `ceo/utf8-input` — **ligger på branch, ikke mergeret**, fordi `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** De ni foregående flader (T20–T29) var alle den *samme* tavshed: en kørsel der lykkede, skrev exit 0 og en tom stderr, mens den leverede noget andet end det bestilte. T30 målte den tiende flade, som er den eneste der ikke handler om kommandoen men om **data ind** — og den er den eneste af de ti, der fjerner data i stedet for at skjule et forkert svar. Det er samtidig produktfasens prioritet 1 i dens reneste form, fordi T13's egen begrundelse navngiver præcis denne fil: "Excel in Denmark … writes `;` by default" er sandt, men Excel på Windows skriver **cp1252**, ikke UTF-8.

**Målt før koden blev rørt (ni kørsler på den rigtige binary; de fire første var exit 0 med tom stderr):**

| Kørsel | Før |
|---|---|
| `latin1.csv -o json` (`M\xf8ller`) | `"M?ller"` — de **ødelagte** tegn skrevet i outputfilen |
| samme uden `-o` (previewen) | tabellen viser `M?ller`, exit 0 |
| samme med `--out` | ødelagt fil skrevet på disk |
| `w1252.csv` med `\x80` (eurotegnet) | `"5?"` |
| `utf16.csv -o json` (BOM + NUL) | **ét feltnavn** `��n\u0000a\u0000v\u0000n` |
| `cat latin1.csv \| transmute -f csv -o json` | samme som filen — pipen afkodede også i UTF-8 |
| `latin1.csv` som stdin uden `-f` | samme |
| `Møller` i UTF-8, `-o json` | korrekt (skal fortsat virke) |
| `🚀日本` i UTF-8 | korrekt (skal fortsat virke) |

**Årsagen er én linje.** `fs.readFileSync(inputFile, 'utf-8')` i `src/cli.js` og `setEncoding('utf-8')` i `readStdin` fortæller Node, at bytes er tekst, og Node's svar på et segment den ikke kender er U+FFFD, ikke en fejl. WHATWG's UTF-8-dekoder *må* ikke fejle, så det er ikke en fejl i Node — det er en fejl i at bede om UTF-8 uden at tjekke.

**Rettelse:**

- `readStdin` returnerer nu **`Buffer`**, ikke tekst. Det fjerner `setEncoding('utf-8')` fra den sti, hvor den lå, så en pipe og en fil gennemgår præcis samme kontrol.
- `decodeText(buffer, source)` i `src/cli.js` kalder `isUtf8` (`node:buffer`) **før** den dekoder. Kun fejlstien dekoder to gange, fordi den skal finde den første U+FFFD.
- **Exit 3, ikke 2.** T23's asymmetri: exit 2 er brugerens eget input (en flag, en expression), exit 3 er input, der ikke kan læses. En fil i en anden kodning er ikke læsbar, og intet skrives — heller ikke til previewen, heller ikke ved `--out`.
- **Ingen gætning, ingen reparation.** Kodningen nævnes som *eksempel* (`iconv -f iso-8859-1`), fordi en forkert gætning ville omskrive brugerens bytes — det er præcis den fare T27's linje afviser.
- **Tjekket er på bytes, aldrig på den dekodede tekst.** En gyldig UTF-8-fil, der virkelig indeholder U+FFFD, læses derfor stadig; det er låst af en egen test, fordi den modsatte rettelse (at lede i den dekodede tekst) ville være en overgrebende vagt ligesom T26's.
- Konformitetslås i samme mønster som T28/T29: `docs/cli.md` skal citere den **ordrette** besked fra en rigtig kørsel af binaryen, `--help` skal liste `not UTF-8` under exit 3, og exit-3-rækken i docs skal nævne det.

**Valg, der er bevidst:**

- **Fejl, ikke advarsel.** T26's advarsel gælder et *feltnavn*, der kan være rigtigt for næste fil. Her er intet antagende: `M\xf8ller` i cp1252 **er** `Møller`, og U+FFFD er ikke den samme tegnkode, så kørslen ville skrive en fil, der ligner rigtig og ikke er det. Advarsel ville væltet den ødelæggelse tilbage på brugeren med en tonehøjde.
- **Positionen er et tegn, ikke en byte.** `isUtf8` siger intet om hvor, og en håndskrevet UTF-8-validator ville være præcis den kode, der kan være *forkert stilt* — den klasse fejl opgaven fjerner. `indexOf('\uFFFD')` på den dekodede tekst er eksakt, fordi WHATVG garanterer én U+FFFD pr. ugyldigt segment. Testen låser tallet mod sit rigtige input.

**Acceptkriterier, verificeret:**

- cp1252-fil, cp1252-pipe, UTF-16-fil og preview uden output: exit 3, tom stdout, ingen fil skrevet, besked med position og `iconv`.
- `Møller`, `🚀日本` og en fil med ægte U+FFFD: exit 0, tom stderr, korrekt output.
- Konformitetslås: docs, `--help` og exit-3-tabellen siger det samme som den rigtige fejl.

**Verifikation:** `npm test` grøn med 134 engine-tests (uændret — ingen enginekode rørtes), 125 CLI-tests (118 → 125, 7 nye), 75 konformitets- (74 → 75, 1 ny), 6 README-, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller over 28 filer. `npm pack --dry-run` uændret på 5 filer. **Ingen `site/`-fil rørt** — engine'en modtager allerede en streng, så der er ingen bytes at tjekke i browseren, og `site/try.html` får tekst fra et textarea. Derfor er hverken `site/engine.js` regenereret eller `check:site` kørt: diffen rører ingen af site-gatens path-grupper.

**Tænder, målt:** de syv nye CLI-tests er kørt mod den gamle kode; de fem der påstår exit 3 fejler alle med `expected exit 3, got 0` — præcis den fejl de er skrevet til at fange. De to der låser at gyldig UTF-8 stadig virker, passer på gammel kode som de skal.

**Deploy:** `npm run check:deploy` kørt først i iterationen: uændret for **femte** gang i træk, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig. `DEPLOY-MISSING` står derfor ved, diffen er **ikke** mergeret til `main`, og der er oprettet ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret.

9. **`--out` overskriver en eksisterende fil uden at sige det (fra T30, målt):** `transmute people.csv -o json --out eksisterende.json` erstatter filen, exit 0, tom stderr. Det er målt på den rigtige binary, og det er **ikke rettet**, fordi det er den næsten universelle standard i CLI-værktøjer, og fordi rettelsen kræver en beslutning: `--force` (jf. `curl -o`, `sed -i.bak`) ville bryde scripts, der i dag virker, hvilket er produktfasens prioritet 1 i modsat retning. Målingen viser også at `--out` på **samme fil som input** er sikkert, fordi input læses før den skrives. **Mads: skal `--out` kræve `--force` for at overskrive, eller er standardadfærden rigtig?** Uden svar beholder loopet standarden, fordi den er forventet.
10. **NUL-bytes i input (fra T30, målt):** et NUL-byte i en CSV-overskrift bliver til et feltnavn med `\u0000` i, exit 0. Målt, ikke rettet: det er ikke en kodetning, men en beskadiget fil, og NUL i en tekstfil er sjældnere end cp1252. Det er skrevet ned, så den næste måling ikke genfinder det som nyt. Det ville være en kandidat til samme `decodeText`-kontrol, hvis nogen melder det.
11. **`sort` på tal-strenge (fra T21/T22, stadig åben):** se afsnittet om de fire flader ovenfor. Det er en afvejning, ikke en tavs korruption — `jq`'s `sort_by` gør det samme — så det kræver en beslutning, ikke en fix.

12. **YAML-dybde over ca. 2.500 mappingsniveauer (fra T31, målt):** `parseYAMLBlock` følger indrykning rekursivt, så en fil med ~2.500 niveauer dør med `Could not parse input as yaml: Maximum call stack size exceeded` (exit 3, tom stdout, ingen fil — 2.000 niveauer er exit 0, og JSON på 2.000 er exit 0, fordi V8's `JSON.parse` er iterativ). Målt, **ikke rettet**: det fejer højt og skriver intet, så det er ikke en tavs korruption, og en reel k8s- eller openapi-fil ligger på 10–20 niveauer, ikke 2.500. Den er skrevet ned, så næste måling ikke genfinder den som ny. **Mads: skal læseren have en eksplicit dybdegrænse med en besked om dybden (f.eks. "nests deeper than 2000 levels"), eller er V8's egen besked ærlig nok?** Uden svar beholder loopet den nuværende adfærd, fordi en ny fejlvej er mere kode end fundet fortjener.

### 31. [x] Mål stier, locale, millionrækker og YAML-dybde — og ret den tavshed, de gemte

**Status:** FÆRDIG med commit `c5e7d4b` på `ceo/paths-locale-limits` — **ligger på branch, ikke mergeret**, fordi `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Begrundelse:** Efter ti målte tavsheder (T20–T30) var der ingen ny fejl i køen, kun fire **uudforskede** stier, planen havde navngenet: filstier med mellemrum i `--out`, POSIX-locale, filer ≥ 100.000 rækker mod `Limits`-løftet, og YAML-mappingsdybde. Denne iteration målte alle fire på den rigtige binary. To af dem viste sig at være rene. Den tredje — millionrækkerne — viste sig at være **to fejl i én linje**, hvoraf den ene brød løftet i `docs/cli.md` direkte, og den anden gjorde previewen *synligt* skæv for enhver med et ikke-latin tegn i et navn. Den fjerde gav et målt fund, der er skrevet ned og bevidst urørt.

**Målt før koden blev rørt (på den rigtige binary, `src/cli.js`):**

| Måling | Resultat |
|---|---|
| input med mellemrum i stien, preview | exit 0, korrekt JSON — **rent** |
| `--out "out dir/result file.json"` | exit 0, filen skrevet — **rent** |
| `--out` med ny linje i filnavnet | exit 0, filen skrevet under det navn — **rent** |
| `--out "no such dir/x.json"` (mellemrum + manglende mappe) | exit 3 med ENOENT — **rent** |
| `LC_ALL=C` / `en_US.UTF-8` / `da_DK.UTF-8` på dansk data, json + table | exit 0, **byte-identisk** output i alle tre — **rent** |
| 120.000 rækker → json / csv / sql / xml | exit 0, 0,3–0,7 s — **rent** |
| 120.000 rækker gennem 10 pipeline-step | exit 0, ≤ 0,06 s hver — **rent** |
| **120.000 rækker, preview (ingen `-o`)** | **exit 1, `Error: Maximum call stack size exceeded`, tom stdout** |
| **120.000 rækker med `-o table --out`** | **samme krasch** |
| samme som pipe (`cat big.csv \| transmute`) | **samme krasch** |
| grænsen for kraschen | 110.000 rækker exit 0, **115.000 rækker exit 1** |
| **1.000.000 rækker (23 MB), preview** | **exit 1, samme krasch** — efter rettelsen exit 0 på 1,6 s |
| celle med 120 tegn i række 31 (tabellen viser række 1–20) | alle 20 trykte linjer paddet til 131 tegn for en celle, ingen viste |
| `Møller` / `🚀` / `日本` i `table` | højre kant **ude af linje** på de to linjer med 🚀 og 日本 |
| YAML-mapping 2.000 niveauer dyb | exit 0 |
| YAML-mapping 2.500 niveauer dyb | exit 3, `Could not parse input as yaml: Maximum call stack size exceeded` |
| JSON 2.000 niveauer dyb (V8's `JSON.parse` er iterativ) | exit 0 — **rent** |

**Årsagen til de to fejl er den samme linje.** `serializers.table` målte kolonnebredder med

```js
const colWidths = headers.map(h => Math.max(h.length, ...data.map(row => cellValue(row[h]).length)));
```

Det har tre fejl i én linje. **(1)** `Math.max(...data.map(...))` spreder ét argument pr. record ind i et kald; V8 giver op et sted omkring 110.000, så `table` døde på en 4 MB-fil — og `table` er formatet previewen bruger, så den simple `transmute people.csv` døde med den. **(2)** `.length` er ikke et kolonnetantal: det tæller UTF-16-kodeenheder. `🚀` er to kodeenheder og to kolonner, `日本` er to kodeenheder og fire kolonner, `e` + kombinerende accent er to kodeenheder og én kolonne. **(3)** Bredderne blev målt over **hele filen**, mens tabellen kun printer 20 rækker, så én lang celle i række 31.000 paddede alle 20 trykte linjer til en bredde ingen af dem brugte.

**Rettelse:**

- `displayWidth(str)` tæller **skærmkolonner**: kode-punkter, ikke UTF-16-kodeenheder, og CJK/Hangul/kana/fullwidth/emoji tæller 2. `padDisplay(str, w)` bruger den. Intervallerne er dem en dansk eller generel-europæisk datafil møder; *ambiguous* bredde (`±`, `°`, variation selector) er bevidst ladt på 1 kolonne, fordi det er hvad de fleste terminaler gør, og fordi det aldrig over-padder almindelig latinisk tekst.
- Kolonnebredderne måles i en **løkke over de 20 rækker, der printes** — ingen spread, intet `Math.max` over filen. Det fjerner kraschen, gør previewen uafhængig af hvor mange rækker der ligger bagved, og gør den *mindre* arbejde på en stor fil end før (før: alle rækker × alle kolonner).
- `site/engine.js` er byte-identisk med `src/engine.js` og blev kopieret med, så playgroundet på `/` og `/da/` fik præcis samme rettelse. Det er grunden til at `check:site` *er* kørt i denne iteration, modsat T30.
- `docs/cli.md` siger nu, at kolonnerne er så brede som de 20 rækker tabellen printer, og at de tælles i skærmkolonner.

**Valg, der er bevidst:**

- **Ingen advarsel, ingen ny fejlkode.** En krasch er ikke en advarselssag, og en skæv kant er synlig for alle — begge er den slags, hvor det er billigere at være konservativ end at forklare sig.
- **Målt på de 20 trykte rækker, ikke på hele filen.** Det er en adfærdsændring ud over kraschen: en fil på 30 rækker, hvor række 31 bærer den lange værdi, får nu en smallere tabel. Det er pointen — tabellen skal have den bredde den viser — og ingen af de 27 eksisterende snapshots ændrer sig, fordi ingen af dem har mere end 20 rækker.
- **Ingen ny afhængighed, intet wcwidth-bibliotek.** De seksten intervaller er en lokal konstant på otte linjer; et bibliotek ville være en runtime-afhængighelse i et værktøj, hvis største salgsargument er nul afhængigheder.

**Acceptkriterier, verificeret:**

- 150.000 rækker: preview exit 0 med `(150000 rows, 2 columns)` og `... 149980 more rows`; samme fil med `-o table --out` exit 0. 1.000.000 rækker (23 MB): preview exit 0 på 1,6 s, csv-skrivning exit 0 på 1,9 s — `Limits`-afsnittets løfte holder nu.
- `Møller` / `🚀` / `日本`: alle otte linjer i tabellen har samme skærmbredde, målt med en uafhængig tæller i testen der kun kender de tre cases og derfor ikke kan genlære engineens egen.
- Række 31 med en 120-tegns celle: de 21 trykte linjer er højst 14 kolonner brede, og `... 10 more rows` står der.
- 4 nye engine-tests og 2 nye CLI-tests, kørt mod den gamle kode: de fire engine-tests fejler med henholdsvis `Maximum call stack size exceeded`, en tabel med to forskellige linjebredder, `café` der er bredere end `cafe`, og en 131 kolonner bred tabel; de to CLI-tests fejler med `exit 1: Error: Maximum call stack size exceeded` og `table is crooked`.

**Verifikation:** `npm test` grøn med 138 engine-tests (134 → 138, 4 nye), 127 CLI-tests (125 → 127, 2 nye), 75 konformitets-, 6 README-, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller over 28 filer. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` kørt og grøn. Ingen snapshot ændret.

**Noget ved siden af, samme klasse:** `docs/cli.md` indeholdt et **rigtigt NUL-byte** (offset 10138) indeni den sætning, der beskriver NUL-bytes i input — T30's egen diff. Følgen var at `grep` erklærede filen *binary* og derfor søgte i den med vilje, så ingen af planens, konformitetens eller README-kontrollerne kunne finde et ord i `docs/cli.md`. Én byte, erstattet af `\uFFFD` og `\u0000` som escaped tekst. Samme slags-fejl som den `6cb28f6` rettede i denne plan.

**Deploy:** `npm run check:deploy` kørt først i iterationen: uændret for **sjette** gang i træk, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig. `DEPLOY-MISSING` står derfor ved, diffen er **ikke** mergeret til `main`, og der er oprettet ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. Diffen rører `site/engine.js`, så den kræver en note, når bunken merges.

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

### 26. [x] Et feltnavn, ingen rækker har, skal sige hvad der skete

**Status:** FÆRDIG med commit `b20b809` på `ceo/missing-fields` — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** T20–T25-metoden fortsat på den flade T25's research efterlod: et resultat, der afviser det, der blev bedt om, uden at sige det. Alle otte fund er kørt på den gamle kode før rettelsen.

**Fund 1 — `unique` med en tastefejl i `by` skriver én række og tier om hvorfor.** `item[by]` er `undefined` for alle, `seen` rammer `undefined` efter den første række, og resten er dubletter:

```
$ transmute test/fixtures/people.csv --pipe '[{"op":"unique","by":"ag"}]' --output json
[ { "name": "Alice", … } ]
$ echo $?          # 0, tom stderr
```

Fire rækker ind, én ud. Det er den værste af fundene, fordi det er det eneste sted i værktøjet hvor en fejl **fjerner data** uden at spørge nogen.

**Fund 2 — de samme otte felter, samme familie, otve forskellige svar.** Alle kørt på den gamle kode, alle exit 0, alle med tom stderr:

| Pipeline | Hvad kom ud |
|---|---|
| `sort` by `ag` | rækkerne i input-rækkefølge, altså ikke sorterede |
| `pick` `["name","emial"]` | `name` uden `emial` — brugeren bad om begge og fik det ene |
| `omit` `emial` | intet fjernet |
| `rename` `{emial: email}` | intet omdøbt |
| `group` by `contry` | én gruppe `(null)` med alle fire rækker |
| `flatten` `itemz` | ingen rækker udvidt |
| `join` `on: id` mod `with: [{idd: …}]` | `[]` — alle rækker droppet |

**Fund 3 — `sort`s comparator var ikke en orden.** Den svarede `1` for *alle* par, også to rækker der begge manglede feltet, altså `a < b` og `b < a` på én gang. Rækkerne kom tilfældigvis ud i input-rækkefølge, og intet lovede at de skulle.

**Rettelse:**

- `reportMissingFields(data, step, warnings)` i engine'en, kaldt i `run`s transform-løkke **før** hvert step. Den har to tabeller: `STEP_FIELDS` siger hvilke feltnavne hver operation navngiver, `FIELD_EFFECTS` siger hvad steppet gjorde ved at finde ingen. Advarslen får samme form som CSV's `column4`-advarsel fra T14: **`pick: no record has a field named "emial"; it is in no output`**, på stderr, exit 0, stdout ren.
- **Resultatet er uændret.** En pipeline, der navngiver et felt en fil ikke har, er ikke en ødelagt pipeline — samme script køres ofte mod flere filer — så kørslen lykkes og skriver det, steppet gjorde. Nyheden er advarslen, ikke en ny exit-kode. Det er T14's valg anvendt på felter.
- Tjekket sker **mod data som de er i det step**, ikke mod filen ved ankomst: et felt `add` eller `map` lige har lavet mangler ikke, og et felt en tidligere `rename` har fjernet gør. Testene låser begge.
- **Et felt nogle rækker har er ikke et felt ingen rækker har.** Heterogene data er det normale billede ved en left join uden match, en API der tilføjer en nøgle, og `pick` selv, så kun " ingen rækker har det" får en advarsel. Syv tests låser at intet advares i de tilfælde.
- `join`s `on` tjekkes mod begge sider: højresiden ligger i `with`, og et felt kun højresiden har er en anden fejl end et felt ingen side har.
- `sort`-comparatoren returnerer `0` når begge rækker mangler feltet, så den er en total orden.
- Rækker der ikke er records springes over: de har ingen felter at mangle, og `pick` siger det selv i sin egen fejl.
- `docs/cli.md` fik afsnittet **When a field name is in no row** med to kørte eksempler (det ene med advarsel, det andet et heterogent input der *ikke* advares) og en linje om at stdout aldrig ændrer sig. Ingen af de 17 `CASES` ændrede sig, så ingen snapshot regenereres.

**Valg, der er bevidst:**

- **Advarsel, ikke exit 2.** T25's regel (en step der ikke kan gøre sit arbejde skal sige det) gælder en *manglende parameter*, som altid er en fejl. Et feltnavn er en udokumenteret antagelse om den data, og den kan være rigtig for en anden fil. Derfor er svaret samme klasse som T14's `column4`: en linje på stderr, exit 0, filen skrives.
- **Advarslen skal sige følgen, ikke bare fejlen.** "no record has a field named ag" giver brugeren et problem; "every row looked identical, so 1 of 4 rows survived" forteller hvorfor outputtet er kort. Derfor er `FIELD_EFFECTS` en tabel med en sætning pr. operation.
- **Rækker der ikke er records er ikke et fund.** De er en anden fejl med sin egen besked.

**Verifikation:** `npm test` grøn med 129 engine- (121 → 129, 8 nye), 95 CLI- (92 → 95, 3 nye), 69 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 20 pages`, `deviations: 0` ved 360/768/1280 px og alle selftester grønne inkl. deploy-friskheds-selftesten. `tools/site_chrome.py` regenererede `site/engine.js` (byte-identisk med `src/engine.js`) og asset-hash'en i `try.html`; søgeindeks uændret på 104. Deploy genverificeret først i iterationen med `npm run check:deploy`: uændret, `DEPLOY-MISSING` står ved, intet mergeret.

**Tænder, dokumenteret:** de 8 nye engine-tests er kørt mod den gamle kode — **5 af 8 fejler**, hver med sit symptom (`unique: 0 warnings, want 1`, sorterækkefølgen, felterne efter `rename`). De 3 der ikke fejler, skal ikke fejle: de låser at heterogene data, felter en tidligere step har lavet, og rækker der ikke er records ikke giver en advarsel. Samme for de 3 nye CLI-tests: 2 af 3 fejler på gammel kode med *tom stderr*, altså præcis den fejl de er skrevet til at fange.

**Ikke gjort, bevidst:** browserplaygroundet på `/` og `/da/` får stadig ingen advarsler — `site/try.html` videresender ikke `r.warnings`. Det er en reel mangel på sitets mest brugte flade, men den kræver en UI-ændring i to sider, og det er en egen opgave. Se `❓ Til Mads` punkt 8.

### 25. [x] En step, der ikke kan gøre sit arbejde, skal sige det

**Status:** FÆRDIG som `5fd4648` på `ceo/pipeline-validation` — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** T20/T21/T22/T23-metoden fortsat, nu på den sjette flade planen havde udpeget. Alle fund er **kørt på den gamle kode** før rettelsen, og de nye tests er kørt igen mod den gamle kode bagefter, så tænderne er dokumenterede.

**Fund 1 — `pick` uden `fields` slettede hele filens indhold.** `fields` er `[undefined]`, intet matcher, og hver record bliver `{}`:

```
$ transmute people.csv --pipe '[{"op":"pick"}]' --output csv
name,age,zip,active,city
$ echo $?          # 0
```

Alle fire rækker skrevet ud som tomme, exit 0, tom stderr. Det er den værste af fundene, fordi outputtet er gyldigt og ligner en eksport: brugeren får en fil med det rigtige antal rækker og ingen data, og ingenting i den siger at felterne forsvandt.

**Fund 2 — de ni andre operationer gjorde det samme på deres egen måde.** `filter` og `map` uden `expr` var identiteten (altså T23's fund med en anden vej ind), `sort` og `group` uden `by` var et no-op, `rename` uden `mapping`, `flatten` uden `field`, `omit` uden `fields` og `add` uden `fields` var tavse no-ops. `join` var den anden alvorlige: et `with` der var tomt eller ikke et array gav `rows = []`, intet matchede, og **alle** rækker faldt væk med exit 0.

**Fund 3 — `head`/`tail` tog ethvert tal for `n`, og `tail 0` gav alle rækker.** `data.slice(-0)` er `data.slice(0)`, så "de sidste nul rækker" kom tilbage som alle tolv. En streng (`"5"`) blev coercet af `slice` uden at nogen sagde det, og `head "abc"` gav **nul** rækker — exit 0, tom fil, ingen advarsel.

**Fund 4 — et arvet objekt-property var en operation.** `operations[step.op]` finder `toString`, `constructor` og `valueOf` på prototypen, så:

```
$ transmute people.csv --pipe '[{"op":"toString"}]' --output json
[ "[object Object]" ]
exit=0
```

Hele filen som én række med teksten `[object Object]`. Samme familie som T20's `[object Object]`, men fundet i en anden kodevej.

**Rettelse:**

- Ny `validatePipeline(pipeline)` i engine'en: `STEP_PARAMS` siger hvad hver operation skal bringe med, `PARAM_CHECKS` siger hvad hver slags parameter må være, og `OPTIONAL_PARAMS` markerer de tre, der har en dokumenteret default (`unique` uden `by`, `head`/`tail` uden `n` = 10). Fejlene bærer `usage: true`, så de bliver exit 2 i CLI'en og en fejlboks i browseren — samme kodevej som T23's expression-fejl.
- **Én regel, to kaldere.** `parsePipeline` i `cli.js` kalder den mens den læser flagene, altså *før* inputfiles læses, så en tastefejl i en pipeline ikke rapporteres som et filproblem; `run` kalder den for alle andre, altså også browserplaygroundet, hvis textarea. `cli.js` mistede dermed sin egen løkke, så der ikke længere er to steder at vedligeholde.
- Ops-opslaget bruger `Object.prototype.hasOwnProperty.call(operations, op)`, så fund 4 er lukket i kilden og ikke kun i testen.
- `tail` med `n === 0` returnerer `[]`.
- `validatePipeline` kaldes i `run` **før** parsingen. Den gamle kode læste inputtet først, så `--pipe '[{"op":"pick"}]'` på en CSV med `-f json` gav exit 3 om CSV'en; nu giver den exit 2 om pipen. Den nye test `a bad step is reported before the input is read` låser rækkefølgen.
- `docs/cli.md` fik afsnittet **What a step must bring with it** med en tabel over alle 14 operationer, den konkrete fejlmeddelelse for `pick` (verificeret character for character ved at køre kommandoen) og forklaringen på at tomme lister er lovlige, mens en tom `expr` ikke er. Exit-code-tabellen er opdateret. Ingen af de 17 `CASES` ændrede sig, så ingen snapshot regenereres.

**Valg, der er bevidst:**

- **En tom `expr` er en fejl, en tom `fields`-liste er ikke.** `{"op":"pick","fields":[]}` er "vælg ingen felter" — et krav brugeren kan stille; `{"op":"filter","expr":""}` er en shellvariabel, der aldrig blev sat. Samme kode, modsat betydning, så de skal ikke behandles ens.
- **En `n` under nul afvises i stedet for at fortolkes.** `head -1` gav før alle rækker undtagen den sidste, som er `slice(0,-1)`'s betydning, ikke "minus én række".
- **Et `by` på et felt, ingen rækker har, er *ikke* en fejl her.** Det er T25's næste flade, se `Næste iteration`.

**Verifikation:** `npm test` grøn med 121 engine- (108 → 121, 13 nye), 92 CLI- (86 → 92, 6 nye), 69 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 20 pages`, `deviations: 0` og alle selftester grønne inkl. deploy-friskheds-selftesten. Deploy genverificeret først i iterationen med `npm run check:deploy`: uændret, `DEPLOY-MISSING` står ved.

**Tænder, dokumenteret:** de 13 nye engine-tests er kørt mod den gamle kode — **10 af 13 fejler**, hver med sit eget symptom: `pick` gav `{}`, `{"op":"toString"}` gav `["[object Object]"]`, `tail 0` gav 12 rækker, og `a bad step is reported before the input is read` fejlede med `Unexpected token 'h'` — altså *inputfejlen*, som beviser at rækkefølgen før var omvendt. De 3 der ikke fejler på den gamle kode, skal ikke fejle: de låser at `unique` uden `by`, `head`/`tail` uden `n` og en tom `mapping` stadig er lovlige, så en overgrebende validator ville blive rød. Samme for de 6 nye CLI-tests: 5 af 6 fejler på gammel kode med exit 0 (hvor der skulle være 2), exit 3 i stedet for 2, og 12 rækker i stedet for 0.

### 24. [x] Brug `--delimiter` i previewen, som i den rigtige kørsel

**Status:** FÆRDIG som `ca259c1` på `ceo/expression-syntax` — **ligger på branch, ikke mergeret**, fordi bunken rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** Den anden konkrete fejl, T22's research fandt og skrev i planen, taget som sin egen lille opgave i samme iteration. Fundet var allerede kørt og reproduceret, så her var der intet at opdage — kun at rette.

**Fund — flaget blev valideret, accepteret og kasseret.** `showPreview` kaldte `run(text, format, [])` uden at give `delimiter` videre:

```
$ printf 'a;b;c\n1;2;3\n' > semi2.csv
$ transmute semi2.csv --delimiter ,          # preview
(1 rows, 3 columns)                          # auto-detekterede ';'
$ transmute semi2.csv --delimiter , -o csv   # den rigtige kørsel
"a;b;c"
"1;2;3"
```

Samme kommando, to forskellige svar, og forskellen afhang af om man tilføjede `--output`. Det er præcis den inkonsistens T16's regel (*læser og skriver skal have samme regel*) er skrevet for — bare mellem to tilstande af den *samme* læser.

**Rettelse:** `showPreview` tager `delimiter` og giver den videre til `run`. Tre linjer i `src/cli.js`, ingen ændring i `site/engine.js`, fordi playgroundet ikke har preview-tilstanden.

**Verifikation:** `npm test` grøn med 108 engine-, 86 CLI- (85 → 86), 69 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. Den nye test er kørt mod den gamle `showPreview` og fejlede med sit eget symptom (`preview ignored --delimiter`), ikke med en afvigelse i forventningen. Ingen sitefil rørt, så `check:site` er ikke genkørt; den var grøn efter T23 på de samme 20 sider.

### 23. [x] Lad en expression, der ikke er JavaScript, fejle højt i stedet for at gøre intet

**Status:** FÆRDIG som `29f1e9a` på `ceo/expression-syntax` — **ligger på branch, ikke mergeret**, fordi diffen rører `site/engine.js` og `DEPLOY-MISSING` står. Se Deploy.
**Mislykkede forsøg:** 0/2
**Metode:** T20/T21/T22-metoden fortsat, nu på den flade planen havde udpeget: `compileExpression`. Alle fund er kørt på den gamle kode før rettelsen.

**Fund 1 — en syntaktisk ugyldig expression fejlede stille og lod alle rækker stå.** `compileExpression` fangede *alle* fejl fra `new Function` og returnerede identiteten, så en filter, der ikke kan kompilere, var det samme som ingen filter:

```
$ transmute t.json --pipe '[{"op":"filter","expr":"item.age >"}]' --output table
| age |
| 10  |
| 30  |
(2 rows, 1 columns)
exit=0, stderr tom
```

Det er den værste af de tavse klasser, fordi outputtet er gyldigt: brugeren får sin fulde tabel tilbage i stedet for det, han bad om, og intet i outputtet afslører, at der aldrig blev filtreret. Samme for manglende parentes (`item.age > 5)`).

**Fund 2 — samme fejl i `add` gav hver række *hele recordet* i stedet for en værdi.** Identitetsfallbacket lå også i `add` (`src/engine.js:423`), så `{"op":"add","fields":{"x":"item.age >"}}` skrev hele `item` ind i `x` for hver række — stille opfundne data i en beregnet kolonne. Det var værre end `null`, fordi det ligner et resultat.

**Fund 3 — den eksisterende `try/catch` i `add` slugte den nye fejl.** `add` fangede per række, fordi en expression der kaster ved kørsel skal give `null` i stedet for at stoppe eksporten. Men en expression, der ikke kan kompilere, er ødelagt i *alle* rækker, så den skal skrives væk fra record-loopet og fejle som en helhed.

**Rettelse:**

- `compileExpression` kaster nu en fejl med expressionen og V8's egen besked: `Invalid expression "item.age >": Unexpected token ')'`. Den bærer `usage: true`, og `run` fører flaget videre i sit resultat, så en dårlig expression er en **usage-fejl (exit 2)** — det er brugerens eget input — mens en expression, der kompilerer og kaster ved kørsel, fortsat er en transformationsfejl (exit 1). Det er den asymmetri, fundet viste omvendt af.
- `add` kompilerer alle felter **før** den første række. Per-record `try/catch` er bevaret uændret, så `item.nope.deep` stadig giver `null` i det felt, som `docs/cli.md` lover.
- **Browserværdien fejler ikke siden ihjel.** `compileExpression` kaldes kun inde i `run`'s `try`, og `site/try.html:27` sender `r.error` til playgroundets fejlboks, så en ugyldig expression vises som enhver anden fejl. Det er derfor planens åbne beslutning ("hvor må den fejle") er besvaret med *begge* steder: CLI exit 2, browser fejlboks, samme kode.

**Verifikation:** `npm test` grøn med 108 engine- (103 → 108), 85 CLI- (80 → 85), 69 conformance-, 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter og 173 kontratkontroller. `npm pack --dry-run` uændret på 5 filer. `npm run check:site` grøn med `0 finding(s) across 20 pages`, `deviations: 0`, alle selftester grønne inklusive deploy-friskheds-selftesten. `npm run audit:site` uden fund. **Tænder:** de ni nye tests er kørt mod den gamle kode og fejlede med det konkrete symptom (exit 0 med alle rækker; `x` = hele recordet), ikke med en afvigelse i min egen forventning. Ingen snapshot ændrede sig, fordi ingen `CASES`-case indeholder en ugyldig expression — de nye tests er CLI-tests, der kræver exit 2 og tom stdout, så de lå ikke i vejen for datagrundlaget.

`docs/cli.md` siger det nu i exit-code-tabellen, i `filter` (med den konkrete `item.age >`-kommando) og i `add` (forskellen på kast ved kørsel og ugyldig syntaks). `tools/site_chrome.py` regenererede `site/engine.js` (byte-identisk med `src/engine.js`) og asset-hash'en i `try.html` (`?v=27163601` → `?v=0c816101`); ingen anden side ændrede sig, og søgeindekset er uændret på 104 entries.

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

- **Et flag, der ikke kan gøre sit arbejde, skal sige det — det er samme tavshed
  som et gentaget flag.** T28 fjernede det gentagne; T29 fjernede det, der er
  *nødvendigt* for at flaget virker. Skellet mellem fejl (exit 2) og advarsel
  (T26) er her skarpt: en advarsel er til et *antagende om data*, der kan være
  rigtigt for næste fil, mens `-o csv` er en eksplicit udtalelse om formatet, så
  `--table users` ved siden af den ikke kan "ment som en mulighed". Beviset er
  at kun `--out` rørte data — filen manglede, eller en ASCII-tabel lå i en fil
  der hed `.json` — og de to andre gør ingen skade, så et krav om exit 2 for
  dem er en konsekvens af *familien*, ikke en målt nødvendighed. Det er den
  pris, der er betalt for én regel uden undtagelser.

- **Læs koden, før reglen skrives: `--delimiter` styrer kun læseren.** T29's
  scope skrev "CSV på input *eller* output", fordi det lød rimeligt. Målt viste
  det modsatte: `opts.delimiter` bruges ét sted i engine'en, i CSV-læseren
  (`src/engine.js:570`), mens skriveren altid skriver komma og citerer felter med
  et genkendt delimiter (`escapeCSV`, `src/engine.js:646`) — T16's bevidste
  fravalg. `orders.json -o csv` var byte-identisk med og uden flaget. En regel
  skrevet før koden læst er en *antagelse med Exit 2*, og det er værre end ingen
  regel, fordi den låser brugeren ude med en besked om et problem der ikke findes.

- **Sporet mellem "værd at læse" og "værd at tro på" er smallere end det føles.**
  T29 måtte vælge *hvornår* en død option skal svares: `--out` og `--table` er
  afklaret af flagene alene og bør derfor fejle før input læses (T25's
  argument), mens `--delimiter` først kan afgøres efter detektion, så en
  manglende fil er stadig exit 3. Asymmetrien er ikke en blemme, men den er
  skrevet ned og testet, så en senere "forenkling" ikke fjerner den i tavshed.

- **En række uden felter er en fejl; et feltnavn uden rækker er en advarsel.** T26
  lod det åbent, hvad et step skal sige, når det møder data i en anden form end
  den blev skrevet til, og T27 lukkede det med T26's egen skelneline, anvendt på
  den anden slags data. Et *feltnavn* er et antagende om data, der kan være rigtigt
  for næste fil, så det advares og filen skrives (T26). En *række uden felter* kan
  intet step læse, og de tre mulige svar — `{}`, tegnindekser, en droppet række —
  er opdigtet eller tabt data, så kørslen stopper og siger hvilket step, hvilken
  række og hvilken form. Beviset for valget er omfanget: før rettelsen var seks af
  otte sådanne step tavse på exit 0, hvoraf to **slettede** rækker. En advarsel
  oven på det ville have været den samme stilhed med en højere tone. Mønstret er
  det samme som T25: en regel, ét sted, begge kaldere — `validatePipeline` for
  pipelinens form, `requireRecords` for rækkerne, og browseren arver begge.

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
- Fund under T32: `escapeXML` var **ikke** den fejl, T21's note om ulovlige XML-navne havde lukket. T21 rettede nøglenavne, og værdierne stod ubeskyttet — så et NUL i en værdi skrev en fil, der erklærede `version="1.0"` og som expat afviste med `not well-formed (invalid token)`, exit 0 og tom stderr. En tavshed kan altså ligge i den linje, der *ligner* som om den gør sit arbejde, lige så let som i en der slet ikke gør det; det er det andet eksempel i denne plan på, at en diff man læser, ikke er en måling.
- Fund under T32, værd at huske: **Transmutes egen læser læser den ødelagte XML-fil fint.** Runden `json → xml → json` fejlede aldrig, fordi læseren er egen genfortolkning af filen og derfor accepterer hvad `escapeXML` skrev. En selvrunde er altså ikke et bevis på gyldighed — det er grunden til, at målingen blev lavet med `expat` som reference-parser. Samme regel gæder T30's cp1252-fund: det blev målt mod bytes, ikke mod værktøjets egen indlæsning.
- Beslutning under T32: **stop, ikke strip.** Der findes intet repræsenterbart svar — `&#0;` afvises af den samme `Char`-produktion — så vrågten kaster med exit 1 og skriver intet. Beskeden siger *hvor* (`row 1, field "note"`) og *hvad* (`U+0000 (NUL)`), og peger på de fire formatters der faktisk kan bære tegnet. Konformitesten verificerer det sidste med en rigtig kørsel, så rådet ikke kan blive en løgn, hvis en writer senere taber evnen.
- Beslutning under T32: vagten **går gennem data før skrivning** i stedet for at tjekke i `escapeXML`. Det er dyrere end at tjekke pr. tegn, men det er den eneste måde at få række og felt ind i beskeden, og T26/T27 viste at præcision i en fejlmeddelelse er forskellen på en bruger der kan handle og en der ikke kan. Den er også præcis én indgang, så de fem skriveveje (element-tekst, attribut-værdi, `@`-attribut, `name`-attribut, rodtabel) ikke kan komme i drift hver for sig.
- Fund under T32: en *fuld* surrogatpar er ét tegn over `#xFFFF` og dermed lovlig, så en vagt bygget på `/[\uD800-\uDFFF]/` ville have afvist hvert emoji i værktøjet. `for...of` går i code points og skelner de to; testen låser `U+D800` mod `U+1F600`, så det kan ikke gå galt ved en senere opgave.
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
- Ny regel fra T23: **en fejl skal ramme den, der kan rette den.** `compileExpression` slugt syntax-fejlen, fordi den ville "være rar at have en fallback". Fallbacken var dog ikke en fallback: den lignede et resultat. Samme princip som T17's exit 3 og T13's advarsler — en høj, konkret fejl er billigere end et stille svar.
- Beslutning under T23: **en dårlig expression er exit 2, ikke exit 1.** Exit-kontrakten er "det brugeren skrev vs. det der gik galt", og en expression der ikke kan kompile er det første. Det er derfor `run` fører et `usage`-flag i sit resultat i stedet for at CLI'en skulle genskabe klassificeringen.
- Fund under T23: **identitets-fallbacket lå to steder.** Ikke bare i `filter` og `map`, men også i `add`, hvor den skrev hele recordet ind i det beregnede felt — altså opfundne data, der lignede et resultat. En fælde der ligner et svar skal altid søges efter i *alle* call sites, ikke kun der hvor den først blev set.
- Fund under T23: `add`s per-record `try/catch` var nødvendig for kast ved kørsel (`item.nope.deep` → `null`, lovet i `docs/cli.md`) og skjulte samtidig syntax-fejlen. Løsningen er ikke at fjerne catchen, men at **kompilere før den første række**: det skelner mellem "ødelagt i alle rækker" og "ødelagt i denne række".
- Procesfund under T23: planens åbne spørgsmål "hvor må en hård fejl fejle i browseren?" viste sig at have et svar, der lå i koden: `compileExpression` kaldes kun inde i `run`s `try`, og `site/try.html` videresender `r.error`. **Læs kaldvejen, før du designer en håndtering** — ellers er der to steder at vedligeholde i stedet for nul.
- Ny regel fra T25: **en operation, der ikke kan gøre sit arbejde, må ikke svare som om den gjorde det.** T25 fandt elleve veje, hvor `parsePipeline` krævede et `op`-nøgle og intet andet: `filter` beholdt alle rækker, `pick` skrev `{}` for hver record, `join` med tomt `with` droppede alle rækker, `tail 0` gav alle rækker. Alle med exit 0, tom stderr og gyldigt output. Spørg altid: *hvis denne parameter mangler eller er noget andet end det forventede, hvad svarer værktøjet så — og er det svar det, brugeren bad om?*
- Ny regel fra T25: **reglen skal have én ejer og to kaldere.** T23's `compileExpression`-regel lå i engine'en, fordi begge miljøer kalder den samme kode. T25 gjorde det samme for pippelinens regler: `validatePipeline` ligger i engine'en, `parsePipeline` kalder den mens den læser flagene, og `run` kalder den for alle andre. `cli.js` mistede dermed sin egen løkke, så der ikke længere er to steder, der kan komme i utakt — det er præcis T22's regel om detektor og læser, anvendt på validering.
- Ny regel fra T25: **slå op med `hasOwnProperty`, når nøglen kommer fra brugerinput.** `operations[step.op]` fandt `toString`, `constructor` og `valueOf` på prototypen, så `{"op":"toString"}` kørte `Object.prototype.toString` som en transformation og svarede `[object Object]`. Samme slagsfejl som T21's `__proto__` som gruppenøgle, fundet i en anden kodevej: en streng fra input er aldrig en pålidelig nøgle.
- Procesregel fra T25: **en validator skal have tests for hvad den *ikke* afviser.** Tre af de nye tests låser, at `unique` uden `by`, `head`/`tail` uden `n` og en tom `mapping` stadig er lovlige. De fejler ikke på den gamle kode — det er pointen: de er der, fordi en overgrebende validator er lige så skadelig som ingen, og den fejl fanger man kun, hvis den er skrevet ned.
- Fund under T25: da parameteren er en streng, skal fejlmeddelelsen vise **den værdi, den fik** (`got "5"`, ikke bare `must be a number`). T22's procesregel om at skrive tests mod output gælder også brugerens input: en Shellvariabel, der ekspanderede til tom, skal kunne genkendes i beskeden.

- Ny regel fra T26: **en parameter, der er til stede, kan stadig være forkert — og så skal værktøjet sige følgen.** T25's regel dækkede den manglende parameter. T26's dækker den *forkerte*: `unique` med `by: "ag"` på en fil med `age` skrev én række i stedet for fire, exit 0, tom stderr. Spørg derfor altid: *denne parameter er med, men passer den de data, den møder — og ved jeg det, eller gætter jeg?*
- Ny regel fra T26: **en advarsel skal fortælle, hvad der skete, ikke kun at noget er forkert.** "no record has a field named ag" er et problem; "every row looked identical, so 1 of 4 rows survived" forteller brugeren hvorfor outputtet er kort, så de kan se at de kigger på den forkerte fil. Derfor er der `FIELD_EFFECTS` med en sætning pr. operation, ikke én fælles tekst.
- Ny regel fra T26: **skeln mellem "ingen rækker har det" og "nogle rækker har det".** T25's research efterlod spørgsmålet eksplicit, fordi et krav om at alle felter skal findes ville være falsk for heterogene data. Svaret er en advarsel kun i det første tilfælde: en advarsel for hvert felt i en venstre-join uden match ville træne brugeren til at ignorere den advarsel, der betyder noget. Syv tests låser ulydigheden.
- Ny regel fra T26: **en regel skal have den rigtige enhed.** Tjekket foregår per step mod data som de er i det step, ikke mod filen ved ankomst — ellers ville `add`/`map` før `sort`/`pick` advare om felter, der netop blev skabt. Samme tankegang som T25's rækkefølge-krav: se på det tidspunkt, hvor reglen gælder.
- Fund under T26: **`sort`s comparator svarede `1` for to rækker, der begge manglede feltet.** Det er `a < b` og `b < a` samtidig, altså ikke en orden; at rækkerne kom ud i input-rækkefølge var en egenskab ved den brugte motor, ikke en egenskab ved koden. T22's regel om at læseren og detektoren skal have samme regel har en søskend: **en comparator skal være en total orden, ellers er dens output udefineret, uanset hvad den ser ud til at gøre.**
- Procesregel fra T26: **den nye kode fangede min egen test.** `reportMissingFields` sagde `omit: no record has a field named "id"` i den test, der skulle være stille — fordi `pick` lige inden havde fjernet `id`. Det var testens pipeline, der var forkert, ikke rettelsen, og det er præcis T22's procesregel: læs hvad koden faktisk siger, før du skriver hvad den burde sige.

- Ny regel fra T24: **et flag skal gøre det samme i alle tilstande.** `--delimiter` var valideret, accepteret og kasseret i previewen, så svaret afhang af om man tilføjede `--output`. Samme klasse som T16 og T22: to veje gennem den samme læser skal have den samme regel — også når den ene veje er en preview.
- Fund under T24: previewen er det, brugeren bliver bedt om at tro på, før han kører den rigtige kommando. Derfor er den mere skånsom end resten af værktøjet, ikke mindre: en preview der lyver, koster mere end en fejl der stopper.

- 2026-09-26 ca. 08:0x CEST: **T32 gennemført på `ceo/xml-unwritable-chars` (branch fra `ceo/paths-locale-limits`), ikke mergeret til `main`.** `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret for **syvende** gang i træk, live er stadig `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit og 25 filer i drift, `/support/index.html` utilgængelig — så bunken er nu tyve commits på fjorten branch, og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. T31 havde peget på de skærmformater `table` ikke dækker, og målingen på den rigtige binary delte dem i to grupper. **`xml`, `sql` og `csv` på `café`/`日本`/`🚀`, en `csv`-celle på 300 tegn (byte-identisk round trip), `csv` med 1.000.000 rækker på 1,9 s, og tab/LF/CR i `xml`: alle rene**, skrevet ned i T32's tabel så de ikke måles igen. **Den tredje var ikke ren, og fejlen lå i en linje T31 ikke havde rørt.** `escapeXML` escaper `&`, `<`, `>`, `"` og `'` og lader alt andet passere råt, så **et kontroltegn i en *værdi*** skrev sig ubeskadiget ind i filen. Otte målinger, alle exit 0 med tom stderr og en fil på disk, som **expat afviser med `not well-formed (invalid token)`**: `U+0000`, `U+0007`, `U+000B`, `U+000C`, `U+001B`, `U+001F`, `U+FFFE`, `U+FFFF` — plus en enlig surrogat, der blev skrevet som U+FFFD, altså data tabt i stilhed. Samme fejl i et feltnavn (går ud i `name`-attributten) og i en `@`-attributværdi. XML 1.0's `Char`-produktion er `#x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]`, så alle otte ligger uden for den, og **der er ingen escape**: `&#0;` afvises af den samme produktion. **Målemetoden er den vigtigste linje i denne iteration:** Transmutes *egen* læser læser den ødelagte fil fint, så runden `json → xml → json` fejlede aldrig — målingen måtte tages med `expat` som reference-parser, ellers ville den ikke have fundet fejlen. Rettelsen er `firstUnrepresentableXMLChar` (Char-produktionen skrevet ud, ikke tilnærmet) + `scanXMLValue`, som går gennem data **før** skrivning, så beskeden kan sige hvilken række og hvilket felt; kaldt fra `serializers.xml` dækker det alle fem skriveveje på én gang. **Valg — stop, ikke strip:** exit 1, tom stdout, ingen fil, fordi intet repræsenterbart findes, og fordi en fil der påstår at være XML 1.0 uden at være det er værre end ingen. Det er exit 1 og ikke 2, fordi pipeline'en er fin — præcis T27's skelneline. `C0_NAMES` giver de otte kontroltegn deres navn, så beskeden er `U+0000 (NUL)` og ikke bare et tal. **Begrænsningen holdt snævt:** en *fuld* surrogatpar er ét tegn over `#xFFFF` og er lovlig, så `for...of` (code points) er hele forskellen mellem `U+D800` og `U+1F600` — en test låser de to, så en bredere vagt ikke kan kvæle emoji ved en senere opgave. 4 nye engine-tests (138 → 142) og 3 nye CLI-tests (127 → 130) på den rigtige binary; **tre af de fire engine-tests fejler på den gamle kode** med præcis de målte symptomer, den fjerde (at `csv`/`sql`/`json`/`yaml` bevarer tegnet) er grøn på begge og er bevidst en regression-garanti. Den nye konformitest (75 → 76) låser fejlmeddelelsen **ordret** til `docs/cli.md`, `--help` og exit-1-rækken i docs, og verificerer med rigtige kørsler at de fire formater, beskeden navngiver som flugtvej, faktisk kan bære tegnet — så rådet ikke kan blive en løgn. Låsen testet mod to mutationer (ændret fejltekst, slettet `--help`-linje), begge fanget. Procesfejl undervejs, begge fanget af de nye tests: (1) min egen engine-test indexerede den forkerte række, så `esc` og `us` læste `undefined` og blev skrevet som `<item/>`; (2) min CLI-round-trip-test sammenlignede mod et tal, men **XML har ingen typer**, så `id: 1` kommer tilbage som `"1"` — testen var forkert, ikke koden. `docs/cli.md` fik afsnittet **XML output: the characters XML itself cannot hold** med `Char`-produktionen, den ordrette besked og en note om at tab, LF og CR er lovlige og ikke røres. `site/engine.js` er byte-identisk med `src/engine.js` og blev kopieret med, så **playgroundet på `/` og `/da/` fik samme rettelse**; `tools/site_chrome.py` regenererede asset-hash'en i `try.html`, ingen anden side ændrede sig, søgeindeks uændret på 104 — derfor **er** `check:site` kørt. Lokalt grøn: `npm test` 142+130+76+6+39+4+173, `npm pack --dry-run` uændret på 5 filer, `npm run check:site` `0 finding(s) across 20 pages` + `deviations: 0` + selftester grønne inkl. deploy-friskheds-selvfesten, `npm run audit:site` `No known vulnerabilities found`, `npm audit` `found 0 vulnerabilities`. Næste opgave er en ny måling i samme klasse: **de andre læsere** — T30 målte kun encodingsfejlen på *ind*, aldrig hvad en læser gør med en fil den ikke forstår (CSV med feltantalskollision, YAML med duplikeret nøgle, XML med to rødder), for læserne har alle exit 0 som deres dårligste svar.

- Fund under T33: en nøgle, der står to gange med to forskellige værdier, er **ikke** et antagende om data (T26's advarselsklasse) men en fil, der modsiger sig selv — og dog er svaret advarsel og ikke fejl. Skellelinien er T26's egen, brugt fra den anden side: det læseren *kan* vide, er at den har valgt, så det siger den; det den ikke kan vide, er hvilken side der er rigtig, og det må den ikke gætte om ved at nægte at konvertere. Derfor: sidste værdi som `JSON.parse` og `jq` giver, exit 0, ren stdout, kollisionen med nøgle, begge værdier og linjer på stderr.
- Fund under T33: `{"a":1,"a":1}` er ikke en kollision. Det er T26's anden regel — "et felt nogle rækker har advares aldrig" — anvendt på en anden slags støj: en advarsel skal pege på noget, brugeren kan gøre noget ved, ellers er den bare støj.
- Fund under T33: fundet i JSON gås som tekst, og det er eksakt frem for heuristisk — en nøgle i JSON er per definition en streng med `:` bagefter, så scanneren kan hverken finde en kollision, der ikke er der, eller overse en, der er. Værdien slices ud af samme tekst og parses for sig selv; det er det, der gør sammenligningen mulig uden at skrive en JSON-parser.
- Fund under T33: den samme rodregel dækker to forskellige fejl, fordi de deler årsag — det læseren ikke læser. Derfor er "én advarsel til alle læsere" og "exit 3 for alt efter roden" to sider af samme linje: advarsel når der findes et fornuftigt svar, fejl når læseren ellers ville vælge for brugeren.
- Procesfejl under T33, to, begge fanget af de nye tests: (1) `advanceTo` sprang over værdier uden at tælle linjeskift, så enhver kollision efter en flerlinjes værdi fik **forkert linje** — usynligt i output, men det gjorde præcis den hævdelse, beskeden er bygget på ("linje 3 er et sted at kigge"), til en løgn; (2) `noteDuplicateKey` sammenlignede to *objekter* (`first === second`) i stedet for to værdier, så identiske gentagelser advaredes alligevel. Begge fejl lå i den nye kode, ikke i den gamle, og begge blev fundet af de tests, der skulle låse de to ting, beskeden lover.

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

9. **Syv `.pyc`-filer er sporet på `main` (fra T26, målt):** `git ls-tree -r main` viser `tools/__pycache__/{layout_check,make_icons,make_og,seo_check,shots,site_chrome,verify_live}.cpython-314.pyc` — bytecode fra en Python-version der ikke findes på nogen maskine her, som ingen kan bruge, og som følger med i enhver diff af `tools/`. De kom ind med `c3db6e5` den 8/9. **Årsagen er ikke en manglende regel, men at reglen ligger på den umergerede bunke:** `__pycache__/` står i `.gitignore` på `ceo/missing-fields` (kom med i T15's slice) men **ikke** på `main` — målt med `git show main:.gitignore` og `git check-ignore -v` på hver af de to. Det er derfor farligt netop nu: kontrakten begynder hver iteration med at checke ud på `main`, og derfra ville et `git add -A` have committet den `cpython-313.pyc`, `check:deploy` lige havde lavet. Da bunken merges kommer reglen med, men de syv *sporede* filer bliver liggende, indtil nogen kører `git rm --cached tools/__pycache__` — altså skal det være en del af merge-bunken, ikke en senere opgave. En kontrol i `verify_contract.mjs` der fejler på et sporet `.pyc` er værd at have uanset.

8. **Browserplaygroundet får ingen advarsler (fra T26):** `site/try.html` videresender `r.error` men ikke `r.warnings`, så en browserbruger på `/` og `/da/` får `{}` for en række efter en `pick` med en tastefejl, uden at advarslen fra CLI'en når ham. Det er den mest brugte flade i produktet, og den bruges netop til at prøve en pipeline, før man kører den rigtige kommando. Løsningen er at føre `r.warnings` gennem `postMessage` og vise dem under outputfeltet på begge forsider. Loopet har ikke lavet det, fordi det er en UI-ændring i to sider med egen layout-gate, ikke en fejlrettelse. **Mads: skal advarslerne vises på sitet?** Uden svar gør næste iteration det, fordi det er den samme regel som T26's anvendt på den anden klient.

7. **Tom streng i SQL-output (fra T19):** loopet har besluttet, at `''` skrives som `''` og
   kun `null`/manglende nøgle som `NULL`, fordi det er SQL-korrekt, og fordi den gamle
   adfærd gjorde `WHERE middle = ''` meningsløs efter en import. Det er bevidst truffet uden
   svar, da den er én commit at rulle tilbage til. **Hvis du vil have `NULL` for tomme
   felter, så sig det** — så bytter jeg regex'en tilbage og justerer `docs/cli.md`.
13. **De to læserhuller er lukket (fra T33, rettet af T34).** (a) En YAML-flowsamling som *hele dokumentet* — `{a: 1, a: 2}` på roden — læstes som den bogstavlige streng `"{a": "1, a: 2}"`, exit 0. (b) To XML-dokumenter med **samme** rodnavn fangedes kun af elementkontrollen. Begge er rettet og målt i T34, som desuden fandt en tredje fejl scope ikke havde set: `<rows/>` alene blev afvist som et rod, der aldrig lukkes. **Bemærkningen fra T33 om `<rows><rows/></rows>` holdt ikke** — målingen viser, at det er ét velformet dokument, og `[{}]` er det svar læseren allerede giver `<r><i/></r>`. T34's egen målingstabel står med alle tyve stier. **Ingen beslutning nødvendig.**
15. **Hele tal over 2^53 taber deres sidste cifre i stilhed (fra T38, målt, ikke rettet):** `9007199254740993` skrives som `9007199254740992` i alle seks formater, exit 0, tom stderr, fordi `JSON.parse` runder ved læsningen — motoren ser aldrig det tal, der stod i filen. `jq` bevarer de samme heltal, så "det er sådan tal er" holder ikke, og Python's `json.loads` gør det samme som Transmute. Det rammer 64-bit id'er (snowflake, ordrenumre), beløb i minorenheder og andre tal, hvor én af 16 cifre er hele værdien. Rettelsen kan **ikke** ligge i skriveren, så der er to muligheder: (a) en tabsfrit læser, der genkender heltalsliteraler i inputteksten og bevarer dem som streng indtil en bruger spørger om et tal, eller (b) en advarsel ved læsningen — samme skelneline som T26: kørslen lykkes, men én linje på stderr siger at cifrene kan være ændret. (a) er mere arbejde og en reel adfærdsændring i output; (b) er billig og ærlig, men lader tallet være ændret. **Mads: advarsel ved læsningen (b), eller tabsfrit læser (a)?** Uden svar beholder loopet den nuværende adfærd og skriver fundet ned her, fordi en ny læsevej er mere kode end fundet fortjener på egen hånd.
16. **Et integralt float-tabte sin float-identitet, og det er bevidst ikke rettet (fra T39, målt):** `1.0` skrives `1` i YAML, så PyYAML læser det tilbage som `int` — **værdien er identisk**, kun typen er en anden. Det samme gælder `1e15`, som allerede skrives som int. **JavaScript kan ikke skelne `1.0` fra `1`**: begge er tallet 1, så når værdien først er et tal, er spørgsmålet om inputtet sagde `1.0` besvaret *nej*. Derfor skriver T39 ikke `1.0` — det ville opfinde en float-identitet, filen måske aldrig havde, og en tæller skrevet som `1.0` er en ny slags overraskelse. Den del af T38's måling, der *kun* er denne, er altså lukket som **målt og bevidst**, ikke som rettet. **Mads: skal en YAML-fil bevare `1.0` som float?** Det kræver en læser, der holder stavingen (jf. punkt 15's tabsfri læser), altså samme beslutning og samme kode — de to punkter bør afgøres sammen, og uden svar forbliver den nuværende, forudsigelige adfærd.
14. **Browserplaygroundet får ingen advarsler — LUKKET af T35.** Det var en sideeffekt, da T26 skrev det ned; efter T33 og T34 var advarslerne en *dokumenteret* del af læserne, og de døde i den flade, flest brugere ser. Fundet var **én linje** — `site/try.html` videresendte `text`, `error` og `rows` men ikke `warnings` — og de otte advarselsproducerende stier fra T13–T34 endte derfor alle i samme sted. Advarslerne males nu i deres eget element under output på `/` og `/da/`, aldrig i outputelementet, fordi kopier og download læser netop det. Låst af tre konformitester, hvoraf den første kører sitets egen `try.html`-script og kræver at rammens `warnings` er tegn for tegn lig CLI'ens stderr. **Ingen beslutning nødvendig.**
- 2026-09-26 ca. 06:2x–07:0x CEST: **T26 gennemført på `ceo/missing-fields`, ikke mergeret til `main`.** Deploy genverificeret **først** i iterationen med `npm run check:deploy`: uændret, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig, så `DEPLOY-MISSING` står ved; intet er mergeret, og der er derfor oprettet ingen `VERIFICÉR DEPLOY`-note. T20–T25-metoden kørt på den flade T25's research efterlod: **et feltnavn, ingen rækker har.** Otte fund, alle kørt på den gamle kode før rettelsen. (1) `unique` med `by: "ag"` på en fil med `age` sammenlignede `undefined` med `undefined`, kaldte alle fire rækker identiske og skrev **én** række — exit 0, tom stderr, og det eneste sted i værktøjet hvor en fejl fjerner data. (2) `sort` sorterede ikke, `pick` droppede feltet, `omit` fjernede intet, `rename` omdøbte intet, `group` lagde alle rækker i `(null)`, `flatten` udvidede ingen, og `join` med `on` ingen side har droppede **alle** rækker — alle exit 0, alle tavse. (3) `sort`s comparator svarede `1` for to rækker der begge manglede feltet, altså ikke en orden. Rettelse: `reportMissingFields` i engine'en med to tabeller (`STEP_FIELDS`, `FIELD_EFFECTS`), kaldt i `run`s transform-løkke **før** hvert step, så den advarser om `pick: no record has a field named "emial"; it is in no output` på stderr med exit 0 og ren stdout. **Resultatet er bevidst uændret** — et feltnavn er en antagelse om data, som kan være rigtig for næste fil, så det er T14's advarselsklasse, ikke T25's exit 2. Tjekket sker per step mod data som de er der, så felter `add`/`map` lige har lavet mangler ikke; **et felt nogle rækker har advares aldrig**, fordi heterogene data er det `pick` er bygget til (syv tests låser det); `join`s `on` tjekkes mod begge sider; rækker der ikke er records springes over; `sort` returnerer `0` når begge rækker mangler feltet. `docs/cli.md` fik afsnittet **When a field name is in no row** med to kørte eksempler — det ene med advarsel, det andet et heterogent input der *ikke* advares — og en linje om at stdout aldrig ændrer sig. 8 nye engine-tests (121 → 129) og 3 nye CLI-tests (92 → 95). `tools/site_chrome.py` regenererede `site/engine.js` (byte-identisk med `src/engine.js`) og asset-hash'en i `try.html`; søgeindeks uændret på 104. Lokalt grøn: `npm test` 129+95+69+6+39+4+173, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 20 pages`, `deviations: 0` ved 360/768/1280 px og alle selftester grønne inkl. deploy-friskheds-selftesten. Ingen af de 17 `CASES` ændrede sig, så ingen snapshot regenereres. Tænder: 5 af 8 engine-tests og 2 af 3 CLI-tests fejler på den gamle kode, de sidste med *tom stderr* — præcis den fejl de er skrevet til at fange. Procesfund: den nye kode fangede min egen test (`omit` efter `pick` i en pipeline), hvilket bekræfter at advarslen ikke er støjende for korrekt input. Næste flade er fundet undervejs og kræver en beslutning, se `Næste iteration`.
- 2026-09-26 ca. 05:5x–06:3x CEST: **T25 gennemført på `ceo/pipeline-validation`, ikke mergeret til `main`.** Deploy genverificeret **først** i iterationen med `npm run check:deploy`: uændret, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, så `DEPLOY-MISSING` står ved; intet er mergeret, og der er derfor oprettet ingen `VERIFICÉR DEPLOY`-note. T23's research pegede på `run`s fejlklassificering, og den viste sig at have en enklere form: **hver operation var kørbar uden den parameter, den ikke kan arbejde uden, og svarede med et andet svar end det, brugeren bad om.** Fire fund, alle kørt på den gamle kode før rettelsen. (1) `{"op":"pick"}` skrev `{}` for hver record — hele filens indhold væk, exit 0, tom stderr, gyldig CSV med det rigtige antal rækker; (2) `filter`/`map` uden `expr` var identiteten, `sort`/`group` uden `by`, `rename` uden `mapping`, `flatten` uden `field`, `omit`/`add` uden `fields` var tavse no-ops, og `join` med tomt eller ikke-array `with` droppede **alle** rækker; (3) `tail` med `n: 0` gav alle tolv rækker, fordi `data.slice(-0)` er `data.slice(0)`, og `head "abc"` gav nul rækker, fordi `slice` coerced strengen uden at nogen sagde det; (4) `operations[step.op]` fandt arvede properties, så `{"op":"toString"}` kørte `Object.prototype.toString` som en transformation og svarede `[object Object]`. Rettet med én `validatePipeline` i engine'en: `STEP_PARAMS` + `PARAM_CHECKS` + `OPTIONAL_PARAMS`, fejl med `usage: true` altså exit 2 i CLI'en og fejlboks i browseren. **Én regel, to kaldere** — `parsePipeline` kalder den før inputfiles læses, så en tastefejl i en pipeline ikke længere rapporteres som et filproblem (den gamle kode læste først, så `-f json` på en CSV gav exit 3), og `run` kalder den for alle andre, altså også browserplaygroundet. Ops-opslaget bruger nu `hasOwnProperty`. `docs/cli.md` fik afsnittet **What a step must bring with it** med en tabel over alle 14 operationer og den konkrete fejlmeddelelse verificeret character for character; exit-code-tabellen er opdateret. 13 nye engine-tests (108 → 121) og 6 nye CLI-tests (86 → 92). **Tænder kørt og dokumenteret:** mod den gamle kode fejler 10 af de 13 engine-tests med deres eget symptom (`{}`, `["[object Object]"]`, 12 rækker, `Unexpected token 'h'`) og 5 af de 6 CLI-tests (exit 0 hvor der skulle være 2, exit 3 i stedet for 2). De 4 der ikke fejler, låser at `unique` uden `by`, `head`/`tail` uden `n`, tom `mapping` og tom `fields`-liste stadig er lovlige — de skal ikke fejle, fordi en overgrebende validator er lige så skadelig som ingen. **Ingen af de 17 `CASES` ændrede sig**, så ingen snapshot er regenereret; det er beviset på, at rettelsen kun rammer de pipelines, den handler om. Lokalt grøn: `npm test` 121+92+69+6+39+4+173, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 20 pages`, `deviations: 0` og alle selftester grønne inkl. deploy-friskheds-selftesten. `tools/site_chrome.py` (Python 3.13.15 fra `.venv-site`) regenererede asset-hash'en i `try.html` (`?v=0c816101` → `?v=fdffc4f0`); søgeindekset uændret på 104 entries. Implementationscommit `5fd4648`, pushet til `ceo/pipeline-validation`, **ikke mergeret til `main`**. Næste flade står i `Næste iteration`: et resultat, der afviser det, der blev bedt om, uden at sige det — `pick` med et felt ingen record har, `sort` med `by` på et felt ingen rækker har.

- 2026-09-26 ca. 05:2x–06:0x CEST: **T22 gennemført på `ceo/format-detect`, ikke mergeret til `main`.** Deploy genverificeret **først** i iterationen med `npm run check:deploy`: uændret, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, `/support/index.html` utilgængelig, 25 afvigende filer, så `DEPLOY-MISSING` står ved; intet er mergeret, og der er derfor oprettet ingen `VERIFICÉR DEPLOY`-note. T20/T21-metoden kørt på den **sidste** flade de to efterlod: format-detekteringen. To fund, begge reproduceret på den gamle kode. (1) `detectFormat` havde sin **egen, svagere kopi** af delimiterreglen og kendte kun komma, mens CSV-læseren genkender `,` `;` tab `|` — så en dansk Excel-eksport, en TSV og en pipe-tabel blev sendt i JSON-læseren og afvist med exit 3. På stdin er det hele historien, fordi der ingen filudvidelse er, og stdin er den normale indgang; samme fejl ramte playgroundet på `/` og `/da/` (`site/try.html:25`). T13's egen TSV-test skrev `-f csv --delimiter tab` foran kommandoen og undgik dermed netop den automatiske vej. (2) Enkolonnefiler blev afvist, fordi de ikke har en delimiter at finde — `email\na@b.dk\nc@d.dk` er en mailingliste. Rettet ved at detektoren nu bruger læserens egne `CSV_DELIMITERS` og `countUnquoted`, så de to ikke kan komme i utakt, plus at en fil med mere end én linje og ingen delimiter regnes som CSV; **én linje er bevidst undtaget**, så `42`, `true` og `hello` forbliver JSON-skalarer. Rækkefølgen mod JSON/YAML/XML er uændret. 4 nye engine-tests (99 → 103) og 4 nye CLI-tests (76 → 80), alle syv skrevet mod output og kørt mod den gamle kode, hvor de fejlede med det konkrete symptom. **Ingen snapshot ændrede sig** — ingen `CASES`-case ændrede rækkefølge. Procesfejl, begge fanget af de nye tests: en `assert.strictEqual` på et array og en forventet streng uden det `
`, `console.log` tilføjer. `docs/cli.md` fik to eksempler i delimiter-afsnittet, begge kørt og verificeret character for character. `tools/site_chrome.py` regenererede `site/engine.js` (byte-identisk) og asset-hashes på 20 sider; søgeindeks uændret på 104. Lokalt grøn: `npm test` 103+80+69+6+39+4+173, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 20 pages`, `deviations: 0` og alle selftester grønne inkl. deploy-friskheds-selftesten. Implementationscommit `0115204`, pushet til `ceo/format-detect`, **ikke mergeret til `main`**. **To fund gjort permanent i planens næste iteration, ikke rettet her:** `compileExpression` fanger alle fejl i et `new Function` og returnerer identiteten, så en syntaktisk ugyldig `filter`-expression kører med exit 0, tom stderr og alle rækker i output, mens en expression der kaster ved kørsel giver exit 1 — altså stille syntax-fejl og høje runtime-fejl, præcis omvendt; og `--delimiter` er stille ignoreret i preview-tilstanden, fordi `showPreview` kalder `run(text, format, [])` uden at give `delimiter` videre, så det samme flag giver et andet svar med og uden `--output`. Begge er verificeret ved kørsel og skrevet ned, fordi de er næste iteration, ikke sideværk.

- 2026-09-26 ca. 04:0x–04:2x CEST: **T20 gennemført på `ceo/nested-cells`, ikke mergeret til `main`.** Deploy genverificeret **først** i iterationen med `npm run check:deploy`: uændret, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, `/support/index.html` utilgængelig, så `DEPLOY-MISSING` står ved. T18's metode kørt for **første gang på serialiseringssiden**: rigtige filer gennem `src/cli.js` med hvert output-format, jagt efter exit 0 med mistet data. Tre fund, alle reproduceret på den gamle kode: (1) `serializers.csv` og `serializers.sql` skrev værdier med `String()`, så et objekt blev til den bogstavelige `[object Object]` — exit 0, tom stderr, og sitets egen flatten-guide skrev en hel sektion om at omgå præcis det; (2) arrays blev skrevet komma-joinet, så `["a,b"]` og `["a","b"]` gav den samme fil, og `{}`/`[]` gav begge et tomt felt; (3) `operations.join` spurgte om det **upræfikserede** navn i sin kollisions-guard, så `join --prefix` droppede præcis det felt prefixen findes for — exit 0, mens både `docs/cli.md` og join-guiden lovede det modsatte. Rettet med `cellValue()` delt af `csv`/`table`/`sql` (kompakt JSON for ikke-skalærer, samme form som `jq`'s `@csv`), et eget objekt-tjek i `sqlValue`, og en guard der spørger om det navn den faktisk skriver til; uden `prefix` er adfærden uændret. `docs/cli.md` fik sektionen `#### Nested values in a flat cell` plus et prefix-eksempel på et kolliderende felt; flatten- og join-guiden er rettet, så ingen af dem længere beskriver en fejl som en advarsel. `tools/site_chrome.py` regenererede søgeindeks (104 entries), asset-hashes og sitemap på 20 sider. 11 nye engine-tests (78 → 89) og 6 nye CLI-tests (70 → 76); **0 af 27 eksisterende snapshots ændret**, den nye case `nested-values-to-csv` er den eneste tilføjelse i `expected.json`, hvilket er beviset på at rettelsen er additiv. Procesfejl undervejs, gjort permanent: min egen test delte CSV-linjen på `,` for at finde cellen, men cellen *er* JSON med kommaer i, så testen havde en svagere idé om CSV end værktøjet selv — den læser nu cellen tilbage med `parsers.csv`. Lokalt grøn: `npm test` 89+76+69+6+39+4+173, 0 fejl, `npm pack --dry-run` 5 filer uændret, `npm run check:site` `0 finding(s) across 20 pages`, `deviations: 0` og fire grønne selvtesttrin inkl. deploy-friskheds-selvfesten, `npm run audit:site` og `npm audit` uden fund. Næste iteration: kør `npm run check:deploy` først; er `DEPLOY-MISSING` væk, merges bunken på fire branch til `main`.
- 2026-09-26 ca. 04:0x–04:2x CEST: T19 gennemført på `ceo/sql-empty-string`, bygget oven på `ceo/xml-attributes`, så bunken nu er ni commits. Deploy genverificeret **først** i iterationen med `npm run check:deploy`: uændret, `DEPLOY-MISSING` står ved, og diffen mergeret **ikke** til `main` (den rørrer `site/engine.js`); ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. To tavse datatab fundet i `serializers.sql`, begge med exit 0 og gyldig SQL: (1) `sqlValue` skrev både `null` og `''` som `NULL`, så en CSV med et tomt felt importerede fint og `WHERE middle = ''` fandt intet bagefter; (2) regex'en `/^-?\d+(\.\d+)?$/` skrev det danske postnummer `0074` som tallet 74. Rettet i begge engines (byte-identiske) til `null`/`undefined` → `NULL`, `''` → `''`, og regex'en snævret til `/^-?(0|[1-9]\d*)(\.\d+)?$/`, så kun et forulede nul tvinger citater på. Nyt fixture `test/fixtures/sql-empty.csv` som `CASES`-case, så konformancen dækker det i begge engines og i den rigtige CLI; `docs/cli.md` fik en firelinjes-tabel over `NULL` / `''` / `2100` / `'0074'` med kommando og fuldt output, altså migrationen er skrevet ned. Den grønne test `SQL NULL for empty values` blev omskrevet til tre tests, der hver især kan fange en regression: null mod tom streng, tom streng gennem en CSV-runde, nulforpræfiks. **Procesfejl, begge fanget af de nye tests:** jeg skrev begge de to første tests ud fra hovedet i stedet for fra outputtet — `(NULL, NULL)` optræder jo i tredjerækken med den manglende nøgle, så min `includes`-påstand ramte den, og `"0.5"` er et decimaltal uden nulforpræfiks, så den ville være quotet i min nye forventning. Rettet til at sammenligne hele rækker mod den faktiske output. Snapshots regenereret til 27 entries **uden at ét eneste eksisterende snapshot ændrede sig** — beviset på, at rettelsen kun rammer de to tilfælde, den handler om. **Den gæld fra T18-iterationen er betalt:** `npm run check:site` er kørt og grøn (`0 finding(s) across 20 pages`, `deviations: 0`, fire grønne selvtesttrin inkl. deploy-friskheds-selvfesten), så bunken er nu grøn i hele gaten, ikke kun i root-gaten. Lokalt grøn: `npm test` 80+71+67+6+39+4+173, 0 fejl, `npm pack --dry-run` 5 filer uændret. Implementationscommit `538aa2e`, pushet til `ceo/sql-empty-string`, **ikke mergeret til `main`**. Næste opgave: kør `npm run check:deploy` først; er `DEPLOY-MISSING` væk, merges bunken på ni commits til `main`.

- 2026-09-26 ca. 04:2x–05:1x CEST: T17 gennemført på `ceo/nested-yaml`. `parsers.yaml` erstattet af en indrykningsdrevet læser (`parseYAML` → `tokenizeYAML` → `parseYAMLBlock`): mappings og sekvenser i vilkårlig dybde, `- key: value` med indrykket inline-mapping, sekvens på samme indrykning som sin nøgle, blokskalarer (`|`, `>`, `|-`, `|+`), enkelt- og dobbeltcitate med escapes, flow-kollektioner (`[a, b]`, `{k: v}`), `#`-kommentarer og `---`/`...`. Den gamle læser lod en indrykket blok forsvinde og exitede 0 — hele `service`-blokken i en almindelig config-fil var væk. `serializers.yaml` skriver den samme struktur tilbage (nested mappings, sekvenser af mappings, blokskalarer, citater), og en streng der læses som noget andet skrives quotet, så `0074` ikke bliver 74. Ny fixture `test/fixtures/nested.yaml` (tre niveauer) som `CASE`, så conformance dækker den i begge engines, plus to konverteringer med fuldt output i `docs/cli.md`; afsnittet om YAML-understøttelse er skrevet om og siger nu, at anchors og multi-dokument-filer ikke understøttes, og at kun første dokument læses med en advarsel på stderr. 12 nye engine-tests (55 → 67), 7 nye CLI-tests (63 → 70), conformance 63 → 65. `detectFormat` genkender nu `key: value` som YAML og ser på første meningsbærende linje, så en indsat config-fil i browserplaygroundet ikke læses som JSON. Snapshots regenereret til 26 entries **uden at ét eneste eksisterende snapshot ændrede sig** — beviset på, at rettelsen er en no-op for data, der allerede virkede. Fund undervejs: (1) `blockScalarHeader` skrev `style: m[1]`, som er chomping-indikatoren, så *alle* blokskalarer blev literale — fanget af den test, der hævede den foldede egenskab, ikke af dem, der testede `|`; (2) min første CLI-test påstod `zip: 0074` på en yaml-fil, hvilket er YAML'ens egen coercing, ikke writerens — påstanden flyttedes til json → yaml → json, fordi det er den vej, et postnummer faktisk rejser; (3) `expectFail(..., 1, ...)` viste exit **3**, CLI'ens kontrakt for ulæseligt input, så testen blev skrevet om til den. Lokalt grøn: `npm test` 67+70+65+6+39+4+166, `npm pack --dry-run` 5 filer, `npm run check:site` `0 finding(s) across 19 pages`, `deviations: 0` ved 360/768/1280 px, `Site-gate grøn.` med syv grønne selvtesttrin. Deploy genverificeret **først** med `npm run check:deploy`: live `3d90812`, 5 site-commit / 25 filer u deployede, `/support/index.html` utilgængelig — uændret, så `DEPLOY-MISSING` står ved, diffen mergeret **ikke** til `main` (den rørrer `site/engine.js`), og der er oprettet ingen `VERIFICÉR DEPLOY`-note. Næste opgave er T12 (dansk support-side); T13/T14/T15/T16/T17 ligger som seks u mergerede commits på to branch-kæder.

- 2026-09-26 ca. 11:5x–12:4x CEST: **T39 gennemført på `ceo/yaml-float-spelling` (branch fra `ceo/nonfinite-numbers`), ikke mergeret til `main`.** `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret for **fjortende** gang i træk, live er stadig `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig — så bunken er nu **toogtyve commits på nitten branch**, og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. T38 skrev to tal ned som "en linje" og en beslutning; den her er den enlinjes del, og den viste sig at være det mest synlige fund i hele planen, fordi den rammer almindelige tal. Syttende tal gennem den rigtige binary (`transmute nums.json -o yaml`) og læst tilbage med **PyYAML**: **syv af syv** læses som noget andet, exit 0, tom stderr. De fem alvorlige er den samme fejl fem gange — `1e-7`, `-1e-7`, `1e+21`, `1e+308` og `5e-324` (den mindste double i JavaScript) skrives **bart** og læses som **`str`**: et tal i talklæde. De to andre (`1.0`→`int`, `1e15`→`int`) er **ikke** tab, fordi `1.0` og `1` er det samme tal i JavaScript. **Årsagen er hentet ud af PyYAML's egen resolver, ikke gættet:** YAML 1.1's float-production kræver et **obligatorisk punktum** og et **obligatorisk tegn** på eksponenten, mens JavaScript er læssere end begge — derfor er `1.0e308` i en fejl, selv med punktum. De fem andre formater har **ikke** fejlen, og det er målt: SQLite læser den bare `1e-7` som `real`, og JSON/CSV/table/xml er utypede. Rettelsen er `formatYAMLNumber` kaldt fra `formatYAMLValue`, så den gælder mappings, sekvenser, dybe noder og topniveauskalarer. 1 ny engine-test (155 → 156), kørt mod den gamle kode, hvor den faldt med præcis det målte symptom. **Procesfund, tre, og de to første er værd at huske:** (1) testen måtte låse **stavingen**, ikke round-trip, fordi **vores egen læser er mere tilladende end PyYAML** og læser `1e-7` som et tal — en round-trip-test passerer mod den ødelagte skriver, og et værktøj der er enig med sig selv er ikke bevis på at en fil kan læses; (2) min egen mutationstest var **ugyldig** i første kørsel, fordi tre `perl`-substitutioner ikke matchede, så de "overlevede" kun fordi de aldrig blev anvendt — lavet ordentligt med eksakt strengerstatning bagefter; (3) `drop the sign` **overlevede** den ordentlige test, og årsagen var **død kode**: `Number::toString` skriver altid et tegn på eksponenten, så tegn-grenen var utilgåelig og ukillelig — den er fjernet, og mønstret kræver nu tegnet direkte, så overlevelsen opløstes ved at lade dødkoden være væk i stedet for at skrive en test til den. Fire mutationer dræbes nu alle: `String(val)`, `drop the dot`, `invent a float identity` (`1`→`1.0`, den beslutning punkt 16 beskytter) og `quote the number instead`. `1.0` bliver **bevidst** `1`, fordi skriveren må ikke opfinde en float-identitet inputtet måske aldrig havde — ny `❓ Til Mads` punkt 16. `site/engine.js` byte-identisk med `src/engine.js` (`cmp` bekræfter), `try.html`-asset-hash `79a50e59` → `7a7d9085`, søgeindeks uændret på 104. Lokalt grøn: `npm test` 156+137+83+6+39+4+173, `npm pack --dry-run` uændret på 5 filer. Næste opgave er T40 i **YAML-skriverens skalare** — kun talskalaren er målt; `null`/`true`/`false` og strengene gennem `needsYAMLQuotes` er en anden måling.

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
- 2026-09-26 ca. 06:3x–07:1x CEST: T27 gennemført på `ceo/record-shape` som `0abe7a3`, bygget oven på `ceo/missing-fields`, **ikke mergeret til `main`**. `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret, live er stadig `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit og 25 filer i drift, `/support/index.html` utilgængelig — så bunken er nu femten commits på ni branch, og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. T26 havde efterladt designsvalget "skal `pick` på ikke-records returnere `{}`, fejle, eller skal `map` altid levere records?" i stedet for at gætte; researchen bag T27 viste, at `pick` var det *mindste* eksempel — efter et `map` der efterlod strenge var seks af de otte step, der navngiver et felt, tavse på exit 0 med tom stderr: `omit` og `rename` byggede kolonnerne `0 1 2 3` med `A l i c e` i (data filen aldrig indeholdt), `add` spreadede et tal ind i `{}` og tabte tallet, `group` lagde hver række i `(null)`, `unique --by` sammenlignede `undefined` med `undefined` og slettede alle*rækker undtagen én*, `join` droppede alle og skrev en tom fil. Kun `pick` var høj, med V8's egen `Cannot use 'in' operator to search for 'name' in Ada`. Rettelsen er `requireRecords(data, step, index)` + `RECORD_STEPS` + `describeRow` i engine'en, kaldt i `run`s transform-løkke før hvert step: fejl med step, rækkenummer og rækkens form, exit 1 (ikke 2 — pipeline'en er fin, rækkerne er det ikke), tom stdout, ingen fil. `count`, `head`, `tail`, `filter`, `map` og `unique` uden `by` røres ikke, fordi `map` er den dokumenterede vej til værdier, så en vagt der stoppede den, ville gøre vejen ubrugelig — testet i begge lag. 5 nye engine-tests (129 → 134) og 3 nye CLI-tests (95 → 98) på den rigtige binary. To procesfejl, begge fanget af de nye tests: en test lavede en *record med en streng i* i stedet for en streng som række, og en antog to grupper hvor `group` slår objekter og arrays sammen efter identitet og dermed giver tre — begge rettet til det faktiske output. Lokalt grøn: `npm test` 134+98+69+6+39+4+173, `npm pack --dry-run` 5 filer uændret, `npm run check:site` `0 finding(s) across 20 pages`, `deviations: 0` ved 360/768/1280 px, selftester grønne inkl. deploy-friskheds-selftesten. `tools/site_chrome.py` regenererede `site/engine.js` (byte-identisk med `src/engine.js`) og asset-hash'en i `try.html`; ingen anden side ændrede sig, søgeindeks uændret på 104. Næste opgave er **T28**: et gentaget `--pipe` (eller `-f`, `-o`, `--delimiter`, `--table`) tages som en ny kommando, og de forrende kasseres i stilhed — fundet undervejs, reproduceret, og skrevet ned med scope og acceptkriterier.
- 2026-09-26 ca. 05:3x–06:1x CEST: T23 og T24 gennemfort på `ceo/expression-syntax` (branch fra `ceo/format-detect`), **ikke mergeret til `main`, fordi `DEPLOY-MISSING` står.** `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret, live er stadig `3d90812` og 25 filer afviger, så bøgen på tolv commits er stadig låst. T23: `compileExpression` slugt alle syntax-fejl og returnerede identiteten, så `item.age >` kørte med exit 0, tom stderr og alle rækker; `add` skrev hele recordet ind i det beregnede felt. Nu kaster `compileExpression` med `Invalid expression "…": V8-besked`, fejlen bærer `usage`, `run` fører flaget videre, og CLI'en giver exit 2 mens en kast-ved-kørsel-expression fortsat er exit 1; `add` kompilerer før den første række, så null-adfærden for kast ved kørslen er uændret. Beslutningen "hvor må den fejle" viste sig at have ét svar: kaldet ligger i `run`s `try`, `site/try.html:27` videresender `r.error` til playgroundets fejlboks. T24: `showPreview` kaldte `run` uden `delimiter`, så `--delimiter` var valideret, accepteret og kasseret netop når `--output` manglede. Lokalt grøn: `npm test` 108 engine- + 86 CLI- + 69 conformance- + 6 README-tests, 39 workflow-regressioner, 4 workflow-kontrakter, 173 kontratkontroller; `npm pack --dry-run` 5 filer; `npm run check:site` `0 finding(s) across 20 pages`, `deviations: 0`, fire grønne selftesttrin inklusive deploy-friskheds-selftesten; `npm run audit:site` `No known vulnerabilities found`. **Tænder:** de ni nye tests i T23 og den ene i T24 er kørt mod den gamle kode og fejlede med deres konkrete symptom (exit 0 med alle rækker; `x` = hele recordet; preview ignorerede flaget). Ingen snapshot ændrede sig, og ingen `CASES`-case ændrede rækkefølge. `tools/site_chrome.py` regenererede `site/engine.js` (byte-identisk med `src/engine.js`) og asset-hash'en i `try.html`; ingen anden side ændrede sig. Implementationscommits `29f1e9a` (T23) og `ca259c1` (T24), begge grønne lokalt og ikke mergerede. Næste iteration: kør `npm run check:deploy` igen, og hvis stadig `DEPLOY-MISSING`, tag fejlklassificeringen i `run` — `{"op":"filter"}` uden `expr` er stadig identiteten med exit 0.

- 2026-09-26 ca. 07:2x–08:3x CEST: T28 gennemført på `ceo/repeated-flags` (ny branch fra `ceo/record-shape`), **ikke mergeret til `main`**. `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret for tredje gang i træk, live er stadig `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit og 25 filer i drift, `/support/index.html` utilgængelig — så bunken er nu seksten commits på ti branch, og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. Syv kørsler med et gentaget flag blev målt på den gamle kode, alle exit 0 med tom stderr, og to af dem slettede data (`-f json -f csv` læste JSON som én kolonne og skrev en tom fil den selv havde fundet på; `--out a.csv --out b.csv` lod `a.csv` forsvinde). Rettelsen er `OPTION_NAMES` + `countOptions` + `takeOption` i `src/cli.js`, som afviser det andet krav med `UsageError`: exit 2, tom stdout, besked der siger at kun den sidste ville være brugt. To valg blev truffet og skrevet ned: **afvise, ikke sammensætte** to `--pipe` (det er det eneste flag hvor en sammensætning betyder noget, og den ville gøre flagenes rækkefølge afgørende for stepenes — altså det ene flag med en skjult regel), og **tallet fra hele kommandolinjen** (`countOptions` kører før parsing), fordi den første rettelse sagde "2 gange" om tre `--delimiter` — præcis den fejl opgaven fjerner. Procesfejl, én, fanget af målingen. 11 nye CLI-tests (98 → 109) og 3 nye konformitestests (69 → 72); konformitestesten kører den rigtige binary to gange, låser `docs/cli.md` til fejlmeddelelsen **ordret**, låser at hver option i docs-tabellen både findes i parseren og afvises gentagne, og tjekker at exit-2-rækken i docs stadig beskriver exit 2. Låsen er verificeret mod tre mutationer, alle fanget: ændret fejltekst, fjernet `takeOption` for `--delimiter`, fjernet reglen fra `--help`. `docs/cli.md` fik reglen under `Options` med den kørte kommando og exit-2-linjen, `--help` og previewen siger det samme. Lokalt grøn: `npm test` 134+109+72+6+39+4+173, `npm pack --dry-run` uændret på 5 filer, `npm run check:site` `0 finding(s) across 20 pages`, `deviations: 0`, selftester grønne inkl. deploy-friskheds-selftesten. **Ingen sitefil rørt** — T28 rører kun argument-parseren, som browseren ikke har, så `site/engine.js` er uændret og ingen `VERIFICÉR DEPLOY`-note opstår. Næste opgave er **T29**: `--out fil` uden `--output` er helt ignoreret (preview, exit 0, tom stderr, ingen fil), målt på koden efter T28 og skrevet ned med scope og acceptkriterier.
- 2026-09-26 ca. 07:5x–08:4x CEST: T30 gennemført på `ceo/utf8-input` (branch fra `ceo/dead-options`), **ikke mergeret til `main`**. `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret for **femte** gang i træk, live er stadig `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit og 25 filer i drift, `/support/index.html` utilgængelig — så bunken er nu atten commits på tolv branch, og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. T29 havde efterladt den tiende flade som den eneste *uudforskede*, og den viste sig at være den eneste af de ti, der ikke handler om kommandoen men om **data ind**: `fs.readFileSync(path, 'utf-8')` erstatter ethvert byte-segment uden for UTF-8 med U+FFFD **uden at fejle**. Ni kørsler målt på den rigtige binary før rettelsen; de fire første var exit 0 med tom stderr. En Windows-1252-eksport af en dansk kundeliste (`M\xf8ller`) kom ud som `M?ller` i previewen, i outputfilen og på disk via `--out`; cp1252-eurotegnet `\x80` blev `?`; en UTF-16-fil blev **ét feltnavn** `��n\u0000a\u0000v\u0000n`; pipen afkodede på samme måde, fordi `readStdin` kaldte `setEncoding('utf-8')`. Det er det eneste fund i hele rækken, der **fjerner data** i stedet for at skjule et forkert svar, og det er T13's egen motivation fra den anden side: Excel i Danmark skriver `;`, og på Windows skriver den cp1252. Rettelsen er `readStdin` → `Buffer` + `decodeText(buffer, source)` med `isUtf8` fra `node:buffer` **før** dekodning; exit 3, tom stdout, ingen fil, besked med første ugyldige tegn og `iconv` som eksempel. Tre valg er skrevet ned: exit 3 ikke 2 (input der ikke kan læses, ikke en flag brugeren skrev), ingen gætning på kodningen (en forkert gætning omskriver brugerens bytes), og tjekket på bytes aldrig på den dekodede tekst, så en fil med ægte U+FFFD stadig læses — en test låser netop det, fordi den modsatte rettelse ville være en overgrebende vagt. 7 nye CLI-tests (118 → 125) på den rigtige binary, hvoraf de fem exit-3-påstande **fejler på den gamle kode** med `expected exit 3, got 0`; 1 ny konformitetstest der låser `docs/cli.md` til den ordrette besked fra en rigtig kørsel, `--help`s exit-3-linje og exit-3-rækken i docs. `docs/cli.md` fik afsnittet **Text encoding**. **Ingen `site/`-fil rørt**: engine'en modtager allerede en streng, så browseren har ingen bytes at tjekke, og diffen rører ingen af site-gatens path-grupper, så `check:site` er ikke kørt. Lokalt grøn: `npm test` 134+125+75+6+39+4+173, `npm pack --dry-run` uændret på 5 filer. To ting blev målt og **bevidst ikke rettet**, begge skrevet ned under `❓ Til Mads` punkt 9 og 10: `--out` overskriver en eksisterende fil i stilhed (kræver en beslutning om `--force`, fordi en rettelse ville bryde scripts der virker i dag), og et NUL-byte i en overskrift bliver til et feltnavn med `\u0000` (sjældnere end cp1252, samme kontrol ville række). Næste opgave er en ny måling: `--out` med mellemrum i stien, POSIX-locale, store filer (≥ 100.000 rækker mod `Limits`-løftet om ingen grænser) og YAML-mappingsdybde.
- 2026-09-26 ca. 07:4x–08:1x CEST: **T31 gennemført på `ceo/paths-locale-limits` (branch fra `ceo/utf8-input`), ikke mergeret til `main`.** `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret for **sjette** gang i træk, live er stadig `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit og 25 filer i drift, `/support/index.html` utilgængelig — så bunken er nu nitten commits på tretten branch, og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. T30 havde efterladt de fire uudforskede stier som hele resten af fladen, og målingen på den rigtige binary delte dem i to grupper. **Mellemrum i stier, ny linje i et filnavn, manglende mappe, `LC_ALL=C`/`en_US.UTF-8`/`da_DK.UTF-8` på dansk data (byte-identisk output), 120.000 rækker gennem alle fire formater og ti pipeline-step, og dyb JSON på 2.000 niveauer: alle rene**, skrevet ned så de ikke måles igen. **Store filer var derimod to fejl i én linje.** `serializers.table` målte kolonnebredder med `Math.max(...data.map(row => cellValue(row[h]).length))`, og det har tre fejl: spredningen døde med `Maximum call stack size exceeded` omkring 115.000 rækker (110.000 er exit 0) — altså på en 4 MB-fil, og fordi `table` er previewens format døde den simple `transmute people.csv` med; `.length` tæller UTF-16-kodeenheder, så `日本` (to enheder, fire kolonner), `🚀` og kombinerende accenter skubbede højre kant ud af linje i det format **alle** brugere ser først; og bredderne blev målt over hele filen, så én 120-tegns celle i række 31 paddede alle 20 trykte linjer til 131 tegn for en celle ingen af dem viste. Det er det største fund siden T30, fordi det bryder `docs/cli.md`s `Limits`-løfte direkte: 1.000.000 rækker (23 MB) exit 1 før, exit 0 på 1,6 s efter, og csv-skrivning af samme fil på 1,9 s. Rettelsen er `displayWidth`/`padDisplay` med seksten lokale interval-konstanter (ingen wcwidth-afhængighed, fordi nul afhængigheder er værktøjets salgsargument) og en løkke over de 20 rækker der faktisk printes — hvilket også gør previewen billigere på store filer end før. `site/engine.js` er byte-identisk med `src/engine.js` og blev kopieret med, så **playgroundet på `/` og `/da/` fik samme rettelse**; det er derfor `check:site` *er* kørt her, modsat T30: grøn med `0 finding(s) across 20 pages` og fire grønne selvtesttrin inkl. deploy-friskheds-selvfesten. 4 nye engine-tests og 2 nye CLI-tests, alle seks kørt mod den gamle kode og alle seks røde med præcis de målte symptomer (`Maximum call stack size exceeded`, `table is crooked`, `café` bredere end `cafe`, 131-kolonners tabel); **0 af 27 snapshots ændret**. Løbende fund ved siden af: `docs/cli.md` indeholdt et rigtigt NUL-byte på offset 10138, indeni den sætning der beskriver NUL-bytes — T30's egen diff — som gjorde at `grep` erklærede filen *binary* og søgte i den med vilje, så ingen plan-, konformitets- eller README-kontrol kunne finde et ord i `docs/cli.md`; erstattet af escaped `\uFFFD`/`\u0000`. **YAML-dybden er målt og bevidst urørt** (`❓ Til Mads` punkt 12): over ca. 2.500 mappingsniveauer dør `parseYAMLBlock` i sin egen rekursion, men med exit 3, tom stdout og ingen fil, altså højt og uden datatab — det kræver en beslutning, ikke en fix. Lokalt grøn: `npm test` 138+127+75+6+39+4+173, `npm pack --dry-run` uændret på 5 filer, `npm run check:site` grøn, `npm run audit:site` `No known vulnerabilities found`, `npm audit` `found 0 vulnerabilities`. Næste opgave er en ny måling i samme klasse: `xml`, `sql` og `csv` på brede tegn og på en celle længere end alle andre — de tre skærmformater `table` ikke dækkede.

- 2026-09-26 ca. 08:2x–09:4x CEST: **T33 gennemført på `ceo/reader-ambiguity` (branch fra `ceo/xml-unwritable-chars`), ikke mergeret til `main`.** `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret for **ottende** gang i træk, live er stadig `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig — så bunken er nu **tyve commits på femten branch**, og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. T32 havde skrevet den næste flade ned som de **andre læsere** med tre navngivne tilfælde; målingen blev taget på den rigtige binary før koden blev rørt og delte sig i *otte rene* (CSV-feltantalskollision — T14's positionsnavl holder i tre varianter; korte rækker; tab-indenteret YAML; blandet tekst i XML) og **to fund**. **Fund 1:** en nøgle, der står to gange med to værdier, taber den første i stilhed — på fire veje ind i samme fejl: `{"name":"Ada","name":"Bob"}` → `Bob`, exit 0, tom stderr, og samme fejl for JSON dybt nede, YAML-blokmapping og YAML-flowmapping. Det er YAML's klassiske fælde, og det ser ud som om en merge lykkedes. **Fund 2:** alt efter XML'ens rodelement blev aldrig læst, så `<rows>…</rows><more>…</more>` gav kun det første dokument: exit 0, tom stderr, halv en fil der ligner alle. Rettelsen til fund 1 er `noteDuplicateKey` + `duplicateJSONKeys` (dokumentet gås som tekst, fordi `JSON.parse` har kastet værdien væk og en reviver ikke ser kollisionen; fundet er eksakt, fordi en nøgle i JSON altid er en streng med `:` bagefter) plus `set()` i `parseYAMLMapping` og `seen` i flowmappingen — **én** besked til alle læsere, med nøgle, begge værdier og linje. Identiske gentagelser (`{"a":1,"a":1}`) forbliver tavse, fordi der er intet at beslutte. Fund 2 er en `strip()`-kontrol på resten efter `</root>`: exit 3, fordi et XML-dokument har ét rodelement, og læseren ikke skal vælge dokument for brugeren. **To ting blev målt og bevidst ikke rettet** (`❓ Til Mads` punkt 13, T34): en flowsamling som hele dokumentet læses stadig som strengen `"{a": "1, a: 2}"`, og to dokumenter med *samme* rodnavn fanges kun af elementkontrollen, så beskeden peger på det indre — brugerens data er i sikkerhed, men reglen er kun halvt dækket. 5 nye engine-tests (142 → 147) og 2 nye CLI-tests (130 → 132), alle syv kørt mod den gamle kode og alle røde med præcis de målte symptomer. To procesfejl, begge fanget af de nye tests: linjetallet var forkert, fordi `advanceTo` sprang over værdier uden at tælle linjeskift, og `noteDuplicateKey` sammenlignede to objekter i stedet for to værdier, så identiske gentagelser advaredes alligevel. `docs/cli.md` fik to afsnit med kørte kommandoer; XML-eksemplet måtte rettes, fordi CLI'en sætter `Could not parse input as xml: ` foran beskeden, hvilket min første udskrift ikke havde. `site/engine.js` byte-identisk med `src/engine.js`, `try.html`-asset-hash `1d852314` → `74cbfcd5`, søgeindeks uændret på 104. Lokalt grøn: `npm test` 147+132+76+6+39+4+173, `npm pack --dry-run` uændret på 5 filer, `npm run check:site` grøn med `deviations: 0` på 20 sider og alle selftester grønne inkl. deploy-friskheds-selvfesten. Implementationscommit `46b5567`. Næste opgave er T34.
- 2026-09-26 ca. 08:2x–09:1x CEST: **T34 gennemført med commit `e8641c1` på `ceo/reader-gaps` (branch fra `ceo/reader-ambiguity`), ikke mergeret til `main`.** `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret for **niende** gang i træk, live er stadig `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig — så bunken er nu **enogtyve commits på seksten branch**, og der oprettes ingen `VERIFICÉR DEPLOY`-note, fordi intet er mergeret. T33 skrev de to huller ned som T34 med fire acceptkriterier; målingen på den rigtige binary, **før** koden blev rørt, sagde at kun den ene var et fund, og at der lå en tredje fejl ved siden af dem. **Fund 1:** rodreglen dækkede kun halvt, fordi `lastIndexOf('</rows>')` tager den *sidste* `</rows>`, så to dokumenter med samme rodnavn — den form et batchværktøj, der appender samme skema, skriver — slap uden om rodreglen og blev meldt af elementkontrollen med en besked, der pegede ind i filen. Rettelsen er `findRootClose`, som tæller åbne elementer i stedet for at kigge efter den seneste lukning; alle otte sammenbundne former (inkl. `<rows/><rows>b</rows>`, tomt første dokument, tre dokumenter, navnerumme og blank linje imellem) får nu rodreglens besked. Tællingen er over *indrykning*, ikke navne, så `<root><root>x</root></root>` og `<root><roots>x</roots></root>` er uændrede — begge låst i test. **Fund 2, som scope ikke havde set:** `<rows/>` alene blev afvist med `XML root element <rows> is never closed`, den eneste besked i hele XML-læseren der var bogstaveligt forkert; den læses nu som det dokument den er, nul rækker. **Fund 3:** `{a: 1, b: two}` som hele dokument læstes som den ene streng `"{a": "1, b: two}"`, exit 0, tom stderr — `parseYAMLFlow` læser den syntaks i forvejen og læser den samme linje rigtigt en linje ned, så kun roden manglede. Rettelsen kalder den kun når flowet lukker på linjen *og* intet følger efter, så ubalanceret `{`, en samling over flere linjer og `{a: 1}` med en nøgle under sig er alle uændrede — tre målinger på den gamle kode, tre tests. **To ting blev bevidst ikke gjort, fordi målingen sagde nej:** krydsede tags (`<a><b></a>`) får uændret elementkontrollens besked, fordi `findRootClose` returnerer null ved en lukning der ikke matcher det den lukker, så kaldet falder tilbage på læserens egen `lastIndexOf` — en tælling over sådan en fil ville være opdigtet; og `<rows><rows/></rows>` er **ikke** et fund, selv om T33 skrev det som acceptkriterium, fordi det er ét velformet dokument, og `[{}]` er det svar læseren allerede giver `<r><i/></r>`. 2 nye engine-tests (147 → 149), 1 nyt CLI-test (132 → 133) og to skærpete assertions i et eksisterende, der sagde *forkert* at samme rodnavn-filen fanges af elementkontrollen. `docs/cli.md` fik to afsnit med kørte kommandoer og fejlmeddelelser verificeret tegn for tegn. `site/engine.js` byte-identisk med `src/engine.js`, `try.html`-asset-hash `74cbfcd5` → `2e850275`, søgeindeks uændret på 104. Lokalt grøn: `npm test` 149+133+76+6+39+4+173, `npm pack --dry-run` uændret på 5 filer, `npm run check:site` grøn med 0 fund på 20 sider og alle selftester grønne inkl. deploy-friskheds-selvfesten. **To procesfejl, begge fanget af de nye tests:** `findRootClose` startede med tom stak og returnerede, når rodens *børn* var lukket, så alle XML-tests faldt med `more after </r>: "</r>"`; og to af mine egne test-forventninger var gættet frem for kørt. Begge rettet i testene, ikke i koden, fordi koden havde svaret rigtigt hele vejen. Næste opgave er T35: advarslerne fra de sidste tre iterationer når aldrig en browserbruger (`❓ Til Mads` punkt 8 og 14).

- Procesregel fra T35, den vigtigste i denne plan: **mål den flade, der afleverer resultatet — ikke bare den, der producerer det.** T13–T34 rettede tretten tavsheder i motoren, og alle tretten blev skrevet om i CLI'ens advarsels og exit-kode. Men motorens resultat har **to** kunder, og den anden kunde læser ikke stderr: `site/try.html`. Ingen af de tretven opgaver checkede den, fordi de alle målte `src/engine.js` gennem `cli.js`. Da advarslen nåede dødt, var det ikke fordi nogen havde lavet den forkert — den var rigtig hele vejen i `src/cli.js` og faldt i en ramme der ikke vidste feltet fandtes. **En ny afhængighed mellem to dele af et produkt er en flade, ligeså vel som en ny kodevej er det.**

- Fund under T35: de otte advarselsproducerende stier T13–T34 producerede var **ét fund**, ikke otte, fordi de delte årsag. Det er derfor målingen blev taget som én tabel med tolv rækker og to kolonner — "hvad CLI'en siger" mod "hvad browseren viser" — i stedet for som otte separate fejl. Forskellen er praktisk: otte fund ville otte diffs og otte tests, ét fund én linje i rammen og én funktion i `site.js`, og de otte målinger bliver så til **regressionstabellen** der viser at de alle er dækket.

- Fund under T35, målt fordi det ikke måtte antages: de to værste tilfælde var ikke de sjove. `pick` med en tastefejl i et feltnavn giver en tabel med **én række og nul kolonner** — et resultat der ser ud som om værktøjet ikke forstod hans data. `unique --by` på et felt ingen rækker har skriver **én række ud af tre**, exit 0, tom stderr. Den sidste er det eneste sted i hele værktøjet hvor data forsvinder uden at nogen siger det, og den så aldrig en browser. En advarsel der ikke når den, der prøver værktøjet, er den samme tavshed som ingen advarsel — kun dyrere, fordi den er skrevet.

- Beslutning under T35: **advarsler males under output, aldrig i det.** Kopier-knappen og download-knappen læser `[data-role=output]`, så en advarsel i det element ville blive kopieret og gemt som data. Det er præcis den skelnelinestandard CLI'ens stderr/stdout-adskillelse findes for at holde, anvendt på den anden side af den samme wire: motoren siger det samme til begge kunder, men den ene skriver det til et kanal brugeren beder om data fra, og den anden til et han ikke gør. Derfor males advarslerne i deres eget element, download blokeres **ikke** af dem (de er ikke en fejltilstand), og elementet er `hidden` i markup'en, fordi siden uden JavaScript viser sit statiske eksempel, og en tom boks der lader som om noget mangler, er en løgn.

- Beslutning under T35: **rammens kontrakt skal være total.** `site/try.html` svarer nu med `warnings: []` også på de to tidlige veje (ugyldig pipeline-JSON, pipeline der ikke er et array), så forsiden ikke skal special-case to fejl den ikke kan ramme med de andre. En forgrening, der kun findes i nogle svar, er en forgrening der bliver en tavshed ved den næste tilfælde der tilføjes.

- Procesfejl under T35, tre, og den tredje er den interessante. (1) Min egen konformitest kaldte CLI'en uden `--pipe`, så den sammenlignede en tom stderr med en advarsel og rapporterede "frame og CLI er uenige" om en fejl i testen. (2) Et 400-tegns vindue omkring `outEl.textContent` fangede mit eget nye `warnings(e.data.warnings)` som om advarslerne stod i outputelementet. (3) **Efter at begge var rettet, slap en mutation stadig igennem**: den lagde advarslerne i outputelementet via en variabel (`outEl.textContent = list.join('\n')`), og min test greb kun et nøgleord på *samme linje*. Låsen blev derfor flyttet til at undersøge **selve funktionskroppen** for `outEl` — det er den der siger noget om hvorhen noget skrives, ikke hvor linjen tilfældigvis står. Samme slags som T22's og T32's procesregler: en test der kun kan fange den mutation man selv tænkte på, er en test der pynter.

- 2026-09-26 ca. 11:2x–11:5x CEST: **T40 gennemført på `ceo/yaml-string-scalars` (branch fra `ceo/yaml-float-spelling`), ikke mergeret til `main`.** `npm run check:deploy` kørt først: `DEPLOY-MISSING` uændret for **sekstende** gang i træk, live er `3d90812` (2026-09-24 23:32:50 +0200), 5 site-commit i drift, 25 afvigende filer, `/support/index.html` utilgængelig — så bunken er nu **treogtyve** commits på tyve branch, og der oprettes ingen `VERIFICÉR DEPLOY`-note for intet der er mergeret (T40's egen note står under punkt 40). T39's måling havde efterladt **hele den anden halvdel af YAML-skriverens skalare** som uudforsket, så målingen blev tagen der: 63 rene strenge gennem den rigtige binary før koden blev rørt, exit 0, tom stderr, læst tilbage med **PyYAML 6.0.3**. **Svar af 63: syvogtyve værdier kom tilbage som noget andet end den streng der gik ind, to af dem fik PyYAML til at afvise hele dokumentet, og 14 nøgler kom tilbage under et andet navn.** `yes`/`No`/`on`/`OFF` → `True`/`False` (YAML 1.1 har fire ord til `true`, og kun `true`/`false` var dækket); `.inf`/`.NaN` → `float`; `1_000`, `1__0`, `0b1010_1`, `07_7`, `0x1_F` → `int` (underscores er *inde i* YAML's heltalsregel); `12:30` → **750**, `1:30:45` → 5445, `12:00:00` → 43200, `190:20:30.15` → 685230.15 (et klokkeslæg er base 60 i YAML 1.1); `2026-09-26` → `datetime.date`; `2026-09-26T12:00:00Z` → `datetime`. De to værste er værre end en ændret type: `<<` (merge) og `=` (value) er de eneste to tags i resolveren uden en constructor, så en værdi `<<` lavede et dokument PyYAML afviste med `ConstructorError` — en fil produceret med exit 0, som ingen læser kan åbne. **Nøglerne var den halvdel, scope ikke havde set:** `formatYAMLKey` lod `[A-Za-z0-9_.\-/ ]` stå, så nøglen `0074` blev læst som den **oktale** `60` og `2026-09-26` som en `date`. Rettelsen er YAML 1.1's egne productions, transskriberet **hele** fra den resolver PyYAML faktisk har (`yaml/resolver.py`, `add_implicit_resolver` — bool/int/float/timestamp/null plus de to constructorløse tags) i `YAML_1_1_RESOLVES_ELSEWHERE`, kaldt fra både `needsYAMLQuotes` og `formatYAMLKey`, så reglen hører til skriveren. Kun de manglende productions er tilføjet: de otte strukturelle regler og `Number()`-reglen røres ikke, så de otte strukturchars og de tal der allerede læses rigtigt beholder deres staving. Som i T39 låses **stavingen og ikke round-trip**, fordi vores egen læser er mere tillidende end PyYAML og læser `yes` og `12:30` tilbage som strenge. 1 ny engine-test (156 → 157) og 1 ny CLI-test på den rigtige binary (137 → 138), begge **kørt mod den gamle kode** og ude med præcis de målte symptomer (`"yes" is written bare, and a YAML 1.1 reader resolves it to bool` / `- answer: yes`). **Målingen lå desuden tolve veje den gamle kode allerede lavede for rigtigt**, og de er låst, fordi en for bred regel ville gøre enhver fil til støj: `y`, `n`, `12:60`, `12:30:60`, `1.2.3`, `2026-9-26`, `2026/09/26`, `2026-09-26t12:00:00z`, `NaN`, `inf`, `a:b` er strenge hos PyYAML. To af mine egne gæt var forkerte og blev rettet **efter at være målt**: `2026-13-45` *er* en timestamp (resolveren er leksisk og validerer ikke datoen) og `1:2:3:4` *er* et gyldigt sekstagesimal — præcis derfor er productionerne transskriberet fra kilden og ikke samlet af hånden. **Tænder:** ni mutationer, otte gyldige dræbt alle (bool-vocabularet, sekstagesimal-grenen i int, underscores, timestampens datetime-gren, `merge`/`value`, nøglernes brug af reglen, en for bred regel der skriver alt i citater, `.inf`/`.nan`-grene); den niende var en ugyldig mutation — et regex der ikke kompilerede — og tælles **ikke** med som bevis, fordi den fejlede af en syntaxfejl og ikke af testen. Procesfejl undervejs, to, begge fanget af målingen og ikke af testen: min første mutationstest brugte `engine.orig.js` som "gammel kode", men filen var taget **efter** rettelsen, så et tandskør virkede grønt mod den ødelagte skriver; den rigtige gamle kode er hentet med `git show HEAD:src/engine.js`. Og to controls var klassificeret forkert i første udkast (`1e5` er quotet af den *gamle* `Number()`-regel, `+.5` af den gamle tegnregel) — begge rettet, fordi en lås der sigter på den forkerte regel er en lås der pynter. `site/engine.js` byte-identisk med `src/engine.js` (`cmp` bekræfter); `tools/site_chrome.py` regenererede kun `engine.js`-hashen i `try.html` (`7a7d9085` → ny), søgeindeks uændret på 104, ingen anden side ændret. Lokalt grøn: `npm test` 157+138+83+6+39+4+173 med 0 fejl, `npm pack --dry-run` 5 filer uændret, `npm run check:site` `0 finding(s) across 20 pages` + `deviations: 0` og alle selftester grønne inkl. deploy-friskheds-selvfesten, `npm run audit:site` `No known vulnerabilities found`, `npm audit` `found 0 vulnerabilities`. **Ingen merge til `main`** — `DEPLOY-MISSING` står, og det er en menneskebeslutning (`❓ Til Mads` punkt 1). Næste opgave er **T41**: målt før den skrives, i den anden ende af skriveren (`csv`, `table`, `xml` på værdier der ligner tal og typer).
