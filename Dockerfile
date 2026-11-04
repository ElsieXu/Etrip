# Etrip 後端：Google Cloud Run 用
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
# Cloud Run 會提供 PORT 環境變數
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 server:app
