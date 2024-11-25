// iNaturalist API endpoint
const API_BASE_URL = 'https://api.inaturalist.org/v1';

// Fairfax County approximate boundaries
const FAIRFAX_BOUNDS = {
    swlat: 38.5950,
    swlng: -77.5111,
    nelat: 39.0024,
    nelng: -77.1198
};

// Initialize map
let map = L.map('map', {
    zoomControl: false,
    maxZoom: 18
}).setView([38.8462, -77.3064], 11);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '©OpenStreetMap, ©CartoDB'
}).addTo(map);

// Add zoom control to top-right
L.control.zoom({
    position: 'topright'
}).addTo(map);

// Initialize markers layer group
let markers = L.layerGroup().addTo(map);

// Add these constants at the top
const YEARS_TO_FETCH = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
const RESULTS_PER_PAGE = 200;

// Constants for data handling
const DATA_YEARS = Array.from({length: 10}, (_, i) => 2015 + i);
let allObservationsData = [];

// Function to load all historical data
async function loadAllHistoricalData() {
    const observations = [];
    
    for (const year of DATA_YEARS) {
        try {
            const response = await fetch(`data/observations_${year}.json`); // Ensure this path is correct
            if (response.ok) {
                const yearData = await response.json();
                observations.push(...yearData.observations);
                console.log(`Loaded ${yearData.observations.length} observations from ${year}`);
            }
        } catch (error) {
            console.warn(`Failed to load data for ${year}:`, error);
        }
    }
    
    return observations;
}
// Function to analyze data by year
function analyzeYearlyData(observations) {
    const yearlyStats = {};
    
    observations.forEach(obs => {
        const year = new Date(obs.observed_on).getFullYear();
        if (!yearlyStats[year]) {
            yearlyStats[year] = {
                totalObservations: 0,
                speciesCounts: new Set(),
                taxonomicGroups: {}
            };
        }
        
        yearlyStats[year].totalObservations++;
        yearlyStats[year].speciesCounts.add(obs.taxon?.name);
        
        const taxonGroup = obs.taxon?.iconic_taxon_name || 'Unknown';
        yearlyStats[year].taxonomicGroups[taxonGroup] = 
            (yearlyStats[year].taxonomicGroups[taxonGroup] || 0) + 1;
    });
    
    return yearlyStats;
}

// Function to update the dashboard with historical data
function updateDashboardWithHistoricalData(observations) {
    const yearlyStats = analyzeYearlyData(observations);
    
    // Update yearly trends chart
    createYearlyTrendsChart(yearlyStats);
    
    // Update species accumulation chart
    createSpeciesAccumulationChart(yearlyStats);
    
    // Update current stats
    updateCurrentStats(observations);
}

// Create yearly trends chart
function createYearlyTrendsChart(yearlyStats) {
    const ctx = document.getElementById('yearlyTrendsChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(yearlyStats),
            datasets: [{
                label: 'Total Observations',
                data: Object.values(yearlyStats).map(year => year.totalObservations),
                borderColor: '#3498db',
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Yearly Observation Trends'
                }
            }
        }
    });
}

// Update current statistics
function updateCurrentStats(observations) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    // Filter for current year/month
    const thisYearObs = observations.filter(obs => 
        new Date(obs.observed_on).getFullYear() === currentYear
    );
    const thisMonthObs = thisYearObs.filter(obs => 
        new Date(obs.observed_on).getMonth() === currentMonth
    );
    
    // Update stats display
    document.getElementById('speciesCount').textContent = 
        new Set(observations.map(obs => obs.taxon?.name)).size;
    document.getElementById('monthlyCount').textContent = thisMonthObs.length;
    
    // Find recent hotspot
    const recentHotspots = findHotspots(thisMonthObs);
    document.getElementById('hotspot').textContent = 
        recentHotspots[0]?.name || 'No recent hotspots';
}

// Find observation hotspots
function findHotspots(observations) {
    const locations = {};
    observations.forEach(obs => {
        const place = obs.place_guess || 'Unknown Location';
        locations[place] = (locations[place] || 0) + 1;
    });
    
    return Object.entries(locations)
        .map(([name, count]) => ({name, count}))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
}

