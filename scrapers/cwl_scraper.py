import json
import os
from datetime import datetime, timezone
from urllib.parse import quote

import requests
from config import BASE_URL, ENCODED_CLAN_TAG, HEADERS

url = f"{BASE_URL}/clans/{ENCODED_CLAN_TAG}/currentwar/leaguegroup"


def fetch_json(session, path):
    response = session.get(f"{BASE_URL.rstrip('/')}{path}", timeout=TIMEOUT)
    if response.status_code == 404:
        print(f"Not found or unavailable: {path}")
        return None
    response.raise_for_status()
    return response.json()


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as file:
        json.dump(data, file, indent=2, ensure_ascii=False)


def update_cwl_data():
    os.makedirs(DATA_DIR, exist_ok=True)
    clan_tag = quote(CLAN_TAG if CLAN_TAG.startswith('#') else f'#{CLAN_TAG}', safe='')

    with requests.Session() as session:
        session.headers.update(HEADERS)
        try:
            group = fetch_json(session, f'/clans/{clan_tag}/currentwar/leaguegroup')
            if group is None:
                print('CWL group data is not available. No snapshot saved.')
                return

            war_tags = list(dict.fromkeys(
                tag for round_data in group.get('rounds', [])
                for tag in round_data.get('warTags', [])
                if tag and tag != '#0'
            ))
            wars = []
            for tag in war_tags:
                try:
                    war = fetch_json(session, f'/clanwarleagues/wars/{quote(tag, safe="")}')
                    if war is not None:
                        wars.append(war)
                except requests.RequestException as error:
                    print(f'Could not fetch CWL war {tag}: {error}')

        except requests.RequestException as error:
            print(f'Failed to fetch CWL group: {error}')
            return

    today = datetime.now(timezone.utc).strftime('%Y%m%d')
    filename = f'cwl_{today}.json'
    snapshot_path = os.path.join(DATA_DIR, filename)
    save_json(snapshot_path, {
        'collectedAt': datetime.now(timezone.utc).isoformat(),
        'clanTag': CLAN_TAG,
        'leagueGroup': group,
        'wars': wars,
        'warsFetched': len(wars),
        'warTagsTotal': len(war_tags),
    })

    index = []
    if os.path.exists(INDEX_PATH):
        try:
            with open(INDEX_PATH, encoding='utf-8') as file:
                existing = json.load(file)
                if isinstance(existing, list):
                    index = existing
        except (OSError, ValueError):
            print('Index invalid; creating a new index.')

    if filename not in index:
        index.append(filename)
    index.sort(reverse=True)
    save_json(INDEX_PATH, index)
    print(f'Saved {snapshot_path} ({len(wars)}/{len(war_tags)} CWL wars fetched)')


if __name__ == '__main__':
    update_cwl_data()
