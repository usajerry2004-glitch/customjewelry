.PHONY: dev dev-db stop clean test seed

# Start everything with Docker
dev-all:
	docker-compose up --build

# Start just the database
dev-db:
	docker-compose up db redis -d

# Start backend for development
dev-api:
	cd backend && npm run start:dev

# Start frontend for development
dev-web:
	cd frontend && npm run dev

# Run both backend and frontend
dev:
	make dev-db
	make dev-api & make dev-web

# Stop all containers
stop:
	docker-compose down

# Run backend tests
test-api:
	cd backend && npm test

# Seed database with demo data
seed:
	cd backend && npm run seed

# Clean up
clean:
	docker-compose down -v
	rm -rf backend/dist backend/node_modules
	rm -rf frontend/.next frontend/node_modules

# Install all dependencies
install:
	cd backend && npm install
	cd frontend && npm install

help:
	@echo "JewelFlow OS Development Commands:"
	@echo "  make dev-db     - Start PostgreSQL + Redis"
	@echo "  make dev-api    - Start NestJS API (dev mode)"
	@echo "  make dev-web    - Start Next.js frontend"
	@echo "  make test-api   - Run backend tests"
	@echo "  make seed       - Seed database with demo data"
	@echo "  make install    - Install all dependencies"
