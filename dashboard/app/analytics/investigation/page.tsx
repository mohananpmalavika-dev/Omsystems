"use client";

import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Route, GitBranch, MapPin, Clock, VideoIcon, Camera } from "lucide-react";

export default function AIInvestigationPage() {
  return (
    <AppLayout>
      <PageHero
        title="AI Investigation Tools"
        description="Cross-camera journey reconstruction, route analysis, and evidence collection powered by AI"
        icon={Route}
      />
      
      <div className="container mx-auto p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Route className="h-5 w-5 text-primary" />
                <CardTitle>Cross-Camera Timeline</CardTitle>
              </div>
              <CardDescription>
                Track subjects across multiple cameras with AI-powered journey reconstruction
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Coming Soon</Badge>
              <p className="text-sm text-muted-foreground">
                Automatically stitch together detections across camera views to build complete movement timelines.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-primary" />
                <CardTitle>Route Reconstruction</CardTitle>
              </div>
              <CardDescription>
                Visualize movement paths and identify patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Coming Soon</Badge>
              <p className="text-sm text-muted-foreground">
                Generate visual route maps showing how individuals or vehicles moved through your premises.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <CardTitle>Last Seen Location</CardTitle>
              </div>
              <CardDescription>
                Find the last known location of persons or vehicles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Coming Soon</Badge>
              <p className="text-sm text-muted-foreground">
                Quick lookup to find when and where a subject was last detected by your surveillance system.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle>Object Origin Tracing</CardTitle>
              </div>
              <CardDescription>
                Trace where objects first appeared in the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Coming Soon</Badge>
              <p className="text-sm text-muted-foreground">
                Work backwards to identify entry points and first detection moments for investigation targets.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <VideoIcon className="h-5 w-5 text-primary" />
                <CardTitle>Evidence Collection</CardTitle>
              </div>
              <CardDescription>
                Automated evidence gathering workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Coming Soon</Badge>
              <p className="text-sm text-muted-foreground">
                Collect relevant video clips and metadata across all related cameras for incident documentation.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />
                <CardTitle>Multi-Camera Correlation</CardTitle>
              </div>
              <CardDescription>
                Link detections across surveillance zones
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Coming Soon</Badge>
              <p className="text-sm text-muted-foreground">
                AI identifies matching subjects across different camera views using appearance and temporal analysis.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>🚧 Under Development</CardTitle>
            <CardDescription>
              These advanced investigation capabilities are being built on top of the existing AI analytics engine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div>
                <strong>Current Capabilities Available:</strong>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-muted-foreground">
                  <li>Person re-identification (ReID) for tracking across cameras</li>
                  <li>AI-powered video search with natural language queries</li>
                  <li>Multi-camera synced playback for manual investigation</li>
                  <li>Evidence vault with chain of custody tracking</li>
                </ul>
              </div>
              <div className="pt-2">
                <strong>Planned Features:</strong>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-muted-foreground">
                  <li>Automated journey timeline generation</li>
                  <li>Interactive route visualization on floor plans</li>
                  <li>Predictive path analysis and anomaly detection</li>
                  <li>One-click evidence package creation for incidents</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
