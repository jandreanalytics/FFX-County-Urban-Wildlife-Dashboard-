import os
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def replace_with_ffx_files():
    # Find all _ffx.json files
    ffx_files = Path('.').glob('observations_*_ffx.json')
    
    for ffx_file in ffx_files:
        try:
            # Get original filename by removing _ffx
            original_file = ffx_file.name.replace('_ffx.json', '.json')
            
            logger.info(f"Processing: {ffx_file} -> {original_file}")
            
            # Read filtered data
            with open(ffx_file, 'r') as f:
                filtered_data = json.load(f)
            
            # Write to original file
            with open(original_file, 'w') as f:
                json.dump(filtered_data, f, indent=2)
            
            # Delete _ffx file
            os.remove(ffx_file)
            logger.info(f"Successfully replaced {original_file} and removed {ffx_file}")
            
        except Exception as e:
            logger.error(f"Error processing {ffx_file}: {e}")

if __name__ == "__main__":
    replace_with_ffx_files()