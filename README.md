# Fairfax County Biodiversity Dashboard 🌿

## Overview
An interactive web-based dashboard visualizing biodiversity data from Fairfax County, Virginia, using the iNaturalist API. This project aims to make local wildlife observations accessible and engaging for citizens, researchers, and nature enthusiasts.

## 🎯 Project Goals
- Track and visualize biodiversity trends in Fairfax County (2015-2024)
- Create an accessible platform for exploring local wildlife data
- Provide insights into species distribution and seasonal patterns
- Engage citizens in local biodiversity monitoring

## 🛠️ Technologies Used
- **Frontend**: HTML5, CSS3, JavaScript
- **Data Visualization**: Chart.js, Leaflet.js
- **Data Processing**: Python (pandas, requests)
- **API**: iNaturalist API
- **Version Control**: Git/GitHub
- **Hosting**: GitHub Pages

## 📊 Features
- Interactive map showing observation locations
- Real-time biodiversity statistics
- Temporal trend analysis
- Species distribution visualization
- Seasonal highlights and patterns
- Mobile-responsive design

## 💻 Technical Implementation

### Data Collection
The project uses Python to fetch and process data from the iNaturalist API:
- Collects research-grade observations from 2015-2024
- Filters for verified species identifications
- Processes geographical data within Fairfax County bounds
- Generates clean, structured JSON data files

### Visualization
The dashboard implements several interactive visualizations:
- Leaflet.js for geographical mapping
- Chart.js for temporal and taxonomic analysis
- Custom CSS for responsive design
- Dynamic filtering capabilities

### Performance Optimization
- Efficient data structure for quick loading
- Local data storage for historical records
- Optimized API calls for real-time updates
- Compressed image assets

## 📈 Data Insights
- Average yearly observations: ~7,000 (2020-2024)
- Most observed species groups:
  - Plants (45%)
  - Birds (25%)
  - Insects (15%)
  - Others (15%)
- Peak observation months: April-September
- Notable biodiversity hotspots:
  - Burke Lake Park
  - Huntley Meadows
  - Great Falls Park

## 🚀 Future Enhancements
- [ ] Advanced filtering options
- [ ] User contribution features
- [ ] Seasonal prediction models
- [ ] Community engagement tools
- [ ] Enhanced mobile experience


## 🔧 Setup and Installation

1. Clone the repository:
bash
git clone https://github.com/jandreanalytics/FFX-County-Urban-Wildlife-Dashboard-.git

2. Install Python dependencies:
bash
pip install requests pandas tqdm

3. Run the data collection script:
bash
python scripts/fetch_data.py

4. Open `index.html` in a web browser or deploy to GitHub Pages

## 📧 Contact
Jeremy Andre
- GitHub: [jandreanalytics](https://github.com/jandreanalytics)
- LinkedIn: [jeremy-andre](https://www.linkedin.com/in/jeremy-andre-a18925241/)

---
*This project is part of an ongoing effort to monitor and preserve local biodiversity in Fairfax County, Virginia.*
