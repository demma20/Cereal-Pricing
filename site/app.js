// app.js (browser)
// Expects data/latest.json = [ { date, country, source, metric, unit, value }, ... ]

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
    const ctx = els.canvas.getContext('2d');
    chart = new Chart(ctx, {
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

  function uniqSorted(arr) {
    return [...new Set(arr.filter(v => v != null && v !== ''))]
      .sort((a,b)=> String(a).localeCompare(String(b)));
  }

  function populateSelect(el, values, allLabel) {
    el.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = allLabel;
    el.appendChild(optAll);
    values.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      el.appendChild(o);
    });
  }

  function normalizeRow(r) {
    // required fields: date, country, source, metric (commodity), unit, value
    if (!r) return null;
    const { date, country, source, metric, unit, value } = r;
    if (!date || !country || !metric || value == null) return null;

    const d = new Date(date);
    if (isNaN(d)) return null;

    const v = typeof value === 'string' ? Number(value.replace(/[, ]+/g, '')) : Number(value);
    if (!Number.isFinite(v)) return null;

    return {
      date: d,
      country: String(country).trim(),
      commodity: String(metric).trim(),   // metric == commodity
      unit: unit ? String(unit).trim() : '',
      source: source ? String(source).trim() : '',
      value: v
    };
  }

  function refresh() {
    const selCountry = els.country.value;
    const selCommodity = els.commodity.value;

    let rows = DATA;
    if (selCountry) rows = rows.filter(r => r.country === selCountry);
    if (selCommodity) rows = rows.filter(r => r.commodity === selCommodity);

    rows = rows.filter(r => r.date instanceof Date && !isNaN(r.date))
               .sort((a,b)=> a.date - b.date);

    const c = ensureChart();
    if (c) {
      c.data.labels = rows.map(r => r.date.toISOString().slice(0,10));
      c.data.datasets[0].data = rows.map(r => r.value);
      c.update();
    }

    // KPIs
    if (!rows.length) {
      els.latest.textContent = '—';
      els.inr.textContent = '—';   // only show INR if your data has it; else leave em-dash
      els.source.textContent = '—';
      return;
    }
    const last = rows[rows.length - 1];
    els.latest.textContent = nf.format(last.value) + (last.unit ? ` ${last.unit}` : '');
    els.inr.textContent = '—'; // no INR column in this schema; remove or repurpose if needed
    els.source.textContent = last.source || '—';
  }

  async function boot() {
    try {
      const res = await fetch('data/latest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load data/latest.json (${res.status})`);
      const raw = await res.json();
      if (!Array.isArray(raw) || !raw.length) throw new Error('latest.json is empty or not an array');

      DATA = raw.map(normalizeRow).filter(Boolean);
      if (!DATA.length) {
        console.error('No valid rows after normalization. Check keys/values in latest.json');
        return;
      }

      // Build filters
      const countries = uniqSorted(DATA.map(r => r.country));
      const commodities = uniqSorted(DATA.map(r => r.commodity));
      populateSelect(els.country, countries, 'All countries');
      populateSelect(els.commodity, commodities, 'All commodities');

      // Handlers
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
