"""Offline release policy checks; never contacts or deploys to Cloudflare."""
import json
from pathlib import Path
import tomllib

production = tomllib.loads(Path('wrangler.toml').read_text())
preview = json.loads(Path('wrangler.preview.json').read_text())
assert production['name'] == 'smarttrade-ai'
assert production['main'] == 'cloudflare/src/production.js'
assert production['workers_dev'] is False
assert production['preview_urls'] is False
assert not production.get('routes'), 'Production route requires separate review'
assert preview['name'] == 'smarttrade-ai-preview'
assert preview['main'] == 'cloudflare/src/preview.js'
assert preview['workers_dev'] is True
assert preview['preview_urls'] is False
for config in (production, preview):
    assert config['assets'] == {'directory': './preview-public', 'binding': 'ASSETS', 'run_worker_first': True}
    assert config['durable_objects']['bindings'] == [{'name': 'MARKET_QUOTA', 'class_name': 'MarketQuota'}]
    assert config['migrations'] == [{'tag': 'v1_market_quota', 'new_sqlite_classes': ['MarketQuota']}]
    assert not config.get('d1_databases'), 'D1 must stay disabled'
    assert config.get('vars', {}).get('PORTFOLIO_SYNC_ENABLED') != 'true'
assert production['vars'] == {'MARKET_DISPLAY_APPROVED': 'false', 'MARKET_QUOTA_GUARD_READY': 'false'}
print('PASS: separate runtime targets, shared UI/guards, market and D1 disabled; no production route')
