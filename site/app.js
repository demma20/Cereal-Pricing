// app.js (browser)
(async () => {
  const countryEl = document.getElementById('country');
  const commodityEl = document.getElementById('commodity');
  const latestEl = document.getElementById('latest');
  const inrEl = document.getElementById('inr');
  const sourceEl = document.getElementById('source');
  const ctx = document.getElementById('chart').getContext('2d');

  let rows = [];
  let chart;

  function uniq(a){ return [...new Set(a)].filter(Boolean).sort(); }

  try {
    const res = await fetch('data/latest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = await res.json();
  } catch (e) {
    console.error('Failed to load data/latest.json:', e);
    return;
  }

  // populate filters
  const countries = uniq(rows.map(r => r.country));
  const commodities = uniq(rows.map(r => r.commodity));
  countryEl.innerHTML = '<option value="">All countries</option>' + countries.map(c=>`<option>${c}</option>`).join('');
  commodityEl.innerHTML = '<option value="">All metrics</option>' + commodities.map(c=>`<option>${c}</option>`).join('');

  function render(){
    const ctry = countryEl.value;
    const comm = commodityEl.value;

    let data = rows;
    if (ctry) data = data.filter(r => r.country === ctry);
    if (comm) data = data.filter(r => r.commodity === comm);
    data.sort((a,b)=>a.date.localeCompare(b.date));

    // headline cards
    const last = data[data.length - 1];
    latestEl.textContent = last ? String(last.value) : '';
    inrEl.textContent = last && last.inr_per_kg ? String(last.inr_per_kg) : '';
    sourceEl.textContent = last ? `${last.market || ''} ${last.source ? ' / ' + last.source : ''}`.trim() : '';

    // chart
    const labels = data.map(r=>r.date);
    const values = data.map(r=>r.value);
    if (!chart){
      chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Price per kg', data: values, tension: 0.25, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:false} } }
      });
    } else {
      chart.data.labels = labels;
      chart.data.datasets[0].data = values;
      chart.update();
    }
  }

  countryEl.addEventListener('change', render);
  commodityEl.addEventListener('change', render);
  render();
})();
