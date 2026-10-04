#!/bin/bash
echo "===> Running build_files.sh"
if [ -f requirements.txt ]; then
    pip install -r requirements.txt
elif [ -f ../requirements.txt ]; then
    pip install -r ../requirements.txt
fi

if [ -f backend/manage.py ]; then
    python3 backend/manage.py collectstatic --noinput 2>/dev/null || python backend/manage.py collectstatic --noinput 2>/dev/null || true
elif [ -f manage.py ]; then
    python3 manage.py collectstatic --noinput 2>/dev/null || python manage.py collectstatic --noinput 2>/dev/null || true
fi
echo "===> Build finished!"
