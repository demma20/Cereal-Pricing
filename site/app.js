// site/app.js
// Front-end for Agri Prices. Data file is at ../data/latest.json

(function () {
  /** @type {{date:string,country:string,source:string,metric:string,unit:string,value:number}[]} */
  let rows = [];
  let chart;
  let els;

  const uniq = (arr) => [...new Set(arr)];
  const fmt = (n) =>
    n >= 1000
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  function setCards(series) {
    if (!series.length) {
      els.latest.textContent = '';
      els.inr.textContent = '';
      els.source.textContent = '';
      return;
    }
    const last = series[series.length - 1];
    els.latest.textContent = `${fmt(last.value)} ${last.unit}`;
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
    const metric = els.metric.value;
    const view = els.view.value;

    return rows.filter((r) => {
      if (country && r.country !== country) return false;
      if (metric && r.metric !== metric) return false;
      if (view === 'chicken' && !/chicken/i.test(r.metric)) return false;
      if (view === 'soy' && !/soy/i.test(r.metric)) return false;
      return true;
    });
  }

  function groupByMetricCountry(data) {
    const map = new Map();
    data.forEach((r) => {
      const key = `${r.metric} | ${r.country}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
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
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
        },
      },
    });
    return chart;
  }

  function render() {
    const filtered = filterRows();

    // Update headline cards from the first matching series
    const firstSeries = (() => {
      const groups = groupByMetricCountry(filtered);
      const it = groups.entries().next();
      return it.done ? [] : it.value[1];
    })();
    setCards(firstSeries);

    const c = ensureChart();
    c.data.datasets = [];

    if (!filtered.length) {
      c.update();
      return;
    }

    const groups = groupByMetricCountry(filtered);
    for (const [label, arr] of groups) {
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
    els.view.addEventListener('change', render);
    els.country.addEventListener('change', render);
    els.metric.addEventListener('change', render);
  }

  async function loadData() {
    try {
      const res = await fetch('../data/latest.json?cb=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rows = await res.json();
    } catch (e) {
      console.error('Failed to load ../data/latest.json:', e);
      return;
    }

    // keep only well-formed records
    rows = rows.filter((r) => r && r.date && r.country && r.metric && typeof r.value === 'number');

    // normalize date to YYYY-MM-DD (adapter parses ISO)
    rows.forEach((r) => (r.date = r.date.slice(0, 10)));

    // fill selects
    const countries = uniq(rows.map((r) => r.country)).sort();
    const metrics = uniq(rows.map((r) => r.metric)).sort();
    buildOptions(countries, els.country, 'country');
    buildOptions(metrics, els.metric, 'metric');

    render();
  }

  // Wait for DOM to exist before grabbing elements
  window.addEventListener('DOMContentLoaded', () => {
    els = {
      view: document.getElementById('view'),
      country: document.getElementById('countrySelect'),
      metric: document.getElementById('metricSelect'),
      latest: document.getElementById('latest'),
      inr: document.getElementById('inr'),
      source: document.getElementById('source'),
      chart: document.getElementById('chart'),
    };
    wireUI();
    loadData();
  });
})();
