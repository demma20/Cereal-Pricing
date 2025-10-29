import pandas as pd
import matplotlib.pyplot as plt

# If your list is called `data` already, keep this. Otherwise, assign it.
df = pd.DataFrame(data)
df['date'] = pd.to_datetime(df['date'], errors='coerce')

# y-axis: prefer USD if present, else price_per_kg (mixed currencies → see note below)
df['y'] = df['usd_per_kg'].where(df['usd_per_kg'].notna(), df['price_per_kg'])

# normalize “cut” labels
def infer_cut(row):
    c = (row.get('commodity') or '').lower()
    pf = (row.get('product_form') or '').lower()
    if 'breast' in c or 'breast' in pf:
        return 'breast'
    if 'thigh' in c or 'thigh' in pf:
        return 'thigh'
    if 'chicken' in c:
        return 'chicken'
    return None

df['cut'] = df.apply(infer_cut, axis=1)

# keep only chicken entries (drop soy, etc.)
df = df[df['cut'].notna()].copy()

# target series definitions: (country, cut, label)
targets = [
    ('Thailand',        'chicken', 'Thailand — Chicken'),
    ('United States',   'breast',  'US — Breast'),
    ('United States',   'thigh',   'US — Thigh'),
    ('European Union',  'breast',  'EU — Breast'),
    ('European Union',  'thigh',   'EU — Thigh'),  # will be skipped if absent
]

# visual mapping: color by region, linestyle by cut
color_by_country = {
    'Thailand': '#d62728',        # red
    'United States': '#1f77b4',   # blue
    'European Union': '#2ca02c',  # green
}
linestyle_by_cut = {
    'breast': '-',     # solid
    'thigh': '--',     # dashed
    'chicken': '-.',   # dash-dot
}

plt.figure(figsize=(10, 5))
plotted_any = False

for country, cut, label in targets:
    s = df[(df['country'] == country) & (df['cut'] == cut)].sort_values('date')
    if s.empty:
        continue
    plt.plot(
        s['date'], s['y'],
        label=label,
        linestyle=linestyle_by_cut.get(cut, '-'),
        linewidth=2,
        color=color_by_country.get(country, None),
    )
    plotted_any = True

if not plotted_any:
    raise ValueError("No matching series found. Check country/cut names.")

plt.xlabel('Date')
plt.ylabel('Price per kg (USD if available; else native currency)')
plt.title('Wholesale Chicken Prices: TH (chicken), US (breast/thigh), EU (breast/thigh)')
plt.legend()
plt.tight_layout()
plt.show()
