// Availability calendar (Monday-first month grids) with range selection.
// Used on the public site (pick arrival/departure) and in the demo admin
// (pick a range to block). Works with nights: a booked night on date D means
// the stay covers D → D+1, so D+1 can still be an arrival or departure day.

import { addDays, eachNight, todayIso } from "../lib/booking.js";
import { dateNames, formatLong, formatMonth } from "./dates.js";

const MOBILE = "(max-width: 640px)";

export class AvailabilityCalendar {
  constructor(root, { locale, labels, onChange, maxMonthsAhead = 18, allowPast = false }) {
    this.root = root;
    this.locale = locale;
    this.labels = labels;
    this.onChange = onChange || (() => {});
    this.allowPast = allowPast;
    this.today = todayIso();
    this.booked = new Set();
    this.start = null;
    this.end = null;
    const [y, m] = this.today.split("-").map(Number);
    this.firstMonth = { y, m };
    this.view = { y, m };
    this.maxMonthsAhead = maxMonthsAhead;
    this.monthsEl = root.querySelector(".calendar-months");
    this.rangeEl = root.querySelector(".calendar-range");
    this.prevBtn = root.querySelector('[data-cal="prev"]');
    this.nextBtn = root.querySelector('[data-cal="next"]');
    this.mq = window.matchMedia(MOBILE);

    this.prevBtn.addEventListener("click", () => this.shift(-1));
    this.nextBtn.addEventListener("click", () => this.shift(1));
    this.mq.addEventListener("change", () => this.render());
    this.monthsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-date]");
      if (btn && !btn.disabled) this.pick(btn.dataset.date);
    });
    this.bindSwipe();
  }

  get visibleMonths() {
    return this.mq.matches ? 1 : 2;
  }

  setBooked(ranges) {
    this.booked = new Set(ranges.flatMap((r) => eachNight(r.start, r.end)));
    this.render();
  }

  setSelection(start, end, { silent = false } = {}) {
    this.start = start || null;
    this.end = end || null;
    if (this.start) this.goTo(this.start);
    else this.render();
    if (!silent) this.onChange({ start: this.start, end: this.end });
  }

  goTo(iso) {
    const [y, m] = iso.split("-").map(Number);
    const idx = this.monthIndex({ y, m });
    const current = this.monthIndex(this.view);
    if (idx < current || idx >= current + this.visibleMonths) {
      this.view = this.monthFromIndex(Math.max(0, Math.min(idx, this.maxMonthsAhead)));
    }
    this.render();
  }

  monthIndex({ y, m }) {
    return (y - this.firstMonth.y) * 12 + (m - this.firstMonth.m);
  }

  monthFromIndex(i) {
    const total = this.firstMonth.m - 1 + i;
    return { y: this.firstMonth.y + Math.floor(total / 12), m: (total % 12) + 1 };
  }

  shift(delta) {
    const idx = this.monthIndex(this.view) + delta * this.visibleMonths;
    const clamped = Math.max(0, Math.min(idx, this.maxMonthsAhead));
    this.view = this.monthFromIndex(clamped);
    this.render();
  }

  isFreeRange(start, end) {
    return eachNight(start, end).every((n) => !this.booked.has(n));
  }

  pick(date) {
    if (!this.start || this.end || date <= this.start) {
      this.start = date;
      this.end = null;
    } else if (this.isFreeRange(this.start, date)) {
      this.end = date;
    } else {
      this.start = this.booked.has(date) ? null : date;
      this.end = null;
    }
    this.render();
    this.onChange({ start: this.start, end: this.end });
  }

  dayState(date) {
    const past = !this.allowPast && date < this.today;
    const booked = this.booked.has(date);
    const turnover = !booked && this.booked.has(addDays(date, -1));
    const choosingEnd = this.start && !this.end;
    // A booked night can still be a departure day if every night before it is free.
    const validEnd = choosingEnd && date > this.start && this.isFreeRange(this.start, date);
    const disabled = past || (booked && !validEnd);
    return { past, booked, turnover, disabled };
  }

  render() {
    const count = this.visibleMonths;
    const idx = this.monthIndex(this.view);
    this.prevBtn.disabled = idx <= 0;
    this.nextBtn.disabled = idx + count > this.maxMonthsAhead;

    const months = Array.from({ length: count }, (_, i) => this.monthFromIndex(idx + i));
    const label = (mo) => formatMonth(this.locale, mo.y, mo.m);
    this.rangeEl.textContent = months.map(label).join(" – ");
    this.monthsEl.replaceChildren(...months.map((mo) => this.renderMonth(mo, label(mo))));
  }

  renderMonth({ y, m }, title) {
    const wrap = document.createElement("div");
    wrap.className = "month";
    const h = document.createElement("h4");
    h.textContent = title;
    const grid = document.createElement("div");
    grid.className = "month-grid";

    for (const name of dateNames(this.locale).days) {
      const d = document.createElement("span");
      d.className = "dow";
      d.setAttribute("aria-hidden", "true");
      d.textContent = name;
      grid.append(d);
    }

    const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    for (let i = 0; i < firstDow; i++) {
      const e = document.createElement("span");
      e.className = "day-empty";
      grid.append(e);
    }

    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const s = this.dayState(iso);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day";
      btn.dataset.date = iso;
      btn.textContent = String(d);
      if (s.past) btn.classList.add("past");
      else if (s.booked) btn.classList.add("booked");
      else if (s.turnover) btn.classList.add("turnover");
      if (iso === this.today) btn.classList.add("today");
      if (iso === this.start) btn.classList.add("range-start");
      if (iso === this.end) btn.classList.add("range-end");
      if (this.start && this.end && iso > this.start && iso < this.end) btn.classList.add("in-range");
      btn.disabled = s.disabled;
      const selected = iso === this.start || iso === this.end;
      btn.setAttribute("aria-pressed", String(selected));
      const status = s.booked ? this.labels.booked : this.labels.free;
      btn.setAttribute("aria-label", `${formatLong(this.locale, iso)}, ${s.past ? "" : status}`.replace(/, $/, ""));
      grid.append(btn);
    }

    wrap.append(h, grid);
    return wrap;
  }

  bindSwipe() {
    let x0 = null;
    let y0 = null;
    this.monthsEl.addEventListener(
      "touchstart",
      (e) => {
        x0 = e.touches[0].clientX;
        y0 = e.touches[0].clientY;
      },
      { passive: true },
    );
    this.monthsEl.addEventListener(
      "touchend",
      (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        const dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) this.shift(dx < 0 ? 1 : -1);
      },
      { passive: true },
    );
  }
}
