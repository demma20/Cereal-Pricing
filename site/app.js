async function load() {
  const res = await fetch('../data/latest.json', { cache: 'no-store' });
  const raw = await res.json();

  // ---------- helpers ----------
  const $ = id => document.getElementById(id);
  const uniq = arr => [...new Set(arr)].sort();
  const toDate = s => new Date(s);

  // Compute USD/kg from a row robustly
  function usdFromRow(r) {
    if (!r) return null;
    if (Number.isFinite(r.usd_per_kg)) return r.usd_per_kg;
    if (Number.isFinite(r.price_per_kg) && Number.isFinite(r.fx_rate_to_usd)) {
      const v = r.price_per_kg * r.fx_rate_to_usd;
      return Number.isFinite(v) ? v : null;
    }
    return null;
  }

  // Normalize a row to a chicken "kind"
  function normalizeKind(row) {
    const c = String(row?.commodity || '').toLowerCase();
  
    // soy stays soy
    if (c.includes('soy')) return 'soy';
  
    // ---- chicken subtypes (return distinct kinds) ----
    // breast (EU "breast fillet", US "B/S", etc.)
    if (
      c.includes('breast') ||
      c.includes('fillet') ||
      c.includes('fillets') ||
      c.includes('b/s') ||
      c.includes('breast fillet')
    ) return 'chicken breast';
  
    // thigh (map any "thigh" or "leg/legs" feed to thigh)
    if (c.includes('thigh')) return 'chicken thigh';
    if (c.includes('leg'))   return 'chicken thigh';
  
    // generic chicken (whole/unspecified)
    if (c.includes('chicken') || c.includes('broiler') || c.includes('poultry')) return 'chicken';
  
    // fallback: leave as-is for single view
    return row?.commodity || '';
  }


  // Precompute kind on each row (don’t mutate the original object structure too much)
  const data = raw.map(r => ({ ...r, __kind: normalizeKind(r) }));

  // ---------- UI lists ----------
  const countries = uniq(data.map(d => d.country).filter(Boolean));
  const commodities = uniq(data.map(d => d.commodity).filter(Boolean));

  // ---------- formatters ----------
  const fmtUSD = v => (v == null || Number.isNaN(v) ? '—' : `$${v.toFixed(2)} USD/kg`);
  const fmtINR = v => (v == null || Number.isNaN(v) ? '—' : `₹${Math.round(v).toLocaleString('en-IN')} INR/kg`);

  // Fill selects
  function fill(el, items){ el.innerHTML = items.map(x=>`<option value="${x}">${x}</option>`).join(''); }
  fill($('country'), countries);
  fill($('commodity'), commodities);

  // defaults
  $('view').value = 'single';
  $('country').value = countries.includes('United States') ? 'United States' : countries[0];
  $('commodity').value = commodities.includes('soy') ? 'soy' : commodities[0];

  // colors per country
  const palette = ['#E54B4B','#3B82F6','#22C55E','#F59E0B','#A855F7','#EF4444','#06B6D4','#84CC16','#F97316','#10B981'];
  const countryColor = {};
  countries.forEach((c,i)=> countryColor[c] = palette[i % palette.length]);

  // line styles per normalized kind
  const kindStyle = {
    'chicken':        { dash: [],       width: 2   }, // solid
    'chicken thigh':  { dash: [6,4],    width: 2   }, // dashed
    'chicken breast': { dash: [2,3],    width: 2.5 }, // dotted
    'soy':            { dash: [8,5],    width: 2.5 }  // long dash
  };

  // which kinds to include per view
  const viewKinds = {
    all:     ['chicken','chicken thigh','chicken breast','soy'],
    chicken: ['chicken','chicken thigh','chicken breast'],
    soy:     ['soy']
  };

  // master date labels across all rows
  const allDates = uniq(data.map(d => d.date).filter(Boolean)).sort((a,b)=> toDate(a)-toDate(b));

  // build a series aligned to master dates for (country, normalized kind)
  function buildSeries(country, kind) {
    const rows = data
      .filter(d => d.country === country && d.__kind === kind)
      .sort((a,b)=> toDate(a)-toDate(b));
    const map = new Map(rows.map(r => [r.date, usdFromRow(r)]));
    return allDates.map(dt => map.get(dt) ?? null);
  }

  // cards
  function updateCardsSingle(rows) {
    if (!rows.length) {
      $('latest').textContent = '—';
      $('inr').textContent = '—';
      $('source').textContent = '—';
      return;
    }
    const last = rows[rows.length - 1];
    const lastUSD = usdFromRow(last);
    $('latest').textContent = fmtUSD(lastUSD);

    const inrPerUsd = last.fx_inr_per_usd ?? (last.fx_usd_per_inr ? 1 / last.fx_usd_per_inr : null);
    const lastINR = last.inr_per_kg ?? (lastUSD != null && inrPerUsd != null ? lastUSD * inrPerUsd : null);
    $('inr').textContent = fmtINR(lastINR);

    $('source').textContent = [last.market_level, last.source].filter(Boolean).join(' • ');
  }

  function updateCardsMulti(label) {
    $('latest').textContent = '—';
    $('inr').textContent = '—';
    $('source').textContent = label;
  }

  function toggleSelects(view) {
    const hide = view !== 'single';
    $('country').style.display = hide ? 'none' : '';
    $('commodity').style.display = hide ? 'none' : '';
  }

  function baseOptions() {
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
        y: { beginAtZero: true, min: 0, ticks: { maxTicksLimit: 6 } }
      },
      devicePixelRatio: 1
    };
  }

  let chart;

  function render() {
    const view = $('view').value;
    const country = $('country').value;
    const commodity = $('commodity').value;

    toggleSelects(view);
    if (chart) { chart.destroy(); chart = null; }

    // --- single series: exact commodity selection (no normalization filter) ---
    if (view === 'single') {
      const rows = data
        .filter(d => d.country === country && d.commodity === commodity)
        .sort((a,b)=> toDate(a)-toDate(b));

      updateCardsSingle(rows);

      const labels = rows.map(r => r.date);
      const values = rows.map(usdFromRow);

      // style by normalized kind of the chosen commodity
      const k = normalizeKind({ commodity });
      const style = kindStyle[k] || { dash: [], width: 2 };

      const ctx = $('chart').getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: `${country} • ${commodity} (USD/kg)`,
            data: values,
            tension: 0.25,
            borderColor: countryColor[country] || '#3B82F6',
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

    // --- multi series: group by normalized kind (this fixes "only Thailand shows") ---
    const wantedKinds = viewKinds[view] || viewKinds.all;
    updateCardsMulti(view === 'all' ? 'All series' : view === 'chicken' ? 'Chicken only' : 'Soy only');

    const datasets = [];
    for (const c of countries) {
      for (const k of wantedKinds) {
        const series = buildSeries(c, k);
        if (series.every(v => v == null)) continue; // skip empty series

        const style = kindStyle[k] || { dash: [], width: 2 };
        datasets.push({
          label: `${c} • ${k}`,
          data: series,
          tension: 0.25,
          borderColor: countryColor[c] || '#3B82F6',
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

  ['view','country','commodity'].forEach(id => $(id).addEventListener('change', render));
  render();
}

document.addEventListener('DOMContentLoaded', load);
