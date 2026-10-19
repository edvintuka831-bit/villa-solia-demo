# Villa Solia Blagaj – DEMO

Demo web stranica za Villa Solia Blagaj (WebCraft Design). Koristi isključivo testne podatke. Nije povezana s produkcijskim servisima, ne šalje emailove i ne mijenja postojeću stranicu villasolia-blagaj.com.

## Funkcije

| # | Funkcija | Gdje |
|---|----------|------|
| 1 | Kalendar dostupnosti (slobodno, zauzeto, dan smjene, vaš odabir), swipe između mjeseci na mobitelu | `/bs/#booking` |
| 2 | Obrazac za upit: dolazak, odlazak, broj gostiju, ime, email, telefon (+ opcionalna poruka). Validacija u pregledniku i na serveru, honeypot zaštita od spama | `/bs/#booking` |
| 3 | Demo admin: lista upita s filterima, potvrdi / odbij / obriši, ručno blokiranje termina preko kalendara, reset testnih podataka | `/admin/` (lozinka `demo1234`) |
| 4 | Tri jezika: bosanski, engleski, njemački. Svaki ima svoj URL (`/bs/`, `/en/`, `/de/`), preklopnik jezika je u meniju, a `/` preusmjerava prema jeziku preglednika | |
| 5 | SEO osnove i mobilni prikaz: title/description po jeziku, `hreflang` + `x-default`, canonical, Open Graph, JSON-LD `LodgingBusiness`, `sitemap.xml`, `robots.txt`, semantički HTML, alt tekstovi, iPhone safe-area, polja od 16px (bez zumiranja), fiksno dugme „Pošalji upit” | |

Pravila rezervacije (u `src/lib/booking.js`): najmanje 2, najviše 30 noćenja, do 8 gostiju. Boravak zauzima noći od dolaska do odlaska, pa dan odlaska može biti dan dolaska sljedećeg gosta. Datume blokiraju samo **ručni blokovi** i **potvrđeni** upiti. Novi i odbijeni upiti ne blokiraju.

> **Samo za DEMO:** sve stranice imaju `noindex`, a `robots.txt` zabranjuje indeksiranje, da demo nikad ne konkuriše pravoj stranici na Googleu. Prije produkcije to treba ukloniti.

## Pokretanje lokalno

Potreban je Node.js 20+.

```bash
npm install
npm start          # build + server na http://localhost:5173
```

Server ispiše lokalnu i LAN adresu. Upiti i blokovi se spremaju u `data/db.json`, koji se automatski napravi iz testnih podataka. `npm run reset-data` vraća testne podatke, kao i dugme „Resetuj testne podatke” u adminu.

## Kako vidjeti demo na iPhoneu

**Opcija A – ista Wi-Fi mreža (puni demo, uključujući zajednički admin):**
1. Na računaru pokrenite `npm start`.
2. U terminalu pronađite red `iPhone/LAN: http://192.168.x.x:5173/`.
3. Otvorite tu adresu u Safariju na iPhoneu koji je na **istoj Wi-Fi mreži**.
4. Admin je na `http://192.168.x.x:5173/admin/`. Upit poslan s iPhonea odmah se vidi u adminu na računaru.
5. Ako se stranica ne otvori, dozvolite dolazne veze za Node.js u firewallu. Na Macu: System Settings → Network → Firewall.

**Opcija B – javni testni link bez vlastitog servera (npr. da pošaljete vlasniku):**
1. Pokrenite `npm run build` (opcionalno `SITE_URL=https://vasa-adresa npm run build` za ispravne canonical/OG linkove).
2. Prevucite folder `dist/` na <https://app.netlify.com/drop> (ili koristite GitHub Pages / Cloudflare Pages).
3. Dobijeni link otvorite na iPhoneu.
   Bez Node servera stranica sama prelazi u **lokalni način**: kalendar, obrazac i admin rade, ali se podaci čuvaju samo u tom pregledniku (localStorage). Na stranici je vidljiva napomena o tome.

Savjet: u Safariju Share → „Add to Home Screen” daje ikonu demoa na početnom ekranu.

## Provjere

```bash
npm run check   # build + ESLint + HTML validacija + unit testovi + testovi u pregledniku
```

- `npm test`: unit testovi za logiku rezervacija, store podataka, build/prijevode i API servera (uključujući sigurnosne headere i path traversal)
- `npm run test:e2e`: Playwright/Chromium na emuliranom iPhoneu 13 (390×844, touch). Pokriva sva 3 jezika, odsustvo horizontalnog skrolanja, meni, promjenu jezika, cijeli tok upit → admin → potvrda → kalendar zauzet, ručno blokiranje, desktop prikaz i statički (fallback) način. Screenshotovi idu u `screenshots/`. Ako Chromium nije na standardnoj Playwright lokaciji, postavite `CHROMIUM_PATH=/putanja/do/chromiuma`.

## Struktura

```
server.mjs                Demo server (bez runtime zavisnosti): statički fajlovi + JSON API
scripts/build.mjs         Renderuje template u dist/{bs,en,de}/ + sitemap/robots
src/templates/            HTML template s {{ključevima}} za prijevode
src/i18n/{bs,en,de}.json  Svi tekstovi stranice (build provjerava da se ključevi poklapaju)
src/lib/                  Zajednička logika (preglednik + server): validacija, dostupnost, store
src/assets/js/            app.js (stranica), calendar.js, admin.js, api.js (server ili localStorage)
src/assets/css/           styles.css (vizuelni identitet u :root tokenima), admin.css
src/assets/img/           Vlastite privremene ilustracije (SVG), bez fotografija s prave stranice
src/admin/                Demo admin stranica
tests/                    unit/ i e2e/
```

## Vizuelni identitet i šta nedostaje

- **Referentnu stranicu nije bilo moguće analizirati.** U vrijeme izrade `villasolia-blagaj.com` se nije razrješavala u DNS-u, a mrežna politika razvojnog okruženja ju je i blokirala. Boje, fontovi i raspored su zato neutralna hercegovačka „sunce i kamen” šema. Sve boje i fontovi su na jednom mjestu (`:root` u `src/assets/css/styles.css`), pa se pravi identitet može primijeniti za nekoliko minuta kad stignu boje ili kad stranica postane dostupna.
- **Fotografije i logo:** nisu preuzete zaštićene fotografije ni logo. Sve slike su vlastite privremene SVG ilustracije označene „DEMO · PLACEHOLDER”. Logo je generički znak sunca + tekst „Villa Solia”. Za zamjenu stavite fotografije u `src/assets/img/` i promijenite `src` u `src/templates/index.html`.
- **Podaci o vili** (broj gostiju i soba, sadržaji, udaljenosti, kontakt) su primjeri i na stranici su tako označeni. Treba ih potvrditi s vlasnikom.
- **Admin autentikacija** je demo lozinka, ne prava zaštita. Za produkciju treba prava prijava (sesije, HTTPS, hashirane lozinke), baza podataka, email obavijesti, GDPR tekst i eventualno sinhronizacija s Booking.com/Airbnb (iCal).
