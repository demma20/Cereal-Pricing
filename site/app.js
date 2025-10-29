async function load() {
  const res = await fetch('../data/latest.json', { cache: 'no-store' });
  const data = await res.json();

  // ===== Helpers =====
  const $ = id => document.getElementById(id);
  const uniq = arr => [...new Set(arr)].sort();
  const parseDate = s => new Date(s);

  // Strict USD/kg extraction (no INR fallbacks)
  const usdFromRow = r => {
    if (!r) return null;
    if (Number.isFinite(r.usd_per_kg)) return r.usd_per_kg;
    if (Number.isFinite(r.price_per_kg) && Number.isFinite(r.fx_rate_to_usd)) {
      return r.price_per_kg * r.fx_rate_to_usd;
    }
    return null; // Chart.js skips nulls
  };

  // Normalize commodity kinds for grouping in multi-series views
  const kindOf = (row) => {
    const c = (row.commodity || '').toLowerCase();
    if (c.includes('soy')) return 'soy';
    if (c.includes('breast')) return 'chicken breast';
    if (c.includes('thigh')) return 'chicken thigh';
    if (c.includes('chicken')) return 'chicken';
    return row.commodity || '';
  };

  // Distinct line styles per kind
  const kindStyle = {
    'chicken':        { dash: [],       width: 2   }, // solid
    'chicken thigh':  { dash: [6, 4],   width: 2   }, // dashed
    'chicken breast': { dash: [2, 3],   width: 2.5 }, // dotted
    'soy':            { dash: [8, 5],   width: 2.5 }  // long dash
  };

  const viewToKinds = {
    all:     ['chicken','chicken thigh','chicken breast','soy'],
    chicken: ['chicken','chicken thigh','chicken breast'],
    soy:     ['soy']
  };

  // ===== Sets & defaults =====
  const countries = uniq(data.map(d => d.country).filter(Boolean));
  const commodities = uniq(data.map(d => d.commodity).filter(Boolean));

  // ===== Formatters =====
  const fmtUSD = v => (v == null || Number.isNaN(v) ? "—" : `$${v.toFixed(2)} USD/kg`);
  const fmtINR = v => (v == null || Number.isNaN(v) ? "—" : `₹${Math.round(v).toLocaleString("en-IN")} INR/kg`);

  // ===== Populate selects =====
  function fill(el, items){ el.innerHTML = items.map(x=>`<option value="${x}">${x}</option>`).join(''); }
  fill($('country'), countries);
  fill($('commodity'), commodities);

  // Sensible defaults
  $('view').value = 'single';
  $('country').value = countries.includes('United States') ? 'United States' : countries[0];
  $('commodity').value = commodities.includes('soy') ? 'soy' : commodities[0];

  // ===== Color per country =====
  const palette = [
    '#E54B4B', '#3B82F6', '#22C55E', '#F59E0B',
    '#A855F7', '#EF4444', '#06B6D4', '#84CC16',
    '#F97316', '#10B981'
  ];
  const countryColor = {};
  countries.forEach((c,i)=> countryColor[c] = palette[i % palette.length]);

  // ===== Global chart handle =====
  let chart;

  // Master set of all dates across all rows (sorted)
  const allDates = uniq(data.map(d => d.date)).sort((a,b)=> parseDate(a) - parseDate(b));

  // Build a series aligned to master dates for (country, kind)
  function buildSeriesByKind(country, kind) {
    const rows = data
      .filter(d => d.country === country && kindOf(d) === kind)
      .sort((a,b)=> parseDate(a.date) - parseDate(b.date));
    const byDate = new Map(rows.map(r => [r.date, usdFromRow(r)]));
    return allDates.map(dt => byDate.get(dt) ?? null);
  }

  // ===== Cards =====
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

  function updateCardsMulti(label) {
    $('latest').textContent = '—';
    $('inr').textContent    = '—';
    $('source').textContent = label;
  }

  // Show/hide selects depending on view
  function toggleSelects(view) {
    const hide = (view !== 'single');
    $('country').style.display   = hide ? 'none' : '';
    $('commodity').style.display = hide ? 'none' : '';
  }

  // ===== Shared chart options =====
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
        y: { min: 0, beginAtZero: true, ticks: { maxTicksLimit: 6 } }
      },
      devicePixelRatio: 1
    };
  }

  // ===== Render =====
  function render() {
    const view = $('view').value;
    const c = $('country').value;
    const k = $('commodity').value;

    toggleSelects(view);
    if (chart) { chart.destroy(); chart = null; }

    // --- Single-series view (exact commodity match) ---
    if (view === 'single') {
      const rows = data
        .filter(d => d.country === c && d.commodity === k)
        .sort((a,b)=> parseDate(a.date) - parseDate(b.date));

      updateCardsSingle(rows);

      const labels = rows.map(r => r.date);
      const values = rows.map(usdFromRow);

      // Pick line style by "kind" even in single view (nice affordance)
      const singleKind = kindOf({ commodity: k });
      const style = kindStyle[singleKind] || { dash: [], width: 2 };

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
            borderWidth: style.width,
            borderDash: style.dash,
            spanGaps: true,
            pointRadius: 0
          }]
        },
        options: baseOptions()
      });
      return;
    }

    // --- Multi-series views (by normalized kind) ---
    const wantedKinds = viewToKinds[view] || ['chicken','chicken thigh','chicken breast','soy'];
    updateCardsMulti(
      view === 'all' ? 'All series' : (view === 'chicken' ? 'Chicken only' : 'Soy only')
    );

    const datasets = [];
    for (const country of countries) {
      for (const kind of wantedKinds) {
        const series = buildSeriesByKind(country, kind);
        if (series.every(v => v == null)) continue; // skip empty

        const style = kindStyle[kind] || { dash: [], width: 2 };
        datasets.push({
          label: `${country} • ${kind}`,
          data: series,
          tension: 0.25,
          borderColor: countryColor[country],
          borderWidth: style.width,
          borderDash: style.dash,
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

  // Events
  ['view','country','commodity'].forEach(id => $(id).addEventListener('change', render));

  // Initial paint
  render();
}

document.addEventListener('DOMContentLoaded', load);
