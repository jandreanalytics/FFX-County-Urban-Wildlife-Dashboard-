import json
import msgpack
import os

def convert_json_to_msgpack(input_dir, output_dir):
    # Ensure the output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Iterate over all JSON files in the input directory
    for filename in os.listdir(input_dir):
        if filename.endswith('.json'):
            input_path = os.path.join(input_dir, filename)
            output_path = os.path.join(output_dir, filename.replace('.json', '.msgpack'))
            
            # Load JSON data
            with open(input_path, 'r') as f:
                data = json.load(f)
            
            # Convert to MessagePack and save
            with open(output_path, 'wb') as f:
                packed = msgpack.packb(data)
                f.write(packed)
            
            print(f"Converted {filename} to {output_path}")

# Example usage
convert_json_to_msgpack('data', 'data/msgpack')