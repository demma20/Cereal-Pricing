
import pandas as pd
SCHEMA = ["date","country","source","commodity","product_form","market_level","price_per_kg","currency","unit_raw","frequency","notes"]
def ensure_schema(df: pd.DataFrame) -> pd.DataFrame:
    for col in SCHEMA:
        if col not in df.columns: df[col] = None
    df = df[SCHEMA]
    df["price_per_kg"] = pd.to_numeric(df["price_per_kg"], errors="coerce")
    df["date"] = pd.to_datetime(df["date"]).dt.date.astype(str)
    return df
