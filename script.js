// Constants
const API_BASE_URL = 'https://api.inaturalist.org/v1';
const FAIRFAX_BOUNDS = {
    swlat: 38.5950,
    swlng: -77.5111,
    nelat: 39.0024,
    nelng: -77.1198
};

const YEARS_AVAILABLE = Array.from({length: 9}, (_, i) => 2024 - i);
const SEASONS = {
    spring: [2,3,4],
    summer: [5,6,7],
    fall: [8,9,10],
    winter: [11,0,1]
};

// Initialize map
let map = L.map('map', {
    zoomControl: false,
    maxZoom: 18,
    preferCanvas: true
}).setView([38.8462, -77.3064], 11);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '©OpenStreetMap, ©CartoDB',
    maxZoom: 19,
    minZoom: 9
}).addTo(map);

// Add this new cluster icon creator function
function createCustomClusterIcon(cluster) {
    const markers = cluster.getAllChildMarkers();
    const total = markers.length;
    
    // Get the dominant group (most common)
    const groups = markers.reduce((acc, marker) => {
        const className = marker.options.icon.options.className;
        const group = className.split('-')[1];
        acc[group] = (acc[group] || 0) + 1;
        return acc;
    }, {});
    
    const dominantGroup = Object.entries(groups)
        .sort((a, b) => b[1] - a[1])[0][0];

    return L.divIcon({
        html: `
            <div class="custom-cluster marker-${dominantGroup}">
                <div class="cluster-dot">
                    <span>${total}</span>
                </div>
            </div>
        `,
        className: 'cluster-icon',
        iconSize: L.point(40, 40)
    });
}

// Update only the cluster group initialization
let markers = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 60,
    iconCreateFunction: createCustomClusterIcon,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    disableClusteringAtZoom: 19
}).addTo(map);

// Store chart instances
let speciesAccumulationChartInstance = null;

// Core data loading functions
async function loadYearlyData(years = [2023], page = 1, perPage = 100) {
    if (!Array.isArray(years)) years = [years];
    
    const allData = [];
    for (const year of years) {
        try {
            const response = await fetch(
                `https://jandreanalytics.github.io/FFX-County-Urban-Wildlife-Dashboard-/data/observations_${year}.json`
            );
            if (response.ok) {
                const data = await response.json();
                allData.push(...data.observations);
            }
        } catch (error) {
            console.warn(`Failed to load data for ${year}:`, error);
        }
    }
    return allData;
}
// Map update function
function updateMap(observations) {
    markers.clearLayers();
    
    const markersToAdd = observations.map(obs => {
        if (!obs.location) return null;
        
        const [lat, lng] = obs.location.split(',').map(Number);
        if (isNaN(lat) || isNaN(lng)) return null;
        
        const taxonomicGroup = (obs.taxonomic_group || 'unknown').toLowerCase();
        const emoji = getEmoji(taxonomicGroup);
        
        return L.marker([lat, lng], {
            icon: L.divIcon({
                className: `marker-${taxonomicGroup} emoji-marker`,
                html: `<div class="emoji-container">${emoji}</div>`
            })
        }).bindPopup(createPopupContent(obs));
    }).filter(Boolean);

    markers.addLayers(markersToAdd);
}

// Initialize dashboard
async function initializeDashboard() {
    try {
        showLoadingState();
        initializeSeasonButtons();
        
        const initialData = await loadYearlyData([2024], 1, 100);
        if (initialData.length === 0) {
            console.error('No initial data loaded');
            return;
        }
        
        updateMap(initialData);
        updateBiodiversityStats(initialData);
        displayLatestDiscoveries(initialData);
        
        // Add this zoom fitting code after markers are added
        const markerBounds = markers.getBounds();
        if (markerBounds.isValid()) {
            map.fitBounds(markerBounds, {
                padding: [50, 50],  // Add padding around the bounds
                maxZoom: 11        // Limit how far it can zoom in
            });
        } else {
            // Fallback to Fairfax County bounds if no markers
            map.fitBounds([
                [38.5950, -77.5111],  // SW corner
                [39.0024, -77.1198]   // NE corner
            ]);
        }
        
        addMapLegend();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
    }
}
// Filter functions
function filterObservations(observations, filters) {
    return observations.filter(obs => {
        if (filters.taxonomicGroup && filters.taxonomicGroup !== 'all') {
            if (obs.taxonomic_group !== filters.taxonomicGroup) return false;
        }
        
        if (filters.season) {
            const month = new Date(obs.observed_on).getMonth();
            if (!SEASONS[filters.season].includes(month)) return false;
        }
        
        return true;
    });
}

// Recent observations functions
async function fetchRecentObservations() {
    try {
        console.log('Fetching recent observations...');
        const response = await fetch(
            'https://jandreanalytics.github.io/FFX-County-Urban-Wildlife-Dashboard-/data/observations_2024.json'
        );
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Fetched observations:', data);
        
        if (!data.observations || !Array.isArray(data.observations)) {
            console.error('Invalid data format:', data);
            return [];
        }
        
        return data.observations;
    } catch (error) {
        console.error('Error fetching recent observations:', error);
        return [];
    }
}

