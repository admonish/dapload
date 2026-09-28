# Build stage: some dependencies (cffi, via smbprotocol) have no prebuilt
# wheels for armv7, so compile wheels here where gcc is available.
FROM python:3.12-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libffi-dev \
 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.12-slim
LABEL org.opencontainers.image.source="https://github.com/admonish/dapload" \
      org.opencontainers.image.description="Dapload: a better web UI for WiFi Transfer on the Shanling M1 Plus" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY --from=build /wheels /wheels
RUN pip install --no-cache-dir --no-index /wheels/* && rm -rf /wheels
COPY proxy.py .
COPY public ./public
ENV PORT=8899 \
    CONFIG_DIR=/data \
    PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8899
CMD ["python3", "proxy.py"]
