# Hostinger Linux VPS Deployment Guide (OpenLiteSpeed + Django)

This project is configured for deployment on a Hostinger Linux VPS using the OpenLiteSpeed + Django template.

## Prerequisites
1. A Hostinger VPS running the **Django (OpenLiteSpeed)** OS template.
2. A domain name pointed to your VPS IP address.
3. Your code pushed to a private GitHub repository.

## Step 1: Clone the Repository
SSH into your Hostinger VPS and clone the repository into your web root (or a dedicated directory):

```bash
cd /usr/local/lsws/Example/html/
# You may need to create SSH keys on the server and add them to GitHub
git clone git@github.com:your-org/hotel-kinarika-pos.git .
```

## Step 2: Configure Environment Variables
Copy the `.env.example` files and populate them with real values.

### Backend `.env`
```bash
cd backend
cp .env.example .env
nano .env
```
Fill in the values:
```env
DJANGO_SECRET_KEY=your-secure-random-string
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourdomain.com
CORS_ALLOWED_ORIGINS=https://yourdomain.com
CSRF_TRUSTED_ORIGINS=https://yourdomain.com
```

### Frontend `.env`
```bash
cd ../frontend
cp .env.example .env
nano .env
```
Set the API URL to your domain:
```env
VITE_API_URL=https://yourdomain.com/api/
```

## Step 3: Build the Frontend
Install Node.js (if not already present), install dependencies, and build:
```bash
npm install
npm run build
```
Copy the contents of `frontend/dist/` to your OpenLiteSpeed document root.

## Step 4: Setup the Backend
Activate your Python virtual environment (provided by the Hostinger Django template), install requirements, and run migrations:

```bash
cd ../backend
source /path/to/your/venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
```

### Create the Initial Admin User
Do not hardcode credentials. Run this command to create your secure operator login:
```bash
python manage.py createsuperuser
```

## Step 5: Configure OpenLiteSpeed
1. Access your OpenLiteSpeed WebAdmin Console (usually `https://your-server-ip:7080`).
2. Point the WSGI application to `backend/core/wsgi.py`.
3. Ensure the virtual host serves the `frontend/dist/` files for `/` and routes `/api/`, `/admin/`, and `/static/` to the Django WSGI app.
4. Set up an SSL certificate using the built-in Certbot integration or Let's Encrypt.
5. Restart OpenLiteSpeed.

## Security Reminders
- Never commit `.env` to GitHub.
- Never set `DJANGO_DEBUG=True` in production.
- Ensure the production database is backed up regularly.
