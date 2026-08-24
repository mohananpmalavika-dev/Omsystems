// Run this script in browser console to diagnose non-working cameras
// Copy and paste this entire script into browser console (F12)

async function checkCameraStatus() {
  console.log("🔍 Checking all cameras on the video wall...\n");
  
  // Get all camera tiles
  const tiles = document.querySelectorAll('[data-activity-camera-id]');
  console.log(`Found ${tiles.length} camera tiles\n`);
  
  const results = [];
  
  for (const tile of tiles) {
    const cameraId = tile.getAttribute('data-activity-camera-id');
    const cameraName = tile.getAttribute('data-activity-branch-name') || 'Unknown';
    
    try {
      // Check if camera has a session
      const hasLiveBadge = tile.querySelector('[class*="LIVE"]') !== null;
      const hasWatchButton = tile.textContent.includes('Watch live');
      const hasDegraded = tile.textContent.includes('DEGRADED') || tile.textContent.includes('QUEUED');
      
      let status = 'unknown';
      if (hasLiveBadge) status = 'streaming';
      else if (hasDegraded) status = 'degraded';
      else if (hasWatchButton) status = 'not-started';
      
      const result = {
        cameraId,
        cameraName,
        status,
        hasVideo: tile.querySelector('video') !== null,
      };
      
      // Try to fetch camera details from API
      try {
        const response = await fetch(`/api/control/v1/cameras/${cameraId}`, {
          headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
          }
        });
        
        if (response.ok) {
          const camera = await response.json();
          result.online = camera.onlineStatus === 'online' || camera.status === 'online';
          result.hasMainStream = Boolean(camera.streams?.main || camera.mainStreamUrl);
          result.hasSubStream = Boolean(camera.streams?.sub || camera.subStreamUrl);
          result.deviceType = camera.sourceType || camera.deviceType;
        }
      } catch (e) {
        result.apiError = e.message;
      }
      
      results.push(result);
      
      // Color code the console output
      const emoji = status === 'streaming' ? '✅' : status === 'degraded' ? '⚠️' : '❌';
      console.log(`${emoji} ${cameraName} (${cameraId})`);
      console.log(`   Status: ${status}`);
      if (result.online !== undefined) {
        console.log(`   Online: ${result.online ? 'Yes' : 'No'}`);
      }
      if (result.hasMainStream !== undefined || result.hasSubStream !== undefined) {
        console.log(`   Streams: ${result.hasMainStream ? 'Main ✓' : 'Main ✗'} | ${result.hasSubStream ? 'Sub ✓' : 'Sub ✗'}`);
      }
      if (result.deviceType) {
        console.log(`   Device: ${result.deviceType}`);
      }
      console.log('');
      
    } catch (error) {
      console.error(`Error checking ${cameraId}:`, error);
      results.push({
        cameraId,
        cameraName,
        error: error.message,
      });
    }
  }
  
  // Summary
  console.log('\n📊 SUMMARY:\n');
  const streaming = results.filter(r => r.status === 'streaming').length;
  const notStarted = results.filter(r => r.status === 'not-started').length;
  const degraded = results.filter(r => r.status === 'degraded').length;
  
  console.log(`✅ Streaming: ${streaming}`);
  console.log(`⚠️ Degraded: ${degraded}`);
  console.log(`❌ Not Started: ${notStarted}`);
  
  // Identify issues
  console.log('\n🔧 ISSUES FOUND:\n');
  const offline = results.filter(r => r.online === false);
  const noStreams = results.filter(r => r.hasMainStream === false && r.hasSubStream === false);
  
  if (offline.length > 0) {
    console.log(`📡 ${offline.length} cameras are OFFLINE:`);
    offline.forEach(r => console.log(`   - ${r.cameraName} (${r.cameraId})`));
    console.log('   💡 Solution: Check camera power and network connectivity\n');
  }
  
  if (noStreams.length > 0) {
    console.log(`🎥 ${noStreams.length} cameras have NO STREAM PROFILES:`);
    noStreams.forEach(r => console.log(`   - ${r.cameraName} (${r.cameraId})`));
    console.log('   💡 Solution: Configure RTSP stream URLs in camera settings\n');
  }
  
  return results;
}

// Run the check
console.log('Starting camera diagnostics...\n');
checkCameraStatus().then(results => {
  console.log('\n✅ Diagnostic complete!');
  console.log('Results are stored in the console. Copy this data to share with support.');
  console.table(results);
});
