async function load() {
  const res = await fetch('../data/latest.json', { cache: 'no-store' });
  const data = await res.json();

  const $ = id => document.getElementById(id);
  const uniq = arr => [...new Set(arr)].sort();
  const by = (arr, fn) => arr.reduce((m, x) => ((m[fn(x)] ??= []).push(x), m), {});

  // --- DOM refs
  const selView = $('view');
  const selCountry = $('country');
  const selCommodity = $('commodity');

  // --- Normalize commodities into two buckets for styling (chicken/soy)
  const normCommodity = c => {
    if (!c) return c;
    const s = String(c).toLowerCase();
    if (s.includes('soy')) return 'soy';
    if (s.includes('chicken')) return 'chicken';
    return c; // fallback (shows as-is in single view)
  };

  // --- Lists for selects
  const countries = uniq(data.map(d => d.country));
  const commodities = uniq(data.map(d => normCommodity(d.commodity)));

  // --- Formatters
  const fmtUSD = v => (v == null || Number.isNaN(v) ? "—" : `$${v.toFixed(2)} USD/kg`);
  const fmtINR = v => (v == null || Number.isNaN(v) ? "—" : `₹${Math.round(v).toLocaleString("en-IN")} INR/kg`);

  // --- Populate selects
  function fill(el, items){ el.innerHTML = items.map(x=>`<option value="${x}">${x}</option>`).join(''); }
  fill(selCountry, countries);
  fill(selCommodity, commodities);

  selCountry.value = countries.includes('United States') ? 'United States' : countries[0];
  selCommodity.value = commodities.includes('soy') ? 'soy' : commodities[0];
  selView.value = 'single'; // default

  // --- Chart state
  let chart;

  // --- Helpers
  const usdFromRow = r => {
    if (r.usd_per_kg != null) return r.usd_per_kg;
    if (r.price_per_kg != null && r.fx_rate_to_usd != null) return r.price_per_kg * r.fx_rate_to_usd;
    return null;
  };

  const allDates = uniq(data.map(d => d.date)).sort((a,b)=> new Date(a) - new Date(b));

  // Color palette (cycled per country)
  const palette = [
    '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#059669',
    '#d97706', '#0ea5e9', '#f43f5e', '#065f46', '#9ca3af'
  ];
  const countryColor = {};
  countries.forEach((c, i) => countryColor[c] = palette[i % palette.length]);

  function syncControlsVisibility(){
    const all = selView.value === 'all';
    selCountry.classList.toggle('hidden', all);
    selCommodity.classList.toggle('hidden', all);
  }

  function renderSingle(){
    const c = selCountry.value;
    const kRaw = selCommodity.value;
    // In single view, match original raw commodity names if possible; also accept normalized.
    const rows = data
      .filter(d => d.country === c && (normCommodity(d.commodity) === kRaw))
      .sort((a,b)=> new Date(a.date) - new Date(b.date));

    if (!rows.length){
      $('latest').textContent = '—';
      $('inr').textContent = '—';
      $('source').textContent = '—';
      if (chart) { chart.destroy(); chart = null; }
      return;
    }

    const labels = rows.map(r => r.date);
    const values = rows.map(usdFromRow);
    const last = rows[rows.length - 1];

    // Cards
    const lastUSD = usdFromRow(last);
    $('latest').textContent = fmtUSD(lastUSD);

    const inrPerUsd = last.fx_inr_per_usd ?? (last.fx_usd_per_inr ? 1 / last.fx_usd_per_inr : null);
    const lastINR = last.inr_per_kg ?? (lastUSD != null && inrPerUsd != null ? lastUSD * inrPerUsd : null);
    $('inr').textContent = fmtINR(lastINR);

    $('source').textContent = last ? [last.market_level, last.source].filter(Boolean).join(' • ') : '—';

    // Draw
    if (chart) chart.destroy();
    const ctx = $('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `${c} • ${kRaw} (USD/kg)`,
          data: values,
          tension: 0.25,
          borderColor: countryColor[c],
          borderWidth: 2,
          borderDash: normCommodity(kRaw) === 'soy' ? [6, 4] : [],
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        elements: { point: { radius: 0 } },
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y;
                return (v == null || Number.isNaN(v)) ? '—' : `$${v.toFixed(2)} USD/kg`;
              }
            }
          },
          decimation: { enabled: true, algorithm: 'lttb', samples: 400 }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8 } },
          y: { min: 0, beginAtZero: true, ticks: { maxTicksLimit: 6 } }
        },
        devicePixelRatio: 1
      }
    });
  }

  function renderAll(){
    // Cards: not meaningful for multi-series
    $('latest').textContent = '—';
    $('inr').textContent = '—';
    $('source').textContent = 'Multiple series • USD/kg';

    // Build series for each (country, type=chicken|soy)
    const grouped = by(
      data.map(d => ({...d, type: normCommodity(d.commodity)}))
          .filter(d => d.type === 'chicken' || d.type === 'soy'),
      d => `${d.country}|||${d.type}`
    );

    const labels = allDates;

    const datasets = Object.entries(grouped).map(([key, rows]) => {
      const [country, type] = key.split('|||');
      // Map to full date domain, gaps as null
      const mapByDate = new Map(rows.map(r => [r.date, usdFromRow(r)]));
      const series = labels.map(dt => mapByDate.get(dt) ?? null);
      return {
        label: `${country} • ${type}`,
        data: series,
        tension: 0.25,
        borderColor: countryColor[country],
        borderWidth: 2,
        borderDash: type === 'soy' ? [6, 4] : [],
        spanGaps: false,
        pointRadius: 0
      };
    });

    // Draw
    if (chart) chart.destroy();
    const ctx = $('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', intersect: false },
        elements: { point: { radius: 0 } },
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y;
                return (v == null || Number.isNaN(v)) ? '—' : `${ctx.dataset.label}: $${v.toFixed(2)} USD/kg`;
              }
            }
          },
          decimation: { enabled: true, algorithm: 'lttb', samples: 600 }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 10 } },
          y: { min: 0, beginAtZero: true, ticks: { maxTicksLimit: 6 } }
        },
        devicePixelRatio: 1
      }
    });
  }

  function render(){
    syncControlsVisibility();
    if (selView.value === 'all') {
      renderAll();
    } else {
      renderSingle();
    }
  }

  // Events
  ['change'].forEach(evt => {
    selView.addEventListener(evt, render);
    selCountry.addEventListener(evt, render);
    selCommodity.addEventListener(evt, render);
  });

  // Initial paint
  render();
}

document.addEventListener('DOMContentLoaded', load);
