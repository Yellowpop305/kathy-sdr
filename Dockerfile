FROM node:20-slim

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install

# Build
COPY tsconfig.json ./
COPY src ./src
COPY prompts ./prompts
RUN npm run build

# Runtime
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
