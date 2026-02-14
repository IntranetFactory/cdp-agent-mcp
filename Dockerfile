FROM node:22-slim

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Chrome path for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build

# Create screenshots directory
RUN mkdir -p /tmp/cdp-agent-mcp-screenshots

EXPOSE 3002

ENV PORT=3002

# Run the MCP server in HTTP mode with headless Chrome
CMD ["node", "build/src/index.js", "--transport=http", "--headless", "--executable-path=/usr/bin/chromium", "--chrome-arg=--no-sandbox", "--chrome-arg=--disable-setuid-sandbox"]
