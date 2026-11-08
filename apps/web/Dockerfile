FROM oven/bun:1 AS build
WORKDIR /app
COPY apps/web/package.json apps/web/bun.lock ./
RUN bun install --frozen-lockfile
COPY apps/web ./
# VITE_USE_MOCK=0: the expo image must never fall back to in-browser mock data.
# Real environment wins over .env.development (which sets VITE_USE_MOCK=1).
ARG VITE_USE_MOCK=0
ENV VITE_USE_MOCK=${VITE_USE_MOCK}
# VITE_EXPO is kept as a build switch; every view now ships in the expo image.
ARG VITE_EXPO=0
ENV VITE_EXPO=${VITE_EXPO}
RUN bun run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
