import json
from shapely.geometry import Point, shape
from shapely.ops import transform
from pyproj import CRS, Transformer
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def load_county_boundary():
    with open('ffx.geojson', 'r') as f:
        geojson = json.load(f)
        
        # Convert from Web Mercator to WGS84
        transformer = Transformer.from_crs(
            CRS("EPSG:3857"),  # Web Mercator
            CRS("EPSG:4326"),  # WGS84
            always_xy=True
        )
        
        # Transform geometry to WGS84
        polygon = shape(geojson['features'][0]['geometry'])
        polygon = transform(transformer.transform, polygon)
        
        # Debug boundary extent (should now be in lat/lon)
        minx, miny, maxx, maxy = polygon.bounds
        logger.debug(f"Boundary bounds (WGS84): [{minx:.4f}, {miny:.4f}] to [{maxx:.4f}, {maxy:.4f}]")
        return polygon

def parse_location(location_str):
    """Parse location string in format '38.847905,-77.3032533333'"""
    try:
        if not location_str or ',' not in location_str:
            return None
        lat, lon = map(float, location_str.strip().split(','))
        return lat, lon
    except ValueError as e:
        logger.warning(f"Invalid location format: {location_str} - {e}")
        return None

def is_in_fairfax(lat, lon, ffx_polygon):
    point = Point(lon, lat)  # GeoJSON uses (lon, lat)
    return ffx_polygon.contains(point)

def validate_observation(obs):
    """Validate observation format and return location if valid"""
    required_fields = ['id', 'location']
    
    # Check if all required fields exist
    if not all(field in obs for field in required_fields):
        logger.debug(f"Missing required fields in observation {obs.get('id', 'unknown')}")
        return None
        
    return obs['location']

def filter_observations_for_year(year, ffx_polygon):
    input_file = f'observations_{year}.json'
    output_file = f'observations_{year}_ffx.json'
    
    try:
        with open(input_file, 'r') as f:
            data = json.load(f)
            
        # Validate basic structure
        if not all(key in data for key in ['year', 'observations']):
            logger.error(f"Invalid file format for {year}")
            return
            
        if year != data['year']:
            logger.warning(f"Year mismatch in {input_file}: {year} vs {data['year']}")
    except FileNotFoundError:
        logger.warning(f"File {input_file} not found - skipping")
        return
    
    filtered_obs = []
    total = len(data['observations'])
    errors = 0
    
    # Log sample record structure
    if total > 0:
        logger.debug(f"Sample record keys for {year}: {list(data['observations'][0].keys())}")
    
    for obs in data['observations']:
        try:
            location = validate_observation(obs)
            if location:
                lat, lon = map(float, location.split(','))
                if is_in_fairfax(lat, lon, ffx_polygon):
                    filtered_obs.append(obs)
        except (ValueError, AttributeError) as e:
            errors += 1
            if errors <= 5:
                logger.warning(f"Error processing observation {obs.get('id', 'unknown')}: {e}")
            continue
    
    data['observations'] = filtered_obs
    data['total_count'] = len(filtered_obs)
    
    with open(output_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    logger.info(f"Year {year}: {len(filtered_obs)}/{total} observations in Fairfax County (errors: {errors})")

def process_all_years():
    years = range(2015, 2025)
    ffx_polygon = load_county_boundary()
    logger.info("Starting processing for all years...")
    for year in years:
        filter_observations_for_year(year, ffx_polygon)
    logger.info("Completed processing all years")

if __name__ == "__main__":
    process_all_years()