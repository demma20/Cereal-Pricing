
import json
import pandas as pd
from pathlib import Path

from sources.normalize import ensure_schema
from sources.eu import generate_sample as eu_sample
from sources.india import generate_sample as india_sample
from sources.thailand import generate_sample as th_sample
from sources.china import generate_sample as cn_sample

OUT = Path(__file__).resolve().parents[1] / "data" / "latest.json"

def run():
    # Replace the sample series with real extractors once wired.
    frames = []
    frames.append(eu_sample("EU","EC Agri-food Portal","soy",0.55, product_form="grain"))
    frames.append(eu_sample("EU","EC Agri-food Portal","soybean_meal",0.42, product_form="meal_44_48"))
    frames.append(eu_sample("EU","EC Market Observatories","chicken",2.2, market_level="carcass"))
    frames.append(eu_sample("EU","EC Market Observatories","beef",4.5, market_level="carcass"))
    frames.append(eu_sample("EU","EC Market Observatories","pork",2.8, market_level="carcass"))

    frames.append(india_sample("India","AGMARKNET","soy",0.50, product_form="grain"))
    frames.append(india_sample("India","AGMARKNET","soybean_meal",0.38, product_form="meal_44_48"))

    frames.append(th_sample("Thailand","OAE/data.go.th","soy",0.53, product_form="grain", market_level="farmgate"))

    frames.append(cn_sample("China","MOFCOM/MARA","pork",3.1, market_level="retail"))
    frames.append(cn_sample("China","MOFCOM/MARA","chicken",2.0, market_level="retail"))
    frames.append(cn_sample("China","MOFCOM/MARA","beef",5.2, market_level="retail"))

    df = pd.concat(frames, ignore_index=True)
    df = ensure_schema(df)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(df.to_dict(orient="records"), f, indent=2)
    print(f"Wrote {len(df)} records to {OUT}")

if __name__ == "__main__":
    run()
