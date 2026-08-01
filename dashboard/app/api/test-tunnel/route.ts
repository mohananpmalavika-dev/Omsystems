import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type TunnelTestResults = {
  tunnelUrl: string;
  edgeBridgeKeySet: boolean;
  healthCheck?: {
    status: number;
    ok: boolean;
    body: string;
  };
  authCheck?: {
    status: number;
    ok: boolean;
  };
};

export async function GET() {
  const tunnelUrl = process.env.MEDIA_GATEWAY_INTERNAL_URL || "NOT SET";
  const edgeBridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY || "NOT SET";
  
  const tests: TunnelTestResults = {
    tunnelUrl,
    edgeBridgeKeySet: edgeBridgeKey !== "NOT SET",
  };
  
  try {
    // Test 1: Can we reach the tunnel health endpoint?
    const healthResponse = await fetch(`${tunnelUrl}/health`, {
      signal: AbortSignal.timeout(10000),
    });
    
    tests.healthCheck = {
      status: healthResponse.status,
      ok: healthResponse.ok,
      body: await healthResponse.text(),
    };
    
    // Test 2: Can we authenticate with the tunnel?
    const authResponse = await fetch(`${tunnelUrl}/health`, {
      headers: {
        "x-edge-bridge-key": edgeBridgeKey,
      },
      signal: AbortSignal.timeout(10000),
    });
    
    tests.authCheck = {
      status: authResponse.status,
      ok: authResponse.ok,
    };
    
    return NextResponse.json({
      success: true,
      tests,
      message: "All tests passed!",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      tests,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
