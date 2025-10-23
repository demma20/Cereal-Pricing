
PREF_BY_COMMODITY = {
  "soy": ["wholesale", "farmgate", "retail"],
  "soybean_meal": ["wholesale", "farmgate", "retail"],
  "chicken": ["wholesale", "carcass", "farmgate", "retail"],
  "beef": ["wholesale", "carcass", "farmgate", "retail"],
  "pork": ["wholesale", "carcass", "farmgate", "retail"],
}
COUNTRY_OVERRIDES = {
  ("EU","chicken"): ["carcass","wholesale","farmgate","retail"],
  ("EU","beef"): ["carcass","wholesale","farmgate","retail"],
  ("EU","pork"): ["carcass","wholesale","farmgate","retail"],
}
FX_TO_USD = { "USD":1.0, "EUR":1.08, "INR":0.012, "THB":0.027, "CNY":0.14 }
