# ---- Build the web app ------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY contracts/evm/package.json contracts/evm/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace web --workspace server --include-workspace-root=false
COPY web web
COPY server/src/seed server/src/seed
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -w web

# ---- Runtime: API + static web app in one container --------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY package.json package-lock.json ./
COPY contracts/evm/package.json contracts/evm/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false && npm cache clean --force
COPY server server
COPY --from=build /app/web/dist web/dist
COPY web/src/config web/src/config
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
ENV DATABASE_FILE=/data/tourisme.db UPLOAD_DIR=/data/uploads WEB_DIST=/app/web/dist
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings=ExperimentalWarning", "server/src/index.js"]
