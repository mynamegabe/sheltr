FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

COPY .env.production .env.development

# Host 0.0.0.0 is important for docker
CMD ["npm", "run", "dev", "--", "--host"]
