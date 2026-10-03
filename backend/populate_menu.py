import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from pos.models import Category, MenuItem

def run():
    print("Deleting all existing categories and menu items...")
    Category.objects.all().delete()
    MenuItem.objects.all().delete()
    
    menu = {
        "Breakfast": [
            ("Unlimited Chicken Misal", 180, "non-veg"),
            ("Masala Bhurji Pav", 100, "non-veg"),
            ("Spl. Mutton Kheema Pav", 300, "non-veg"),
            ("Butter Omelette Pav", 70, "non-veg"),
            ("Spl. Mutton Bheja Fry", 300, "non-veg"),
            ("Aamboli Chutney", 50, "veg"),
            ("Aaloo Paratha", 80, "veg"),
            ("Paneer Paratha", 80, "veg"),
            ("Thalipith", 80, "veg"),
            ("Idali Chuntey", 40, "veg"),
        ],
        "Starter (Fish)": [
            ("Bangada Rava Fry", 180, "non-veg"),
            ("Stuffed Bangda Fry", 200, "non-veg"),
            ("Surmai Rava Fry", 350, "non-veg"),
            ("Paplet Rava Fry", 400, "non-veg"),
            ("Stuffed Paplet Fry", 500, "non-veg"),
            ("Bombil Fry (4 pcs)", 400, "non-veg"),
            ("Stuffed Bombil Fry (4 pcs)", 440, "non-veg"),
            ("Kolambi Rava Fry (8 pcs)", 350, "non-veg"),
            ("Khekda Lolypop (6 pcs)", 400, "non-veg"),
            ("Boneless Fish Finger (8 pcs)", 350, "non-veg"),
            ("Suka Bombil Fry (12 pcs)", 150, "non-veg"),
            ("Jawala Chatney", 80, "non-veg"),
            ("Saranga Fry", 150, "non-veg"),
            ("Renve Fry (4 pcs)", 400, "non-veg"),
            ("Rani Masa Fry", 120, "non-veg"),
        ],
        "Starter (Chicken)": [
            ("Chicken Lolipop (8 pcs)", 250, "non-veg"),
            ("Chicken 65 (8 pcs)", 200, "non-veg"),
            ("Chicken Masala Papad", 120, "non-veg"),
            ("Chicken Fry", 200, "non-veg"),
            ("Kaleji Fry", 200, "non-veg"),
            ("Chicken Roast", 250, "non-veg"),
        ],
        "Starter (Veg)": [
            ("Masala Papad", 50, "veg"),
            ("Roasted Papad", 20, "veg"),
            ("Paneer Chilli", 150, "veg"),
            ("Paneer Pakoda", 150, "veg"),
        ],
        "Fish Thali": [
            ("Bangada Thali", 280, "non-veg"),
            ("Surmai Thali", 450, "non-veg"),
            ("Paplet Thali", 499, "non-veg"),
            ("Bombil Thali", 280, "non-veg"),
            ("Saranga Thali", 450, "non-veg"),
            ("Kolambi Thali", 499, "non-veg"),
            ("Boneless Fish Thali", 280, "non-veg"),
            ("Khekada Thali", 450, "non-veg"),
            ("Ek Shimpi Thali", 350, "non-veg"),
        ],
        "Chicken Thali": [
            ("Chicken Masala Thali", 280, "non-veg"),
            ("Kombadi Vade Thali", 300, "non-veg"),
            ("Kinarika Spl. Chicken Thali", 499, "non-veg"),
        ],
        "Mutton Thali": [
            ("Mutton Masala Thali", 450, "non-veg"),
            ("Mutton Vade Thali", 460, "non-veg"),
            ("Kinarika Spl. Mutton Thali", 699, "non-veg"),
        ],
        "Egg & Veg Thali": [
            ("Andaa Masala Thali", 200, "non-veg"),
            ("Mini Veg Thali", 100, "veg"),
            ("Special Veg Thali", 150, "veg"),
        ],
        "Gravies & Curries": [
            ("Kolambi Masala", 350, "non-veg"),
            ("Bangada Thickle", 120, "non-veg"),
            ("Bombil Aatl", 120, "non-veg"),
            ("Ek Shimpi Masala", 250, "non-veg"),
            ("Khekda Masala", 350, "non-veg"),
            ("Suka Chicken", 180, "non-veg"),
            ("Chicken Masala", 180, "non-veg"),
            ("Chicken Aalni", 180, "non-veg"),
            ("Chicken Handi", 350, "non-veg"),
            ("Chicken Kaleji Fry", 350, "non-veg"),
            ("Butter Chicken", 250, "non-veg"),
            ("Mutton Masala", 280, "non-veg"),
            ("Mutton Kheema", 280, "non-veg"),
            ("Anda Masala", 120, "non-veg"),
            ("Anda Curry", 100, "non-veg"),
            ("Paneer Masala", 180, "veg"),
            ("Butter Paneer", 200, "veg"),
            ("Mutter Paneer", 200, "veg"),
            ("Palak Paneer", 200, "veg"),
            ("Kaju Masala", 180, "veg"),
            ("Kaju Paneer", 210, "veg"),
            ("Veg Kolhapuri", 180, "veg"),
            ("Chana Masala", 180, "veg"),
            ("Vang Masala", 120, "veg"),
            ("Vangyach Bharit", 120, "veg"),
            ("Pithl", 80, "veg"),
            ("Shevbhaji", 150, "veg"),
            ("Fish Curry", 30, "non-veg"),
            ("Kolambi Curry", 50, "non-veg"),
            ("Ek Shimpi Curry", 30, "non-veg"),
            ("Khekda Curry", 30, "non-veg"),
            ("Tambda Rassa", 30, "non-veg"),
            ("Pandhara Rassa", 30, "non-veg"),
            ("Chicken/Mutton Aalni Soup", 30, "non-veg"),
        ],
        "Rice & Biryani": [
            ("Chicken Biryani", 350, "non-veg"),
            ("Mutton Biryani", 450, "non-veg"),
            ("Kolambi Biryani", 350, "non-veg"),
            ("Veg Biryani", 220, "veg"),
            ("Veg Pulav", 120, "veg"),
            ("Anda Biryani", 250, "non-veg"),
            ("Steam Rice", 30, "veg"),
            ("Indrayani Rice", 30, "veg"),
            ("Jeera Rice", 120, "veg"),
            ("Aalni Bhaat", 180, "veg"),
        ],
        "Combos": [
            ("Shev Bhaji + 2 Chapati/1 Bhakri", 80, "veg"),
            ("Tomato Bhaji + 2 Chapati/1 Bhakri", 80, "veg"),
            ("Bhaji + 2 Chapati/1 Bhakri", 80, "veg"),
            ("Usal + 2 Chapati/1 Bhakri", 80, "veg"),
            ("Vangyache Bharit + 2 Chapati/1 Bhakri", 80, "veg"),
            ("Kanda Chutney + 2 Chapati/1 Bhakri", 80, "veg"),
            ("Pithla Bhakri", 80, "veg"),
            ("Dal Rice", 80, "veg"),
            ("Dal Khichdi", 80, "veg"),
        ],
        "Breads": [
            ("Jwari Bhakari", 30, "veg"),
            ("Bajari Bhakari", 30, "veg"),
            ("Tandalachi Bhakari", 30, "veg"),
            ("Chapati", 15, "veg"),
            ("Aamboli", 40, "veg"),
        ],
        "Drinks": [
            ("Solkadhi", 50, "veg"),
            ("Taak", 30, "veg"),
            ("Cold-Drinks", 20, "veg"),
        ]
    }

    for cat_name, items in menu.items():
        cat = Category.objects.create(name=cat_name, is_active=True)
        for i_name, i_price, i_type in items:
            is_loyalty = "Thali" in cat_name or "Thali" in i_name
            MenuItem.objects.create(
                category=cat,
                name=i_name,
                price=i_price,
                item_type=i_type,
                is_active=True,
                is_loyalty_eligible=is_loyalty
            )
            print(f"Added {i_name} - ₹{i_price} ({i_type})")
    
    print("Done populating menu!")

if __name__ == '__main__':
    run()
