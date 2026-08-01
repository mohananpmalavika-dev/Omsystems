// Quick check if edge agent is running
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

console.log("🔍 Checking Edge Agent Status...\n");

// Test 1: Check port 8090
console.log("Test 1: Checking if port 8090 is listening...");
try {
  const { stdout } = await execAsync('netstat -ano | findstr "8090"');
  if (stdout.includes("LISTENING")) {
    console.log("✅ Port 8090 is LISTENING - Edge agent is running!\n");
  } else {
    console.log("⚠️ Port 8090 found but not listening\n");
  }
} catch (error) {
  console.log("❌ Port 8090 is NOT listening - Edge agent is NOT running\n");
}

// Test 2: Try to connect to health endpoint
console.log("Test 2: Testing media gateway health endpoint...");
try {
  const response = await fetch("http://127.0.0.1:8090/health");
  if (response.ok) {
    const data = await response.json();
    console.log(`✅ Media gateway is responding: ${JSON.stringify(data)}\n`);
  } else {
    console.log(`⚠️ Media gateway responded but with error: ${response.status}\n`);
  }
} catch (error) {
  console.log("❌ Cannot connect to media gateway - Edge agent is NOT running\n");
}

// Test 3: Check control plane for edge agent status
console.log("Test 3: Checking edge agent status in control plane...");
try {
  const response = await fetch(
    "https://sentinel-grid-control-plane1.onrender.com/v1/edge-agents/6a570d4a-2c71-415f-b59a-643cf50d55c5/heartbeat",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-bridge-key": "WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa",
      },
      body: JSON.stringify({ version: "0.1.0" }),
    }
  );

  if (response.ok) {
    const data = await response.json();
    console.log(`✅ Edge agent in control plane:`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Last seen: ${data.lastSeenAt}`);
    console.log(`   Public media URL: ${data.publicMediaUrl || "(not set)"}\n`);
    
    const lastSeen = new Date(data.lastSeenAt);
    const now = new Date();
    const secondsAgo = Math.floor((now - lastSeen) / 1000);
    
    if (secondsAgo < 60) {
      console.log(`✅ Edge agent is ACTIVE (last seen ${secondsAgo} seconds ago)\n`);
    } else {
      console.log(`⚠️ Edge agent was last seen ${secondsAgo} seconds ago - may not be running\n`);
    }
  } else {
    console.log(`⚠️ Could not get edge agent status: ${response.status}\n`);
  }
} catch (error) {
  console.log(`❌ Error checking control plane: ${error.message}\n`);
}

// Summary
console.log("=".repeat(60));
console.log("SUMMARY:");
console.log("=".repeat(60));
console.log("\nIf you see:");
console.log("✅ All green checks → Edge agent IS WORKING");
console.log("❌ Red X marks → Edge agent IS NOT RUNNING");
console.log("\nTo start edge agent:");
console.log("  cd c:\\Omsystems\\edge-agent");
console.log("  START_SCANNER_SIMPLE.bat");
