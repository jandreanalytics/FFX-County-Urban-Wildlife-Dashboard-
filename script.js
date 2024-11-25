// Constants

const API_BASE_URL = 'https://api.inaturalist.org/v1';
const FAIRFAX_BOUNDS = {
    swlat: 38.5950,
    swlng: -77.5111,
    nelat: 39.0024,
    nelng: -77.1198
};
const YEARS_AVAILABLE = Array.from({length: 9}, (_, i) => 2024 - i); // Creates [2024, 2023, ..., 2016]
const SEASONS = {
    spring: [2,3,4],
    summer: [5,6,7],
    fall: [8,9,10],
    winter: [11,0,1]
};

// Initialize map with better performance settings
let map = L.map('map', {
    zoomControl: false,
    maxZoom: 18,
    preferCanvas: true // Use Canvas renderer for better performance
}).setView([38.8462, -77.3064], 11);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '©OpenStreetMap, ©CartoDB',
    maxZoom: 19,
    minZoom: 9
}).addTo(map);

// Use a cluster group for better marker management
let markers = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 50
}).addTo(map);

// Store chart instances
let speciesAccumulationChartInstance = null;

// Function to load data with pagination
async function loadYearlyData(years = [2023], page = 1, perPage = 100) {
    if (!Array.isArray(years)) {
        years = [years]; // Convert single year to array if needed
    }
    
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

// Function to update map with better performance
function updateMap(observations) {
    console.log(`Updating map with ${observations.length} observations`);
    markers.clearLayers();
    
    const markersToAdd = observations.map(obs => {
        if (!obs.location) {
            console.log('Observation missing location:', obs);
            return null;
        }
        
        const [lat, lng] = obs.location.split(',').map(Number);
        if (isNaN(lat) || isNaN(lng)) {
            console.log('Invalid coordinates:', obs.location);
            return null;
        }
        
        // Add safety check for taxonomic_group
        const taxonomicGroup = (obs.taxonomic_group || 'unknown').toLowerCase();
        
        return L.marker([lat, lng], {
            icon: L.divIcon({
                className: `marker-${taxonomicGroup}`,
                html: `<div class="marker-dot"></div>`
            })
        }).bindPopup(createPopupContent(obs));
    }).filter(Boolean);

    console.log(`Adding ${markersToAdd.length} markers to map`);
    markers.addLayers(markersToAdd);
}

// Optimized dashboard initialization
async function initializeDashboard() {
    try {
        console.log('Initializing dashboard...');
        
        // Initialize season buttons
        initializeSeasonButtons();
        
        // Load initial data with pagination
        const initialData = await loadYearlyData([2023], 1, 100);
        console.log(`Loaded initial data: ${initialData.length} observations`);
        
        if (initialData.length === 0) {
            console.error('No initial data loaded');
            return;
        }
        
        updateMap(initialData);
        updateBiodiversityStats(initialData);
        
        // Fetch and display recent observations
        const recentObs = await fetchRecentObservations();
        displayLatestDiscoveries(recentObs);  // Changed this line from displayRecentObservations
        
        // Load more data in the background
        loadMoreData(2023, 2);
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
    }
}

// Function to load more data in the background
async function loadMoreData(year, startPage) {
    for (let page = startPage; page <= 5; page++) {
        const moreData = await loadYearlyData([year], page, 100); // Pass year as array
        if (moreData.length === 0) break;
        updateMap(moreData);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between loads
    }
}

function filterObservations(observations, filters) {
    return observations.filter(obs => {
        // Apply taxonomic filter
        if (filters.taxonomicGroup && filters.taxonomicGroup !== 'all') {
            if (obs.taxonomic_group !== filters.taxonomicGroup) return false;
        }
        
        // Apply seasonal filter
        if (filters.season) {
            const month = new Date(obs.observed_on).getMonth();
            if (!SEASONS[filters.season].includes(month)) return false;
        }
        
        return true;
    });
}
// Add this new function - it won't replace anything
function updateLatestDiscoveriesFilter(seasonalData, season, year) {
    const recentDiv = document.getElementById('recentObservations');
    if (!recentDiv) return;

    // Clear existing content first
    recentDiv.innerHTML = '';

    const groupedObservations = seasonalData.reduce((grouped, obs) => {
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
        .sort((a, b) => new Date(b[1].latestObservation.observed_on) - new Date(a[1].latestObservation.observed_on));

    const content = `
        <div class="discoveries-tabs">
            <button class="tab-button active" data-tab="recent">Recent Discoveries</button>
            <button class="tab-button" data-tab="filtered">${season} ${year} (${seasonalData.length})</button>
        </div>
        <div class="tab-content filtered-view">
            <div class="recent-header">
                <h2>${season} ${year} Discoveries</h2>
                <span class="observation-count">Showing ${seasonalData.length} observations</span>
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
        </div>
    `;

    recentDiv.innerHTML = content;

    // Add click handlers for species cards
    document.querySelectorAll('.recent-card').forEach(card => {
        card.addEventListener('click', () => {
            const species = card.dataset.species;
            const speciesData = groupedObservations[species];
            showSpeciesDetail(species, speciesData);
        });
    });
}

// Add this function to get current month's statistics
async function getCurrentMonthStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/observations/species_counts?` + new URLSearchParams({
            place_id: '2416',
            d1: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
            d2: new Date().toISOString().split('T')[0],
            verifiable: true
        }));

        if (!response.ok) throw new Error('Failed to fetch current month stats');
        
        const data = await response.json();
        return {
            speciesCount: data.total_results,
            observationsCount: data.results.reduce((acc, curr) => acc + curr.count, 0),
            taxonomicBreakdown: data.results.reduce((acc, curr) => {
                acc[curr.taxon.iconic_taxon_name] = (acc[curr.taxon.iconic_taxon_name] || 0) + curr.count;
                return acc;
            }, {})
        };
    } catch (error) {
        console.error('Error fetching current month stats:', error);
        return null;
    }
}

// Update your updateBiodiversityStats function to include current month
async function updateBiodiversityStats(observations) {
    const currentMonthStats = await getCurrentMonthStats();
    const stats = {
        totalSpecies: new Set(observations.map(o => o.species_name)).size,
        byGroup: {},
        currentMonth: currentMonthStats
    };
    
    observations.forEach(obs => {
        if (!stats.byGroup[obs.taxonomic_group]) {
            stats.byGroup[obs.taxonomic_group] = new Set();
        }
        stats.byGroup[obs.taxonomic_group].add(obs.species_name);
    });

    displayStats(stats);
}

function createPopupContent(observation) {
    return `
        <div class="observation-popup">
            <h3>${observation.common_name || observation.species_name}</h3>
            ${observation.photo_url ? `<img src="${observation.photo_url}" width="150">` : ''}
            <p>Observed: ${new Date(observation.observed_on).toLocaleDateString()}</p>
            <p>Group: ${observation.taxonomic_group}</p>
        </div>
    `;
}

// Call initialize function after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    populateYearFilter();
    initializeDashboard();
    startRecentObservationsRefresh();
    initializeSeasonButtons();
    
    // Add filter listeners
    document.getElementById('taxonomicFilter')
        .addEventListener('change', handleFilterChange);
    
    document.getElementById('yearFilter')
        .addEventListener('change', handleFilterChange);
    
    document.querySelectorAll('.season-buttons button')
        .forEach(btn => btn.addEventListener('click', handleSeasonSelect));
    
    addHelpfulTips();
});

// Add this function
async function fetchYearData(year, page, perPage) {
    try {
        console.log(`Fetching data for year ${year}, page ${page}`);
        const response = await fetch(
            `https://jandreanalytics.github.io/FFX-County-Urban-Wildlife-Dashboard-/data/observations_${year}.json`
        );
        if (response.ok) {
            const yearData = await response.json();
            console.log(`Loaded ${yearData.observations.length} observations for ${year}`);
            const start = (page - 1) * perPage;
            const paginatedData = yearData.observations.slice(start, start + perPage);
            console.log(`Returning ${paginatedData.length} observations for page ${page}`);
            return paginatedData;
        }
        console.warn(`Failed to load data for ${year}`);
        return [];
    } catch (error) {
        console.warn(`Failed to load data for ${year}:`, error);
        return [];
    }
}
// Add these functions
function handleFilterChange(event) {
    const filter = {
        taxonomicGroup: document.getElementById('taxonomicFilter').value,
        year: document.getElementById('yearFilter').value
    };
    
    loadYearlyData([filter.year]).then(data => {
        const filteredData = filterObservations(data, filter);
        updateMap(filteredData);
        updateBiodiversityStats(filteredData);
    });
}

