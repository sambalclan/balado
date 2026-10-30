import requests
import json
import os
import re

URL = "https://api.clashk.ing/v2/clan/%232RVRP900V/wars"

OUTPUT = "data/war_stats"
INDEX = "data/war_stats_index.json"

os.makedirs(OUTPUT, exist_ok=True)

response = requests.get(URL, timeout=30)
response.raise_for_status()

result = response.json()

# Mendukung respons berupa array atau objek berisi items/wars.
if isinstance(result, list):
    wars = result
elif isinstance(result, dict):
    wars = result.get("items", result.get("wars", []))
else:
    raise ValueError("Format respons API tidak dikenal")

if not isinstance(wars, list):
    raise ValueError("Daftar War bukan array")

files = []

for war in wars:
    if not isinstance(war, dict):
        continue

    # Sebagian API menyimpan data War dalam objek 'data'.
    data = war.get("data", war)

    if not isinstance(data, dict):
        continue

    start = data.get("startTime")

    if not start:
        print("Lewati War tanpa startTime")
        continue

    # Pastikan nama file aman.
    start = re.sub(r"[^a-zA-Z0-9._-]", "_", str(start))

    filename = f"war_{start}.json"
    filepath = os.path.join(OUTPUT, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    files.append(filename)
    print("Tersimpan:", filename)

# Hapus duplikat dan urutkan dari terbaru.
files = sorted(set(files), reverse=True)

with open(INDEX, "w", encoding="utf-8") as f:
    json.dump(files, f, indent=2, ensure_ascii=False)

print(f"\nSelesai! {len(files)} file War dibuat.")