# attribution_test.py
import requests
import json
from pprint import pprint

def test_attribution_format():
    API_URL = 'https://api.inaturalist.org/v1/observations'
    
    # Query parameters
    params = {
        'photos': 'true',
        'per_page': 1,
        'order': 'desc',
        'order_by': 'created_at',
        'quality_grade': 'research'
    }
    
    try:
        print('Fetching observation...')
        response = requests.get(API_URL, params=params)
        response.raise_for_status()
        
        data = response.json()
        
        if data['results'] and data['results'][0]:
            obs = data['results'][0]
            
            print('\nPhoto Attribution Data:')
            print('====================')
            
            if obs.get('photos') and obs['photos'][0]:
                photo = obs['photos'][0]
                attribution_data = {
                    'photo_url': photo['url'],
                    'license_code': photo.get('license_code'),
                    'attribution': photo.get('attribution'),
                    'observer': obs['user'].get('name') or obs['user'].get('login'),
                    'user_data': {
                        'name': obs['user'].get('name'),
                        'login': obs['user'].get('login'),
                        'id': obs['user'].get('id')
                    },
                    'full_photo_data': photo
                }
                pprint(attribution_data)
                
    except requests.exceptions.RequestException as e:
        print(f'Error: {str(e)}')

if __name__ == '__main__':
    test_attribution_format()