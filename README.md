# Hotel Kinarika POS

A comprehensive point-of-sale system built with Django REST Framework and React/Vite.

## Architecture
- **Backend:** Django REST Framework, SQLite (default) / PostgreSQL
- **Frontend:** React, Vite, TailwindCSS (inline styled for robustness)
- **Deployment Target:** Hostinger Linux VPS (OpenLiteSpeed + Django template)

## Local Development
### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Deployment
Please see [deployment/hostinger/README.md](deployment/hostinger/README.md) for full deployment instructions.
