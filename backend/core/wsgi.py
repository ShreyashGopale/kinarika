import os
import sys
from django.core.wsgi import get_wsgi_application

# Add path mapping
path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if path not in sys.path:
    sys.path.append(path)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
application = get_wsgi_application()

# --- AUTO-MIGRATE & USER GENERATION FOR VERCEL + SUPABASE ---
try:
    from django.core.management import call_command
    from django.contrib.auth import get_user_model

    # Run migrations automatically on first cold start
    call_command('migrate', '--noinput')

    User = get_user_model()
    TARGET_USER = "kinarika"
    TARGET_PASS = "weservehealthy"

    if not User.objects.filter(username=TARGET_USER).exists():
        User.objects.create_superuser(username=TARGET_USER, password=TARGET_PASS, email="")
        print("Successfully generated cloud database credentials.")
except Exception as e:
    print(f"Database sync bypass: {e}")
