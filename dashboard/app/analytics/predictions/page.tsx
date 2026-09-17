"use client";

import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Camera, HardDrive, AlertTriangle, Network, Building2, Clock, Zap } from "lucide-react";

export default function AIPredictionPage() {
  return (
    <AppLayout>
      <PageHero
        title="AI Prediction Dashboard"
        description="Predictive analytics for infrastructure failures, security incidents, and operational anomalies"
        icon={TrendingUp}
      />
      
      <div className="container mx-auto p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-orange-500" />
                <CardTitle>Camera Failure Prediction</CardTitle>
              </div>
              <CardDescription>
                Predict camera failures before they happen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">In Development</Badge>
              <p className="text-sm text-muted-foreground">
                ML models analyze image quality degradation, connection stability, and hardware health metrics to forecast failures 24-72 hours in advance.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-red-500" />
                <CardTitle>Storage Capacity Forecast</CardTitle>
              </div>
              <CardDescription>
                HDD and storage exhaustion predictions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">In Development</Badge>
              <p className="text-sm text-muted-foreground">
                Time-series analysis of storage consumption patterns to predict when drives will reach capacity.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5 text-blue-500" />
                <CardTitle>Network Switch Health</CardTitle>
              </div>
              <CardDescription>
                Predict network equipment failures
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">In Development</Badge>
              <p className="text-sm text-muted-foreground">
                Monitor packet loss, latency spikes, and port errors to forecast switch failures and bandwidth bottlenecks.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <CardTitle>Recording Interruption Risk</CardTitle>
              </div>
              <CardDescription>
                Predict recording gaps before they occur
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">In Development</Badge>
              <p className="text-sm text-muted-foreground">
                Analyze DVR health, storage I/O, and network stability to predict imminent recording failures.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-500" />
                <CardTitle>Branch Risk Assessment</CardTitle>
              </div>
              <CardDescription>
                Predictive security risk scoring per location
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">In Development</Badge>
              <p className="text-sm text-muted-foreground">
                ML models combine historical incidents, camera coverage gaps, and local factors to predict branch vulnerability.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                <CardTitle>Incident Probability Forecast</CardTitle>
              </div>
              <CardDescription>
                Predict likelihood of security events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">In Development</Badge>
              <p className="text-sm text-muted-foreground">
                Time-series and pattern recognition to forecast elevated risk periods for specific incident types.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>About Predictive Analytics</CardTitle>
            <CardDescription>
              How AI prediction works in Om Systems
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <strong className="text-base">Data Sources:</strong>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-muted-foreground">
                  <li>Real-time camera health telemetry (frame rate, bitrate, quality scores)</li>
                  <li>Storage I/O metrics and disk health indicators (SMART data)</li>
                  <li>Network performance metrics (latency, packet loss, bandwidth)</li>
                  <li>Historical incident patterns and seasonal trends</li>
                  <li>Environmental factors (temperature, power events)</li>
                </ul>
              </div>
              
              <div>
                <strong className="text-base">Machine Learning Approach:</strong>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-muted-foreground">
                  <li><strong>Time-series forecasting:</strong> ARIMA, Prophet, and LSTM models for trend prediction</li>
                  <li><strong>Anomaly detection:</strong> Isolation Forest and autoencoders for unusual patterns</li>
                  <li><strong>Classification:</strong> XGBoost for failure probability estimation</li>
                  <li><strong>Multi-variate analysis:</strong> Combines multiple weak signals into confident predictions</li>
                </ul>
              </div>
              
              <div>
                <strong className="text-base">Prediction Horizons:</strong>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-muted-foreground">
                  <li><strong>Immediate (0-6 hours):</strong> Critical alerts requiring immediate action</li>
                  <li><strong>Short-term (6-48 hours):</strong> Preventive maintenance window</li>
                  <li><strong>Medium-term (2-7 days):</strong> Planning and parts procurement</li>
                  <li><strong>Long-term (7-30 days):</strong> Budget planning and lifecycle management</li>
                </ul>
              </div>

              <div>
                <strong className="text-base">Integration with Operations:</strong>
                <p className="text-muted-foreground mt-2">
                  Predictions automatically generate preventive work orders, adjust monitoring thresholds, 
                  and notify relevant teams before failures occur. This reduces downtime and ensures continuous 
                  surveillance coverage across all branches.
                </p>
              </div>

              <div className="pt-4 border-t">
                <Badge variant="secondary">Status: Backend Ready, UI Integration In Progress</Badge>
                <p className="text-muted-foreground mt-2">
                  The prediction engine is operational in the analytics backend. This dashboard UI will 
                  visualize predictions, confidence scores, and recommended actions once frontend integration is complete.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
