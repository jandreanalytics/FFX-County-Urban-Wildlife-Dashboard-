# restore_all.py
import json
import os
from datetime import datetime

class FullRestorer:
    def __init__(self):
        self.data_dir = os.path.join(os.path.dirname(__file__), 'data')
    
    def restore_all(self):
        total_restored = 0
        
        for year in range(2016, 2025):
            removed_path = os.path.join(self.data_dir, f'removed_{year}.json')
            if not os.path.exists(removed_path):
                continue
                
            print(f"\nProcessing {year}...")
            
            # Load removed data
            with open(removed_path, 'r') as f:
                removed_data = json.load(f)
            
            # Create new observations file
            observations_data = {
                'year': year,
                'total_count': len(removed_data['observations']),
                'last_updated': datetime.now().isoformat(),
                'observations': removed_data['observations']
            }
            
            # Save as observations file
            json_path = os.path.join(self.data_dir, f'observations_{year}.json')
            with open(json_path, 'w') as f:
                json.dump(observations_data, f, indent=2)
            
            restored_count = len(removed_data['observations'])
            total_restored += restored_count
            
            print(f"  Restored {restored_count} observations")
            
        print(f"\nRestoration complete!")
        print(f"Total observations restored: {total_restored}")

def main():
    restorer = FullRestorer()
    restorer.restore_all()

if __name__ == "__main__":
    main()