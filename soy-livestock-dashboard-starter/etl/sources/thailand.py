
from datetime import date, timedelta
import pandas as pd

def generate_sample(country, source, commodity, base, drift=0.002, n_weeks=12, **extras):
    today = date.today()
    rows = []
    price = base
    for i in range(n_weeks, 0, -1):
        dt = today - timedelta(weeks=i)
        price *= (1 + drift)
        rows.append({
            "date": dt.isoformat(),
            "country": country,
            "source": source,
            "commodity": commodity,
            "product_form": extras.get("product_form",""),
            "market_level": extras.get("market_level","wholesale"),
            "price_per_kg": round(price, 2),
            "currency": extras.get("currency","USD"),
            "unit_raw": extras.get("unit_raw","USD/kg"),
            "frequency": extras.get("frequency","weekly"),
            "notes": "placeholder – replace with real extractor"
        })
    return pd.DataFrame(rows)

# TODO: Replace with OAE / data.go.th API calls
