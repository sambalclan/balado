import json
import os
from datetime import datetime, timezone
from urllib.parse import quote, unquote

import requests
from config import BASE_URL, CLAN_TAG, HEADERS


DATA_DIR = 'data/cwl_stats'
INDEX_PATH = 'data/cwl_stats_index.json'


def encode_tag(tag):
    """Accept plain, #prefixed, or URL-encoded Clash of Clans tags."""
    tag = str(tag).strip()
    for _ in range(3):
        decoded = unquote(tag)
        if decoded == tag:
            break
        tag = decoded
    return quote('#' + tag.lstrip('#').upper(), safe='')


def fetch_json(path):
    url = f"{BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        if response.status_code != 200:
            print(f'API request failed ({response.status_code}): {path}')
            return None
        return response.json()
    except (requests.RequestException, ValueError) as error:
        print(f'API request error: {error}')
        return None


def update_cwl_data():
    clan_tag = encode_tag(CLAN_TAG)
    group = fetch_json(f'clans/{clan_tag}/currentwar/leaguegroup')
    if group is None:
        print('CWL group data unavailable. No snapshot saved.')
        return

    war_tags = [tag for round_data in group.get('rounds', [])
                for tag in round_data.get('warTags', []) if tag != '#0']
    wars = []
    for tag in dict.fromkeys(war_tags):
        war = fetch_json(f'clanwarleagues/wars/{encode_tag(tag)}')
        if war is not None:
            wars.append(war)

    os.makedirs(DATA_DIR, exist_ok=True)
    today = datetime.now(timezone.utc).strftime('%Y%m%d')
    filename = f'cwl_{today}.json'
    snapshot_path = os.path.join(DATA_DIR, filename)
    snapshot = {
        'collectedAt': datetime.now(timezone.utc).isoformat(),
        'group': group,
        'wars': wars,
    }

    with open(snapshot_path, 'w', encoding='utf-8') as file:
        json.dump(snapshot, file, indent=4, ensure_ascii=False)
    print(f'Saved CWL snapshot to {snapshot_path} ({len(wars)} wars)')

    index = []
    if os.path.exists(INDEX_PATH):
        try:
            with open(INDEX_PATH, 'r', encoding='utf-8') as file:
                index = json.load(file)
            if not isinstance(index, list):
                index = []
        except (OSError, ValueError):
            index = []

    if filename not in index:
        index.append(filename)
    index.sort(reverse=True)
    with open(INDEX_PATH, 'w', encoding='utf-8') as file:
        json.dump(index, file, indent=4)
    print(f'Updated CWL index: {INDEX_PATH}')


if __name__ == '__main__':
    update_cwl_data()