// Initialize the dashboard
async function initializeDashboard() {
    try {
        // Show loading state
        document.body.classList.add('loading');
        
        // Load historical data
        const historicalData = await loadAllHistoricalData();
        allObservationsData = historicalData;
        
        // Update the dashboard
        updateDashboardWithHistoricalData(historicalData);
        
        // Initialize map with all data
        initializeMap(historicalData);
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        // Show error message to user
        document.getElementById('error-message').classList.remove('hidden');
    } finally {
        // Hide loading state
        document.body.classList.remove('loading');
    }
}

// Add necessary HTML elements
document.addEventListener('DOMContentLoaded', () => {
    // Add charts container to your HTML
    const chartsSection = `
        <div class="charts-container">
            <div class="chart-box">
                <canvas id="yearlyTrendsChart"></canvas>
            </div>
            <div class="chart-box">
                <canvas id="taxonomicTrendsChart"></canvas>
            </div>
        </div>
    `;
    
    document.querySelector('.dashboard-grid').insertAdjacentHTML('beforeend', chartsSection);
    
    // Initialize the dashboard
    initializeDashboard();
});

// Update the fetch function to handle multiple years
async function fetchObservationsForYear(year, taxonType = null) {
    try {
        let params = new URLSearchParams({
            swlat: FAIRFAX_BOUNDS.swlat,
            swlng: FAIRFAX_BOUNDS.swlng,
            nelat: FAIRFAX_BOUNDS.nelat,
            nelng: FAIRFAX_BOUNDS.nelng,
            per_page: RESULTS_PER_PAGE,
            quality_grade: 'research,needs_id',
            year: year.toString(),
            order_by: 'observed_on',
            photos: 'true'
        });

        if (taxonType) {
            params.append('taxon_id', taxonType.toString());
        }

        const response = await fetch(`${API_BASE_URL}/observations?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.results;
    } catch (error) {
        console.error(`Error fetching observations for year ${year}:`, error);
        return [];
    }
}

// New function to fetch all observations
async function fetchObservations(taxonType = null) {
    try {
        // Show loading state
        document.body.style.cursor = 'wait';
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'loading-indicator';
        loadingIndicator.textContent = 'Loading observations...';
        document.body.appendChild(loadingIndicator);

        // Fetch data for all years in parallel
        const allObservationsPromises = YEARS_TO_FETCH.map(year => 
            fetchObservationsForYear(year, taxonType)
        );

        const allYearsResults = await Promise.all(allObservationsPromises);
        
        // Combine all results
        const combinedResults = allYearsResults.flat();

        // Remove duplicates based on observation ID
        const uniqueResults = Array.from(new Map(
            combinedResults.map(item => [item.id, item])
        ).values());

        // Sort by date
        uniqueResults.sort((a, b) => 
            new Date(b.observed_on) - new Date(a.observed_on)
        );

        return { results: uniqueResults };
    } catch (error) {
        console.error('Error fetching all observations:', error);
        return null;
    } finally {
        // Remove loading state
        document.body.style.cursor = 'default';
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
    }
}

function updateMap(observations) {
    markers.clearLayers();
    
    observations.forEach(obs => {
        if (obs.geojson) {
            const marker = L.marker([
                obs.geojson.coordinates[1],
                obs.geojson.coordinates[0]
            ]);
            
            const popupContent = `
                <strong>${obs.species_guess || 'Unknown species'}</strong><br>
                Date: ${new Date(obs.observed_on).toLocaleDateString()}<br>
                ${obs.photos.length > 0 ? `<img src="${obs.photos[0].url}" width="150">` : ''}
            `;
            
            marker.bindPopup(popupContent);
            markers.addLayer(marker);
        }
    });
}

function updateStats(observations) {
    document.getElementById('totalObs').textContent = observations.length;
    
    // Count unique species
    const species = new Set(observations.map(obs => obs.species_guess));
    document.getElementById('speciesCount').textContent = species.size;
    
    // Find most common species
    const speciesCounts = {};
    observations.forEach(obs => {
        if (obs.species_guess) {
            speciesCounts[obs.species_guess] = (speciesCounts[obs.species_guess] || 0) + 1;
        }
    });
    
    const mostCommon = Object.entries(speciesCounts)
        .sort(([,a], [,b]) => b - a)[0];
    
    document.getElementById('commonSpecies').textContent = mostCommon ? mostCommon[0] : '-';
}

function updateRecentObservations(observations) {
    const container = document.getElementById('observations-list');
    container.innerHTML = '';
    
    observations.slice(0, 12).forEach(obs => {
        const card = document.createElement('div');
        card.className = 'observation-card';
        card.innerHTML = `
            <h3>${obs.species_guess || 'Unknown species'}</h3>
            ${obs.photos.length > 0 ? `<img src="${obs.photos[0].url}" width="100%">` : ''}
            <p>Date: ${new Date(obs.observed_on).toLocaleDateString()}</p>
        `;
        container.appendChild(card);
    });
}

// Add new functions for charts
function createSpeciesDistributionChart(observations) {
    const taxonomicCounts = {};
    observations.forEach(obs => {
        if (obs.taxon && obs.taxon.iconic_taxon_name) {
            taxonomicCounts[obs.taxon.iconic_taxon_name] = 
                (taxonomicCounts[obs.taxon.iconic_taxon_name] || 0) + 1;
        }
    });

    const ctx = document.getElementById('speciesDistribution').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(taxonomicCounts),
            datasets: [{
                data: Object.values(taxonomicCounts),
                backgroundColor: [
                    '#2ecc71', // Plants
                    '#3498db', // Animals
                    '#9b59b6', // Fungi
                    '#e74c3c', // Others
                    '#f1c40f', // Additional categories
                    '#1abc9c'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 20,
                        font: {
                            size: 12
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Distribution by Taxonomic Group',
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: 20
                }
            }
        }
    });
}

function createTrendChart(observations, viewType, selectedYear = 'all') {
    const ctx = document.getElementById('trendChart').getContext('2d');
    let chartData;
    let chartOptions;

    switch(viewType) {
        case 'monthly':
            chartData = getMonthlyTrendData(observations, selectedYear);
            chartOptions = {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                    datasets: [{
                        label: 'Observations',
                        data: chartData,
                        borderColor: '#2980b9',
                        tension: 0.3
                    }]
                }
            };
            break;

        case 'yearly':
            chartData = getYearlyTrendData(observations);
            chartOptions = {
                type: 'bar',
                data: {
                    labels: Object.keys(chartData),
                    datasets: [{
                        label: 'Observations per Year',
                        data: Object.values(chartData),
                        backgroundColor: '#2980b9'
                    }]
                }
            };
            break;

        case 'topSpecies':
            chartData = getTopSpeciesData(observations);
            chartOptions = {
                type: 'horizontalBar',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Number of Observations',
                        data: chartData.data,
                        backgroundColor: '#2980b9'
                    }]
                },
                options: {
                    indexAxis: 'y'
                }
            };
            break;
    }

    if (window.trendChart) {
        window.trendChart.destroy();
    }
    window.trendChart = new Chart(ctx, chartOptions);
}

function getMonthlyTrendData(observations, selectedYear) {
    const monthlyData = new Array(12).fill(0);
    observations.forEach(obs => {
        if (obs.observed_on) {
            const date = new Date(obs.observed_on);
            if (selectedYear === 'all' || date.getFullYear().toString() === selectedYear) {
                monthlyData[date.getMonth()]++;
            }
        }
    });
    return monthlyData;
}

function getYearlyTrendData(observations) {
    const yearlyData = {};
    observations.forEach(obs => {
        if (obs.observed_on) {
            const year = new Date(obs.observed_on).getFullYear();
            yearlyData[year] = (yearlyData[year] || 0) + 1;
        }
    });
    return yearlyData;
}

function getTopSpeciesData(observations) {
    const speciesCounts = {};
    observations.forEach(obs => {
        if (obs.species_guess) {
            speciesCounts[obs.species_guess] = (speciesCounts[obs.species_guess] || 0) + 1;
        }
    });

    const sortedSpecies = Object.entries(speciesCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

    return {
        labels: sortedSpecies.map(([species]) => species),
        data: sortedSpecies.map(([,count]) => count)
    };
}

// Update the initialize function
async function initialize() {
    const data = await fetchObservations();
    if (data && data.results) {
        currentObservations = data.results;
        updateMap(data.results);
        updateStats(data.results);
        updateRecentObservations(data.results);
        createSpeciesDistributionChart(data.results);
        createTrendChart(data.results, 'monthly');
    }
}

// Update event listeners
document.getElementById('showAll')?.addEventListener('click', async () => {
    const data = await fetchObservations();
    if (data && data.results) {
        currentObservations = data.results;
        updateMap(data.results);
        updateStats(data.results);
        updateRecentObservations(data.results);
        createSpeciesDistributionChart(data.results);
        createTrendChart(data.results, 'monthly');
    }
});
document.getElementById('showPlants')?.addEventListener('click', async () => {
    const data = await fetchObservations(47126);
    if (data && data.results) {
        currentObservations = data.results;
        updateMap(data.results);
        updateStats(data.results);
        updateRecentObservations(data.results);
        createSpeciesDistributionChart(data.results);
        createTrendChart(data.results, 'monthly');
    }
});
document.getElementById('showAnimals')?.addEventListener('click', async () => {
    const data = await fetchObservations(1);
    if (data && data.results) {
        currentObservations = data.results;
        updateMap(data.results);
        updateStats(data.results);
        updateRecentObservations(data.results);
        createSpeciesDistributionChart(data.results);
        createTrendChart(data.results, 'monthly');
    }
});
document.getElementById('showFungi')?.addEventListener('click', async () => {
    const data = await fetchObservations(47170);
    if (data && data.results) {
        currentObservations = data.results;
        updateMap(data.results);
        updateStats(data.results);
        updateRecentObservations(data.results);
        createSpeciesDistributionChart(data.results);
        createTrendChart(data.results, 'monthly');
    }
});

// Add event listeners for the new controls
document.getElementById('trendViewSelect').addEventListener('change', (e) => {
    const selectedYear = document.getElementById('yearSelect').value;
    createTrendChart(currentObservations, e.target.value, selectedYear);
});

document.getElementById('yearSelect').addEventListener('change', (e) => {
    const viewType = document.getElementById('trendViewSelect').value;
    createTrendChart(currentObservations, viewType, e.target.value);
});

// Add functions for citizen engagement
function updateSeasonalTips() {
    const month = new Date().getMonth();
    const seasonalSpecies = {
        // Spring
        2: ['Eastern Bluebird', 'Spring Beauty', 'Wood Frogs'],
        3: ['Virginia Bluebells', 'Spring Peepers', 'Eastern Redbud'],
        4: ['Warblers', 'Jack-in-the-pulpit', 'Box Turtles'],
        // Summer
        5: ['Fireflies', 'Monarch Butterflies', 'Black-eyed Susans'],
        // ... etc for each month
    };
    
    const speciesList = document.getElementById('seasonal-species');
    const currentSpecies = seasonalSpecies[month] || [];
    speciesList.innerHTML = currentSpecies.map(species => 
        `<li>${species}</li>`).join('');
}

function createRecentFindings(observations) {
    const grid = document.getElementById('observations-grid');
    const recent = observations.slice(0, 6); // Show 6 most recent
    
    grid.innerHTML = recent.map(obs => `
        <div class="finding-card">
            <img src="${obs.photos[0]?.url || 'default-nature.jpg'}" alt="${obs.species_guess}">
            <div class="finding-info">
                <h3>${obs.species_guess}</h3>
                <p>${new Date(obs.observed_on).toLocaleDateString()}</p>
                <p>${obs.place_guess}</p>
            </div>
        </div>
    `).join('');
}

// Initialize the app
initialize(); 

