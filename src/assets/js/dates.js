// Month/weekday names and date formatting for bs/en/de. Kept here instead of
// relying on Intl, because some browsers ship without Bosnian locale data.

const NAMES = {
  bs: {
    months: ["januar", "februar", "mart", "april", "maj", "juni", "juli", "august", "septembar", "oktobar", "novembar", "decembar"],
    monthsShort: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
    days: ["pon", "uto", "sri", "čet", "pet", "sub", "ned"],
    daysLong: ["ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota", "nedjelja"],
  },
  en: {
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    daysLong: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  },
  de: {
    months: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    monthsShort: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."],
    days: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
    daysLong: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
  },
};

export function dateNames(lang) {
  return NAMES[lang] || NAMES.bs;
}

const parts = (iso) => iso.split("-").map(Number);
const weekday = (y, m, d) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;

export function formatMonth(lang, y, m) {
  return `${dateNames(lang).months[m - 1]} ${y}`;
}

/** Short date, e.g. "3. nov 2026" / "3 Nov 2026" / "3. Nov. 2026". */
export function formatShort(lang, iso) {
  const [y, m, d] = parts(iso);
  const mon = dateNames(lang).monthsShort[m - 1];
  return lang === "en" ? `${d} ${mon} ${y}` : `${d}. ${mon} ${y}`;
}

/** Long date for screen readers, e.g. "ponedjeljak, 3. novembar 2026". */
export function formatLong(lang, iso) {
  const [y, m, d] = parts(iso);
  const n = dateNames(lang);
  const day = n.daysLong[weekday(y, m, d)];
  return lang === "en" ? `${day}, ${d} ${n.months[m - 1]} ${y}` : `${day}, ${d}. ${n.months[m - 1]} ${y}`;
}
