async function load() {
  // --- fetch robustly ---
  let raw = [];
  try {
    const res = await fetch('../data/latest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
    if (!Array.isArray(raw)) raw = [];
  } catch (e) {
    console.error('Failed to load latest.json:', e);
    raw = [];
  }

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
    if (text.includes('soy')) return 'soy';
    if (
      c === 'chicken breast' ||
      text.includes('breast') ||
      text.includes('fillet') || text.includes('fillets') ||
      text.includes('b/s') || text.includes('boneless skinless')
    ) return 'chicken breast';
    if (c === 'chicken thigh' || text.includes('thigh')) return 'chicken thigh';
    if (text.includes('leg')) return 'chicken thigh'; // EU "legs" maps to thigh
    if (c === 'chicken' || text.includes('chicken') || text.includes('broiler') || text.includes('poultry')) return 'chicken';
    return row?.commodity || '';
  }

  // Precompute kind on each row
  const data = raw.map(r => ({ ...r, __kind: normalizeKind(r) }));

  // ---------- UI elements (guard early if missing) ----------
  const viewSel = $('view');
  const countrySel = $('country');
  const commoditySel = $('commodity');
  const latestEl = $('latest');
  const inrEl = $('inr');
  const sourceEl = $('source');
  const chartCanvas = $('chart');

  if (!viewSel || !countrySel || !commoditySel || !latestEl || !inrEl || !sourceEl || !chartCanvas) {
    console.warn('Required DOM elements missing; aborting render.');
    return;
  }
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded; aborting render.');
    latestEl.textContent = '—';
    inrEl.textContent = '—';
    sourceEl.textContent = 'Load Chart.js';
    return;
  }

  // ---------- UI lists ----------
  const countries = uniq(data.map(d => d.country).filter(Boolean));
  const commodities = uniq(data.map(d => d.commodity).filter(Boolean));

  // ---------- formatters ----------
  const fmtUSD = v => (v == null || Number.isNaN(v) ? '—' : `$${v.toFixed(2)} USD/kg`);
  const fmtINR = v => (v == null || Number.isNaN(v) ? '—' : `₹${Math.round(v).toLocaleString('en-IN')} INR/kg`);

  // Fill selects
  function fill(el, items){ el.innerHTML = items.map(x=>`<option value="${x}">${x}</option>`).join(''); }
  fill(countrySel, countries);
  fill(commoditySel, commodities);

  // defaults
  viewSel.value = 'single';
  countrySel.value = countries.includes('United States') ? 'United States' :
                     (countries.includes('EU') ? 'EU' :
                     (countries.includes('European Union') ? 'European Union' : countries[0] || ''));
  commoditySel.value = commodities[0] || '';

  // colors per country - fixed colors
  const countryColor = {
    'Thailand': '#22C55E',
    'United States': '#F59E0B',
    'EU': '#3B82F6',
    'European Union': '#3B82F6'
  };

  // line styles per normalized kind
  const kindStyle = {
    'chicken':        { dash: [],       width: 2.5 },
    'chicken thigh':  { dash: [8,4],    width: 2.5 },
    'chicken breast': { dash: [3,3],    width: 2.5 },
    'soy':            { dash: [10,5],   width: 2   }
  };

  // master date labels across all rows
  const allDates = uniq(data.map(d => d.date).filter(Boolean)).sort((a,b)=> toDate(a)-toDate(b));

  // country alias match
  function countryMatches(target, rowCountry) {
    if (!target || !rowCountry) return false;
    if (target === rowCountry) return true;
    const isEU = (x) => x === 'EU' || x === 'European Union';
    return isEU(target) && isEU(rowCountry);
  }

  // build a series aligned to master dates for (country, normalized kind)
  function buildSeries(countryName, kind) {
    const rows = data.filter(d => countryMatches(countryName, d.country) && d.__kind === kind)
                     .sort((a,b)=> toDate(a.date)-toDate(b.date));
    const map = new Map(rows.map(r => [r.date, usdFromRow(r)]));
    return allDates.map(dt => map.get(dt) ?? null);
  }

  // cards
  function updateCardsSingle(rows) {
    if (!rows.length) {
      latestEl.textContent = '—';
      inrEl.textContent = '—';
      sourceEl.textContent = 'No data';
      return;
    }
    const last = rows[rows.length - 1];
    const lastUSD = usdFromRow(last);
    latestEl.textContent = fmtUSD(lastUSD);

    const inrPerUsd = last.fx_inr_per_usd ?? (last.fx_usd_per_inr ? 1 / last.fx_usd_per_inr : null);
    const lastINR = last.inr_per_kg ?? (lastUSD != null && inrPerUsd != null ? lastUSD * inrPerUsd : null);
    inrEl.textContent = fmtINR(lastINR);

    sourceEl.textContent = [last.market_level, last.source].filte_]()
