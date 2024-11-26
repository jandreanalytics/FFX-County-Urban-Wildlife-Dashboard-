// attribution_test.mjs
import fetch from 'node-fetch';

async function testAttributionFormat() {
    const API_URL = 'https://api.inaturalist.org/v1/observations';
    
    try {
        console.log('Fetching random observation...');
        const response = await fetch(`${API_URL}/random?photos=true`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.results && data.results[0]) {
            const obs = data.results[0];
            
            console.log('\nPhoto Attribution Data:');
            console.log('====================');
            
            if (obs.photos && obs.photos[0]) {
                const photo = obs.photos[0];
                console.log(JSON.stringify({
                    photoUrl: photo.url,
                    licenseCode: photo.license_code,
                    attribution: photo.attribution,
                    observer: obs.user?.name || obs.user?.login,
                    fullUserData: {
                        name: obs.user?.name,
                        login: obs.user?.login,
                        id: obs.user?.id
                    },
                    fullPhotoData: {
                        license_code: photo.license_code,
                        attribution: photo.attribution,
                        url: photo.url
                    }
                }, null, 2));
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testAttributionFormat();