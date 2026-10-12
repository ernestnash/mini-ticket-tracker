FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3001
# Node 24 runs the .ts files directly, so there is no build step. Migrate is idempotent.
CMD ["sh", "-c", "npm run db:migrate && npm start"]