import requests
import json
import pandas as pd
from datetime import datetime
import time
import os

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

    def fetch_year_data(self, year):
        print(f"Fetching data for {year}...")
        observations = []
        per_page = 200
        page = 1
        
        while True:
            params = {
                **self.FAIRFAX_BOUNDS,
                'per_page': per_page,
                'page': page,
                'year': year,
                'quality_grade': 'research',  # Only research-grade observations
                'photos': 'true',            # Must have photos
                'identifications': 'most_agree'  # Consensus on identification
            }
            
            try:
                response = requests.get(f'{self.API_BASE_URL}/observations', params=params)
                response.raise_for_status()
                data = response.json()
                
                # Filter and clean the observations
                filtered_batch = []
                for obs in data['results']:
                    if obs.get('taxon') and obs.get('observed_on'):
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
                        filtered_batch.append(filtered_obs)
                
                observations.extend(filtered_batch)
                print(f"  Retrieved {len(filtered_batch)} valid observations (Total: {len(observations)})")
                
                if len(data['results']) < per_page:
                    break
                    
                page += 1
                time.sleep(1)  # Rate limiting
                
            except Exception as e:
                print(f"Error on page {page}: {str(e)}")
                break
        
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
    
    # Process each year
    total_observations = 0
    yearly_counts = {}
    
    for year in range(2015, 2025):
        print(f"\nProcessing year {year}")
        print("-" * 50)
        observations = fetcher.fetch_year_data(year)
        fetcher.save_data(observations, year)
        yearly_counts[year] = len(observations)
        total_observations += len(observations)
        time.sleep(2)  # Delay between years
    
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