from rest_framework import serializers
from .models import (
    User, Table, Category, MenuItem, Order, OrderItem, Payment, 
    Customer, LoyaltyAccount, RestaurantSettings, InventoryPurchase
)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username']

class TableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Table
        fields = '__all__'

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'

class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = '__all__'

class OrderItemSerializer(serializers.ModelSerializer):
    # Read-only fields derived from the related menu item so the frontend can
    # show the veg/non-veg type and the loyalty (star) badge without a second
    # request.
    item_type = serializers.SerializerMethodField()
    is_loyalty_eligible = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            'id', 'menu_item', 'name_snapshot', 'price_snapshot',
            'quantity', 'is_free_redemption', 'item_type', 'is_loyalty_eligible',
        ]

    def get_item_type(self, obj):
        return obj.menu_item.item_type if obj.menu_item else 'unknown'

    def get_is_loyalty_eligible(self, obj):
        return bool(obj.menu_item.is_loyalty_eligible) if obj.menu_item else False

class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = '__all__'

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    payment = PaymentSerializer(read_only=True)
    
    class Meta:
        model = Order
        fields = '__all__'

class LoyaltyAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyAccount
        fields = ['veg_paid_count', 'nonveg_paid_count', 'free_veg_balance', 'free_nonveg_balance']

class CustomerSerializer(serializers.ModelSerializer):
    loyalty = LoyaltyAccountSerializer(read_only=True)
    class Meta:
        model = Customer
        fields = ['id', 'phone_number', 'name', 'loyalty']

class InventoryPurchaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryPurchase
        fields = '__all__'
