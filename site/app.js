
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
    const c  = String(row?.commodity || '').toLowerCase();
    const pf = String(row?.product_form || '').toLowerCase();
    const text = `${c} ${pf}`;
  
    // soy stays soy
    if (text.includes('soy')) return 'soy';
  
    // --- chicken breast ---
    if (
      c.includes('breast') ||
      text.includes('breast') ||
      text.includes('fillet') || text.includes('fillets') ||
      text.includes('b/s') || text.includes('boneless skinless')
    ) return 'chicken breast';
  
    // --- chicken thigh ---
    if (c.includes('thigh') || text.includes('thigh')) return 'chicken thigh';
    if (text.includes('leg')) return 'chicken thigh';
  
    // --- generic chicken ---
    if (text.includes('chicken') || text.includes('broiler') || text.includes('poultry')) return 'chicken';
  
    return row?.commodity || '';
  }

  // Precompute kind on each row
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
  const countryColor = {
    'United States': '#3B82F6',
    'European Union': '#10B981',
    'EU': '#10B981',
    'Thailand': '#F59E0B'
  };

  // line styles per normalized kind
  const kindStyle = {
    'chicken':        { dash: [],       width: 2.5 }, // solid
    'chicken thigh':  { dash: [8,4],    width: 2   }, // dashed
    'chicken breast': { dash: [3,3],    width: 2   }, // dotted
    'soy':            { dash: [10,5],   width: 2   }  // long dash
  };

  // master date labels across all rows
  const allDates = uniq(data.map(d => d.date).filter(Boolean)).sort((a,b)=> toDate(a)-toDate(b));

  // build a series aligned to master dates for (country, normalized kind)
  function buildSeries(country, kind) {
    const rows = data
      .filter(d => (d.country === country || d.country === 'EU') && d.__kind === kind)
      .filter(d => country === 'EU' ? (d.country === 'EU' || d.country === 'European Union') : d.country === country)
      .sort((a,b)=> toDate(a.date)-toDate(b.date));
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

    // --- single series ---
    if (view === 'single') {
      const rows = data
        .filter(d => d.country === country && d.commodity === commodity)
        .sort((a,b)=> toDate(a.date)-toDate(b.date));

      updateCardsSingle(rows);

      const labels = rows.map(r => r.date);
      const values = rows.map(usdFromRow);

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

    // --- multi series for chicken view ---
    if (view === 'chicken') {
      updateCardsMulti('Chicken comparison');
      const datasets = [];
      
      // Thailand - only has generic "chicken"
      const thailandChicken = buildSeries('Thailand', 'chicken');
      if (thailandChicken.some(v => v != null)) {
        datasets.push({
          label: 'Thailand • chicken',
          data: thailandChicken,
          tension: 0.25,
          borderColor: countryColor['Thailand'],
          borderWidth: kindStyle['chicken'].width,
          borderDash: kindStyle['chicken'].dash,
          pointRadius: 0,
          spanGaps: true
        });
      }

      // United States - chicken breast and thigh
      const usBreast = buildSeries('United States', 'chicken breast');
      if (usBreast.some(v => v != null)) {
        datasets.push({
          label: 'United States • chicken breast',
          data: usBreast,
          tension: 0.25,
          borderColor: countryColor['United States'],
          borderWidth: kindStyle['chicken breast'].width,
          borderDash: kindStyle['chicken breast'].dash,
          pointRadius: 0,
          spanGaps: true
        });
      }

      const usThigh = buildSeries('United States', 'chicken thigh');
      if (usThigh.some(v => v != null)) {
        datasets.push({
          label: 'United States • chicken thigh',
          data: usThigh,
          tension: 0.25,
          borderColor: countryColor['United States'],
          borderWidth: kindStyle['chicken thigh'].width,
          borderDash: kindStyle['chicken thigh'].dash,
          pointRadius: 0,
          spanGaps: true
        });
      }

      // European Union - chicken breast and thigh
      const euBreast = buildSeries('European Union', 'chicken breast');
      if (euBreast.some(v => v != null)) {
        datasets.push({
          label: 'EU • chicken breast',
          data: euBreast,
          tension: 0.25,
          borderColor: countryColor['European Union'],
          borderWidth: kindStyle['chicken breast'].width,
          borderDash: kindStyle['chicken breast'].dash,
          pointRadius: 0,
          spanGaps: true
        });
      }

      const euThigh = buildSeries('European Union', 'chicken thigh');
      if (euThigh.some(v => v != null)) {
        datasets.push({
          label: 'EU • chicken thigh',
          data: euThigh,
          tension: 0.25,
          borderColor: countryColor['European Union'],
          borderWidth: kindStyle['chicken thigh'].width,
          borderDash: kindStyle['chicken thigh'].dash,
          pointRadius: 0,
          spanGaps: true
        });
      }

      const ctx = $('chart').getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        data: { labels: allDates, datasets },
        options: baseOptions()
      });
      return;
    }

    // --- multi series for other views (all, soy) ---
    const wantedKinds = view === 'soy' ? ['soy'] : ['chicken','chicken thigh','chicken breast','soy'];
    updateCardsMulti(view === 'all' ? 'All series' : 'Soy only');

    const datasets = [];
    
    // Special handling for chicken view to avoid duplicates
    const specialCountries = {
      'Thailand': view === 'all' ? ['chicken','soy'] : ['soy'],
      'United States': view === 'all' ? ['chicken breast','chicken thigh','soy'] : ['soy'],
      'European Union': view === 'all' ? ['chicken breast','chicken thigh','soy'] : ['soy']
    };

    for (const c of ['Thailand', 'United States', 'European Union']) {
      const kinds = specialCountries[c] || wantedKinds;
      for (const k of kinds) {
        const series = buildSeries(c === 'European Union' ? 'EU' : c, k);
        if (series.every(v => v == null)) continue;

        const style = kindStyle[k] || { dash: [], width: 2 };
        const displayCountry = c === 'European Union' ? 'EU' : c;
        datasets.push({
          label: `${displayCountry} • ${k}`,
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
