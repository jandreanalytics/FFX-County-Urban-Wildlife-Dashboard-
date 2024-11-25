import requests
import json
import pandas as pd
from datetime import datetime
import time
import os
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
from random import uniform

class INaturalistDataFetcher:
    def __init__(self):
        self.API_BASE_URL = 'https://api.inaturalist.org/v1'
        self.FAIRFAX_BOUNDS = {
            'swlat': 38.5950,
            'swlng': -77.5111,
            'nelat': 39.0024,
            'nelng': -77.1198
        }
        
        # Create data directory
        self.data_dir = os.path.join(os.path.dirname(__file__), 'data')
        os.makedirs(self.data_dir, exist_ok=True)

        # Configure retry strategy
        self.session = requests.Session()
        retries = Retry(
            total=5,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504]
        )
        self.session.mount('https://', HTTPAdapter(max_retries=retries))
        
        # Configure API authentication
        self.api_token = 'eyJhbGciOiJIUzUxMiJ9.eyJ1c2VyX2lkIjo4Nzc3MjA0LCJleHAiOjE3MzI2NDY5ODl9.bEzkLopMoBVvtm4vlNpN34Yhz6Y2G0E47L5Nm8xCC6d4Vr4T_wPayfl1QNyc6S_MUmRYl9xemOmcWwNbBHzNbg'
        self.headers = {
            'User-Agent': 'FairfaxBiodiversityProject/1.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_token}'
        }

    def load_existing_data(self, year):
        json_path = os.path.join(self.data_dir, f'observations_{year}.json')
        if os.path.exists(json_path):
            with open(json_path, 'r') as f:
                data = json.load(f)
                return data.get('observations', [])
        return []

    def make_request(self, url, params):
        """Make request with proper rate limiting and retries"""
        while True:
            try:
                response = self.session.get(
                    url, 
                    params=params, 
                    headers=self.headers
                )
                response.raise_for_status()
                
                # Increase delay between requests (3-5 seconds)
                time.sleep(uniform(3, 5))
                
                # Check rate limit headers
                remaining = int(response.headers.get('X-RateLimit-Remaining', 100))
                if remaining < 10:
                    wait_time = float(response.headers.get('X-RateLimit-Reset', 60))
                    print(f"Rate limit nearly reached, waiting {wait_time} seconds...")
                    time.sleep(wait_time + 5)  # Add buffer
                
                return response.json()
                
            except requests.exceptions.HTTPError as e:
                if e.response.status_code in [403, 429]:
                    retry_after = int(e.response.headers.get('Retry-After', 120))
                    print(f"Rate/Auth limited, waiting {retry_after} seconds...")
                    time.sleep(retry_after)
                    continue
                raise e

    def fetch_month_data(self, year, month, existing_ids, observations):
        per_page = 200
        month_params = {
            **self.FAIRFAX_BOUNDS,
            'per_page': per_page,
            'year': year,
            'month': month,
            'quality_grade': 'research',
            'photos': 'true',
            'identifications': 'most_agree'
        }

        try:
            # Check total observations for month
            data = self.make_request(f'{self.API_BASE_URL}/observations', month_params)
            total_results = data.get('total_results', 0)
            
            if total_results > 10000:
                print(f"    Month has {total_results} observations, splitting into smaller chunks...")
                # Split into 15-day chunks
                chunks = [(1,15), (16,31)]
                for start_day, end_day in chunks:
                    chunk_params = {**month_params, 'day': f"{start_day},{end_day}"}
                    self.process_chunk(chunk_params, existing_ids, observations)
            else:
                self.process_chunk(month_params, existing_ids, observations)
                
        except requests.exceptions.HTTPError as e:
            if e.response.status_code in [403, 429]:
                print(f"Rate limit reached for {year}-{month:02d}, skipping...")
                return False
            raise e
        return True

    def process_chunk(self, params, existing_ids, observations):
        data = self.make_request(f'{self.API_BASE_URL}/observations', params)
        total_pages = (data.get('total_results', 0) + params['per_page'] - 1) // params['per_page']
        
        for page in range(1, total_pages + 1):
            try:
                params['page'] = page
                data = self.make_request(f'{self.API_BASE_URL}/observations', params)
                
                new_observations = []
                for obs in data['results']:
                    if obs.get('taxon') and obs.get('observed_on'):
                        if obs['id'] not in existing_ids:
                            filtered_obs = {
                                'id': obs['id'],
                                'observed_on': obs['observed_on'],
                                'species_name': obs['taxon'].get('name'),
                                'common_name': obs['taxon'].get('preferred_common_name'),
                                'taxonomic_group': obs['taxon'].get('iconic_taxon_name'),
                                'location': obs.get('location'),
                                'place_guess': obs.get('place_guess'),
                                'photo_url': obs['photos'][0]['url'] if obs.get('photos') else None,
                                'scientific_name': obs['taxon'].get('scientific_name'),
                                'coordinates': {
                                    'lat': obs['latitude'],
                                    'lng': obs['longitude']
                                } if obs.get('latitude') and obs.get('longitude') else None
                            }
                            new_observations.append(filtered_obs)
                            existing_ids.add(obs['id'])
                
                if new_observations:
                    observations.extend(new_observations)
                    print(f"    Added {len(new_observations)} observations (Total: {len(observations)})")
                    
            except requests.exceptions.HTTPError as e:
                if e.response.status_code in [403, 429]:
                    print("Rate limit reached during chunk processing, saving progress...")
                    return False
                raise e
        return True

    def fetch_year_data(self, year):
        print(f"Fetching data for {year}...")
        existing_observations = self.load_existing_data(year)
        existing_ids = {obs['id'] for obs in existing_observations}
        observations = existing_observations.copy()

        # Process all months (removed April 2020 restriction)
        for month in range(1, 13):
            print(f"  Processing {year}-{month:02d}...")
            if not self.fetch_month_data(year, month, existing_ids, observations):
                break
            self.save_data(observations, year)
            print(f"  Progress saved: {len(observations)} total observations for {year}")
            time.sleep(2)
        
        return observations

    def save_data(self, observations, year):
        if not observations:
            print(f"No data to save for {year}")
            return
        
        # Save filtered data as JSON
        json_path = os.path.join(self.data_dir, f'observations_{year}.json')
        data_to_save = {
            'year': year,
            'total_count': len(observations),
            'last_updated': datetime.now().isoformat(),
            'observations': observations
        }
        
        with open(json_path, 'w') as f:
            json.dump(data_to_save, f, indent=2)
        
        print(f"Saved {len(observations)} observations for {year}")
        print(f"  JSON: {json_path}")

def main():
    fetcher = INaturalistDataFetcher()
    
    # Process each year starting from 2020
    total_observations = 0
    yearly_counts = {}
    
    for year in range(2020, 2025):  # Changed starting year to 2020
        print(f"\nProcessing year {year}")
        print("-" * 50)
        observations = fetcher.fetch_year_data(year)
        fetcher.save_data(observations, year)
        yearly_counts[year] = len(observations)
        total_observations += len(observations)
        time.sleep(2)
    
    # Save summary statistics
    summary = {
        'total_observations': total_observations,
        'yearly_counts': yearly_counts,
        'last_updated': datetime.now().isoformat()
    }
    
    with open(os.path.join(fetcher.data_dir, 'summary.json'), 'w') as f:
        json.dump(summary, f, indent=2)
    
    print("\nData collection complete!")
    print(f"Total observations: {total_observations}")
    print("\nYearly breakdown:")
    for year, count in yearly_counts.items():
        print(f"{year}: {count} observations")

if __name__ == "__main__":
    main()