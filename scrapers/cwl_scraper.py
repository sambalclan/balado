"""
Clan War League (CWL) scraper.

Menyimpan satu file JSON per musim CWL:
    data/cwl_stats/cwl_<season>.json      (contoh: cwl_2026-10.json)
dan daftar file di:
    data/cwl_stats_index.json             (terbaru di atas)

Desain "tidak boleh error":
- Semua error jaringan / HTTP / JSON ditangkap, script SELALU exit 0.
- Retry otomatis untuk timeout, 429, dan 5xx.
- War yang sudah selesai (warEnded) dipakai ulang dari file lama, tidak di-fetch ulang.
- File ditulis atomik (tulis ke .tmp lalu replace) sehingga tidak pernah korup.
- File hanya ditulis jika isinya berubah -> tidak ada commit kosong tiap 15 menit.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.parse import quote

import requests

try:
    from config import BASE_URL, CLAN_TAG, HEADERS
except Exception as e:  # CLAN_TAG hilang, dotenv tidak ada, dll.
    print(f"[CWL] Config error: {e}")
    sys.exit(0)

DATA_DIR = os.path.join("data", "cwl_stats")
INDEX_PATH = os.path.join("data", "cwl_stats_index.json")
TIMEOUT = 20
MAX_RETRIES = 3


# --------------------------------------------------------------------------- #
# Helper
# --------------------------------------------------------------------------- #
def api_get(path):
    """GET ke API dengan retry. Return (status_code, json_or_None). Tidak pernah raise."""
    url = f"{BASE_URL}{path}"
    status = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            res = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            status = res.status_code
            if status == 200:
                try:
                    return status, res.json()
                except ValueError:
                    print(f"[CWL] Respons bukan JSON valid: {path}")
                    return status, None
            # 429 / 5xx -> coba lagi; status lain (404, 403, dll.) -> berhenti
            if status == 429 or status >= 500:
                time.sleep(2 * attempt)
                continue
            return status, None
        except requests.RequestException as e:
            print(f"[CWL] Percobaan {attempt}/{MAX_RETRIES} gagal ({type(e).__name__}): {path}")
            time.sleep(2 * attempt)
    return status, None


def load_json(path, default):
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except (OSError, ValueError):
        pass
    return default


def save_json_atomic(path, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    os.replace(tmp, path)


def strip_meta(d):
    """Salinan tanpa field waktu-ambil, untuk membandingkan isi."""
    return {k: v for k, v in d.items() if k != "fetchedAt"}


def valid_war_tag(tag):
    return isinstance(tag, str) and tag.startswith("#") and tag != "#0" and len(tag) > 2


def update_index(filename):
    index = load_json(INDEX_PATH, [])
    if not isinstance(index, list):
        index = []
    if filename not in index:
        index.append(filename)
        index.sort(reverse=True)  # terbaru di atas (sama seperti clan_scraper)
        save_json_atomic(INDEX_PATH, index)
        print(f"[CWL] Menambahkan {filename} ke index.")


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def update_cwl_data():
    status, group = api_get(f"/clans/{CLAN_TAG}/currentwar/leaguegroup")

    if status == 404 or (status == 200 and isinstance(group, dict) and group.get("state") == "notInWar"):
        print("[CWL] Clan tidak sedang mengikuti CWL.")
        return
    if status != 200 or not isinstance(group, dict):
        print(f"[CWL] Gagal mengambil league group (status: {status}). Dilewati.")
        return

    season = group.get("season")
    if not season:
        print("[CWL] Data league group tidak punya 'season'. Dilewati.")
        return

    filename = f"cwl_{season}.json"
    file_path = os.path.join(DATA_DIR, filename)

    # War lama (yang sudah selesai tidak perlu di-fetch ulang)
    old = load_json(file_path, {})
    old_wars = old.get("wars", {}) if isinstance(old, dict) else {}
    if not isinstance(old_wars, dict):
        old_wars = {}

    wars = {}
    fetch_failed = 0
    rounds_out = []

    for rnd in group.get("rounds", []) or []:
        tags = [t for t in (rnd.get("warTags", []) if isinstance(rnd, dict) else []) if valid_war_tag(t)]
        rounds_out.append({"warTags": tags})

        for tag in tags:
            cached = old_wars.get(tag)
            if isinstance(cached, dict) and cached.get("state") == "warEnded":
                wars[tag] = cached
                continue

            st, war = api_get(f"/clanwarleagues/wars/{quote(tag, safe='')}")
            if st == 200 and isinstance(war, dict):
                wars[tag] = war
            else:
                fetch_failed += 1
                if isinstance(cached, dict):  # pakai data lama kalau fetch gagal
                    wars[tag] = cached

    result = dict(group)
    result["rounds"] = rounds_out
    result["wars"] = wars

    # Jangan timpa data bagus dengan data lebih sedikit
    if len(wars) < len(old_wars):
        print("[CWL] Data baru lebih sedikit dari data lama, mempertahankan data lama.")
        return

    if old and strip_meta(old) == result:
        print(f"[CWL] {filename}: tidak ada perubahan.")
        update_index(filename)
        return

    result["fetchedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    save_json_atomic(file_path, result)
    update_index(filename)
    print(f"[CWL] Tersimpan {file_path} (state: {group.get('state')}, "
          f"war: {len(wars)}, gagal fetch: {fetch_failed}).")


if __name__ == "__main__":
    try:
        update_cwl_data()
    except Exception as e:  # jaring pengaman terakhir: CWL tidak boleh menggagalkan workflow
        print(f"[CWL] Error tak terduga: {type(e).__name__}: {e}")
    sys.exit(0)
