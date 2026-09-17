# IP-Based Camera Geolocation Feature

## Overview

Camera IP address-നെ അടിസ്ഥാനമാക്കി automatic ആയി GPS location detect ചെയ്യുന്ന feature!

## 🌍 What is IP Geolocation?

Every camera with a **public IP address** has a physical location. Using the IP address, we can automatically detect:
- **Latitude & Longitude** (GPS coordinates)
- **City** (e.g., "Bangalore", "Mumbai")
- **Country** (e.g., "India")

## 🎯 How It Works

### Location Detection Priority (3 Levels)

```
1. Camera Metadata (Highest Priority)
   └─ camera.metadata.location
   └─ Manually set GPS on specific camera
   
2. IP Geolocation (Automatic)
   └─ Detect from camera's public IP address
   └─ Works for 203.x.x.x, 115.x.x.x, etc.
   └─ Skips private IPs (192.168.x.x, 10.x.x.x)
   
3. Branch Location (Fallback)
   └─ branch.metadata.location
   └─ All cameras in branch share same GPS
```

### Example Flow

```
Camera ID: cam-001
IP Address: 203.192.212.15

Step 1: Check camera.metadata.location
  └─ Not found ❌

Step 2: Check IP geolocation
  └─ Query ip-api.com/203.192.212.15
  └─ Result: {
       latitude: 12.9716,
       longitude: 77.5946,
       city: "Bangalore",
       country: "India"
     }
  └─ Found! ✅ Use this location

Step 3: Fall back to branch location
  └─ Skipped (already found)
```

## 🚀 Features

### Automatic Detection
- ✅ No manual GPS configuration needed
- ✅ Works for cameras with public IPs
- ✅ Shows real camera location (not branch)
- ✅ Displays city/country information
- ✅ Updates automatically on refresh

### Smart Filtering
- ✅ Skips private IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- ✅ Handles localhost (127.x.x.x)
- ✅ Validates IP format before querying
- ✅ Graceful fallback on errors

### Performance Optimized
- ✅ Batch processing (10 cameras at a time)
- ✅ 3-second timeout per request
- ✅ Rate limiting friendly (45 req/min)
- ✅ Async/parallel processing

## 📖 Usage

### Frontend

Enable IP geolocation in Camera Map page:

1. Go to `/maintenance/camera-map`
2. Check **"Use IP Location"** checkbox
3. Map automatically refreshes with IP-based locations

### API

```bash
# Enable IP geolocation
GET /api/control/v1/camera-locations?useIpGeolocation=true

# Disable IP geolocation (use branch location only)
GET /api/control/v1/camera-locations?useIpGeolocation=false
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "cam-001",
      "name": "Main Entrance",
      "latitude": 12.9716,
      "longitude": 77.5946,
      "ipAddress": "203.192.212.15",
      "locationSource": "ip-geolocation",
      "city": "Bangalore",
      "country": "India",
      "status": "online"
    }
  ],
  "total": 1,
  "ipGeolocationEnabled": true
}
```

## 🔍 Location Sources

### 1. `camera-metadata`
Camera's own GPS coordinates (highest priority)

```json
{
  "camera": {
    "id": "cam-001",
    "metadata": {
      "location": {
        "latitude": 12.9716,
        "longitude": 77.5946
      }
    }
  }
}
```

### 2. `ip-geolocation`
Automatically detected from IP address

```
IP: 203.192.212.15
  ↓
ip-api.com lookup
  ↓
Lat: 12.9716, Lon: 77.5946
City: Bangalore, Country: India
```

### 3. `branch-metadata`
Fallback to branch location

```json
{
  "branch": {
    "id": "branch-123",
    "metadata": {
      "location": {
        "latitude": 12.9716,
        "longitude": 77.5946
      }
    }
  }
}
```

## ⚙️ Configuration

### Enable by Default (Backend)

IP geolocation is **enabled by default** in the API:

```typescript
useIpGeolocation: z.enum(["true", "false"])
  .optional()
  .transform((v) => v !== "false"), // Default true
```

### Per-Camera GPS Override

Set specific GPS for a camera:

```sql
UPDATE cameras 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 12.9716, "longitude": 77.5946}'::jsonb
)
WHERE id = 'cam-001';
```

## 🌐 Supported IP Ranges

### ✅ Public IPs (Geolocation Works)
- `203.x.x.x` - Asia-Pacific
- `115.x.x.x` - India
- `43.x.x.x` - South Asia
- `122.x.x.x` - China/Asia
- `Any public IP range`

### ❌ Private IPs (Skipped)
- `192.168.x.x` - Private networks
- `10.x.x.x` - Private networks
- `172.16-31.x.x` - Private networks
- `127.x.x.x` - Localhost

