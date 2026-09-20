"use client";

import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, Users, Clock, TrendingUp, MapPin, Package, DoorOpen, BarChart3 } from "lucide-react";

export default function RetailAnalyticsPage() {
  return (
    <>
      <PageHero
        title="Retail Analytics"
        description="Customer behavior insights, queue management, and conversion analytics powered by AI"
        icon={ShoppingBag}
      />
      
      <div className="container mx-auto p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <CardTitle>Customer & Footfall Counting</CardTitle>
              </div>
              <CardDescription>
                Accurate visitor counting with entry/exit tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Available</Badge>
              <p className="text-sm text-muted-foreground">
                AI-powered people counting at entrances with duplicate filtering and directional analysis to track unique visitors.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-500" />
                <CardTitle>Queue Analytics & Wait Times</CardTitle>
              </div>
              <CardDescription>
                Real-time queue length and customer wait time monitoring
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Available</Badge>
              <p className="text-sm text-muted-foreground">
                Monitor queue lengths at checkout counters and service desks with average wait time calculations and alerts.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-red-500" />
                <CardTitle>Heat Maps & Dwell Time</CardTitle>
              </div>
              <CardDescription>
                Visualize customer movement and engagement zones
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Available</Badge>
              <p className="text-sm text-muted-foreground">
                Generate heat maps showing high-traffic areas and measure dwell time at product displays and promotional zones.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <CardTitle>Customer Flow Analysis</CardTitle>
              </div>
              <CardDescription>
                Track movement patterns through store sections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Available</Badge>
              <p className="text-sm text-muted-foreground">
                Analyze customer journey paths through different store zones to optimize layout and product placement.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-500" />
                <CardTitle>Shelf Monitoring & Stock Events</CardTitle>
              </div>
              <CardDescription>
                Detect empty shelves and stock-out situations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">In Development</Badge>
              <p className="text-sm text-muted-foreground">
                AI vision to detect empty shelves, misplaced products, and pricing tag issues in real-time.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <DoorOpen className="h-5 w-5 text-cyan-500" />
                <CardTitle>Checkout & Conversion Analytics</CardTitle>
              </div>
              <CardDescription>
                Measure conversion rates and checkout efficiency
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">In Development</Badge>
              <p className="text-sm text-muted-foreground">
                Calculate conversion rates by comparing store visitors to checkout transactions and identify drop-off points.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                <CardTitle>Peak Hours & Staff Optimization</CardTitle>
              </div>
              <CardDescription>
                Identify busy periods for better staff scheduling
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Available</Badge>
              <p className="text-sm text-muted-foreground">
                Historical analysis of foot traffic patterns to optimize staffing levels during peak and off-peak hours.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-amber-500" />
                <CardTitle>Demographic Insights</CardTitle>
              </div>
              <CardDescription>
                Age and gender distribution analytics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Privacy Controlled</Badge>
              <p className="text-sm text-muted-foreground">
                Anonymized demographic analytics for customer segmentation (requires explicit consent and privacy controls).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                <CardTitle>Comparative Store Performance</CardTitle>
              </div>
              <CardDescription>
                Multi-location retail insights and benchmarking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-2">Available</Badge>
              <p className="text-sm text-muted-foreground">
                Compare footfall, conversion rates, and customer behavior across multiple store locations.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Retail Use Cases</CardTitle>
            <CardDescription>
              How Om Systems retail analytics transforms customer intelligence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <strong className="text-base">Multi-Format Retail:</strong>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-muted-foreground">
                  <li><strong>Shopping malls:</strong> Track footfall distribution across tenants and common areas</li>
                  <li><strong>Supermarkets:</strong> Analyze aisle traffic and checkout efficiency</li>
                  <li><strong>Fashion stores:</strong> Measure engagement with window displays and fitting room wait times</li>
                  <li><strong>Electronics:</strong> Track demo station dwell time and high-interest product zones</li>
                </ul>
              </div>
              
              <div>
                <strong className="text-base">Key Benefits:</strong>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-muted-foreground">
                  <li><strong>Staff optimization:</strong> Deploy staff where customers need them most during peak hours</li>
                  <li><strong>Layout optimization:</strong> Data-driven floor plan adjustments based on actual traffic patterns</li>
                  <li><strong>Marketing ROI:</strong> Measure impact of promotions on foot traffic and dwell time</li>
                  <li><strong>Conversion improvement:</strong> Identify and address drop-off points in the customer journey</li>
                  <li><strong>Queue management:</strong> Real-time alerts when checkout queues exceed target wait times</li>
                </ul>
              </div>
              
              <div>
                <strong className="text-base">Privacy & Compliance:</strong>
                <p className="text-muted-foreground mt-2">
                  All retail analytics are processed in compliance with privacy regulations. Customer counting and heat maps 
                  use anonymized data. Demographic features require explicit consent signage and privacy impact assessments. 
                  No personal data is stored or linked to individuals.
                </p>
              </div>

              <div>
                <strong className="text-base">Integration Points:</strong>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-muted-foreground">
                  <li>Point-of-sale systems for conversion rate calculation</li>
                  <li>Staff scheduling systems for optimal resource allocation</li>
                  <li>Marketing platforms for campaign effectiveness measurement</li>
                  <li>Business intelligence dashboards for executive reporting</li>
                </ul>
              </div>

              <div className="pt-4 border-t">
                <Badge variant="secondary">Status: Core Features Active, Advanced Features In Development</Badge>
                <p className="text-muted-foreground mt-2">
                  Footfall counting, queue analytics, heat maps, and flow analysis are production-ready. 
                  Shelf monitoring and detailed conversion analytics are currently under development. 
                  Contact your account manager to enable retail features for your deployment.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
