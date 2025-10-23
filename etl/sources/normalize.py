
from datetime import datetime
import pandas as pd

SCHEMA = [
    "date","country","source","commodity","product_form","market_level",
    "price_per_kg","currency","unit_raw","frequency","notes"
]

def ensure_schema(df: pd.DataFrame) -> pd.DataFrame:
    for col in SCHEMA:
        if col not in df.columns:
            df[col] = None
    df = df[SCHEMA]
    # enforce types
    df["date"] = pd.to_datetime(df["date"]).dt.date.astype(str)
    df["price_per_kg"] = pd.to_numeric(df["price_per_kg"], errors="coerce")
    return df

def convert_to_perkg(value, unit):
    # Extend this with your unit conversions e.g., 'EUR/100kg' -> EUR/kg
    if unit.lower() in ("usd/kg","eur/kg","inr/kg"):
        return value
    if unit.lower() in ("eur/100kg","usd/100kg","inr/100kg"):
        return value / 100.0
    if unit.lower() in ("inr/quintal","rs/quintal","inr/100kg"):
        return value / 100.0
    return value  # default passthrough
