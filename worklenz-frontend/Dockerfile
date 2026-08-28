FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# Create env-config.js dynamically during build
RUN echo "window.VITE_API_URL='${VITE_API_URL:-http://backend:3000}';" > ./public/env-config.js && \
    echo "window.VITE_SOCKET_URL='${VITE_SOCKET_URL:-ws://backend:3000}';" >> ./public/env-config.js

RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

FROM node:22-alpine AS production

WORKDIR /app

RUN npm install -g serve@14.2.5

COPY --from=build --chown=node:node /app/build /app/build
COPY --from=build --chown=node:node /app/public/env-config.js /app/build/env-config.js

# Create env-config.sh script
RUN echo '#!/bin/sh' > /app/env-config.sh && \
    echo '# Update env-config.js with runtime environment variables' >> /app/env-config.sh && \
    echo 'cat > /app/build/env-config.js << EOL' >> /app/env-config.sh && \
    echo 'window.VITE_API_URL="${VITE_API_URL:-http://backend:3000}";' >> /app/env-config.sh && \
    echo 'window.VITE_SOCKET_URL="${VITE_SOCKET_URL:-ws://backend:3000}";' >> /app/env-config.sh && \
    echo 'window.VITE_CLIENT_PORTAL_URL="${VITE_CLIENT_PORTAL_URL:-${VITE_API_URL:-http://backend:3000}}";' >> /app/env-config.sh && \
    echo 'EOL' >> /app/env-config.sh && \
    chmod +x /app/env-config.sh

# Create start.sh script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo '# Run environment configuration' >> /app/start.sh && \
    echo '/app/env-config.sh' >> /app/start.sh && \
    echo '# Start the server' >> /app/start.sh && \
    echo 'exec serve -s build -l 5000' >> /app/start.sh && \
    chmod +x /app/start.sh

RUN chown -R node:node /app
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5000/ >/dev/null || exit 1
CMD ["/app/start.sh"]
