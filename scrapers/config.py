import os
from urllib.parse import unquote, quote

raw_tag = os.environ["CLAN_TAG"].strip()

CLAN_TAG = "#" + unquote(raw_tag).lstrip("#")
ENCODED_CLAN_TAG = quote(CLAN_TAG, safe="")