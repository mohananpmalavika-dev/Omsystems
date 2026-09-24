/**
 * MindSense Dashboard - Emotional Intelligence Monitoring
 * 
 * Real-time monitoring interface for:
 * - Emotional states across cameras
 * - Threat assessments and behavioral intent
 * - De-escalation coaching
 * - Stress hotspots and analytics
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Alert,
  AlertDescription,
  Progress,
} from '@/components/ui';
import {
  Brain,
  AlertTriangle,
  Shield,
  Users,
  TrendingUp,
  MessageSquare,
  Activity,
  Eye,
  Target,
  MapPin,
  Clock,
  Zap,
} from 'lucide-react';

interface EmotionalState {
  id: string;
  cameraId: string;
  cameraName: string;
  personTrackId: string;
  emotion: string;
  confidence: number;
  valence: number;
  arousal: number;
  stressScore: number;
  deceptionScore: number;
  timestamp: string;
}

interface ThreatAssessment {
  id: string;
  cameraId: string;
  cameraName: string;
  personTrackId: string;
  intent: string;
  threatLevel: string;
  threatScore: number;
  recommendedAction: string;
  monitoringPriority: string;
  alertSecurity: boolean;
  timestamp: string;
}

interface StressHotspot {
  cameraId: string;
  cameraName: string;
  zoneName: string;
  highStressCount: number;
  avgStressScore: number;
  peakStressScore: number;
  uniquePersons: number;
  emotionsObserved: string[];
  severity: string;
}

export const MindSenseDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [emotionalStates, setEmotionalStates] = useState<EmotionalState[]>([]);
  const [threats, setThreats] = useState<ThreatAssessment[]>([]);
  const [hotspots, setHotspots] = useState<StressHotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch data
  useEffect(() => {
    fetchDashboardData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchDashboardData, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchDashboardData = async () => {
    try {
      // Fetch emotional states
      const emotionResponse = await fetch('/api/v1/mindsense/emotional-states');
      const emotionData = await emotionResponse.json();
      if (emotionData.success) {
        setEmotionalStates(emotionData.data.emotionalStates);
      }

      // Fetch threat assessments
      const threatResponse = await fetch('/api/v1/mindsense/threat-assessment?minThreatScore=0.6');
      const threatData = await threatResponse.json();
      if (threatData.success) {
        setThreats(threatData.data.threats);
      }

      // Fetch stress hotspots
      const hotspotResponse = await fetch('/api/v1/mindsense/analytics/stress-hotspots?minStressThreshold=0.6&limit=10');
      const hotspotData = await hotspotResponse.json();
      if (hotspotData.success) {
        setHotspots(hotspotData.data.hotspots);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch MindSense data:', error);
      setLoading(false);
    }
  };

  // Calculate summary statistics
  const stats = {
    totalPersons: emotionalStates.length,
    highStress: emotionalStates.filter(e => e.stressScore > 0.7).length,
    activeThreats: threats.filter(t => ['high', 'critical'].includes(t.threatLevel)).length,
    deceptionAlerts: emotionalStates.filter(e => e.deceptionScore > 0.7).length,
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Brain className="w-8 h-8 text-purple-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">MindSense</h1>
            <p className="text-sm text-gray-600">Emotional Intelligence & Threat Psychology</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
            size="sm"
          >
            <Activity className="w-4 h-4 mr-2" />
            {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
          </Button>
          <Button onClick={fetchDashboardData} size="sm" variant="outline">
            Refresh Now
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Monitored Persons"
          value={stats.totalPersons}
          icon={<Users className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="High Stress"
          value={stats.highStress}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="orange"
          alert={stats.highStress > 0}
        />
        <StatCard
          title="Active Threats"
          value={stats.activeThreats}
          icon={<Shield className="w-5 h-5" />}
          color="red"
          alert={stats.activeThreats > 0}
        />
        <StatCard
          title="Deception Alerts"
          value={stats.deceptionAlerts}
          icon={<Eye className="w-5 h-5" />}
          color="purple"
          alert={stats.deceptionAlerts > 0}
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="emotions">Emotions</TabsTrigger>
          <TabsTrigger value="threats">Threats</TabsTrigger>
          <TabsTrigger value="coaching">Coaching</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Critical Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
                  Critical Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {threats.filter(t => t.threatLevel === 'critical').length > 0 ? (
                  <div className="space-y-2">
                    {threats
                      .filter(t => t.threatLevel === 'critical')
                      .slice(0, 5)
                      .map(threat => (
                        <CriticalAlertItem key={threat.id} threat={threat} />
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No critical alerts</p>
                )}
              </CardContent>
            </Card>

            {/* High Stress Persons */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-orange-600" />
                  High Stress Detected
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.highStress > 0 ? (
                  <div className="space-y-2">
                    {emotionalStates
                      .filter(e => e.stressScore > 0.7)
                      .slice(0, 5)
                      .map(state => (
                        <HighStressItem key={state.id} state={state} />
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No high stress detected</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stress Hotspots Map */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-red-600" />
                Stress Hotspots
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hotspots.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {hotspots.slice(0, 6).map((hotspot, index) => (
                    <HotspotCard key={index} hotspot={hotspot} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No stress hotspots identified</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Emotions Tab */}
        <TabsContent value="emotions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Real-Time Emotional States</CardTitle>
            </CardHeader>
            <CardContent>
              <EmotionalStatesTable states={emotionalStates} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Threats Tab */}
        <TabsContent value="threats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Threat Assessments</CardTitle>
            </CardHeader>
            <CardContent>
              <ThreatAssessmentsTable threats={threats} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Coaching Tab */}
        <TabsContent value="coaching" className="space-y-4">
          <DeEscalationCoaching threats={threats} />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <AnalyticsDashboard
            emotionalStates={emotionalStates}
            threats={threats}
            hotspots={hotspots}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Stat Card Component
const StatCard: React.FC<{
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  alert?: boolean;
}> = ({ title, value, icon, color, alert }) => {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <Card className={alert ? 'border-red-500 border-2' : ''}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Critical Alert Item
const CriticalAlertItem: React.FC<{ threat: ThreatAssessment }> = ({ threat }) => (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{threat.cameraName}</p>
          <p className="text-sm">
            {threat.intent.toUpperCase()} - Threat Score: {(threat.threatScore * 100).toFixed(0)}%
          </p>
          <p className="text-xs mt-1">{threat.recommendedAction}</p>
        </div>
        <Button size="sm" variant="outline">
          View Details
        </Button>
      </div>
    </AlertDescription>
  </Alert>
);

// High Stress Item
const HighStressItem: React.FC<{ state: EmotionalState }> = ({ state }) => (
  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
    <div className="flex items-center space-x-3">
      <Activity className="w-5 h-5 text-orange-600" />
      <div>
        <p className="font-semibold text-sm">{state.cameraName}</p>
        <p className="text-xs text-gray-600">
          {state.emotion.toUpperCase()} - Stress: {(state.stressScore * 100).toFixed(0)}%
        </p>
      </div>
    </div>
    <Badge variant="warning">High Stress</Badge>
  </div>
);

// Hotspot Card
const HotspotCard: React.FC<{ hotspot: StressHotspot }> = ({ hotspot }) => {
  const severityColors = {
    critical: 'bg-red-100 text-red-800 border-red-300',
    high: 'bg-orange-100 text-orange-800 border-orange-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  };

  return (
    <div
      className={`p-4 rounded-lg border-2 ${severityColors[hotspot.severity as keyof typeof severityColors]}`}
    >
      <div className="flex items-center justify-between mb-2">
        <MapPin className="w-5 h-5" />
        <Badge>{hotspot.severity.toUpperCase()}</Badge>
      </div>
      <p className="font-semibold">{hotspot.cameraName}</p>
      {hotspot.zoneName && <p className="text-sm">{hotspot.zoneName}</p>}
      <div className="mt-2 space-y-1 text-xs">
        <p>Incidents: {hotspot.highStressCount}</p>
        <p>Avg Stress: {(hotspot.avgStressScore * 100).toFixed(0)}%</p>
        <p>Persons Affected: {hotspot.uniquePersons}</p>
      </div>
    </div>
  );
};

// Emotional States Table
const EmotionalStatesTable: React.FC<{ states: EmotionalState[] }> = ({ states }) => {
  const getEmotionColor = (emotion: string) => {
    const colors: Record<string, string> = {
      happiness: 'bg-green-100 text-green-800',
      sadness: 'bg-blue-100 text-blue-800',
      anger: 'bg-red-100 text-red-800',
      fear: 'bg-purple-100 text-purple-800',
      surprise: 'bg-yellow-100 text-yellow-800',
      disgust: 'bg-orange-100 text-orange-800',
      neutral: 'bg-gray-100 text-gray-800',
    };
    return colors[emotion] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 text-left">Camera</th>
            <th className="p-3 text-left">Emotion</th>
            <th className="p-3 text-left">Confidence</th>
            <th className="p-3 text-left">Stress</th>
            <th className="p-3 text-left">Deception</th>
            <th className="p-3 text-left">Valence</th>
            <th className="p-3 text-left">Arousal</th>
            <th className="p-3 text-left">Time</th>
          </tr>
        </thead>
        <tbody>
          {states.slice(0, 20).map(state => (
            <tr key={state.id} className="border-b hover:bg-gray-50">
              <td className="p-3">{state.cameraName}</td>
              <td className="p-3">
                <Badge className={getEmotionColor(state.emotion)}>
                  {state.emotion}
                </Badge>
              </td>
              <td className="p-3">{(state.confidence * 100).toFixed(0)}%</td>
              <td className="p-3">
                <Progress value={state.stressScore * 100} className="w-20" />
              </td>
              <td className="p-3">
                {state.deceptionScore > 0.7 ? (
                  <Badge variant="destructive">High</Badge>
                ) : (
                  <span>{(state.deceptionScore * 100).toFixed(0)}%</span>
                )}
              </td>
              <td className="p-3">
                {state.valence > 0 ? (
                  <span className="text-green-600">+{state.valence.toFixed(2)}</span>
                ) : (
                  <span className="text-red-600">{state.valence.toFixed(2)}</span>
                )}
              </td>
              <td className="p-3">{state.arousal.toFixed(2)}</td>
              <td className="p-3 text-xs text-gray-500">
                {new Date(state.timestamp).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Threat Assessments Table
const ThreatAssessmentsTable: React.FC<{ threats: ThreatAssessment[] }> = ({ threats }) => {
  const getThreatLevelColor = (level: string) => {
    const colors: Record<string, string> = {
      none: 'bg-gray-100 text-gray-800',
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800',
    };
    return colors[level] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 text-left">Camera</th>
            <th className="p-3 text-left">Intent</th>
            <th className="p-3 text-left">Threat Level</th>
            <th className="p-3 text-left">Score</th>
            <th className="p-3 text-left">Priority</th>
            <th className="p-3 text-left">Recommended Action</th>
            <th className="p-3 text-left">Alert</th>
          </tr>
        </thead>
        <tbody>
          {threats.slice(0, 20).map(threat => (
            <tr key={threat.id} className="border-b hover:bg-gray-50">
              <td className="p-3">{threat.cameraName}</td>
              <td className="p-3">
                <Badge variant="outline">{threat.intent}</Badge>
              </td>
              <td className="p-3">
                <Badge className={getThreatLevelColor(threat.threatLevel)}>
                  {threat.threatLevel}
                </Badge>
              </td>
              <td className="p-3">
                <Progress value={threat.threatScore * 100} className="w-20" />
              </td>
              <td className="p-3">
                <Badge>{threat.monitoringPriority}</Badge>
              </td>
              <td className="p-3 text-xs">{threat.recommendedAction}</td>
              <td className="p-3">
                {threat.alertSecurity && (
                  <Badge variant="destructive">Alert Security</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// De-Escalation Coaching Component
const DeEscalationCoaching: React.FC<{ threats: ThreatAssessment[] }> = ({ threats }) => {
  const [selectedThreat, setSelectedThreat] = useState<ThreatAssessment | null>(null);
  const [coaching, setCoaching] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const getCoaching = async (threat: ThreatAssessment) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/mindsense/coaching/recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cameraId: threat.cameraId,
          personTrackId: threat.personTrackId,
          situationType: 'aggressive-customer', // Would be dynamic
        }),
      });
      const data = await response.json();
      if (data.success) {
        setCoaching(data.data);
      }
    } catch (error) {
      console.error('Failed to get coaching:', error);
    }
    setLoading(false);
  };

  const priorityThreats = threats
    .filter(t => ['high', 'critical', 'urgent'].includes(t.monitoringPriority))
    .slice(0, 10);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Threat Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Situation for Coaching</CardTitle>
        </CardHeader>
        <CardContent>
          {priorityThreats.length > 0 ? (
            <div className="space-y-2">
              {priorityThreats.map(threat => (
                <button
                  key={threat.id}
                  onClick={() => {
                    setSelectedThreat(threat);
                    getCoaching(threat);
                  }}
                  className={`w-full p-3 text-left rounded-lg border-2 transition ${
                    selectedThreat?.id === threat.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{threat.cameraName}</p>
                      <p className="text-sm text-gray-600">{threat.intent}</p>
                    </div>
                    <Badge className="ml-2">{threat.threatLevel}</Badge>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No situations requiring coaching</p>
          )}
        </CardContent>
      </Card>

      {/* Coaching Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MessageSquare className="w-5 h-5 mr-2" />
            De-Escalation Guidance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500">Loading coaching guidance...</p>
          ) : coaching ? (
            <CoachingRecommendation coaching={coaching} />
          ) : (
            <p className="text-sm text-gray-500">
              Select a situation to view de-escalation guidance
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Coaching Recommendation Display
const CoachingRecommendation: React.FC<{ coaching: any }> = ({ coaching }) => (
  <div className="space-y-4">
    {/* Priority and Phase */}
    <div className="flex items-center justify-between">
      <Badge variant="outline">{coaching.phase}</Badge>
      <Badge className={coaching.priority === 'critical' ? 'bg-red-600' : 'bg-orange-600'}>
        {coaching.priority.toUpperCase()}
      </Badge>
    </div>

    {/* Situation Assessment */}
    <div>
      <h4 className="font-semibold mb-2">Situation Assessment</h4>
      <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
        <p>Emotional State: <span className="font-medium">{coaching.situationAssessment.emotionalState}</span></p>
        <p>Stress Level: <span className="font-medium">{(coaching.situationAssessment.stressLevel * 100).toFixed(0)}%</span></p>
        <p>Intent: <span className="font-medium">{coaching.situationAssessment.intent}</span></p>
        <p>Threat Level: <span className="font-medium">{coaching.situationAssessment.threatLevel}</span></p>
      </div>
    </div>

    {/* Immediate Actions */}
    <div>
      <h4 className="font-semibold mb-2 text-green-700">✓ DO</h4>
      <ul className="list-disc list-inside text-sm space-y-1">
        {coaching.immediateDos.map((action: string, i: number) => (
          <li key={i}>{action}</li>
        ))}
      </ul>
    </div>

    <div>
      <h4 className="font-semibold mb-2 text-red-700">✗ DON'T</h4>
      <ul className="list-disc list-inside text-sm space-y-1">
        {coaching.immediateDonts.map((action: string, i: number) => (
          <li key={i}>{action}</li>
        ))}
      </ul>
    </div>

    {/* Suggested Phrases */}
    <div>
      <h4 className="font-semibold mb-2">Suggested Phrases</h4>
      <div className="space-y-2">
        {coaching.suggestedPhrases.slice(0, 3).map((phrase: string, i: number) => (
          <div key={i} className="bg-blue-50 p-2 rounded text-sm italic">
            "{phrase}"
          </div>
        ))}
      </div>
    </div>

    {/* Communication Strategy */}
    <div>
      <h4 className="font-semibold mb-2">Communication Strategy</h4>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-gray-50 p-2 rounded">
          <p className="font-medium">Tone:</p>
          <p>{coaching.communicationStrategy.tone}</p>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <p className="font-medium">Volume:</p>
          <p>{coaching.communicationStrategy.volume}</p>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <p className="font-medium">Pace:</p>
          <p>{coaching.communicationStrategy.pace}</p>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <p className="font-medium">Eye Contact:</p>
          <p>{coaching.communicationStrategy.eyeContact}</p>
        </div>
      </div>
    </div>

    {/* Safety Precautions */}
    {coaching.backupRequired && (
      <Alert variant="destructive">
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <p className="font-semibold">Backup Required</p>
          <p className="text-sm">Do not engage alone. Wait for backup.</p>
        </AlertDescription>
      </Alert>
    )}
  </div>
);

// Analytics Dashboard
const AnalyticsDashboard: React.FC<{
  emotionalStates: EmotionalState[];
  threats: ThreatAssessment[];
  hotspots: StressHotspot[];
}> = ({ emotionalStates, threats, hotspots }) => {
  // Calculate emotion distribution
  const emotionCounts = emotionalStates.reduce((acc, state) => {
    acc[state.emotion] = (acc[state.emotion] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate intent distribution
  const intentCounts = threats.reduce((acc, threat) => {
    acc[threat.intent] = (acc[threat.intent] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Emotion Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(emotionCounts).map(([emotion, count]) => (
              <div key={emotion} className="flex items-center justify-between">
                <span className="capitalize">{emotion}</span>
                <div className="flex items-center space-x-2">
                  <Progress
                    value={(count / emotionalStates.length) * 100}
                    className="w-32"
                  />
                  <span className="text-sm font-medium w-12 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Behavioral Intent Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(intentCounts).map(([intent, count]) => (
              <div key={intent} className="flex items-center justify-between">
                <span className="capitalize">{intent}</span>
                <div className="flex items-center space-x-2">
                  <Progress
                    value={(count / threats.length) * 100}
                    className="w-32"
                  />
                  <span className="text-sm font-medium w-12 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Stress Hotspot Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {hotspots.map((hotspot, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="font-semibold">{hotspot.cameraName}</p>
                  <p className="text-sm text-gray-600">
                    {hotspot.uniquePersons} persons affected · {hotspot.highStressCount} incidents
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="text-sm font-medium">Avg Stress</p>
                    <p className="text-lg font-bold">
                      {(hotspot.avgStressScore * 100).toFixed(0)}%
                    </p>
                  </div>
                  <Badge className={
                    hotspot.severity === 'critical' ? 'bg-red-600' :
                    hotspot.severity === 'high' ? 'bg-orange-600' : 'bg-yellow-600'
                  }>
                    {hotspot.severity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MindSenseDashboard;
