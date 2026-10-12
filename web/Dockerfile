FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG API_URL=http://api:3001
ENV API_URL=$API_URL
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]