FROM node:18-alpine

# Install Sharp dependencies
RUN apk add --no-cache \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    png-dev \
    giflib-dev \
    librsvg-dev

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy app source
COPY . .

# Create directories for uploads and downloads
RUN mkdir -p uploads downloads

# Expose port
EXPOSE 3001

# Start the app
CMD ["npm", "start"] 