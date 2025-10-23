
async function load() {
  const res = await fetch('../data/latest.json', { cache: 'no-store' });
  const data = await res.json();

  const $ = id => document.getElementById(id);
  const uniq = arr => [...new Set(arr)].sort();

  const countries = uniq(data.map(d => d.country));
  const commodities = uniq(data.map(d => d.commodity));

  function fill(el, items){ el.innerHTML = items.map(x=>`<option value="${x}">${x}</option>`).join(''); }
  fill($('country'), countries);
  fill($('commodity'), commodities);

  $('country').value = countries.includes('United States') ? 'United States' : countries[0];
  $('commodity').value = 'soy';

  let chart;
  function render(){
    const c = $('country').value;
    const k = $('commodity').value;
    const rows = data.filter(d => d.country===c && d.commodity===k).sort((a,b)=> new Date(a.date) - new Date(b.date));

    const labels = rows.map(r => r.date);
    const values = series.map(r => r.usd_per_kg);
    const last = series.at(-1);
    // after computing `last`
    document.getElementById('latest').textContent =
      series.length ? `$${(series.at(-1).usd_per_kg ?? NaN).toFixed(2)} USD` : '—';
    
    document.getElementById('inr').textContent =
      series.length && series.at(-1).inr_per_kg != null
        ? `${series.at(-1).inr_per_kg.toFixed(0)} INR`
        : '—';

    
    document.getElementById('source').textContent = last
      ? `${last.market_level} • ${last.source} • FX ${last.fx_source} (${last.fx_date}) — 1 USD = ${ (last.fx_inr_per_usd || (1/(last.fx_usd_per_inr||NaN)) ).toFixed(2) } INR`
      : '—';

    $('latest').textContent = last ? `${last.price_per_kg.toFixed(2)} ${last.currency}` : '—';
    $('usd').textContent = last && last.usd_per_kg ? `$${last.usd_per_kg.toFixed(2)} USD` : '—';
    $('meta').textContent = last ? `${last.market_level} • ${last.source}` : '—';
  
    if (chart) chart.destroy();
    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: `${c} • ${k}`, data: values, tension: 0.25 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        elements: { point: { radius: 0 } },
        plugins: { legend: { display: true }, decimation: { enabled: true, algorithm: 'lttb', samples: 200 } },
        scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { ticks: { maxTicksLimit: 6 } } },
        devicePixelRatio: 1
      }
    });
  }

  ['country','commodity'].forEach(id => $(id).addEventListener('change', render));
  render();
}
document.addEventListener('DOMContentLoaded', load);
