// site/app.js
// Front-end script for Agri Prices dashboard
// NOTE: index.html lives in /site and data is in /data → fetch ../data/latest.json

(() => {
  const els = {
    view: document.getElementById('view'),
    country: document.getElementById('country'),
    commodity: document.getElementById('commodity'),
    latest: document.getElementById('latest'),
    inr: document.getElementById('inr'),
    source: document.getElementById('source'),
    chart: document.getElementById('chart'),
  };

  /** @type {{date:string,country:string,source:string,metric:string,unit:string,value:number}[]} */
  let rows = [];
  let chart;

  // --- utils ---
  const uniq = (arr) => [...new Set(arr)];
  const fmt = (n) =>
    n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) :
    n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  function setCards(series) {
    if (!series.length) {
      els.latest.textContent = '';
      els.inr.textContent = '';
      els.source.textContent = '';
      return;
    }
    const last = series[series.length - 1];
    els.latest.textContent = `${fmt(last.value)} ${last.unit}`;
    // We only have INR if unit already indicates INR
    els.inr.textContent = /inr/i.test(last.unit) ? `${fmt(last.value)} INR/kg` : 'N/A';
    els.source.textContent = `${last.source} — ${last.country}`;
  }

  function buildOptions(values, selectEl, placeholder = 'All') {
    selectEl.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = `All ${placeholder.toLowerCase()}s`;
    selectEl.appendChild(optAll);

    values.forEach((v) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      selectEl.appendChild(o);
    });
  }

  function filterRows() {
    const country = els.country.value;
    const commodity = els.commodity.value; // maps to metric in data
    return rows.filter((r) =>
      (country ? r.country === country : true) &&
      (commodity ? r.metric === commodity : true)
    );
  }

  function groupByMetricCountry(data) {
    const map = new Map();
    data.forEach((r) => {
      const key = `${r.metric} | ${r.country}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    // ensure chronological order
    for (const arr of map.values()) arr.sort((a, b) => (a.date < b.date ? -1 : 1));
    return map;
  }

  function ensureChart() {
    if (chart) return chart;
    chart = new Chart(els.chart.getContext('2d'), {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        parsing: false,
        animation: false,
        scales: {
          x: { type: 'time', time: { unit: 'month' } },
          y: { beginAtZero: false, ticks: { callback: (v) => fmt(v) } },
        },
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`
            }
          }
        }
      }
    });
    return chart;
  }

  function render() {
    const view = els.view.value; // 'single' or 'all' (we ignore other custom values)
    const filtered = filterRows();

    // Update headline cards using the first (or combined) series
    // For single view, use the selected country+commodity series.
    // For all view, cards are cleared since multiple series are shown.
    if (view === 'single') {
      const single = filtered
        .filter((r) => (els.country.value && els.commodity.value
          ? r.country === els.country.value && r.metric === els.commodity.value
          : true))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      setCards(single);
    } else {
      setCards([]);
    }

    const c = ensureChart();
    c.data.datasets = [];

    if (!filtered.length) {
      c.update();
      return;
    }

    if (view === 'all') {
      // show all series that match the current filters (possibly many)
      const groups = groupByMetricCountry(filtered);
      for (const [label, arr] of groups) {
        c.data.datasets.push({
          label,
          data: arr.map((r) => ({ x: r.date, y: r.value })),
          borderWidth: 2,
          pointRadius: 0,
        });
      }
    } else {
      // single: expect exactly one series (country+commodity). If filters are broad, show the first group.
      const groups = groupByMetricCountry(filtered);
      const [label, arr] = groups.entries().next().value;
      c.data.datasets.push({
        label,
        data: arr.map((r) => ({ x: r.date, y: r.value })),
        borderWidth: 2,
        pointRadius: 0,
      });
    }

    c.update();
  }

  function wireUI() {
    els.view.addEventListener('change', () => {
      const hide = els.view.value === 'all';
      // when viewing all, keep filters visible but they still work (handy to narrow)
      render();
    });
    els.country.addEventListener('change', render);
    els.commodity.addEventListener('change', render);
  }

  async function load() {
    try {
      // important: index/app in /site, data in /data
      const res = await fetch('../data/latest.json?cb=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.url}`);
      rows = await res.json();
    } catch (e) {
      console.error('Failed to load ../data/latest.json:', e);
      return;
    }

    // basic sanity: required fields
    rows = rows.filter(
      (r) =>
        r &&
        r.date &&
        r.country &&
        r.metric &&
        typeof r.value === 'number'
    );

    // Normalize date strings (YYYY-MM-DD) for the time scale
    rows.forEach((r) => (r.date = r.date.slice(0, 10)));

    // Populate selects
    const countries = uniq(rows.map((r) => r.country)).sort();
    const commodities = uniq(rows.map((r) => r.metric)).sort();

    buildOptions(countries, els.country, 'country');
    buildOptions(commodities, els.commodity, 'metric');

    wireUI();
    render();
  }

  load();
})();
