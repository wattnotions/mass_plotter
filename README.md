# Weight Plotter

A browser-based weight tracker. Upload a CSV to view daily measurements, Monday-based weekly averages, and an interactive trend between any two weekly averages.

The app opens with a built-in sample covering the weeks of 28 July through 29 December 2025. An optional three-step introduction is available from the `?` button beside the title. The generated source file is available at [`static/sample_weights.csv`](static/sample_weights.csv).

The app is deliberately weight-only. The previous desktop weight and calorie scripts are retained in [`archive/`](archive/) for reference, but they are not loaded by the web app.

## Features

- Compact file-picker CSV upload
- Cronometer headers (`DateTime`, `Daily Average`) and simple headers (`Date`, `Weight`)
- Daily measurements colored by week
- Weekly averages connected by a line, with Monday week boundaries
- Two-click trend line with start, end, total change, weekly change, and duration
- In-chart trend results that move to the least-busy visible corner
- Prominent second-point guidance after selecting a trend start
- Close button, right-click, or Escape to reset a selected trend
- Plot zoom, pan, hover details, autoscale, and PNG download
- Responsive desktop and mobile layout
- Invalid-row reporting and a 5 MB upload limit
- Stateless processing: uploads are held in memory for the request and are not written to disk

## CSV format

The simplest accepted format is:

```csv
Date,Weight
2026-09-21,70.2
2026-09-22,69.9
```

Cronometer-style files using `DateTime` and `Daily Average` are also accepted. Dates can be ISO (`YYYY-MM-DD` or an ISO timestamp), `DD/MM/YYYY`, or `DD-MM-YYYY`. Weight values are kilograms and can optionally end in `kg`.

The old desktop plot always discarded the first data row. The web app instead keeps every valid row by default.

## Run locally on Linux Mint

Python 3.10 or newer is recommended.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open <http://localhost:8000>. For a production-style local run:

```bash
gunicorn --bind 127.0.0.1:8000 --workers 2 --threads 4 app:app
```

## Deploy on an AWS Lightsail Linux instance

These steps assume Ubuntu/Debian on Lightsail and a checkout at `/opt/mass_plotter`. Replace `YOUR_DOMAIN` and the repository URL.

```bash
sudo apt update
sudo apt install -y python3-venv nginx git
sudo git clone YOUR_REPOSITORY_URL /opt/mass_plotter
sudo chown -R "$USER":"$USER" /opt/mass_plotter
cd /opt/mass_plotter
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Create `/etc/systemd/system/mass-plotter.service`:

```ini
[Unit]
Description=Mass Plotter web app
After=network.target

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/opt/mass_plotter
Environment="PATH=/opt/mass_plotter/.venv/bin"
ExecStart=/opt/mass_plotter/.venv/bin/gunicorn --bind 127.0.0.1:8000 --workers 2 --threads 4 app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

Create `/etc/nginx/sites-available/mass-plotter`:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN;

    client_max_body_size 5M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable both services:

```bash
sudo ln -s /etc/nginx/sites-available/mass-plotter /etc/nginx/sites-enabled/mass-plotter
sudo nginx -t
sudo systemctl enable --now mass-plotter nginx
```

In the Lightsail console, allow HTTP (80) and HTTPS (443) in the instance firewall. Point your domain to the instance's static IP, then add TLS with Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

The app exposes `GET /healthz` for an uptime or load-balancer health check.

## Tests

```bash
python -m unittest discover -s tests -v
```

Plotly is bundled in `static/vendor/`, so the running application does not depend on a third-party CDN.
