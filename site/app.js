// app.js (browser) — tolerant field mapping for latest.json
(() => {
  const els = {
    country: document.getElementById('country'),
    commodity: document.getElementById('commodity'),
    latest: document.getElementById('latest'),
    inr: document.getElementById('inr'),
    source: document.getElementById('source'),
    canvas: document.getElementById('chart'),
  };

  let DATA = [];
  let chart;
  const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

  function ensureChart() {
    if (chart) return chart;
    if (!window.Chart) { console.error('Chart.js not loaded'); return null; }
    chart = new Chart(els.canvas.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Price per kg', data: [], tension: 0.25, pointRadius: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
        scales: { x: { ticks: { autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: false } }
      }
    });
    return chart;
  }

  const uniqSorted = (arr) => [...new Set(arr.filter(v => v != null && v !== ''))]
    .sort((a,b)=> String(a).localeCompare(String(b)));

  function populateSelect(el, values, allLabel) {
    el.innerHTML = '';
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = allLabel;
    el.appendChild(o0);
    values.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      el.appendChild(o);
    });
  }

  // ---- Tolerant field mapping + parsing ----
  function pick(obj, keys, fallback='') {
    for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k];
    return fallback;
  }

  function parseDateLoose(x) {
    if (!x) return null;
    // Accept Date, ISO, YYYY/MM/DD, DD/MM/YYYY
    if (x instanceof Date) return isNaN(x) ? null : x;
    let s = String(x).trim();

    // If DD/MM/YYYY, flip to YYYY-MM-DD
    const mDMY = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/;
    if (mDMY.test(s)) {
      const [, dd, mm, yyyy] = s.match(mDMY);
      s = `${yyyy}-${mm}-${dd}`;
    } else {
      // Standardize slashes to hyphens
      s = s.replace(/\//g, '-');
    }

    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function parseNumberLoose(x) {
    if (x == null || x === '') return null;
    if (typeof x === 'number') return Number.isFinite(x) ? x : null;
    const v = Number(String(x).replace(/[, ]+/g, ''));
    return Number.isFinite(v) ? v : null;
  }

  function normalizeRow(r) {
    if (!r || typeof r !== 'object') return null;

    const date   = pick(r, ['date','obs_date','period','dt']);
    const country= pick(r, ['country','Country']);
    const comm   = pick(r, ['commodity','metric','item','series','product','category']);
    const value  = pick(r, ['value','price','amount','val']);
    const unit   = pick(r, ['unit','uom','units']);
    const source = pick(r, ['source','src']);

    const d = parseDateLoose(date);
    const v = parseNumberLoose(value);
    if (!d || !country || !comm || v == null) return null;

    return {
      date: d,
      country: String(country).trim(),
      commodity: String(comm).trim(),
      value: v,
      unit: unit ? String(unit).trim() : '',
      source: source ? String(source).trim() : ''
    };
  }
  // ------------------------------------------

  function refresh() {
    const selCountry = els.country.value;
    const selCommodity = els.commodity.value;

    let rows = DATA;
    if (selCountry) rows = rows.filter(r => r.country === selCountry);
    if (selCommodity) rows = rows.filter(r => r.commodity === selCommodity);

    rows = rows.sort((a,b)=> a.date - b.date);

    const c = ensureChart();
    if (c) {
      c.data.labels = rows.map(r => r.date.toISOString().slice(0,10));
      c.data.datasets[0].data = rows.map(r => r.value);
      c.update();
    }

    if (!rows.length) {
      els.latest.textContent = '—';
      els.inr.textContent = '—';
      els.source.textContent = '—';
      return;
    }
    const last = rows[rows.length - 1];
    els.latest.textContent = nf.format(last.value) + (last.unit ? ` ${last.unit}` : '');
    els.inr.textContent = '—'; // leave unless you actually compute INR
    els.source.textContent = last.source || '—';
  }

  async function boot() {
    try {
      const res = await fetch('data/latest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load data/latest.json (${res.status})`);
      const raw = await res.json();

      if (!Array.isArray(raw)) throw new Error('latest.json must be a JSON array (not NDJSON).');

      const before = raw.length;
      DATA = raw.map(normalizeRow).filter(Boolean);
      console.log(`[agri] loaded rows: ${before}, valid after normalize: ${DATA.length}`);
      if (DATA.length === 0) {
        console.log('[agri] example keys of first row:', raw[0] ? Object.keys(raw[0]) : '(none)');
      }

      const countries = uniqSorted(DATA.map(r => r.country));
      const commodities = uniqSorted(DATA.map(r => r.commodity));
      populateSelect(els.country, countries, 'All countries');
      populateSelect(els.commodity, commodities, 'All metrics');

      ['change','input'].forEach(ev => {
        els.country.addEventListener(ev, refresh);
        els.commodity.addEventListener(ev, refresh);
      });

      refresh();
    } catch (e) {
      console.error(e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
