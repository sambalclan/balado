import requests
import json
import os
from config import BASE_URL, CLAN_TAG, HEADERS

# CLAN_TAG is URL-encoded ("%23ABC"); war data uses the plain tag ("#ABC")
MY_TAG = CLAN_TAG.replace('%23', '#').upper()
STARTED = ('inWar', 'warEnded')  # rounds that count towards player stats


def api_get(path):
    return requests.get(f"{BASE_URL}{path}", headers=HEADERS, timeout=30)


def fetch_round(war_tag, number):
    """Fetch one CWL war. Returns our side of it, or None when we are not in this war."""
    res = api_get(f"/clanwarleagues/wars/{war_tag.replace('#', '%23')}")
    if res.status_code != 200:
        print(f"Failed to fetch CWL war {war_tag}: {res.status_code}")
        return None

    war = res.json()
    for mine, enemy in (('clan', 'opponent'), ('opponent', 'clan')):
        if (war.get(mine) or {}).get('tag', '').upper() != MY_TAG:
            continue
        return {
            'round': number,
            'warTag': war_tag,
            'state': war.get('state'),
            'opponent': war[enemy].get('name', ''),
            'stars': war[mine].get('stars', 0),
            'members': [
                {
                    'tag': m.get('tag'),
                    'name': m.get('name'),
                    'townHallLevel': m.get('townhallLevel'),
                    'attacks': [
                        {'stars': a.get('stars', 0), 'destructionPercentage': a.get('destructionPercentage', 0)}
                        for a in m.get('attacks', [])
                    ],
                }
                for m in war[mine].get('members', [])
            ],
        }
    return None


def collect_rounds(group, cached):
    rounds = []
    for number, rnd in enumerate(group.get('rounds', []), start=1):
        tags = [t for t in rnd.get('warTags', []) if t != '#0']
        if not tags:
            continue  # round is not created yet

        old = cached.get(number)
        if old and old.get('state') == 'warEnded':
            rounds.append(old)  # finished rounds never change, no need to ask the API again
            continue

        # Our war in this round: try the one we already know first, otherwise scan all of them
        if old:
            tags.sort(key=lambda t: t != old['warTag'])
        found = next(filter(None, (fetch_round(t, number) for t in tags)), old)
        if found:
            rounds.append(found)
    return rounds


def summarize(rounds):
    """Per player totals over all rounds that have started."""
    players = {}
    for rnd in rounds:
        if rnd['state'] not in STARTED:
            continue
        for m in rnd['members']:
            p = players.setdefault(m['tag'], {
                'tag': m['tag'], 'name': m['name'], 'townHallLevel': m['townHallLevel'],
                'rounds': 0, 'attacks': 0, 'stars': 0, 'destruction': 0,
            })
            p['rounds'] += 1
            for a in m['attacks']:
                p['attacks'] += 1
                p['stars'] += a['stars']
                p['destruction'] += a['destructionPercentage']
    return sorted(players.values(), key=lambda p: (-p['stars'], -p['destruction']))


def update_index(filename):
    index_path = 'data/cwl_stats_index.json'
    index = []
    if os.path.exists(index_path):
        with open(index_path, 'r') as f:
            try:
                index = json.load(f)
            except ValueError:
                index = []

    if filename not in index:
        index.append(filename)
        index.sort(reverse=True)  # Newest first
        with open(index_path, 'w') as f:
            json.dump(index, f, indent=4)
        print(f"Added {filename} to CWL stats index.")


def update_cwl_data():
    res = api_get(f"/clans/{CLAN_TAG}/currentwar/leaguegroup")
    if res.status_code == 404:
        print("Clan is not in a Clan War League right now.")
        return
    if res.status_code != 200:
        print(f"Failed to fetch CWL group: {res.status_code}")
        return

    group = res.json()
    season = group.get('season')
    if group.get('state') in (None, 'notInWar') or not season:
        print("No CWL group found.")
        return

    os.makedirs('data/cwl_stats', exist_ok=True)
    filename = f"cwl_{season}.json"
    file_path = os.path.join('data/cwl_stats', filename)

    cached = {}
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r') as f:
                cached = {r['round']: r for r in json.load(f).get('rounds', [])}
        except (ValueError, KeyError, AttributeError, TypeError):
            cached = {}

    rounds = collect_rounds(group, cached)
    data = {
        'season': season,
        'state': group.get('state'),
        'rounds': rounds,
        'members': summarize(rounds),
    }
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=4)
    print(f"Saved CWL {season} ({len(rounds)} rounds) to {file_path}")

    update_index(filename)


if __name__ == "__main__":
    update_cwl_data()
    