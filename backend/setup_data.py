import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.contrib.auth import get_user_model
from pos.models import Category, MenuItem, RestaurantSettings, Table

User = get_user_model()


def run():
    print("Setting up Hotel Kinarika data...")

    # Superuser
    if not User.objects.filter(username='kinarika').exists():
        User.objects.create_superuser('kinarika', 'admin@example.com', 'weservehealthy')
        print("  Created superuser: kinarika / weservehealthy")

    # Restaurant info
    RestaurantSettings.objects.get_or_create(
        name="Hotel Kinarika-Veg & Non-Veg",
        address="Geet Ganga Apt., Shaniwar Peth, Pune 30"
    )

    # Default tables
    for i in range(1, 9):
        Table.objects.get_or_create(name=f"Table {i}")
    print("  Created 8 default tables")

    # Full menu from PRD
    full_menu = {
        "Breakfast (Non-Veg)": [
            ("Unlimited Chicken Misal", 180, "non-veg"),
        ],
        "Breakfast (Veg)": [
            ("Aamboli Chutney", 50, "veg"),
            ("Aamboli Thecha", 50, "veg"),
            ("Aamboli Pithla", 60, "veg"),
            ("Misal Pav", 80, "veg"),
            ("Pohe", 50, "veg"),
            ("Upma", 50, "veg"),
            ("Sabudana Khichdi", 70, "veg"),
        ],
        "Starter (Fish)": [
            ("Bangada Rava Fry", 180, "non-veg"),
            ("Surmai Rava Fry", 350, "non-veg"),
            ("Rawas Rava Fry", 400, "non-veg"),
            ("Pomfret Rava Fry", 500, "non-veg"),
            ("Kolambi Fry", 250, "non-veg"),
        ],
        "Starter (Chicken)": [
            ("Chicken Lollipop (8 PCS)", 250, "non-veg"),
            ("Chicken Tandoori (Half)", 280, "non-veg"),
            ("Chicken Tandoori (Full)", 500, "non-veg"),
            ("Chicken Malai Tikka", 300, "non-veg"),
            ("Chicken Seekh Kabab", 280, "non-veg"),
        ],
        "Starter (Mutton)": [
            ("Mutton Seekh Kabab", 350, "non-veg"),
        ],
        "Starter (Veg)": [
            ("Masala Papad", 50, "veg"),
            ("Paneer Tikka", 250, "veg"),
            ("Veg Manchurian", 180, "veg"),
            ("Mushroom Chilli", 200, "veg"),
        ],
        "Thali (Fish)": [
            ("Bangada Thali", 280, "non-veg"),
            ("Surmai Thali", 450, "non-veg"),
            ("Rawas Thali", 500, "non-veg"),
            ("Pomfret Thali", 600, "non-veg"),
            ("Kolambi Thali", 350, "non-veg"),
        ],
        "Thali (Chicken)": [
            ("Unlimited Chicken Masala Thali", 280, "non-veg"),
            ("Unlimited Butter Chicken Thali", 300, "non-veg"),
            ("Unlimited Chicken Handi Thali", 300, "non-veg"),
        ],
        "Thali (Mutton)": [
            ("Mutton Rassa Thali", 400, "non-veg"),
            ("Mutton Kolhapuri Thali", 420, "non-veg"),
        ],
        "Thali (Other)": [
            ("Special Veg Thali", 150, "veg"),
            ("Egg Curry Thali", 180, "non-veg"),
        ],
        "Gravies (Veg)": [
            ("Paneer Masala", 180, "veg"),
            ("Paneer Butter Masala", 200, "veg"),
            ("Palak Paneer", 180, "veg"),
            ("Mushroom Masala", 180, "veg"),
            ("Dal Fry", 120, "veg"),
            ("Dal Tadka", 130, "veg"),
        ],
        "Gravies (Chicken)": [
            ("Chicken Masala", 250, "non-veg"),
            ("Butter Chicken", 280, "non-veg"),
            ("Chicken Handi", 280, "non-veg"),
            ("Chicken Kolhapuri", 260, "non-veg"),
        ],
        "Gravies (Mutton)": [
            ("Mutton Rassa", 350, "non-veg"),
            ("Mutton Kolhapuri", 370, "non-veg"),
        ],
        "Rice & Biryani": [
            ("Chicken Biryani", 350, "non-veg"),
            ("Mutton Biryani", 450, "non-veg"),
            ("Veg Biryani", 200, "veg"),
            ("Egg Biryani", 250, "non-veg"),
            ("Jeera Rice", 100, "veg"),
            ("Plain Rice", 60, "veg"),
            ("Fried Rice (Veg)", 150, "veg"),
            ("Fried Rice (Chicken)", 200, "non-veg"),
        ],
        "Breads": [
            ("Tandoori Roti", 30, "veg"),
            ("Butter Naan", 50, "veg"),
            ("Garlic Naan", 60, "veg"),
            ("Chapati", 20, "veg"),
        ],
        "Beverages": [
            ("Sol Kadhi", 40, "veg"),
            ("Lassi", 60, "veg"),
            ("Buttermilk", 30, "veg"),
            ("Cold Drink (300ml)", 30, "veg"),
            ("Water Bottle", 20, "veg"),
        ],
    }

    for cat_name, items in full_menu.items():
        cat_obj, _ = Category.objects.get_or_create(name=cat_name)
        for item_name, price, item_type in items:
            MenuItem.objects.get_or_create(
                name=item_name,
                defaults={
                    'price': price,
                    'item_type': item_type,
                    'category': cat_obj,
                }
            )

    total = MenuItem.objects.count()
    print(f"  Loaded {total} menu items across {Category.objects.count()} categories")
    print("Done!")


if __name__ == '__main__':
    run()
