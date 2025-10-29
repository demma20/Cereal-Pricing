// Global variables
let allData = [];
let priceChart = null;

// Load and process data
async function loadData() {
    try {
        const response = await fetch('latest.json');
        allData = await response.json();
        
        // Get unique values for filters
        const countries = [...new Set(allData.map(d => d.country))].sort();
        const commodities = [...new Set(allData.map(d => d.commodity))].sort();
        
        // Populate filter dropdowns
        populateDropdown('commodityFilter', commodities);
        populateDropdown('countryFilter', countries);
        
        // Initial update
        updateDashboard();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function populateDropdown(id, values) {
    const select = document.getElementById(id);
    const allOption = select.querySelector('option');
    
    values.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

function updateDashboard() {
    const commodity = document.getElementById('commodityFilter').value;
    const country = document.getElementById('countryFilter').value;
    const metric = document.getElementById('metricFilter').value;
    
    let filtered = allData;
    
    if (commodity !== 'all') {
        filtered = filtered.filter(d => d.commodity === commodity);
    }
    
    if (country !== 'all') {
        filtered = filtered.filter(d => d.country === country);
    }
    
    if (metric !== 'all') {
        filtered = filtered.filter(d => d.product_form === metric);
    }
    
    updateCards(filtered);
    updateChart(filtered);
}

function updateCards(data) {
    if (data.length === 0) return;
    
    // Get most recent record
    const latest = data.reduce((a, b) => 
        new Date(a.date) > new Date(b.date) ? a : b
    );
    
    // Update headline price
    document.getElementById('headlinePrice').textContent = 
        `${latest.usd_per_kg.toFixed(2)} USD/kg`;
    
    // Update INR price
    document.getElementById('inrPrice').textContent = 
        latest.inr_per_kg ? `${latest.inr_per_kg.toFixed(2)}` : '—';
    
    // Update source info
    document.getElementById('marketLevel').textContent = latest.market_level || '—';
    document.getElementById('sourceInfo').textContent = latest.source || '—';
    document.getElementById('countryInfo').textContent = latest.country || '—';
    document.getElementById('commodityInfo').textContent = latest.commodity || '—';
}

function updateChart(data) {
    // Group data by country and metric
    const grouped = {};
    
    data.forEach(record => {
        const key = `${record.country} • ${record.commodity}`;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push({
            x: new Date(record.date),
            y: record.usd_per_kg  // Changed from 'price' to 'usd_per_kg'
        });
    });
    
    // Sort each group by date
    Object.keys(grouped).forEach(key => {
        grouped[key].sort((a, b) => a.x - b.x);
    });
    
    // Create datasets
    const datasets = Object.keys(grouped).map((key, index) => ({
        label: key,
        data: grouped[key],
        borderColor: getColor(index),
        backgroundColor: getColor(index, 0.1),
        borderWidth: 2,
        pointRadius: 0,
        fill: false
    }));
    
    const ctx = document.getElementById('priceChart').getContext('2d');
    
    if (priceChart) {
        priceChart.destroy();
    }
    
    priceChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'month',
                        displayFormats: {
                            month: 'MMM yyyy'
                        }
                    },
                    title: {
                        display: false
                    }
                },
                y: {
                    title: {
                        display: false
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': $' + 
                                context.parsed.y.toFixed(2) + '/kg';
                        }
                    }
                }
            }
        }
    });
}

function getColor(index, alpha = 1) {
    const colors = [
        `rgba(74, 144, 226, ${alpha})`,   // blue
        `rgba(80, 227, 194, ${alpha})`,   // teal
        `rgba(245, 166, 35, ${alpha})`,   // orange
        `rgba(126, 211, 33, ${alpha})`,   // green
        `rgba(208, 2, 27, ${alpha})`,     // red
        `rgba(74, 20, 140, ${alpha})`     // purple
    ];
    return colors[index % colors.length];
}

// Event listeners
document.getElementById('commodityFilter').addEventListener('change', updateDashboard);
document.getElementById('countryFilter').addEventListener('change', updateDashboard);
document.getElementById('metricFilter').addEventListener('change', updateDashboard);

// Initialize on page load
loadData();
