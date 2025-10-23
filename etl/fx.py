# etl/fx.py
import datetime as dt
import xml.etree.ElementTree as ET
import requests

ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"

def _from_ecb() -> tuple[dict, str]:
    """Return (rates_to_usd, fx_date). Each entry is USD per 1 unit of CURRENCY."""
    r = requests.get(ECB_URL, timeout=15)
    r.raise_for_status()
    root = ET.fromstring(r.text)

    # Parse: ECB publishes EUR->CURRENCY; we want USD per CURRENCY.
    # Find the Cube time + rates
    ns = {"e": "http://www.ecb.int/vocabulary/2002-08-01/eurofxref"}
    # Some files have no namespace; handle both
    cubes = root.findall(".//Cube/Cube/Cube") or root.findall(".//{*}Cube/{*}Cube/{*}Cube")
    parent = root.find(".//Cube/Cube") or root.find(".//{*}Cube/{*}Cube")
    fx_date = parent.get("time") if parent is not None else dt.date.today().isoformat()

    eur_to = {"EUR": 1.0}
    for c in cubes:
        eur_to[c.get("currency")] = float(c.get("rate"))

    # Need EUR->USD to build USD per currency:
    if "USD" not in eur_to:
        raise RuntimeError("ECB payload missing USD rate")
    eur_to_usd = eur_to["USD"]

    # USD per 1 unit of currency X = (USD per EUR) / (X per EUR)
    to_usd = {}
    for cur, eur_x in eur_to.items():
        if eur_x == 0:
            continue
        to_usd[cur] = eur_to_usd / eur_x

    # And define USD itself
    to_usd["USD"] = 1.0
    return to_usd, fx_date

def load_fx(fallback: dict[str, float] | None = None) -> tuple[dict, str, str]:
    """Return (to_usd_map, fx_date, fx_source). Fallback if ECB fails."""
    try:
        m, d = _from_ecb()
        return m, d, "ECB eurofxref daily"
    except Exception:
        d = dt.date.today().isoformat()
        return (fallback or {"USD":1.0, "EUR":1.08, "INR":0.012, "THB":0.027, "CNY":0.14}), d, "fallback: static map"
