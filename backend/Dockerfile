FROM python:3.9-slim

WORKDIR /app

# Install system dependencies if needed (e.g. for shapely or mysql)
# shapely might need geos? python-3.9-slim usually needs some libs.
# default-libmysqlclient-dev might be needed for mysqlclient? 
# I'm using pymysql which is pure python, so it should be fine.
# Shapely might need libgeos-dev.
RUN apt-get update && apt-get install -y \
    build-essential \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose port
EXPOSE 8000

# Command to run
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
