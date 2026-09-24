#!/bin/bash

# COFFE-SAAS Docker Startup Script

set -e

echo "🚀 Starting COFFE-SAAS with Docker..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "📦 Environment Check:"
echo "✅ Docker installed"
echo "✅ Docker Compose installed"
echo ""

# Determine environment
ENV=${1:-prod}

if [ "$ENV" = "dev" ]; then
    echo "🔧 Starting in DEVELOPMENT mode (Hot Reload)"
    echo "📝 Using: docker-compose.dev.yml"
    echo ""
    echo "Services will be available at:"
    echo "  Frontend:  http://localhost:3000"
    echo "  Backend:   http://localhost:8000"
    echo "  API Docs:  http://localhost:8000/api/docs/"
    echo "  Admin:     http://localhost:8000/admin/"
    echo "  pgAdmin:   http://localhost:5050"
    echo ""
    echo "Press Ctrl+C to stop all services"
    echo ""
    docker-compose -f docker-compose.dev.yml up
else
    echo "🚀 Starting in PRODUCTION mode"
    echo "📝 Using: docker-compose.yml"
    echo ""
    echo "⏳ Building images (this may take a few minutes)..."
    echo ""
    docker-compose build
    echo ""
    echo "🔄 Starting services..."
    docker-compose up
fi
