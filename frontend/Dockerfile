FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Create .env.local to enforce production/docker API URL (overrides .env.development if present)
RUN echo "VITE_API_BASE_URL=/api" > .env.local

# Host 0.0.0.0 is important for docker
CMD ["npm", "run", "dev", "--", "--host"]
