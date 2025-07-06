FROM node:18-alpine

# Install Sharp dependencies including PDF support and Puppeteer dependencies
RUN apk add --no-cache \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    libpng-dev \
    giflib-dev \
    librsvg-dev \
    poppler-dev \
    vips-dev \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy app source
COPY . .

# Create directories for uploads and downloads
RUN mkdir -p uploads downloads

# Expose port
EXPOSE 3001

# Start the app
CMD ["npm", "start"] 