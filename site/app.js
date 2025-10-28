async function load() {
  const res = await fetch('../data/latest.json', { cache: 'no-store' });
  const data = await res.json();

  // Helpers
  const $ = id => document.getElementById(id);
  const uniq = arr => [...new Set(arr)].sort();
  const parseDate = s => new Date(s);

  // Sets & defaults
  const countries = uniq(data.map(d => d.country).filter(Boolean));
  const commodities = uniq(data.map(d => d.commodity).filter(Boolean));

  // Formatters
  const fmtUSD = v => (v == null || Number.isNaN(v) ? "—" : `$${v.toFixed(2)} USD/kg`);
  const fmtINR = v => (v == null || Number.isNaN(v) ? "—" : `₹${Math.round(v).toLocaleString("en-IN")} INR/kg`);

  // Populate selects
  function fill(el, items){ el.innerHTML = items.map(x=>`<option value="${x}">${x}</option>`).join(''); }
  fill($('country'), countries);
  fill($('commodity'), commodities);

  // Sensible defaults
  $('view').value = 'single';
  $('country').value = countries.includes('United States') ? 'United States' : countries[0];
  $('commodity').value = commodities.includes('soy') ? 'soy' : commodities[0];

  // Color per country (auto-assign if new countries appear)
  const palette = [
    '#E54B4B', '#3B82F6', '#22C55E', '#F59E0B',
    '#A855F7', '#EF4444', '#06B6D4', '#84CC16',
    '#F97316', '#10B981'
  ];
  const countryColor = {};
  countries.forEach((c,i)=> countryColor[c] = palette[i % palette.length]);

  // Compute USD from a row, safely
  const usdFromRow = r => {
    const v = r?.usd_per_kg ?? (
      (r?.price_per_kg != null && r?.fx_rate_to_usd != null)
        ? r.price_per_kg * r.fx_rate_to_usd
        : null
    );
    return Number.isFinite(v) ? v : null; // Chart.js skips nulls (not NaNs)
  };

  // Global chart handle
  let chart;

  // Master set of all dates (strings), sorted
  const allDates = uniq(data.map(d => d.date)).sort((a,b)=> parseDate(a) - parseDate(b));

  // Build a dataset for (country, commodity) aligned to master labels
  function buildSeries(country, commodity) {
    const rows = data
      .filter(d => d.country === country && d.commodity === commodity)
      .sort((a,b)=> parseDate(a.date) - parseDate(b.date));

    const byDate = new Map(rows.map(r => [r.date, usdFromRow(r)]));
    const aligned = allDates.map(dt => byDate.get(dt) ?? null);
    return aligned;
  }

  // Update the three info cards for single-series mode
  function updateCardsSingle(rows) {
    if (!rows.length) {
      $('latest').textContent = '—';
      $('inr').textContent   = '—';
      $('source').textContent= '—';
      return;
    }
    const last = rows[rows.length - 1];
    const lastUSD = usdFromRow(last);

    $('latest').textContent = fmtUSD(lastUSD);

    const inrPerUsd = last.fx_inr_per_usd ?? (last.fx_usd_per_inr ? 1 / last.fx_usd_per_inr : null);
    const lastINR = last.inr_per_kg ?? (lastUSD != null && inrPerUsd != null ? lastUSD * inrPerUsd : null);
    $('inr').textContent = fmtINR(lastINR);

    $('source').textContent = last
      ? [last.market_level, last.source].filter(Boolean).join(' • ')
      : '—';
  }

  // Cards for multi-series views
  function updateCardsMulti(label) {
    $('latest').textContent = '—';
    $('inr').textContent    = '—';
    $('source').textContent = label; // e.g., "All series" / "Chicken only" / "Soy only"
  }

  // Render the chart based on the current "view" mode
  function render() {
    const view = $('view').value;
    const c = $('country').value;
    const k = $('commodity').value;

    if (chart) { chart.destroy(); chart = null; }

    // Single-series view (original UI)
    if (view === 'single') {
      const rows = data
        .filter(d => d.country === c && d.commodity === k)
        .sort((a,b)=> parseDate(a) - parseDate(b));

      updateCardsSingle(rows);

      const labels = rows.map(r => r.date);
      const values = rows.map(usdFromRow);

      const ctx = $('chart').getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: `${c} • ${k} (USD/kg)`,
            data: values,
            tension: 0.25,
            borderColor: countryColor[c] || '#3B82F6',
            borderWidth: 2,
            borderDash: k === 'soy' ? [6,4] : [],
            spanGaps: true,
            pointRadius: 0
          }]
        },
        options: baseOptions()
      });
      return;
    }

    // Multi-series views
    const modeToTypes = {
      all: ['chicken', 'soy'],
      chicken: ['chicken'],
      soy: ['soy']
    };
    const wantedTypes = modeToTypes[view] || ['chicken','soy'];

    updateCardsMulti(
      view === 'all' ? 'All series' : (view === 'chicken' ? 'Chicken only' : 'Soy only')
    );

    // Build datasets for each (country, type) combo
    const datasets = [];
    for (const country of countries) {
      for (const type of wantedTypes) {
        const series = buildSeries(country, type);
        // Skip if the series is entirely null
        if (series.every(v => v == null)) continue;

        datasets.push({
          label: `${country} • ${type}`,
          data: series,
          tension: 0.25,
          borderColor: countryColor[country],
          borderWidth: type === 'soy' ? 2.5 : 2,
          borderDash: type === 'soy' ? [6,4] : [],
          pointRadius: 0,
          spanGaps: true
        });
      }
    }

    const ctx = $('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: allDates, datasets },
      options: baseOptions()
    });
  }

  // Shared chart options (y starts at 0, nice ticks, decimation, etc.)
  function baseOptions(){
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      elements: { point: { radius: 0 } },
      plugins: {
        legend: { display: true },
        decimation: { enabled: true, algorithm: 'lttb', samples: 200 }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: {
          min: 0,
          beginAtZero: true,
          ticks: { maxTicksLimit: 6 }
        }
      },
      devicePixelRatio: 1
    };
  }

  // Events
  ['view','country','commodity'].forEach(id => $(id).addEventListener('change', render));

  // Initial paint
  render();
}

document.addEventListener('DOMContentLoaded', load);
