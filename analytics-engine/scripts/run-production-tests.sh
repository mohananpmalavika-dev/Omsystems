#!/bin/bash

# Production Test Suite Runner
# Runs all production-ready tests with proper database setup

set -e

echo "============================================"
echo "  Production Test Suite Runner"
echo "============================================"
echo ""

# Check if PostgreSQL is running
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL not found. Please install PostgreSQL."
    exit 1
fi

# Check for test database
echo "📊 Checking test database..."
if ! psql -lqt | cut -d \| -f 1 | grep -qw sentinel_test; then
    echo "⚠️  Test database 'sentinel_test' not found."
    echo "Creating test database..."
    createdb sentinel_test || {
        echo "❌ Failed to create database. Please create manually:"
        echo "   createdb sentinel_test"
        exit 1
    }
fi

# Install pgvector extension
echo "📦 Installing pgvector extension..."
psql sentinel_test -c "CREATE EXTENSION IF NOT EXISTS vector;" > /dev/null 2>&1 || {
    echo "⚠️  pgvector extension not available."
    echo "Some tests may fail without pgvector."
    echo "Install from: https://github.com/pgvector/pgvector"
}

# Set environment variables
export TEST_DATABASE_URL="postgresql://localhost/sentinel_test"
export NODE_ENV="test"

echo "✅ Test environment ready"
echo ""

# Run test suites
echo "============================================"
echo "  Running Test Suites"
echo "============================================"
echo ""

TEST_FAILED=0

# 1. Face Recognition E2E Tests
echo "🧪 [1/5] Face Recognition End-to-End Tests..."
npm run test:face || TEST_FAILED=1
echo ""

# 2. BFSI Compliance Tests
echo "🧪 [2/5] BFSI Compliance Validation Tests..."
npm run test:bfsi || TEST_FAILED=1
echo ""

# 3. Industrial Analytics Tests
echo "🧪 [3/5] Industrial Analytics Integration Tests..."
npm run test:industrial || TEST_FAILED=1
echo ""

# 4. Performance Benchmarks
echo "🧪 [4/5] Performance Benchmark Tests..."
npm run test:performance || TEST_FAILED=1
echo ""

# 5. Failure Scenarios
echo "🧪 [5/5] Failure Scenario Tests..."
npm run test:failures || TEST_FAILED=1
echo ""

# Summary
echo "============================================"
echo "  Test Results Summary"
echo "============================================"
echo ""

if [ $TEST_FAILED -eq 0 ]; then
    echo "✅ All production tests PASSED!"
    echo ""
    echo "Test Coverage:"
    echo "  - Face Recognition E2E: ✅"
    echo "  - BFSI Compliance: ✅"
    echo "  - Industrial Analytics: ✅"
    echo "  - Performance Benchmarks: ✅"
    echo "  - Failure Scenarios: ✅"
    echo ""
    echo "🎉 System is PRODUCTION READY!"
    exit 0
else
    echo "❌ Some tests FAILED"
    echo ""
    echo "Please review the test output above for details."
    echo "Common issues:"
    echo "  - Database connection failed"
    echo "  - pgvector extension missing"
    echo "  - Performance requirements not met"
    exit 1
fi
