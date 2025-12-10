FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

COPY .env.production .env

# Install serve globally
RUN npm install -g serve

# Build the application
RUN npm run build

# Serve the 'dist' directory on port 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
