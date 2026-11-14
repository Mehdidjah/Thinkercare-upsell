FROM node:24.22.3-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci
COPY shared shared
COPY frontend frontend
COPY backend backend
RUN npm run build \
 && npm prune --omit=dev \
 && rm -rf shared/src backend/src backend/test frontend/src frontend/test

FROM node:24.22.3-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["node", "backend/dist/main.js"]