function handleSeasonSelect(event) {
    const season = event.target.dataset.season;
    document.querySelectorAll('.season-buttons button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    loadYearlyData([document.getElementById('yearFilter').value]).then(data => {
        const filteredData = filterObservations(data, { season });
        updateMap(filteredData);
        updateBiodiversityStats(filteredData);
    });
}

// Add this new function - don't remove any existing code
function displayStats(stats) {
    const statsDiv = document.getElementById('biodiversityStats');
    if (!statsDiv) return;

    statsDiv.innerHTML = `
        <h3>Biodiversity Summary</h3>
        <p>Total Species: ${stats.totalSpecies}</p>
        <div class="taxonomic-breakdown">
            ${Object.entries(stats.byGroup).map(([group, species]) => `
                <div class="group-stat">
                    <span class="group-name">${group}</span>: 
                    <span class="species-count">${species.size} species</span>
                </div>
            `).join('')}
        </div>
    `;
}

// Add this function to populate the year filter
function populateYearFilter() {
    const yearFilter = document.getElementById('yearFilter');
    yearFilter.innerHTML = YEARS_AVAILABLE.map(year => 
        `<option value="${year}">${year}</option>`
    ).join('');
}

// Update the fetchRecentObservations function
async function fetchRecentObservations() {
    try {
        // Load the 2024 data for November
        const response = await fetch(
            'https://jandreanalytics.github.io/FFX-County-Urban-Wildlife-Dashboard-/data/observations_2024.json'
        );
        if (response.ok) {
            const data = await response.json();
            // Filter for November 2024 observations
            const novemberObs = data.observations.filter(obs => {
                const obsDate = new Date(obs.observed_on);
                return obsDate.getMonth() === 10; // JavaScript months are 0-based
            });
            return novemberObs;
        }
        return [];
    } catch (error) {
        console.error('Error fetching recent observations:', error);
        return [];
    }
}

