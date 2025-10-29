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
      c === 'chicken breast' ||
      text.includes('breast') ||
      text.includes('fillet') || text.includes('fillets') ||
      text.includes('b/s') || text.includes('boneless skinless')
    ) return 'chicken breast';
  
    // --- chicken thigh ---
    if (c === 'chicken thigh' || text.includes('thigh')) return 'chicken thigh';
    if (text.includes('leg')) return 'chicken thigh'; // EU "legs" maps to thigh
  
    // --- generic chicken ---
    if (c === 'chicken' || text.includes('chicken') || text.includes('broiler') || text.includes('poultry')) return 'chicken';
  
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

  // colors per country - fixed colors
  const countryColor = {
    'Thailand': '#22C55E',        // Green
    'United States': '#F59E0B',   // Orange/Amber
    'EU': '#3B82F6',             // Blue
    'European Union': '#3B82F6'  // Blue
  };

  // line styles per normalized kind
  const kindStyle = {
    'chicken':        { dash: [],       width: 2.5 }, // solid
    'chicken thigh':  { dash: [8,4],    width: 2.5 }, // dashed
    'chicken breast': { dash: [3,3],    width: 2.5 }, // dotted
    'soy':            { dash: [10,5],   width: 2   }  // long dash
  };

  // master date labels across all rows
  const allDates = uniq(data.map(d => d.date).filter(Boolean)).sort((a,b)=> toDate(a)-toDate(b));

  // build a series aligned to master dates for (country, normalized kind)
  function buildSeries(countryName, kind) {
    // Handle EU/European Union naming
    const rows = data.filter(d => {
      // Match country (handle EU vs European Union)
      const countryMatch = 
        (countryName === 'EU' && (d.country === 'EU' || d.country === 'European Union')) ||
        (countryName === 'European Union' && (d.country === 'EU' || d.country === 'European Union')) ||
        d.country === countryName;
      
      // Match kind
      const kindMatch = d.__kind === kind;
      
      return countryMatch && kindMatch;
    }).sort((a,b)=> toDate(a.date)-toDate(b.date));
    
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
      updateCardsMulti('Chicken only');
      const datasets = [];
      
      // Thailand - generic chicken
      const thailandChicken = buildSeries('Thailand', 'chicken');
      if (thailandChicken.some(v => v != null)) {
        datasets.push({
          label: 'Thailand • chicken',
          data: thailandChicken,
          tension: 0.25,
          borderColor: '#22C55E', // Green
          borderWidth: 2.5,
          borderDash: [], // Solid
          pointRadius: 0,
          spanGaps: true
        });
      }

      // United States - chicken breast
      const usBreast = buildSeries('United States', 'chicken breast');
      if (usBreast.some(v => v != null)) {
        datasets.push({
          label: 'United States • chicken breast',
          data: usBreast,
          tension: 0.25,
          borderColor: '#F59E0B', // Orange
          borderWidth: 2.5,
          borderDash: [3, 3], // Dotted
          pointRadius: 0,
          spanGaps: true
        });
      }

      // United States - chicken thigh
      const usThigh = buildSeries('United States', 'chicken thigh');
      if (usThigh.some(v => v != null)) {
        datasets.push({
          label: 'United States • chicken thigh',
          data: usThigh,
          tension: 0.25,
          borderColor: '#F59E0B', // Orange
          borderWidth: 2.5,
          borderDash: [8, 4], // Dashed
          pointRadius: 0,
          spanGaps: true
        });
      }

      // EU - chicken breast
      const euBreast = buildSeries('EU', 'chicken breast');
      if (euBreast.some(v => v != null)) {
        datasets.push({
          label: 'EU • chicken breast',
          data: euBreast,
          tension: 0.25,
          borderColor: '#3B82F6', // Blue
          borderWidth: 2.5,
          borderDash: [3, 3], // Dotted
          pointRadius: 0,
          spanGaps: true
        });
      }

      // EU - chicken thigh  
      const euThigh = buildSeries('EU', 'chicken thigh');
      if (euThigh.some(v => v != null)) {
        datasets.push({
          label: 'EU • chicken thigh',
          data: euThigh,
          tension: 0.25,
          borderColor: '#3B82F6', // Blue
          borderWidth: 2.5,
          borderDash: [8, 4], // Dashed
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
    
    // Handle each country explicitly
    if (view === 'all') {
      // Thailand
      for (const k of ['chicken', 'soy']) {
        const series = buildSeries('Thailand', k);
        if (series.some(v => v != null)) {
          datasets.push({
            label: `Thailand • ${k}`,
            data: series,
            tension: 0.25,
            borderColor: '#22C55E',
            borderWidth: kindStyle[k]?.width || 2,
            borderDash: kindStyle[k]?.dash || [],
            pointRadius: 0,
            spanGaps: true
          });
        }
      }
      
      // United States
      for (const k of ['chicken breast', 'chicken thigh', 'soy']) {
        const series = buildSeries('United States', k);
        if (series.some(v => v != null)) {
          datasets.push({
            label: `United States • ${k}`,
            data: series,
            tension: 0.25,
            borderColor: '#F59E0B',
            borderWidth: kindStyle[k]?.width || 2,
            borderDash: kindStyle[k]?.dash || [],
            pointRadius: 0,
            spanGaps: true
          });
        }
      }
      
      // EU
      for (const k of ['chicken breast', 'chicken thigh', 'soy']) {
        const series = buildSeries('EU', k);
        if (series.some(v => v != null)) {
          datasets.push({
            label: `EU • ${k}`,
            data: series,
            tension: 0.25,
            borderColor: '#3B82F6',
            borderWidth: kindStyle[k]?.width || 2,
            borderDash: kindStyle[k]?.dash || [],
            pointRadius: 0,
            spanGaps: true
          });
        }
      }
    } else if (view === 'soy') {
      // Soy only
      for (const [country, color] of [['Thailand', '#22C55E'], ['United States', '#F59E0B'], ['EU', '#3B82F6']]) {
        const series = buildSeries(country, 'soy');
        if (series.some(v => v != null)) {
          datasets.push({
            label: `${country} • soy`,
            data: series,
            tension: 0.25,
            borderColor: color,
            borderWidth: 2,
            borderDash: [10, 5],
            pointRadius: 0,
            spanGaps: true
          });
        }
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
