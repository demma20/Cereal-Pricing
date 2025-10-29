// app.js
(() => {
  const els = {
    view: document.getElementById('view'),
    country: document.getElementById('country'),
    commodity: document.getElementById('commodity'),
    latest: document.getElementById('latest'),
    inr: document.getElementById('inr'),
    source: document.getElementById('source'),
    canvas: document.getElementById('chart'),
  };

  let RAW = [];
  let chart;

  // ---- tiny helpers ---------------------------------------------------------
  const firstKey = (obj, keys) => keys.find(k => k in obj);
  const val = (row, keys, fallback=null) => {
    const k = firstKey(row, keys);
    return k ? row[k] : fallback;
  };
  const parseDate = (d) => (d instanceof Date ? d : new Date(d));
  const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

  // pick canonical field names by sniffing the first row
  function canonicalize(row) {
    return {
      country: val(row, ['country', 'Country']),
      commodity: val(row, ['commodity', 'item', 'Commodity']),
      date: parseDate(val(row, ['date', 'Date'])),
      price: Number(val(row, ['price_per_kg','price','usd_per_kg','value','Price'], NaN)),
      inr: Number(val(row, ['inr_per_kg','inr','inr_price'], NaN)),
      source: val(row, ['source','market','Market','Source'], ''),
    };
  }

  function uniqSorted(arr) {
    return [...new Set(arr.filter(Boolean))].sort((a,b)=> String(a).localeCompare(String(b)));
  }

  function populateSelect(selectEl, values, allLabel) {
    selectEl.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = allLabel;
    selectEl.appendChild(optAll);
    values.forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      selectEl.appendChild(o);
    });
  }

  function getFiltered() {
    const ctry = els.country.value;
    const cmdy = els.commodity.value;
    let rows = RAW.map(canonicalize);

    // view gate that narrows by commodity only (country stays free)
    const v = els.view.value;
    if (v === 'chicken') rows = rows.filter(r => /chicken/i.test(r.commodity || ''));
    if (v === 'soy') rows = rows.filter(r => /soy/i.test(r.commodity || ''));

    // apply explicit filters (ignore product entirely)
    if (ctry) rows = rows.filter(r => r.country === ctry);
    if (cmdy) rows = rows.filter(r => r.commodity === cmdy);

    // sort by date ascending for chart
    rows.sort((a,b)=> a.date - b.date);
    return rows;
  }

  function updateKPIs(rows) {
    if (!rows.length) {
      els.latest.textContent = '—';
      els.inr.textContent = '—';
      els.source.textContent = '—';
      return;
    }
    const last = rows[rows.length - 1];
    els.latest.textContent = isFinite(last.price) ? `${fmt.format(last.price)}` : '—';
    els.inr.textContent = isFinite(last.inr) ? `${fmt.format(last.inr)}` : '—';
    els.source.textContent = last.source || '—';
  }

  function ensureChart() {
    if (chart) return chart;
    chart = new Chart(els.canvas.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Price per kg', data: [], tension: 0.25, pointRadius: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: false }
        },
        plugins: {
          legend: { display: false },
          tooltip: { intersect: false, mode: 'index' }
        }
      }
    });
    return chart;
  }

  function updateChart(rows) {
    const c = ensureChart();
    const labels = rows.map(r => r.date.toISOString().slice(0,10));
    const data = rows.map(r => isFinite(r.price) ? r.price : null);
    c.data.labels = labels;
    c.data.datasets[0].data = data;
    c.update();
  }

  function refresh() {
    const rows = getFiltered();
    updateKPIs(rows);
    updateChart(rows);
  }

  async function boot() {
    // 1) load
    const res = await fetch('./data.json', { cache: 'no-store' });
    if (!res.ok) {
      console.error('Failed to load data.json');
      return;
    }
    RAW = await res.json();

    if (!Array.isArray(RAW) || RAW.length === 0) {
      console.error('data.json is empty or not an array');
      return;
    }

    // 2) collect unique countries/commodities from RAW (ignore product)
    const sample = canonicalize(RAW[0]); // warms up keys
    const countries = uniqSorted(RAW.map(r => canonicalize(r).country));
    const commodities = uniqSorted(RAW.map(r => canonicalize(r).commodity));

    populateSelect(els.country, countries, 'All countries');
    populateSelect(els.commodity, commodities, 'All commodities');

    // 3) wire events
    ['change','input'].forEach(evt => {
      els.view.addEventListener(evt, refresh);
      els.country.addEventListener(evt, refresh);
      els.commodity.addEventListener(evt, refresh);
    });

    /