## 🔧 Technical Details

### IP Geolocation Service

**Provider**: [ip-api.com](http://ip-api.com)
- Free tier: 45 requests/minute
- No API key required
- Fields: status, lat, lon, city, country
- Timeout: 3 seconds

### Rate Limiting

To respect API limits:
- Batch size: 10 cameras
- Parallel requests within batch
- Sequential batches
- 3-second timeout per request

### Error Handling

```typescript
try {
  const ipLocation = await getLocationFromIp(camera.ipAddress);
  if (ipLocation) {
    // Use IP location
  }
} catch (error) {
  // Log and continue with fallback
  app.log.warn({ cameraId, ipAddress, error }, "IP geolocation failed");
}
```

## 📊 Use Cases

### 1. Distributed Camera Network
```
Mumbai Office: 203.x.x.x → Mumbai location
Delhi Office: 115.x.x.x → Delhi location
Bangalore Office: 43.x.x.x → Bangalore location

No manual GPS configuration needed!
```

### 2. Mobile/Remote Cameras
```
Portable camera with 4G SIM
  ↓
Public IP changes dynamically
  ↓
Location auto-updates based on current IP
```

### 3. Multi-Branch Deployment
```
Branch A: Cameras with public IPs → Exact locations
Branch B: Cameras with private IPs → Branch location
Mixed deployment handled seamlessly
```

## ⚠️ Limitations

### Private IP Networks
- Cameras on 192.168.x.x won't have IP geolocation
- Must use branch location or camera metadata

### Behind NAT/Proxy
- Multiple cameras may share same public IP
- All will show same location (NAT gateway location)

### IP Changes
- Dynamic IPs require page refresh to update location
- Location not stored - computed on each request

### Rate Limits
- Free tier: 45 requests/minute
- Large deployments (>500 cameras) may need paid plan

## 🎓 Examples

### Example 1: Camera with Public IP

```
Input:
  Camera IP: 203.192.212.15
  Branch: Bangalore Main Branch

Process:
  1. Check camera metadata → Not found
  2. Query ip-api.com → Success!
     {
       "lat": 12.9716,
       "lon": 77.5946,
       "city": "Bangalore",
       "country": "India"
     }
  3. Skip branch location (already found)

Output:
  Latitude: 12.9716
  Longitude: 77.5946
  Location Source: "ip-geolocation"
  City: "Bangalore"
```

### Example 2: Camera with Private IP

```
Input:
  Camera IP: 192.168.1.100
  Branch: Mumbai Office

Process:
  1. Check camera metadata → Not found
  2. Check IP geolocation → Skipped (private IP)
  3. Use branch location → Success!
     {
       "latitude": 19.0760,
       "longitude": 72.8777
     }

Output:
  Latitude: 19.0760
  Longitude: 72.8777
  Location Source: "branch-metadata"
  City: undefined
```

### Example 3: Manual Camera GPS

```
Input:
  Camera metadata: {"location": {"latitude": 13.0827, "longitude": 80.2707}}
  Camera IP: 203.x.x.x
  Branch: Chennai Branch

Process:
  1. Check camera metadata → Found! ✅
  2. Skip IP geolocation (not needed)
  3. Skip branch location (not needed)

Output:
  Latitude: 13.0827
  Longitude: 80.2707
  Location Source: "camera-metadata"
```

## 🔐 Security & Privacy

### Safe to Use
- ✅ Only IP address sent to geolocation service
- ✅ No camera credentials exposed
- ✅ No video/image data transmitted
- ✅ Read-only operation
- ✅ Respects tenant isolation

### What Gets Logged
```javascript
app.log.warn({
  cameraId: camera.id,
  ipAddress: camera.ipAddress,  // Only IP, no credentials
  error
}, "IP geolocation failed");
```

## 📚 Related Documentation

- **Main Feature**: `docs/CAMERA_LOCATION_MAP.md`
- **Quick Start**: `docs/CAMERA_MAP_QUICK_START.md`
- **Implementation**: `CAMERA_MAP_IMPLEMENTATION.md`

## 🎉 Summary

IP-based geolocation എന്നാൽ:
- ✅ Camera IP നോക്കി automatic location detection
- ✅ Public IPs-ന് മാത്രം work ചെയ്യും
- ✅ Private IPs (192.168.x.x) branch location use ചെയ്യും
- ✅ No manual configuration needed!
- ✅ Real-time city/country display
- ✅ Fallback സിസ്റ്റം ഉണ്ട്

**Camera എവിടെയാണെന്ന് IP address-നെ അടിസ്ഥാനമാക്കി കണ്ടെത്താം!** 🌍📍✨