function displayLatestDiscoveries(observations, filters = {}) {
    const recentDiv = document.getElementById('recentObservations');
    if (!recentDiv) return;

    // Create title based on filters
    let title = 'Wildlife Sightings';
    if (filters.season) {
        title += ` in ${filters.season.charAt(0).toUpperCase() + filters.season.slice(1)}`;
    }
    if (filters.year) {
        title += ` ${filters.year}`;
    }
    if (!filters.season && !filters.year) {
        title = 'Most Commonly Seen Wildlife';
    }

    const groupedObservations = observations.reduce((grouped, obs) => {
        const speciesKey = obs.common_name || obs.species_name || 'Unknown species';
        if (!grouped[speciesKey]) {
            grouped[speciesKey] = {
                count: 0,
                latestObservation: obs,
                taxonomicGroup: obs.taxonomic_group || 'unknown',
                observations: []
            };
        }
        grouped[speciesKey].count++;
        grouped[speciesKey].observations.push(obs);
        
        if (new Date(obs.observed_on) > new Date(grouped[speciesKey].latestObservation.observed_on)) {
            grouped[speciesKey].latestObservation = obs;
        }
        
        return grouped;
    }, {});

    const sortedGroups = Object.entries(groupedObservations)
        .sort((a, b) => b[1].count - a[1].count);

    recentDiv.innerHTML = `
        <div class="recent-header">
            <div class="title-section">
                <h2>${title}</h2>
                <p class="discovery-subtitle">Click any species card to filter map markers. Most frequent sightings shown first.</p>
            </div>
            <span class="observation-count">Showing ${observations.length} observations</span>
        </div>
        <div class="recent-grid">
            ${sortedGroups.map(([species, data]) => `
                <div class="recent-card" data-species="${species}">
                    ${data.latestObservation.photo_url ? 
                        `<img src="${data.latestObservation.photo_url}" 
                             alt="${species}"
                             loading="lazy">` 
                        : '<div class="no-photo">📷</div>'
                    }
                    <div class="recent-info">
                        <h4>${species}</h4>
                        <p class="sighting-count">${data.count} sighting${data.count > 1 ? 's' : ''}</p>
                        <p class="latest-date">Latest: ${new Date(data.latestObservation.observed_on).toLocaleDateString()}</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    recentDiv.style.height = 'auto';  // Remove any fixed heights

    // Add click handlers for species cards
    recentDiv.querySelectorAll('.recent-card').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            const species = card.dataset.species;
            if (species) {
                filterMapBySpecies(species);
                
                // Remove previous selections
                document.querySelectorAll('.recent-card').forEach(c => 
                    c.classList.remove('selected'));
                // Add selected class to clicked card
                card.classList.add('selected');
            }
        });
    });
}
// Stats functions
// Add environmental indicators data
const ENVIRONMENTAL_INDICATORS = {
    invasiveSpecies: [
        { name: 'Japanese Honeysuckle', prevalence: 'High' },
        { name: 'Kudzu', prevalence: 'Moderate' },
        { name: 'English Ivy', prevalence: 'High' }
    ],
    nativeSpecies: [
        { name: 'Eastern Redbud', prevalence: 'Common' },
        { name: 'Virginia Bluebells', prevalence: 'Common' },
        { name: 'American Beech', prevalence: 'Common' }
    ],
    pollinatorSpecies: [
        { name: 'Monarch Butterfly', prevalence: 'Moderate' },
        { name: 'Eastern Bumblebee', prevalence: 'Common' },
        { name: 'Ruby-throated Hummingbird', prevalence: 'Moderate' }
    ]
};

