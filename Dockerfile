FROM ghcr.io/linuxserver/baseimage-kasmvnc:ubuntunoble

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

# Install Node.js 22 (ubuntunoble base image only provides it at runtime via init scripts)
RUN apt-get update && \
    apt-get install -y ca-certificates curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    apt-get install -y --no-install-recommends build-essential pkg-config libpulse-dev && \
    cd /kclient && npm rebuild && \
    apt-get purge -y build-essential pkg-config libpulse-dev && \
    apt-get autoremove -y

# Skip Puppeteer's Chrome for Testing — we install real Google Chrome via APT
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# Disable npm update check
RUN npm config set update-notifier false > /dev/null

# Install Node.js dependencies (Puppeteer downloads Chrome here)
COPY package.json package-lock.json* ./
COPY scripts/ ./scripts/
RUN npm ci && \
    npm cache clean --force && \
    chown -R 911:911 /config/.npm

# Install Google Chrome stable (real Chrome, not Chrome for Testing)
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends google-chrome-stable

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build

# Copy openbox defaults (menu.xml, autostart)
COPY root/ /

# Default config — linuxserver init copies to /config on first run
COPY cdp-agent-mcp.config.json /defaults/cdp-agent-mcp.config.json

# Allow BASE_URL to be set at build time (e.g. --build-arg BASE_URL=https://mcp.example.com)
ARG BASE_URL=""
ENV BASE_URL=${BASE_URL}

EXPOSE 3002 9222
VOLUME /config