// Add this function to group observations by species
function groupObservationsBySpecies(observations) {
    return observations.reduce((grouped, obs) => {
        const speciesKey = obs.species_guess || obs.taxon?.name || 'Unknown species';
        if (!grouped[speciesKey]) {
            grouped[speciesKey] = {
                count: 0,
                latestObservation: obs,
                taxonomicGroup: obs.taxon?.iconic_taxon_name || 'Unknown',
                observations: []
            };
        }
        grouped[speciesKey].count++;
        grouped[speciesKey].observations.push(obs);
        
        // Keep track of the most recent observation
        if (new Date(obs.observed_on) > new Date(grouped[speciesKey].latestObservation.observed_on)) {
            grouped[speciesKey].latestObservation = obs;
        }
        
        return grouped;
    }, {});
}

// Update the displayRecentObservations function to show the data count

function showSpeciesDetail(species, data) {
    const modal = document.createElement('div');
    modal.className = 'species-modal';
    modal.innerHTML = `
        <div class="species-modal-content">
            <div class="modal-header">
                <h3>${species}</h3>
                <span class="sighting-count">${data.count} sightings</span>
            </div>
            <div class="species-observations">
                ${data.observations.map(obs => `
                    <div class="observation-item">
                        ${obs.photo_url ? 
                            `<img src="${obs.photo_url}" 
                                 alt="${species}"
                                 loading="lazy">` 
                            : '<div class="no-photo">📷</div>'
                        }
                        <div class="observation-details">
                            <p class="observation-date">🗓️ ${new Date(obs.observed_on).toLocaleDateString()}</p>
                            <p class="observation-location">📍 ${obs.place_guess?.split(',')[0] || 'Location unknown'}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="close-modal">✕</button>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Add close handlers
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.addEventListener('click', e => {
        if (e.target === modal) modal.remove();
    });
}

// Add this function to show a detail modal for a species
function showSpeciesDetail(species, data) {
    const modal = document.createElement('div');
    modal.className = 'species-modal';
    modal.innerHTML = `
        <div class="species-modal-content">
            <div class="modal-header">
                <h3>${species}</h3>
                <span class="sighting-count">${data.count} sightings</span>
            </div>
            <div class="species-observations">
                ${data.observations.map(obs => `
                    <div class="observation-item">
                        ${obs.photos[0] ? 
                            `<img src="${obs.photos[0].url.replace('square', 'medium')}" 
                                 alt="${species}"
                                 loading="lazy">` 
                            : '<div class="no-photo">📷</div>'
                        }
                        <div class="observation-details">
                            <p class="observation-date">🗓️ ${new Date(obs.observed_on).toLocaleDateString()}</p>
                            <p class="observation-location">📍 ${obs.place_guess?.split(',')[0] || 'Location unknown'}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="close-modal">✕</button>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Add swipe down to close for mobile
    let touchStartY = 0;
    modal.addEventListener('touchstart', e => {
        touchStartY = e.touches[0].clientY;
    });

    modal.addEventListener('touchmove', e => {
        const touchY = e.touches[0].clientY;
        const diff = touchY - touchStartY;
        if (diff > 100) {
            modal.remove();
        }
    });

    modal.querySelector('.close-modal').onclick = () => modal.remove();
}

