'use client';

import Link from 'next/link';
import { 
  Shield, FileText, AlertTriangle, AlertCircle, 
  CheckCircle, TrendingUp, Activity, BarChart3 
} from 'lucide-react';

export default function ComplianceOverviewPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-4 rounded-2xl">
              <Shield className="h-16 w-16 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Compliance Management System
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Comprehensive compliance tracking, risk management, and audit readiness
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Frameworks</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">-</p>
              </div>
              <Shield className="h-12 w-12 text-purple-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Requirements</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">-</p>
              </div>
              <FileText className="h-12 w-12 text-blue-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Controls</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">-</p>
              </div>
              <CheckCircle className="h-12 w-12 text-green-500 opacity-50" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Open Findings</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">-</p>
              </div>
              <AlertCircle className="h-12 w-12 text-red-500 opacity-50" />
            </div>
          </div>
        </div>

        {/* Main Navigation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {/* Dashboard */}
          <Link
            href="/compliance/dashboard"
            className="group bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden hover:scale-105"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-purple-500 to-blue-500 p-4 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <BarChart3 className="h-8 w-8 text-white" />
                </div>
                <span className="text-purple-600 text-sm font-semibold">VIEW →</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h3>
              <p className="text-gray-600">
                Overview of compliance metrics, framework coverage, and key performance indicators
              </p>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-blue-500 h-2"></div>
          </Link>

          {/* Requirements */}
          <Link
            href="/compliance/requirements"
            className="group bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden hover:scale-105"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-4 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <FileText className="h-8 w-8 text-white" />
                </div>
                <span className="text-blue-600 text-sm font-semibold">MANAGE →</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Requirements</h3>
              <p className="text-gray-600">
                Track and manage regulatory requirements across multiple compliance frameworks
              </p>
            </div>
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2"></div>
          </Link>

          {/* Controls */}
          <Link
            href="/compliance/controls"
            className="group bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden hover:scale-105"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-green-500 to-teal-500 p-4 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <span className="text-green-600 text-sm font-semibold">MANAGE →</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Controls</h3>
              <p className="text-gray-600">
                Implement and manage security controls with testing and effectiveness tracking
              </p>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-teal-500 h-2"></div>
          </Link>

          {/* Findings */}
          <Link
            href="/compliance/findings"
            className="group bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden hover:scale-105"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-red-500 to-orange-500 p-4 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <AlertTriangle className="h-8 w-8 text-white" />
                </div>
                <span className="text-red-600 text-sm font-semibold">TRACK →</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Findings</h3>
              <p className="text-gray-600">
                Monitor audit findings, gaps, and non-conformities with remediation tracking
              </p>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-orange-500 h-2"></div>
          </Link>

          {/* Evidence */}
          <Link
            href="/compliance/evidence"
            className="group bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden hover:scale-105"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-500 p-4 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <FileText className="h-8 w-8 text-white" />
                </div>
                <span className="text-indigo-600 text-sm font-semibold">REPOSITORY →</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Evidence</h3>
              <p className="text-gray-600">
                Store and manage compliance evidence with verification and validity tracking
              </p>
            </div>
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2"></div>
          </Link>

          {/* Risks */}
          <Link
            href="/compliance/risks"
            className="group bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden hover:scale-105"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-orange-500 to-red-500 p-4 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="h-8 w-8 text-white" />
                </div>
                <span className="text-orange-600 text-sm font-semibold">ASSESS →</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Risks</h3>
              <p className="text-gray-600">
                Identify, assess, and manage compliance risks with mitigation strategies
              </p>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-red-500 h-2"></div>
          </Link>
        </div>

        {/* Features Section */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Comprehensive Compliance Management
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                <Activity className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Real-time Monitoring</h3>
              <p className="text-sm text-gray-600">
                Track compliance status and metrics in real-time
              </p>
            </div>
            <div className="text-center">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Audit Ready</h3>
              <p className="text-sm text-gray-600">
                Complete audit trail and evidence repository
              </p>
            </div>
            <div className="text-center">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                <Shield className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Multi-Framework</h3>
              <p className="text-sm text-gray-600">
                Support for ISO, SOC 2, HIPAA, GDPR, and more
              </p>
            </div>
            <div className="text-center">
              <div className="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="h-8 w-8 text-orange-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Risk Management</h3>
              <p className="text-sm text-gray-600">
                Assess and mitigate compliance risks effectively
              </p>
            </div>
          </div>
        </div>

        {/* Legacy Frameworks Link */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-md p-6 text-center">
          <h3 className="text-xl font-bold text-white mb-2">
            Looking for Compliance Frameworks?
          </h3>
          <p className="text-purple-100 mb-4">
            Manage your compliance frameworks and standards
          </p>
          <Link
            href="/compliance"
            className="inline-flex items-center space-x-2 bg-white text-purple-600 px-6 py-3 rounded-lg font-semibold hover:bg-purple-50 transition-colors"
          >
            <Shield className="h-5 w-5" />
            <span>Go to Frameworks</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