// Update the updateBiodiversityStats function to include yearly comparisons and environmental indicators
async function updateBiodiversityStats(observations, singleSpecies = false) {
    const statsDiv = document.getElementById('biodiversityStats');
    if (!statsDiv) return;

    // Clear existing charts
    const existingCharts = statsDiv.querySelectorAll('canvas');
    existingCharts.forEach(canvas => {
        const chartInstance = Chart.getChart(canvas);
        if (chartInstance) chartInstance.destroy();
    });

    if (singleSpecies && observations.length > 0) {
        const speciesName = observations[0].common_name || observations[0].species_name;
        
        // Calculate correct monthly data
        const monthlyData = observations.reduce((acc, obs) => {
            const month = new Date(obs.observed_on).getMonth();
            const monthName = new Date(0, month).toLocaleString('default', { month: 'short' });
            acc[monthName] = (acc[monthName] || 0) + 1;
            return acc;
        }, {});

        // Calculate yearly data for this species
        const yearlyData = observations.reduce((acc, obs) => {
            const year = new Date(obs.observed_on).getFullYear();
            acc[year] = (acc[year] || 0) + 1;
            return acc;
        }, {});

        statsDiv.innerHTML = `
            <div class="single-species-stats">
                <div class="species-header">
                    <h2>${speciesName}</h2>
                </div>
                
                <div class="total-sightings">
                    <p>Total Observations</p>
                    <div class="sighting-number">${observations.length}</div>
                    <p>in Fairfax County</p>
                </div>

                <div class="chart-section">
                    <h3>Monthly Activity Pattern</h3>
                    <div class="chart-container">
                        <canvas id="monthlyChart"></canvas>
                    </div>
                </div>

                <div class="chart-section">
                    <h3>Annual Observations</h3>
                    <div class="chart-container">
                        <canvas id="yearlyChart"></canvas>
                    </div>
                </div>

                <div class="chart-section">
                    <h3>Recent Activity</h3>
                    <div class="recent-timeline">
                        ${observations
                            .sort((a, b) => new Date(b.observed_on) - new Date(a.observed_on))
                            .slice(0, 5)
                            .map(obs => `
                                <div class="timeline-item">
                                    <div class="timeline-header">
                                        <span class="timeline-date">${new Date(obs.observed_on).toLocaleDateString()}</span>
                                        ${obs.photo_url ? 
                                            `<span class="timeline-photo" title="Has photo">📸</span>` : 
                                            ''
                                        }
                                    </div>
                                    <div class="timeline-content">
                                        <span class="timeline-location">${formatLocation(obs.place_guess)}</span>
                                        ${obs.notes ? 
                                            `<span class="timeline-notes">${obs.notes}</span>` : 
                                            ''
                                        }
                                    </div>
                                </div>
                            `).join('')}
                    </div>
                </div>
            </div>
        `;

        // Create Monthly Activity Chart
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyValues = months.map(month => monthlyData[month] || 0);

        new Chart(document.getElementById('monthlyChart'), {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Sightings',
                    data: monthlyValues,
                    backgroundColor: '#4CAF50',
                    borderRadius: 5
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Number of Sightings' }
                    }
                },
                maintainAspectRatio: false
            }
        });

        // Create Yearly Trend Chart
        const years = YEARS_AVAILABLE.sort();
        new Chart(document.getElementById('yearlyChart'), {
            type: 'line',
            data: {
                labels: years,
                datasets: [{
                    label: 'Sightings',
                    data: years.map(year => yearlyData[year] || 0),
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Number of Sightings' }
                    }
                },
                maintainAspectRatio: false
            }
        });

    } else {
        // Use existing stats display for multiple species
        // Prepare species data with abbreviated names
        function abbreviateSpeciesName(name) {
            return name
                .replace('Common ', 'C. ')
                .replace('Eastern ', 'E. ')
                .replace('Northern ', 'N. ')
                .replace('American ', 'Am. ')
                .replace('Southern ', 'S. ')
                .replace('Western ', 'W. ')
                .replace('Greater ', 'G. ')
                .replace('Lesser ', 'L. ');
        }

        const speciesData = observations.reduce((acc, obs) => {
            const species = obs.common_name || obs.species_name || 'Unknown Species';
            acc[species] = (acc[species] || 0) + 1;
            return acc;
        }, {});

        // Seasonal patterns using observation dates
        const seasonalData = observations.reduce((acc, obs) => {
            const month = new Date(obs.observed_on).getMonth();
            if (SEASONS.spring.includes(month)) acc.spring++;
            else if (SEASONS.summer.includes(month)) acc.summer++;
            else if (SEASONS.fall.includes(month)) acc.fall++;
            else acc.winter++;
            return acc;
        }, { spring: 0, summer: 0, fall: 0, winter: 0 });

        // Add taxonomic group analysis
        const taxonomicData = observations.reduce((acc, obs) => {
            const group = obs.taxonomic_group || 'Unknown';
            acc[group] = (acc[group] || 0) + 1;
            return acc;
        }, {});

        // Add monthly trends
        const monthlyData = observations.reduce((acc, obs) => {
            const month = new Date(obs.observed_on).toLocaleString('default', { month: 'short' });
            acc[month] = (acc[month] || 0) + 1;
            return acc;
        }, {});

        // Add yearly comparisons
        const allYearsData = await loadYearlyData(YEARS_AVAILABLE);
        const yearlyData = YEARS_AVAILABLE.reduce((acc, year) => {
            acc[year] = allYearsData.filter(obs => 
                new Date(obs.observed_on).getFullYear() === year
            ).length;
            return acc;
        }, {});

        statsDiv.innerHTML = `
            <div class="wildlife-statistics">
                <h2>Wildlife Statistics</h2>
                
                <div class="stat-section">
                    <h3>Most Reported Species</h3>
                    <div class="chart-container">
                        <canvas id="speciesChart"></canvas>
                    </div>
                </div>

                <div class="stat-section">
                    <h3>Seasonal Distribution</h3>
                    <div class="chart-container">
                        <canvas id="seasonalChart"></canvas>
                    </div>
                </div>

                <div class="stat-section">
                    <h3>Species Groups Distribution</h3>
                    <div class="chart-container">
                        <canvas id="taxonomicChart"></canvas>
                    </div>
                </div>

                <div class="stat-section">
                    <h3>Monthly Trends</h3>
                    <div class="chart-container">
                        <canvas id="monthlyChart"></canvas>
                    </div>
                </div>

                <div class="stat-section">
                    <h3>Yearly Comparisons</h3>
                    <div class="chart-container">
                        <canvas id="yearlyChart"></canvas>
                    </div>
                </div>

                <div class="stat-section">
                    <h3>Environmental Indicators</h3>
                    <div class="environmental-indicators">
                        <h4>Invasive Species</h4>
                        <ul>
                            ${ENVIRONMENTAL_INDICATORS.invasiveSpecies.map(species => `
                                <li>${species.name} - Prevalence: ${species.prevalence}</li>
                            `).join('')}
                        </ul>
                        <h4>Native Species</h4>
                        <ul>
                            ${ENVIRONMENTAL_INDICATORS.nativeSpecies.map(species => `
                                <li>${species.name} - Prevalence: ${species.prevalence}</li>
                            `).join('')}
                        </ul>
                        <h4>Pollinator Species</h4>
                        <ul>
                            ${ENVIRONMENTAL_INDICATORS.pollinatorSpecies.map(species => `
                                <li>${species.name} - Prevalence: ${species.prevalence}</li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;

        // Create Species Chart with abbreviated names
        const topSpecies = Object.entries(speciesData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([species, count]) => [abbreviateSpeciesName(species), count]);

        new Chart(document.getElementById('speciesChart'), {
            type: 'bar',
            data: {
                labels: topSpecies.map(([species]) => species),
                datasets: [{
                    label: 'Number of Sightings',
                    data: topSpecies.map(([, count]) => count),
                    backgroundColor: '#4CAF50',
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.raw} sightings`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        title: {
                            display: true,
                            text: 'Number of Sightings'
                        }
                    },
                    y: {
                        grid: { display: false }
                    }
                },
                maintainAspectRatio: false
            }
        });

        // Create Seasonal Chart
        new Chart(document.getElementById('seasonalChart'), {
            type: 'bar',
            data: {
                labels: ['Spring', 'Summer', 'Fall', 'Winter'],
                datasets: [{
                    data: [
                        seasonalData.spring,
                        seasonalData.summer,
                        seasonalData.fall,
                        seasonalData.winter
                    ],
                    backgroundColor: [
                        '#4CAF50',  // Spring (green)
                        '#FDD835',  // Summer (yellow)
                        '#FF7043',  // Fall (orange)
                        '#42A5F5'   // Winter (blue)
                    ]
                }]
            },
            options: {
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const percent = ((context.raw / observations.length) * 100).toFixed(1);
                                return `${context.raw} sightings (${percent}%)`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { display: false },
                        title: {
                            display: true,
                            text: 'Number of Sightings'
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                },
                maintainAspectRatio: false
            }
        });

        // Add Taxonomic Groups Chart (Pie)
        new Chart(document.getElementById('taxonomicChart'), {
            type: 'pie',
            data: {
                labels: Object.keys(taxonomicData),
                datasets: [{
                    data: Object.values(taxonomicData),
                    backgroundColor: [
                        '#FF6B6B', // Birds
                        '#4ECDC4', // Mammals
                        '#45B7D1', // Plants
                        '#96CEB4', // Reptiles
                        '#88D8B0', // Amphibians
                        '#FFCC5C', // Insects
                        '#4A90E2'  // Fish
                    ]
                }]
            },
            options: {
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { boxWidth: 12 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const percent = ((context.raw / observations.length) * 100).toFixed(1);
                                return `${context.label}: ${context.raw} (${percent}%)`;
                            }
                        }
                    }
                },
                maintainAspectRatio: false
            }
        });

        // Add Monthly Trends Chart (Line)
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyValues = months.map(month => monthlyData[month] || 0);

        new Chart(document.getElementById('monthlyChart'), {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Sightings',
                    data: monthlyValues,
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { display: false },
                        title: {
                            display: true,
                            text: 'Number of Sightings'
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                },
                maintainAspectRatio: false
            }
        });

        // Add Yearly Comparisons Chart (Line)
        new Chart(document.getElementById('yearlyChart'), {
            type: 'line',
            data: {
                labels: YEARS_AVAILABLE,
                datasets: [{
                    label: 'Sightings',
                    data: Object.values(yearlyData),
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { display: false },
                        title: {
                            display: true,
                            text: 'Number of Sightings'
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                },
                maintainAspectRatio: false
            }
        });
    }
}

// UI Helper functions
function createPopupContent(observation) {
    const speciesName = observation.common_name || observation.species_name;
    const links = createSpeciesLink(speciesName);
    
    return `
        <div class="popup-content">
            <h3>${speciesName}</h3>
            ${observation.photo_url ? `
                <img src="${observation.photo_url}" alt="${speciesName}" class="popup-image">
            ` : ''}
            <p>Observed on: ${new Date(observation.observed_on).toLocaleDateString()}</p>
            <div class="learn-more-section">
                <h4>Learn More:</h4>
                <div class="popup-links">
                    <a href="${links.wiki}" target="_blank" rel="noopener">
                        <svg class="wiki-icon" width="16" height="16" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .084-.103.135-.2.157-.74.108-.835.361-.492 1.005.646 1.212 3.636 7.254 4.172 8.286.406-.978 2.01-4.021 2.619-5.222-.34-.601-.816-1.51-1.175-2.122-.418-.716-.629-.896-.927-1.005-.23-.084-.557-.135-1.122-.166-.102-.015-.193-.076-.193-.166v-.434L8.334 4.9h5.073l.042.045v.434c0 .084-.104.135-.197.157-.953.111-1.004.376-.583 1.005.642.93 1.33 2.168 1.953 3.278.826-1.738 1.669-3.519 2.39-5.494.167-.44.076-.564-.408-.59-.318-.018-.422-.076-.422-.166v-.434l.042-.045h4.253l.052.045v.434c0 .084-.104.135-.197.157-.953.111-1.456.419-2.199 1.928-.729 1.488-3.109 6.374-3.792 7.545-.45.785-.77.972-1.139.029-.75-1.591-1.924-3.957-2.758-5.585.874 1.499 3.111 6.395 3.669 7.576.409 1.14.116 1.787-.795 1.819-.315-.002-.419-.077-.419-.165v-.434l.043-.045z"/>
                        </svg>
                        Wikipedia
                    </a>
                    <a href="${links.inat}" target="_blank" rel="noopener">
                        <svg class="inat-icon" width="16" height="16" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M12 1.2A10.8 10.8 0 1 0 22.8 12 10.8 10.8 0 0 0 12 1.2zm0 19.6A8.8 8.8 0 1 1 20.8 12 8.81 8.81 0 0 1 12 20.8zm4.5-8.83a4.5 4.5 0 1 1-4.5-4.5 4.5 4.5 0 0 1 4.5 4.5z"/>
                        </svg>
                        iNaturalist
                    </a>
                </div>
            </div>
        </div>
    `;
}

function showSpeciesDetail(species, data) {
    const modal = document.createElement('div');
    modal.className = 'species-modal';
    modal.innerHTML = `
        <div class="species-modal-content">
            <h3>${species}</h3>
            <div class="species-observations">
                ${data.observations.map(obs => `
                    <div class="observation-item">
                        ${obs.photo_url ? 
                            `<img src="${obs.photo_url}" alt="${species}">` : 
                            '<div class="no-photo">📷</div>'
                        }
                        <div class="observation-details">
                            <p>Observed: ${new Date(obs.observed_on).toLocaleDateString()}</p>
                            <p>Location: ${obs.place_guess || 'Location unknown'}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="close-modal">Close</button>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = e => {
        if (e.target === modal) modal.remove();
    };
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    populateYearFilter();
    initializeDashboard();
    populateSpeciesSearch();  // Add this line to initialize species search
    
    // Add filter listeners
    document.getElementById('taxonomicFilter')?.addEventListener('change', handleFilterChange);
    document.getElementById('yearFilter')?.addEventListener('change', handleFilterChange);
    
    document.querySelectorAll('.season-buttons button')
        .forEach(btn => btn.addEventListener('click', handleSeasonSelect));
    
    document.getElementById('speciesSearch').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        if (searchTerm.length > 0) {
            const options = document.querySelectorAll('#speciesOptions option');
            const match = Array.from(options).find(option => option.value.toLowerCase() === searchTerm);
            if (match) {
                filterMapBySpecies(match.value);
            }
        }
    });

    // Add event listener for help button
    document.getElementById('helpToggle').addEventListener('click', () => {
        const helpPanel = document.getElementById('helpPanel');
        helpPanel.classList.toggle('visible');
    });
    
    // Add reset button handler
    document.getElementById('resetFilters').addEventListener('click', () => {
        // Reset all filters
        document.getElementById('taxonomicFilter').value = 'all';
        document.getElementById('speciesSearch').value = '';
        document.querySelectorAll('.season-buttons button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('[data-season="all"]').classList.add('active');
        
        // Reset the map and display
        resetMapFilter();
    });

    // Add pollinator filter button listener
    document.getElementById('pollinatorFilter').addEventListener('click', function() {
        // Toggle active state
        this.classList.toggle('active');
        
        // Remove other active states from other filter buttons
        document.querySelectorAll('.filter-button').forEach(btn => {
            if (btn !== this) btn.classList.remove('active');
        });
        
        if (this.classList.contains('active')) {
            filterPollinatorSpecies();
        } else {
            resetMapFilter();
        }
    });
    
    // Load invasive species data when the page loads
    loadInvasiveSpecies();
    
    // Add event listener for invasive species filter
    document.getElementById('invasiveFilter')?.addEventListener('click', function() {
        this.classList.toggle('active');
        
        // Remove other active states from other filter buttons
        document.querySelectorAll('.filter-button').forEach(btn => {
            if (btn !== this) btn.classList.remove('active');
        });
        
        if (this.classList.contains('active')) {
            filterInvasiveSpecies();
        } else {
            resetMapFilter();
        }
    });

    // Add event listener for protected species filter
    document.getElementById('protectedFilter')?.addEventListener('click', function() {
        this.classList.toggle('active');
        
        // Remove other active states from other filter buttons
        document.querySelectorAll('.filter-button').forEach(btn => {
            if (btn !== this) btn.classList.remove('active');
        });
        
        if (this.classList.contains('active')) {
            filterProtectedSpecies();
        } else {
            resetMapFilter();
        }
    });
});

// Filter handling functions
function handleFilterChange() {
    const filter = {
        taxonomicGroup: document.getElementById('taxonomicFilter').value,
        year: document.getElementById('yearFilter').value
    };
    
    loadYearlyData([filter.year]).then(data => {
        const filteredData = filterObservations(data, filter);
        updateMap(filteredData);
        updateBiodiversityStats(filteredData);  // Update stats with filtered data
        displayLatestDiscoveries(filteredData, filter);
    });
}

function handleSeasonSelect(event) {
    const season = event.target.dataset.season;
    document.querySelectorAll('.season-buttons button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    const year = document.getElementById('yearFilter').value;
    const filter = { season: season === 'all' ? null : season, year };
    
    loadYearlyData([year]).then(data => {
        const filteredData = filterObservations(data, filter);
        updateMap(filteredData);
        updateBiodiversityStats(filteredData);  // Update stats with filtered data
        displayLatestDiscoveries(filteredData, filter);
    });
}

// Helper functions
function populateYearFilter() {
    const yearFilter = document.getElementById('yearFilter');
    if (yearFilter) {
        yearFilter.innerHTML = YEARS_AVAILABLE.map(year => 
            `<option value="${year}">${year}</option>`
        ).join('');
    }
}

// Update the season buttons initialization
function initializeSeasonButtons() {
    const seasonButtons = {
        all: { emoji: '🗓️', label: 'All' },
        spring: { emoji: '🌱', label: 'Spring' },
        summer: { emoji: '☀️', label: 'Summer' },
        fall: { emoji: '🍂', label: 'Fall' },
        winter: { emoji: '❄️', label: 'Winter' }
    };

    const buttonsHTML = Object.entries(seasonButtons).map(([season, {emoji, label}]) => `
        <button data-season="${season}" class="season-button-${season}${season === 'all' ? ' active' : ''}">
            ${emoji} ${label}
        </button>
    `).join('');

    document.querySelector('.season-buttons').innerHTML = buttonsHTML;
    
    // Add event listeners
    document.querySelectorAll('.season-buttons button').forEach(button => {
        button.addEventListener('click', handleSeasonSelect);
    });
}

function showLoadingState() {
    const recentDiv = document.getElementById('recentObservations');
    if (recentDiv) {
        recentDiv.innerHTML = `
            <div class="recent-header">
                <h2>Loading discoveries...</h2>
            </div>
            <div class="loading-indicator"></div>
        `;
    }
}

// Add this function to fetch and populate species data
async function populateSpeciesSearch() {
    const speciesSearch = document.getElementById('speciesSearch');
    if (!speciesSearch) return;

    try {
        const data = await loadYearlyData(YEARS_AVAILABLE);
        const speciesCount = {};

        data.forEach(obs => {
            const species = obs.common_name || obs.species_name;
            if (species) {
                speciesCount[species] = (speciesCount[species] || 0) + 1;
            }
        });

        const sortedSpecies = Object.entries(speciesCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([species]) => species);

        const datalist = document.getElementById('speciesOptions');
        datalist.innerHTML = '';

        sortedSpecies.forEach(species => {
            const option = document.createElement('option');
            option.value = species;
            datalist.appendChild(option);
        });
    } catch (error) {
        console.error('Error populating species search:', error);
    }
}

// Add this function for species filtering
function filterMapBySpecies(speciesName) {
    const year = document.getElementById('yearFilter').value;
    
    // Remove existing clear filter button if it exists
    document.querySelector('.clear-filter-btn')?.remove();
    
    loadYearlyData([year]).then(data => {
        const speciesData = data.filter(obs => {
            const obsName = (obs.common_name || obs.species_name || '').toLowerCase();
            return obsName === speciesName.toLowerCase();
        });
        
        if (speciesData.length > 0) {
            updateMap(speciesData);
            updateBiodiversityStats(speciesData, true);  // Add true for single species mode
            displayLatestDiscoveries(speciesData, { year, species: speciesName });
            
            // Add new clear filter button
            const clearButton = L.control({position: 'topright'});
            clearButton.onAdd = function() {
                const div = L.DomUtil.create('div', 'clear-filter-btn');
                div.innerHTML = `
                    <button onclick="resetMapFilter()">
                        ← Show All Species
                    </button>
                `;
                return div;
            };
            clearButton.addTo(map);

            // Fit map to filtered markers
            const markerBounds = markers.getBounds();
            if (markerBounds.isValid()) {
                map.fitBounds(markerBounds, {
                    padding: [50, 50],
                    maxZoom: 13
                });
            }
        }
    });
}

// Modify the resetMapFilter function to respect current filters
function resetMapFilter() {
    const year = document.getElementById('yearFilter').value;
    const taxonomicFilter = document.getElementById('taxonomicFilter').value;
    
    loadYearlyData([year]).then(data => {
        let filteredData = data;
        
        // Maintain taxonomic filter if it's active
        if (taxonomicFilter !== 'all') {
            filteredData = data.filter(obs => obs.taxonomic_group === taxonomicFilter);
        }
        
        updateMap(filteredData);
        updateBiodiversityStats(filteredData);  // Add this line to update stats
        displayLatestDiscoveries(filteredData, { year });
        
        // Remove the clear filter button
        document.querySelector('.clear-filter-btn')?.remove();
        
        // Remove selected state from cards
        document.querySelectorAll('.recent-card').forEach(c => 
            c.classList.remove('selected'));
    });
}

// Add this new function
function addMapLegend() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function() {
        const div = L.DomUtil.create('div', 'info legend');
        const groups = [
            { name: 'Birds', class: 'aves', emoji: '🦅' },
            { name: 'Mammals', class: 'mammalia', emoji: '🦌' },
            { name: 'Plants', class: 'plantae', emoji: '🌿' },
            { name: 'Reptiles', class: 'reptilia', emoji: '🦎' },
            { name: 'Amphibians', class: 'amphibia', emoji: '🐸' },
            { name: 'Insects', class: 'insecta', emoji: '🦋' },
            { name: 'Fish', class: 'actinopterygii', emoji: '🐟' }
        ];


        div.innerHTML = `
        <div class="legend-content">
            <h4>Reported Animal Groups</h4>
            <p class="legend-subtitle">Cluster colors reflect most reported species</p>
            ${groups.map(group => `
                <div class="legend-item">
                    <span class="legend-emoji">${group.emoji}</span>
                    <span class="legend-marker marker-${group.class}">
                        <div class="marker-dot"></div>
                    </span>
                    <span>${group.name}</span>
                </div>
            `).join('')}
        </div>
    `;
    return div;
};
// KEEP EXISTING FUNCTION ENDING
legend.addTo(map);
}

// Add this helper function
function getEmoji(taxonomicGroup) {
    const emojiMap = {
        'aves': '🦅',
        'mammalia': '🦌',
        'plantae': '🌿',
        'reptilia': '🦎',
        'amphibia': '🐸',
        'insecta': '🦋',
        'actinopterygii': '🐟',
        'unknown': '❓'
    };
    return emojiMap[taxonomicGroup] || '❓';
}

// ADD THIS NEW HELPER FUNCTION - DO NOT MODIFY OTHER CODE
function createSpeciesLink(speciesName) {
    // Remove abbreviations if they exist
    const fullName = speciesName
        .replace('C. ', 'Common ')
        .replace('E. ', 'Eastern ')
        .replace('N. ', 'Northern ')
        .replace('Am. ', 'American ')
        .replace('S. ', 'Southern ')
        .replace('W. ', 'Western ');
    
    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(fullName)}`;
    const inaturalistUrl = `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(fullName)}`;
    
    return {
        wiki: wikiUrl,
        inat: inaturalistUrl
    };
}

// Add to script.js
document.getElementById('speciesSearch').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    // Implement search logic here
});

function addSearchHistory() {
    const searches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
    const searchContainer = document.createElement('div');
    searchContainer.className = 'recent-searches';
    searchContainer.innerHTML = `
        <h4>Recent Searches</h4>
        ${searches.map(search => `
            <button onclick="applySearch('${search}')">${search}</button>
        `).join('')}
    `;
    document.querySelector('.filter-group').appendChild(searchContainer);
}


async function loadInvasiveSpecies() {
    try {
        const response = await fetch('path/to/invasive-species.json');
        invasiveSpeciesList = await response.json();
    } catch (error) {
        console.error('Error loading invasive species list:', error);
    }
}

document.getElementById('invasiveFilter').addEventListener('click', function() {
    this.classList.toggle('active');
    if (this.classList.contains('active')) {
        filterInvasiveSpecies();
    } else {
        resetFilters();
    }
});

function filterInvasiveSpecies() {
    const filteredObservations = observations.filter(obs => 
        invasiveSpeciesList.includes(obs.scientific_name)
    );
    updateMap(filteredObservations);
    updateBiodiversityStats(filteredObservations);  // Update stats with invasive species data
    displayLatestDiscoveries(filteredObservations);
}

// Replace the POLLINATOR_GROUPS constant with a more specific list
const POLLINATOR_SPECIES = [
    // Native Bees
    'Common Eastern Bumblebee',
    'Eastern Carpenter Bee',
    'European Honey Bee',
    'Mining Bee',
    'Green Metallic Bee',
    'Mason Bee',
    'Leafcutter Bee',
    'Yellow-faced Bee',
    
    // Butterflies
    'Monarch Butterfly',
    'Eastern Tiger Swallowtail',
    'Black Swallowtail',
    'Painted Lady',
    'Red Admiral',
    'American Lady',
    
    // Moths
    'Hummingbird Moth',
    'Clearwing Moth',
    
    // Birds
    'Ruby-throated Hummingbird'
];

function filterPollinatorSpecies() {
    const year = document.getElementById('yearFilter').value;
    
    loadYearlyData([year]).then(data => {
        const filteredData = data.filter(obs => 
            // Only filter by exact species name matches
            POLLINATOR_SPECIES.includes(obs.common_name)
        );
        
        updateMap(filteredData);
        updateBiodiversityStats(filteredData);
        displayLatestDiscoveries(filteredData, { filter: 'pollinators' });
    });
}


// Load invasive species data
async function loadInvasiveSpecies() {
    try {
        const response = await fetch('invasive.json');
        const data = await response.json();
        invasiveSpeciesList = data.invasive_species;
        console.log('Loaded invasive species:', invasiveSpeciesList);
    } catch (error) {
        console.error('Error loading invasive species list:', error);
    }
}

// Modify the existing filterInvasiveSpecies function
function filterInvasiveSpecies() {
    const year = document.getElementById('yearFilter').value;
    
    loadYearlyData([year]).then(data => {
        const filteredData = data.filter(obs => {
            // Check both scientific name and common name
            return invasiveSpeciesList.some(invasive => 
                (obs.scientific_name && obs.scientific_name.toLowerCase() === invasive.name.toLowerCase()) ||
                (obs.common_name && obs.common_name.toLowerCase() === invasive.common_name.toLowerCase())
            );
        });
        
        updateMap(filteredData);
        updateBiodiversityStats(filteredData);
        displayLatestDiscoveries(filteredData, { filter: 'invasive' });
        
        // Add invasive species info to stats
        addInvasiveSpeciesInfo(filteredData);
    });
}

// Add new function to display invasive species information
function addInvasiveSpeciesInfo(filteredData) {
    const statsDiv = document.getElementById('biodiversityStats');
    if (!statsDiv) return;
    
    const invasiveCount = filteredData.length;
    const speciesCounts = filteredData.reduce((acc, obs) => {
        const name = obs.common_name || obs.scientific_name;
        acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {});
    
    const invasiveInfo = document.createElement('div');
    invasiveInfo.className = 'invasive-species-info';
    invasiveInfo.innerHTML = `
        <h3>Invasive Species Report</h3>
        <p>Total invasive sightings: ${invasiveCount}</p>
        <div class="invasive-species-list">
            ${Object.entries(speciesCounts)
                .sort(([,a], [,b]) => b - a)
                .map(([species, count]) => {
                    const invasiveDetails = invasiveSpeciesList.find(inv => 
                        inv.common_name === species || inv.name === species
                    );
                    return `
                        <div class="invasive-species-item">
                            <h4>${species}</h4>
                            <p>Sightings: ${count}</p>
                            ${invasiveDetails ? `
                                <p class="invasive-description">${invasiveDetails.description}</p>
                                <p class="invasive-type">Type: ${invasiveDetails.type}</p>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
        </div>
    `;
    
    // Insert the invasive info at the top of the stats
    statsDiv.insertBefore(invasiveInfo, statsDiv.firstChild);
}

// Modify the document.addEventListener('DOMContentLoaded') section
document.addEventListener('DOMContentLoaded', () => {
    // ...existing initialization code...
    
    // Load invasive species data when the page loads
    loadInvasiveSpecies();
    
    // Add event listener for invasive species filter
    document.getElementById('invasiveFilter')?.addEventListener('click', function() {
        this.classList.toggle('active');
        
        // Remove other active states from other filter buttons
        document.querySelectorAll('.filter-button').forEach(btn => {
            if (btn !== this) btn.classList.remove('active');
        });
        
        if (this.classList.contains('active')) {
            filterInvasiveSpecies();
        } else {
            resetMapFilter();
        }
    });
    
    // ...rest of existing initialization code...
});

// ...rest of existing code...

// Add protected species list
const PROTECTED_SPECIES = {
    mammals: [
        { name: 'Indiana Bat', scientific: 'Myotis sodalis', status: 'Federally endangered' },
        { name: 'Northern Long-eared Bat', scientific: 'Myotis septentrionalis', status: 'Federally threatened' },
        { name: 'Virginia Big-eared Bat', scientific: 'Corynorhinus townsendii virginianus', status: 'Federally endangered' }
    ],
    birds: [
        { name: 'Piping Plover', scientific: 'Charadrius melodus', status: 'Federally threatened' },
        { name: 'Red-cockaded Woodpecker', scientific: 'Picoides borealis', status: 'Federally endangered' },
        { name: 'Bald Eagle', scientific: 'Haliaeetus leucocephalus', status: 'Protected under BGEPA' }
    ],
    reptiles: [
        { name: 'Bog Turtle', scientific: 'Glyptemys muhlenbergii', status: 'Federally threatened' },
        { name: 'Loggerhead Sea Turtle', scientific: 'Caretta caretta', status: 'Federally threatened' }
    ],
    amphibians: [
        { name: 'Shenandoah Salamander', scientific: 'Plethodon shenandoah', status: 'Federally endangered' }
    ],
    fish: [
        { name: 'Roanoke Logperch', scientific: 'Percina rex', status: 'Federally endangered' },
        { name: 'Atlantic Sturgeon', scientific: 'Acipenser oxyrinchus', status: 'Federally endangered' }
    ],
    insects: [
        { name: 'Rusty Patched Bumblebee', scientific: 'Bombus affinis', status: 'Federally endangered' }
    ],
    plants: [
        { name: 'Small Whorled Pogonia', scientific: 'Isotria medeoloides', status: 'Federally threatened' },
        { name: 'Harperella', scientific: 'Ptilimnium nodosum', status: 'Federally endangered' }
    ]
};

function filterProtectedSpecies() {
    const year = document.getElementById('yearFilter').value;
    
    loadYearlyData([year]).then(data => {
        const allProtectedSpecies = Object.values(PROTECTED_SPECIES)
            .flat()
            .map(species => ({
                commonName: species.name.toLowerCase(),
                scientificName: species.scientific.toLowerCase(),
                status: species.status
            }));

        const filteredData = data.filter(obs => {
            const obsCommonName = (obs.common_name || '').toLowerCase();
            const obsScientificName = (obs.scientific_name || '').toLowerCase();
            
            return allProtectedSpecies.some(protected => 
                obsCommonName === protected.commonName ||
                obsScientificName === protected.scientificName
            );
        });
        
        updateMap(filteredData);
        updateBiodiversityStats(filteredData);
        displayLatestDiscoveries(filteredData, { filter: 'protected' });
    });
}

// Remove the addProtectedSpeciesInfo function as it's no longer needed

// ...rest of existing code...

function formatLocation(location) {
    if (!location) return 'Location not specified';
    
    // Remove generic location references
    let formatted = location
        .replace(/, Virginia,? USA?$/i, '')
        .replace(/, USA?$/i, '')
        .replace(/^Fairfax County,?\s*/i, '')
        .replace(/,?\s*Virginia$/i, '')
        .trim();
    
    // If only generic location remains, indicate need for more detail
    if (['Fairfax', '', 'Virginia'].includes(formatted)) {
        return 'Location needs more detail';
    }
    
    // Add park designation if missing
    if (!/park|preserve|trail/i.test(formatted)) {
        if (/^[A-Za-z\s]+$/.test(formatted)) {
            formatted += ' area';
        }
    }
    
    return formatted;
}

// ...existing code...

// In updateBiodiversityStats, update the recent sightings section:
if (singleSpecies && observations.length > 0) {
    // ...existing single species stats code...

    const recentSightings = observations
        .sort((a, b) => new Date(b.observed_on) - new Date(a.observed_on))
        .slice(0, 5);

    statsDiv.innerHTML = `
        // ...existing stats html...

        <div class="chart-section">
            <h3>Recent Activity</h3>
            <div class="recent-timeline">
                ${recentSightings.map(obs => `
                    <div class="timeline-item">
                        <div class="timeline-header">
                            <span class="timeline-date">${new Date(obs.observed_on).toLocaleDateString()}</span>
                            ${obs.photo_url ? 
                                `<span class="timeline-photo" title="Has photo">📸</span>` : 
                                ''
                            }
                        </div>
                        <div class="timeline-content">
                            <span class="timeline-location">${formatLocation(obs.place_guess)}</span>
                            ${obs.notes ? 
                                `<span class="timeline-notes">${obs.notes}</span>` : 
                                ''
                            }
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        // ...rest of existing html...
    `;
    
    // ...rest of existing code...
}

// ...rest of existing code...
