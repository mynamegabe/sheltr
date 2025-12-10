FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Copy .env.development to .env.local (overrides .env.development if present) and replace VITE_API_BASE_URL=... to /api
COPY .env.development .env.local
RUN sed -i 's/VITE_API_BASE_URL=.*$/VITE_API_BASE_URL=\/api/' .env.local

# Host 0.0.0.0 is important for docker
CMD ["npm", "run", "dev", "--", "--host"]
