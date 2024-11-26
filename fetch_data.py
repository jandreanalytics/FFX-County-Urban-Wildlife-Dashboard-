import requests
import json
import os
from datetime import datetime
import time
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
from random import uniform

class AttributionUpdater:
    def __init__(self):
        self.API_BASE_URL = 'https://api.inaturalist.org/v1'
        self.data_dir = os.path.join(os.path.dirname(__file__), 'data')
        self.session = self._configure_session()
        self.last_request_time = 0
        self.MIN_REQUEST_INTERVAL = 3

    def _configure_session(self):
        session = requests.Session()
        retries = Retry(
            total=5,
            backoff_factor=2,
            status_forcelist=[429, 500, 502, 503, 504]
        )
        session.mount('https://', HTTPAdapter(max_retries=retries))
        session.headers.update({
            'User-Agent': 'FairfaxBiodiversityProject/1.0',
            'Accept': 'application/json'
        })
        return session

    def _wait_for_rate_limit(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < self.MIN_REQUEST_INTERVAL:
            time.sleep(self.MIN_REQUEST_INTERVAL - elapsed + uniform(0.1, 0.5))
        self.last_request_time = time.time()

    def make_request(self, url, params):
        while True:
            try:
                self._wait_for_rate_limit()
                response = self.session.get(url, params=params)
                response.raise_for_status()
                
                remaining = int(response.headers.get('X-RateLimit-Remaining', 100))
                if remaining < 10:
                    wait_time = float(response.headers.get('X-RateLimit-Reset', 60))
                    print(f"Rate limit low, waiting {wait_time}s...")
                    time.sleep(wait_time + 5)
                
                return response.json()
                
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 429:
                    retry_after = int(e.response.headers.get('Retry-After', 60))
                    print(f"Rate limited, waiting {retry_after}s...")
                    time.sleep(retry_after + 5)
                    continue
                raise

    def update_attributions(self):
        total_updated = 0
        total_removed = 0
        
        for year in range(2020, 2025):
            json_path = os.path.join(self.data_dir, f'observations_{year}.json')
            if not os.path.exists(json_path):
                continue
            
            print(f"\nProcessing {year}...")
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            updated_count = 0
            removed_count = 0
            total_obs = len(data['observations'])
            
            for i, obs in enumerate(data['observations'], 1):
                if i % 10 == 0:
                    print(f"Progress: {i}/{total_obs} observations")
                    
                if obs.get('photo'):
                    try:
                        response = self.make_request(
                            f"{self.API_BASE_URL}/observations/{obs['id']}",
                            {}
                        )
                        
                        if response['results']:
                            result = response['results'][0]
                            if result.get('photos'):
                                photo = result['photos'][0]
                                observer = result['user'].get('name') or result['user'].get('login')
                                
                                if photo.get('license_code') not in [None, 0]:
                                    obs['photo'] = {
                                        'url': photo['url'],
                                        'license_code': photo.get('license_code'),
                                        'attribution': photo.get('attribution'),
                                        'photographer': observer
                                    }
                                    updated_count += 1
                                else:
                                    obs['photo'] = None
                                    removed_count += 1
                                    
                    except Exception as e:
                        print(f"Error processing observation {obs['id']}: {e}")
                        continue
            
            data['last_updated'] = datetime.now().isoformat()
            with open(json_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            total_updated += updated_count
            total_removed += removed_count
            print(f"Year {year}: Updated {updated_count} photos, Removed {removed_count} all-rights-reserved photos")

        print("\nFinal Summary:")
        print(f"Total photos updated with attribution: {total_updated}")
        print(f"Total all-rights-reserved photos removed: {total_removed}")

def main():
    updater = AttributionUpdater()
    updater.update_attributions()

if __name__ == "__main__":
    main()