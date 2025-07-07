FROM node:18-slim

# Install dependencies for pdf-poppler, sharp, puppeteer
RUN apt-get update && apt-get install -y \
    poppler-utils \
    libcairo2-dev \
    libjpeg-dev \
    libpng-dev \
    libgif-dev \
    librsvg2-dev \
    libvips-dev \
    chromium \
    fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer env
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --timeout=300000 --retry=3

COPY . .

RUN mkdir -p uploads downloads

EXPOSE 3001

CMD ["npm", "start"] 