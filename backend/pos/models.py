from django.db import models
from django.contrib.auth.models import AbstractUser
from decimal import Decimal
import uuid

class User(AbstractUser):
    pass

class RestaurantSettings(models.Model):
    name = models.CharField(max_length=255, default="Hotel Kinarika-Veg & Non-Veg")
    address = models.TextField(default="Geet Ganga Apt., Shaniwar Peth, Pune 30")
    
    def __str__(self):
        return self.name

class Table(models.Model):
    name = models.CharField(max_length=50, unique=True)
    
    def __str__(self):
        return self.name

class Category(models.Model):
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    
    def __str__(self):
        return self.name

class MenuItem(models.Model):
    TYPE_CHOICES = [('veg', 'Veg'), ('non-veg', 'Non-Veg')]
    category = models.ForeignKey(Category, related_name='items', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    item_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='veg')
    is_active = models.BooleanField(default=True)
    is_loyalty_eligible = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.name} - ₹{self.price}"

class InventoryPurchase(models.Model):
    item_name = models.CharField(max_length=255)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2)
    timestamp = models.DateTimeField(auto_now_add=True)
    operator = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.item_name} - ₹{self.purchase_price}"

class Customer(models.Model):
    phone_number = models.CharField(max_length=15, unique=True)
    name = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return self.phone_number

class LoyaltyAccount(models.Model):
    customer = models.OneToOneField(Customer, on_delete=models.CASCADE, related_name='loyalty')
    veg_paid_count = models.IntegerField(default=0)
    nonveg_paid_count = models.IntegerField(default=0)
    free_veg_balance = models.IntegerField(default=0)
    free_nonveg_balance = models.IntegerField(default=0)

    def __str__(self):
        return f"Loyalty for {self.customer.phone_number}"

class LoyaltyTransaction(models.Model):
    TRANSACTION_TYPES = [
        ('PAID_THALI', 'Paid Thali'),
        ('REWARD_EARNED', 'Reward Earned'),
        ('FREE_REDEEMED', 'Free Redeemed'),
    ]
    account = models.ForeignKey(LoyaltyAccount, related_name='transactions', on_delete=models.CASCADE)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    quantity = models.IntegerField(default=1)
    thali_type = models.CharField(max_length=10, choices=[('veg', 'Veg'), ('non-veg', 'Non-Veg')])
    timestamp = models.DateTimeField(auto_now_add=True)
    order_reference = models.CharField(max_length=50, blank=True, null=True)

class Order(models.Model):
    ORDER_TYPES = [('dine-in', 'Dine-In'), ('token', 'Token')]
    STATUS_CHOICES = [
        ('NEW', 'New'),
        ('PREPARING', 'Preparing'),
        ('READY', 'Ready'),
        ('COMPLETED', 'Completed'),
    ]
    order_number = models.CharField(max_length=50, unique=True)
    order_type = models.CharField(max_length=10, choices=ORDER_TYPES, default='dine-in')
    table_name = models.CharField(max_length=50, blank=True, null=True) # For dine-in
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='NEW')
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL)
    
    original_subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    free_thali_adjustment = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    final_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Order #{self.order_number}"

class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    menu_item = models.ForeignKey(MenuItem, on_delete=models.SET_NULL, null=True)
    name_snapshot = models.CharField(max_length=255) # In case menu_item is deleted
    price_snapshot = models.DecimalField(max_digits=10, decimal_places=2) # Historical price
    quantity = models.IntegerField(default=1)
    is_free_redemption = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.quantity} x {self.name_snapshot}"

class Payment(models.Model):
    PAYMENT_METHODS = [('CASH', 'Cash'), ('UPI', 'UPI'), ('CARD', 'Card')]
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='payment')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=10, choices=PAYMENT_METHODS, default='CASH')
    timestamp = models.DateTimeField(auto_now_add=True)

class DiscountRecord(models.Model):
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='discount_record')
    percentage = models.DecimalField(max_digits=5, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    timestamp = models.DateTimeField(auto_now_add=True)

class PrinterSettings(models.Model):
    width_mm = models.IntegerField(default=58, choices=[(58, '58mm'), (80, '80mm')])
    header_visible = models.BooleanField(default=True)
    footer_visible = models.BooleanField(default=True)

class WhatsAppMessage(models.Model):
    STATUS_CHOICES = [('PENDING', 'Pending'), ('SENT', 'Sent'), ('FAILED', 'Failed')]
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True)
    phone_number = models.CharField(max_length=15)
    message_content = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    timestamp = models.DateTimeField(auto_now_add=True)

class BackupRecord(models.Model):
    filename = models.CharField(max_length=255)
    timestamp = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, default='SUCCESS')

class DishSale(models.Model):
    """Keeps track of every dish sold with its price and veg/non-veg label."""
    order_reference = models.CharField(max_length=50)
    dish_name = models.CharField(max_length=255)
    price_sold = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.IntegerField(default=1)
    item_type = models.CharField(max_length=10) # 'veg' or 'non-veg'
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.quantity}x {self.dish_name} ({self.item_type}) at ₹{self.price_sold}"
