
import json
from pathlib import Path
import pandas as pd
from sources.normalize import ensure_schema
from sources import eu, india, thailand, china, us
from config import PREF_BY_COMMODITY, COUNTRY_OVERRIDES, FX_TO_USD

OUT = Path(__file__).resolve().parents[1] / "data" / "latest.json"

def pick_preferred(df: pd.DataFrame) -> pd.DataFrame:
    out = []
    for (country, commodity, date), grp in df.groupby(["country","commodity","date"]):
        order = COUNTRY_OVERRIDES.get((country, commodity), PREF_BY_COMMODITY.get(commodity, ["wholesale","farmgate","retail","carcass"]))
        grp = grp.copy()
        grp["__rank"] = grp["market_level"].apply(lambda m: order.index(m) if m in order else 999)
        out.append(grp.sort_values("__rank").iloc[0].drop(labels="__rank"))
    return pd.DataFrame(out)

def add_usd(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["usd_per_kg"] = (df["price_per_kg"] * df["currency"].map(FX_TO_USD).fillna(0)).round(4)
    return df

def run():
    frames = []
    frames.append(eu.generate_sample("EU","EC Agri-food Portal","soy",0.55, product_form="grain", currency="EUR", market_level="wholesale"))
    frames.append(eu.generate_sample("EU","EC Agri-food Portal","soybean_meal",0.42, product_form="meal_44_48", currency="EUR", market_level="wholesale"))
    for meat, base in [("chicken",2.2),("beef",4.5),("pork",2.8)]:
        frames.append(eu.generate_sample("EU","EC Market Observatories", meat, base, product_form="carcass", currency="EUR", market_level="carcass"))
    frames.append(india.generate_sample("India","AGMARKNET","soy",45.0, product_form="grain", currency="INR", market_level="wholesale"))
    frames.append(india.generate_sample("India","AGMARKNET","soybean_meal",35.0, product_form="meal_44_48", currency="INR", market_level="wholesale"))
    frames.append(thailand.generate_sample("Thailand","OAE/data.go.th","soy",18.0, product_form="grain", currency="THB", market_level="farmgate"))
    for meat, base in [("pork",28.0),("chicken",16.0),("beef",60.0)]:
        frames.append(china.generate_sample("China","MOFCOM/MARA", meat, base, currency="CNY", market_level="retail"))
    frames.append(us.generate_sample("United States","USDA AMS Market News","soy",0.50, product_form="grain", currency="USD", market_level="wholesale"))
    frames.append(us.generate_sample("United States","USDA AMS Market News","soybean_meal",0.40, product_form="meal_44_48", currency="USD", market_level="wholesale"))
    for meat, base in [("chicken",2.1),("beef",4.8),("pork",2.6)]:
        frames.append(us.generate_sample("United States","USDA AMS Market News", meat, base, currency="USD", market_level="wholesale"))

    df = pd.concat(frames, ignore_index=True)
    df = ensure_schema(df)
    df = pick_preferred(df)
    df = add_usd(df)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(df.to_dict(orient="records"), f, indent=2)
    print(f"Wrote {len(df)} rows to {OUT}")

if __name__ == "__main__":
    run()