// Add a function to refresh recent observations periodically
function startRecentObservationsRefresh(intervalMinutes = 5) {
    setInterval(async () => {
        const recentObs = await fetchRecentObservations();
        displayRecentObservations(recentObs);
    }, intervalMinutes * 60 * 1000);
}

// Add map controls in a modern way
L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Add this function to show helpful tooltips
function addHelpfulTips() {
    const mapSection = document.querySelector('.map-section');
    mapSection.setAttribute('title', 'Click on markers to see details about each sighting');
    
    const taxonomicFilter = document.getElementById('taxonomicFilter');
    taxonomicFilter.setAttribute('title', 'Filter to see specific types of wildlife');
    
    // Add a small help text under the map
    const helpText = document.createElement('p');
    helpText.className = 'help-text';
    helpText.innerHTML = 'Tip: Zoom in to see individual sightings, zoom out to see clusters';
    mapSection.appendChild(helpText);
}

// Add pull-to-refresh functionality for mobile
let touchStart = 0;
document.addEventListener('touchstart', e => {
    touchStart = e.touches[0].clientY;
});

document.addEventListener('touchmove', e => {
    const touch = e.touches[0].clientY;
    const diff = touch - touchStart;
    if (diff > 100) {
        location.reload();
    }
});

// Add toast notifications
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Update this function
function displayLatestDiscoveries(observations, seasonalData = null, season = null, year = null) {
    const recentDiv = document.getElementById('recentObservations');
    if (!recentDiv) return;

    const groupedRecentObservations = observations.reduce((grouped, obs) => {
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

    const sortedRecentGroups = Object.entries(groupedRecentObservations)
        .sort((a, b) => new Date(b[1].latestObservation.observed_on) - new Date(a[1].latestObservation.observed_on));

    // Create tabs and content containers
    recentDiv.innerHTML = `
        <div class="discoveries-tabs">
            <button class="tab-button active" data-tab="recent">Recent Discoveries</button>
            ${seasonalData ? `<button class="tab-button" data-tab="filtered">${season} ${year} (${seasonalData.length})</button>` : ''}
        </div>
        <div class="tab-content recent-view active">
            <div class="recent-header">
                <h2>Latest Discoveries</h2>
                <span class="observation-count">Showing ${observations.length} recent observations from November 2024</span>
            </div>
            <div class="recent-grid">
                ${sortedRecentGroups.map(([species, data]) => `
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
        </div>
        ${seasonalData ? `
            <div class="tab-content filtered-view">
                <div class="recent-header">
                    <h2>${season} ${year} Discoveries</h2>
                    <span class="observation-count">Showing ${seasonalData.length} observations</span>
                </div>
                <div class="recent-grid">
                    ${Object.entries(seasonalData.reduce((grouped, obs) => {
                        const speciesKey = obs.common_name || obs.species_name || 'Unknown species';
                        if (!grouped[speciesKey]) {
                            grouped[speciesKey] = {
                                count: 0,
                                latestObservation: obs,
                                observations: []
                            };
                        }
                        grouped[speciesKey].count++;
                        grouped[speciesKey].observations.push(obs);
                        if (!grouped[speciesKey].latestObservation || 
                            new Date(obs.observed_on) > new Date(grouped[speciesKey].latestObservation.observed_on)) {
                            grouped[speciesKey].latestObservation = obs;
                        }
                        return grouped;
                    }, {}))
                    .sort((a, b) => new Date(b[1].latestObservation.observed_on) - new Date(a[1].latestObservation.observed_on))
                    .map(([species, data]) => `
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
            </div>
        ` : ''}
    `;

    // Add tab switching functionality
    recentDiv.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            recentDiv.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            recentDiv.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            button.classList.add('active');
            const tabName = button.dataset.tab;
            recentDiv.querySelector(`.${tabName}-view`).classList.add('active');
        });
    });

    // Add click handlers for species cards
    recentDiv.querySelectorAll('.recent-card').forEach(card => {
        card.addEventListener('click', () => {
            const species = card.dataset.species;
            const speciesData = card.closest('.recent-view') ? 
                groupedRecentObservations[species] : 
                seasonalData?.find(obs => (obs.common_name || obs.species_name) === species);
            if (speciesData) showSpeciesDetail(species, speciesData);
        });
    });
}

