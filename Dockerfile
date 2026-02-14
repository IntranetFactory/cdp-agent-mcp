FROM ghcr.io/linuxserver/baseimage-kasmvnc:debianbookworm

WORKDIR /app

# Configure KasmVNC
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV TITLE=CDP-Agent-MCP
ENV START_DOCKER=false
ENV NO_DECOR=true

# Suppress Chrome/DBus errors
ENV CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox
ENV DISPLAY=:1

ARG DEBIAN_FRONTEND=noninteractive

# Puppeteer config — Chrome is installed via puppeteer below
ENV PUPPETEER_BROWSERS_PATH=/app/puppeteer-browsers
ENV PUPPETEER_SKIP_DOWNLOAD=false

# Disable npm update check
RUN npm config set update-notifier false > /dev/null

# Install Chrome via puppeteer (includes all dependencies)
COPY package.json package-lock.json* ./
RUN npx puppeteer browsers install chrome --install-deps && \
    npm ci --ignore-scripts && \
    npm cache clean --force && \
    chown -R 911:911 /config/.npm

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build

# Copy s6 service overlay
COPY root/ /

# Default config goes into /defaults — linuxserver init copies to /config on first run
COPY cdp-agent-mcp.config.json /defaults/cdp-agent-mcp.config.json

EXPOSE 3002 9222
VOLUME /config
