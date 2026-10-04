#!/bin/bash
# Vercel build script – runs migrations against Supabase
pip install -r requirements.txt
cd backend
python manage.py migrate --noinput
python manage.py collectstatic --noinput
