import geopandas as gpd
from shapely.geometry import Point
import json
import os
from datetime import datetime

class BoundaryFilter:
    def __init__(self):
        self.data_dir = os.path.join(os.path.dirname(__file__), 'data')
        self.boundary = self.load_boundary()
        
    def load_boundary(self):
        """Load and validate FFX boundary"""
        shp_path = os.path.join(self.data_dir, 'FFX_Boundary.shp')
        boundary = gpd.read_file(shp_path)
        # Convert to WGS84 (standard GPS coordinates)
        if boundary.crs != 'EPSG:4326':
            boundary = boundary.to_crs('EPSG:4326')
        print(f"\nBoundary CRS: {boundary.crs}")
        return boundary

    def point_in_boundary(self, lat, lng):
        """Check if point falls within boundary"""
        # Create point in WGS84
        point = gpd.GeoDataFrame(
            geometry=[Point(lng, lat)], 
            crs='EPSG:4326'
        )
        return self.boundary.contains(point.geometry)[0]

    def filter_observations(self):
        total_processed = 0
        total_removed = 0
        
        for year in range(2016, 2025):
            json_path = os.path.join(self.data_dir, f'observations_{year}.json')
            if not os.path.exists(json_path):
                continue
                
            print(f"\nProcessing {year}...")
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            # Test first few points for debugging
            print("\nTesting sample points:")
            for obs in data['observations'][:3]:
                if obs.get('location'):
                    lat, lng = map(float, obs['location'].split(','))
                    print(f"Sample point: {lat}, {lng}")
                    print(f"Location string: {obs['location']}")
                    is_in = self.point_in_boundary(lat, lng)
                    print(f"Is in boundary: {is_in}\n")

            # Process all points
            filtered_obs = []
            removed_obs = []
            
            for obs in data['observations']:
                if (location := obs.get('location')):
                    try:
                        lat, lng = map(float, location.split(','))
                        if self.point_in_boundary(lat, lng):
                            filtered_obs.append(obs)
                        else:
                            removed_obs.append(obs)
                    except ValueError as e:
                        print(f"Error parsing coordinates: {location}")
                        removed_obs.append(obs)
                else:
                    removed_obs.append(obs)

            # Save results
            if filtered_obs:  # Only save if we have valid observations
                data['observations'] = filtered_obs
                data['count'] = len(filtered_obs)
                data['last_validated'] = datetime.now().isoformat()
                
                with open(json_path, 'w') as f:
                    json.dump(data, f, indent=2)
                
                with open(os.path.join(self.data_dir, f'removed_{year}.json'), 'w') as f:
                    json.dump({
                        'year': year,
                        'count': len(removed_obs),
                        'observations': removed_obs
                    }, f, indent=2)
                
                print(f"\nResults for {year}:")
                print(f"  Original: {len(data['observations'])}")
                print(f"  Removed: {len(removed_obs)}")
                print(f"  Remaining: {len(filtered_obs)}")
                
                total_processed += len(data['observations'])
                total_removed += len(removed_obs)

        print(f"\nFinal Summary:")
        print(f"Total processed: {total_processed}")
        print(f"Total removed: {total_removed}")

def main():
    filter = BoundaryFilter()
    filter.filter_observations()

if __name__ == "__main__":
    main()