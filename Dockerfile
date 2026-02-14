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

# Chrome is already installed in the kasmvnc base image — tell puppeteer to skip downloading its own
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# Disable npm update check
RUN npm config set update-notifier false > /dev/null

# Install Node.js dependencies only (no browser download)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts && \
    npm cache clean --force && \
    chown -R 911:911 /config/.npm

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build

# Copy s6 service overlay and defaults
COPY root/ /

# Default config goes into /defaults — linuxserver init copies to /config on first run
COPY cdp-agent-mcp.config.json /defaults/cdp-agent-mcp.config.json

EXPOSE 3002 9222
VOLUME /config