// Add this new function - it won't replace anything
async function loadSeasonalData(year, season) {
    try {
        console.log(`Loading ${season} data for ${year}`);
        const response = await fetch(
            `https://jandreanalytics.github.io/FFX-County-Urban-Wildlife-Dashboard-/data/observations_${year}.json`
        );
        
        if (!response.ok) {
            console.warn(`Failed to load data for ${year}`);
            return [];
        }

        const yearData = await response.json();
        
        // Filter for seasonal data
        const seasonalData = yearData.observations.filter(obs => {
            const month = new Date(obs.observed_on).getMonth();
            return SEASONS[season].includes(month);
        });

        console.log(`Found ${seasonalData.length} observations for ${season} ${year}`);
        return seasonalData;
    } catch (error) {
        console.warn(`Error loading seasonal data for ${year}:`, error);
        return [];
    }
}
// Add this new function - it won't replace anything
function initializeSeasonButtons() {
    const seasonButtons = document.querySelectorAll('.season-buttons button');
    seasonButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const season = event.target.dataset.season;
            const year = document.getElementById('yearFilter').value;
            
            // Update button states
            seasonButtons.forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            
            // Load the seasonal data and update map
            handleSeasonYearSelect(season, year);
        });
    });

    // Also handle year filter changes
    document.getElementById('yearFilter').addEventListener('change', (event) => {
        const activeSeasonButton = document.querySelector('.season-buttons button.active');
        if (activeSeasonButton) {
            const season = activeSeasonButton.dataset.season;
            handleSeasonYearSelect(season, event.target.value);
        }
    });
}
// Add this new function - it won't replace anything
async function handleSeasonYearSelect(season, year) {
    try {
        // Show loading state
        showToast(`Loading ${season} data for ${year}...`);
        
        // Clear existing markers
        markers.clearLayers();
        
        // Load and process data in chunks
        const seasonalData = await loadSeasonalData(year, season);
        const chunkSize = 1000;
        
        for (let i = 0; i < seasonalData.length; i += chunkSize) {
            const chunk = seasonalData.slice(i, i + chunkSize);
            const markersToAdd = chunk.map(obs => {
                if (!obs.location) return null;
                
                const [lat, lng] = obs.location.split(',').map(Number);
                if (isNaN(lat) || isNaN(lng)) return null;
                
                // Add safety check for taxonomic_group
                const taxonomicGroup = (obs.taxonomic_group || 'unknown').toLowerCase();
                
                return L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: `marker-${taxonomicGroup}`,
                        html: `<div class="marker-dot"></div>`
                    })
                }).bindPopup(createPopupContent(obs));
            }).filter(Boolean);
            
            markers.addLayers(markersToAdd);
            
            // Allow UI to update between chunks
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        showToast(`Loaded ${seasonalData.length} observations for ${season} ${year}`);
        
        // Update biodiversity stats with the seasonal data
        updateBiodiversityStats(seasonalData);
        
        // Add this line
        updateLatestDiscoveriesFilter(seasonalData, season, year);
        
    } catch (error) {
        console.error('Error loading seasonal data:', error);
        showToast('Error loading seasonal data');
    }
}

// Add this new function - it won't replace anything
function updateLatestDiscoveriesFilter(seasonalData, season, year) {
    const recentDiv = document.getElementById('recentObservations');
    if (!recentDiv) return;

    // Clear existing content first
    recentDiv.innerHTML = '';

    const groupedObservations = seasonalData.reduce((grouped, obs) => {
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
        .sort((a, b) => new Date(b[1].latestObservation.observed_on) - new Date(a[1].latestObservation.observed_on));

    const content = `
        <div class="discoveries-tabs">
            <button class="tab-button active" data-tab="recent">Recent Discoveries</button>
            <button class="tab-button" data-tab="filtered">${season} ${year} (${seasonalData.length})</button>
        </div>
        <div class="tab-content filtered-view">
            <div class="recent-header">
                <h2>${season} ${year} Discoveries</h2>
                <span class="observation-count">Showing ${seasonalData.length} observations</span>
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
        </div>
    `;

    recentDiv.innerHTML = content;

    // Add click handlers for species cards
    document.querySelectorAll('.recent-card').forEach(card => {
        card.addEventListener('click', () => {
            const species = card.dataset.species;
            const speciesData = groupedObservations[species];
            showSpeciesDetail(species, speciesData);
        });
    });
}



