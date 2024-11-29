import json
import requests
import shutil

# Function to get habitat information from Overpass API based on coordinates
def get_habitat_from_coordinates(latitude, longitude):
    overpass_url = "http://overpass-api.de/api/interpreter"
    overpass_query = f"""
    [out:json];
    is_in({latitude},{longitude});
    out body;
    """
    response = requests.get(overpass_url, params={'data': overpass_query})
    if response.status_code == 200:
        elements = response.json().get('elements')
        if elements:
            for element in elements:
                if 'tags' in element and 'natural' in element['tags']:
                    return element['tags']['natural']
    return "Unknown"

# Backup the original JSON file
shutil.copy('observations_2015.json', 'observations_2015_backup.json')

# Read the JSON file
with open('observations_2015.json', 'r') as file:
    data = json.load(file)

# Check the structure of the data
print(type(data))  # Should be a dictionary
if isinstance(data, dict) and 'observations' in data:
    observations = data['observations']
    if isinstance(observations, list):
        for entry in observations:
            print(type(entry))  # Should be a dictionary
            if isinstance(entry, dict):
                location = entry.get('location')
                if location:
                    latitude, longitude = location.split(',')
                    print(f"Fetching habitat for coordinates: {latitude}, {longitude}")
                    habitat = get_habitat_from_coordinates(latitude, longitude)
                    print(f"Habitat found: {habitat}")
                    entry['habitat'] = habitat
            else:
                print("Entry is not a dictionary:", entry)
    else:
        print("Observations is not a list:", observations)
else:
    print("Data is not a dictionary or does not contain 'observations':", data)

# Write the updated JSON data back to the file
with open('observations_2015_updated.json', 'w') as file:
    json.dump(data, file, indent=4)

print("Habitats appended successfully and backup created.")