async function load() {
  const res = await fetch('../data/latest.json', { cache: 'no-store' });
  const data = await res.json();

  const $ = id => document.getElementById(id);
  const uniq = arr => [...new Set(arr)].sort();

  const countries = uniq(data.map(d => d.country));
  const commodities = uniq(data.map(d => d.commodity));

  // Formatters
  const fmtUSD = v => (v == null || Number.isNaN(v) ? "—" : `$${v.toFixed(2)} USD/kg`);
  const fmtINR = v => (v == null || Number.isNaN(v) ? "—" : `₹${Math.round(v).toLocaleString("en-IN")} INR/kg`);

  // Populate selects
  function fill(el, items){ el.innerHTML = items.map(x=>`<option value="${x}">${x}</option>`).join(''); }
  fill($('country'), countries);
  fill($('commodity'), commodities);

  $('country').value = countries.includes('United States') ? 'United States' : countries[0];
  $('commodity').value = 'soy';

  let chart;

  function render(){
    const c = $('country').value;
    const k = $('commodity').value;

    const rows = data
      .filter(d => d.country === c && d.commodity === k)
      .sort((a,b)=> new Date(a.date) - new Date(b.date));

    // If no data, clear UI and bail
    if (!rows.length) {
      $('latest').textContent = '—';
      $('inr').textContent = '—';
      $('source').textContent = '—';
      if (chart) { chart.destroy(); chart = null; }
      return;
    }

    const labels = rows.map(r => r.date);

    // Prefer precomputed USD, else derive via row FX
    const usdFromRow = r => {
      if (r.usd_per_kg != null) return r.usd_per_kg;
      if (r.price_per_kg != null && r.fx_rate_to_usd != null) return r.price_per_kg * r.fx_rate_to_usd;
      return null;
    };
    const values = rows.map(usdFromRow);

    const last = rows[rows.length - 1];

    // Headline USD (card 1)
    const lastUSD = usdFromRow(last);
    $('latest').textContent = fmtUSD(lastUSD);

    // Headline INR (card 2): prefer precomputed, else USD * INR per USD from the row
    const inrPerUsd = last.fx_inr_per_usd ?? (last.fx_usd_per_inr ? 1 / last.fx_usd_per_inr : null);
    const lastINR = last.inr_per_kg ?? (lastUSD != null && inrPerUsd != null ? lastUSD * inrPerUsd : null);
    $('inr').textContent = fmtINR(lastINR);

    // Source / FX note (card 3)
    $('source').textContent = last
      ? [last.market_level, last.source].filter(Boolean).join(' • ')
      : '—';
    // Draw chart (USD/kg)
    if (chart) chart.destroy();
    const ctx = $('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: `${c} • ${k} (USD/kg)`, data: values, tension: 0.25 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        elements: { point: { radius: 0 } },
        plugins: {
          legend: { display: true },
          decimation: { enabled: true, algorithm: 'lttb', samples: 200 }
        },
        scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { ticks: { maxTicksLimit: 6 } } },
        devicePixelRatio: 1
      }
    });
  }

  ['country','commodity'].forEach(id => $(id).addEventListener('change', render));
  render();
}

document.addEventListener('DOMContentLoaded', load);
