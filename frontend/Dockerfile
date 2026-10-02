# Build stage
FROM node:16-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm 8 for better compatibility
RUN npm install -g npm@8

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy app source
COPY . .

# Variables del build (CRA las incrusta en el JS; vienen de docker-compose.yml -> build.args).
# REACT_APP_API_URL vacío = el API está en el mismo dominio bajo /api/v1 (sin localhost).
ARG REACT_APP_API_URL=
ARG REACT_APP_PUBLIC_URL=
ENV REACT_APP_API_URL=$REACT_APP_API_URL \
    REACT_APP_PUBLIC_URL=$REACT_APP_PUBLIC_URL
# Sin source maps (.map): no se publica el código fuente original con sus comentarios
ENV GENERATE_SOURCEMAP=false

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built app from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
