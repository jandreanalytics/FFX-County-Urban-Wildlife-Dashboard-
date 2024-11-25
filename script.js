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

// Use a cluster group for markers
let markers = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 50
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
        
        return L.marker([lat, lng], {
            icon: L.divIcon({
                className: `marker-${taxonomicGroup}`,
                html: `<div class="marker-dot"></div>`
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
        console.log('Initial data loaded:', initialData);
        
        if (initialData.length === 0) {
            console.error('No initial data loaded');
            return;
        }
        
        updateMap(initialData);
        updateBiodiversityStats(initialData);
        displayLatestDiscoveries(initialData);
        
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
        title = 'Latest Discoveries';
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
            <h2>${title}</h2>
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

    // Add click handlers for species cards
    recentDiv.querySelectorAll('.recent-card').forEach(card => {
        card.addEventListener('click', () => {
            const species = card.dataset.species;
            const speciesData = groupedObservations[species];
            showSpeciesDetail(species, speciesData);
        });
    });
}
// Stats functions
async function updateBiodiversityStats(observations) {
    const stats = {
        totalSpecies: new Set(observations.map(o => o.species_name)).size,
        byGroup: {}
    };
    
    observations.forEach(obs => {
        if (!stats.byGroup[obs.taxonomic_group]) {
            stats.byGroup[obs.taxonomic_group] = new Set();
        }
        stats.byGroup[obs.taxonomic_group].add(obs.species_name);
    });

    displayStats(stats);
}

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

// UI Helper functions
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
    
    // Add filter listeners
    document.getElementById('taxonomicFilter')?.addEventListener('change', handleFilterChange);
    document.getElementById('yearFilter')?.addEventListener('change', handleFilterChange);
    
    document.querySelectorAll('.season-buttons button')
        .forEach(btn => btn.addEventListener('click', handleSeasonSelect));
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
        updateBiodiversityStats(filteredData);
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
    const filter = { season, year };
    
    loadYearlyData([year]).then(data => {
        const filteredData = filterObservations(data, filter);
        updateMap(filteredData);
        updateBiodiversityStats(filteredData);
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

function initializeSeasonButtons() {
    document.querySelectorAll('.season-buttons button').forEach(button => {
        button.addEventListener('click', (event) => {
            const season = event.target.dataset.season;
            const year = document.getElementById('yearFilter').value;
            handleSeasonSelect(event);
        });
    });
}

// Add this at the start of your data loading functions
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

