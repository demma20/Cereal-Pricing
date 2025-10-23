
async function load() {
  const res = await fetch('../data/latest.json', {cache: 'no-store'});
  const data = await res.json();

  // Build filter options
  const countries = [...new Set(data.map(d => d.country))].sort();
  const commodities = [...new Set(data.map(d => d.commodity))].sort();
  const markets = [...new Set(data.map(d => d.market_level))].sort();
  const forms = [...new Set(data.map(d => d.product_form))].sort();

  const $ = id => document.getElementById(id);
  function fill(sel, items){ sel.innerHTML = items.map(x=>`<option value="${x}">${x||'—'}</option>`).join(''); }

  fill($('country'), countries);
  fill($('commodity'), commodities);
  fill($('market'), markets);
  fill($('form'), ['','grain','meal_44_48','carcass','retail','live', ...forms.filter(x=>x && !['grain','meal_44_48','carcass','retail','live'].includes(x))]);

  // Default selections
  $('country').value = countries[0];
  $('commodity').value = 'soy';
  $('market').value = markets.includes('wholesale') ? 'wholesale' : markets[0];
  $('form').value = '';

  let chart;
  function render(){
    const f = {
      country: $('country').value,
      commodity: $('commodity').value,
      market: $('market').value,
      form: $('form').value
    };
    const rows = data
      .filter(d => d.country===f.country && d.commodity===f.commodity && d.market_level===f.market && (f.form==='' || d.product_form===f.form))
      .sort((a,b)=> new Date(a.date) - new Date(b.date));

    const labels = rows.map(r => r.date);
    const values = rows.map(r => r.price_per_kg);
    const last = rows[rows.length-1];

    $('latest').textContent = last ? `${last.price_per_kg.toFixed(2)} ${last.currency}` : '—';
    $('latestDate').textContent = last ? last.date : '—';
    $('source').textContent = last ? `${last.source} (${last.frequency})` : '—';

    if (chart) chart.destroy();
    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: `${f.country} • ${f.commodity} • ${f.market}`, data: values, tension: .25 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { ticks: { maxTicksLimit: 8 }}, y: { beginAtZero: false } },
        plugins: { legend: { display: true } }
      }
    });
  }

  ['country','commodity','market','form'].forEach(id => document.getElementById(id).addEventListener('change', render));
  render();
}
load();
