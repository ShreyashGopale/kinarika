import json
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from django.db.models import Sum, Count
from django.db import models
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from decimal import Decimal, InvalidOperation
from .models import (
    Table, Category, MenuItem, Order, OrderItem, Customer,
    LoyaltyAccount, LoyaltyTransaction, Payment, User, DishSale,
    InventoryPurchase, WhatsAppMessage
)
from .serializers import (
    TableSerializer, CategorySerializer, MenuItemSerializer,
    OrderSerializer, CustomerSerializer, PaymentSerializer
)
from .whatsapp import send_whatsapp, get_verify_token


# ============================================================
#  AUTH
# ============================================================

@api_view(['POST'])
@permission_classes([AllowAny])
def api_login(request):
    """Hardcoded username/password login."""
    username = (request.data.get('username') or '').strip()
    password = (request.data.get('password') or '').strip()
    
    if username == "kinarika" and password == "weservehealthy":
        try:
            user, created = User.objects.get_or_create(username="kinarika")
            if created or not user.has_usable_password():
                user.set_password("weservehealthy")
                user.save()
            user.backend = 'django.contrib.auth.backends.ModelBackend'
            login(request, user)
            return Response({'message': 'Logged in', 'user': user.username})
        except Exception as e:
            return Response({'error': f'Database error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
    # Fallback to standard auth just in case
    user = authenticate(request, username=username, password=password)
    if user is not None:
        login(request, user)
        return Response({'message': 'Logged in', 'user': user.username})
        
    return Response(
        {'error': 'Invalid credentials'},
        status=status.HTTP_401_UNAUTHORIZED
    )


@api_view(['POST'])
def api_logout(request):
    logout(request)
    return Response({'message': 'Logged out'})


@api_view(['GET'])
def api_session(request):
    if request.user.is_authenticated:
        return Response({'user': request.user.username})
    return Response(
        {'error': 'Not authenticated'},
        status=status.HTTP_401_UNAUTHORIZED
    )


# ============================================================
#  TABLES  (GET list, POST create, DELETE one)
# ============================================================

@api_view(['GET', 'POST'])
def tables_list(request):
    if request.method == 'GET':
        tables = Table.objects.all().order_by('id')
        data = []
        for table in tables:
            # Find any active order sitting on this table
            active = Order.objects.filter(
                table_name=table.name,
                status__in=['NEW', 'PREPARING', 'READY']
            ).first()
            table_info = {
                'id': table.id,
                'name': table.name,
                'has_active_order': active is not None,
                'active_order_id': active.id if active else None,
                'active_order_status': active.status if active else None,
            }
            data.append(table_info)
        return Response(data)

    # POST  –  create a new table
    name = request.data.get('name', '').strip()
    if not name:
        return Response(
            {'error': 'Table name is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if Table.objects.filter(name=name).exists():
        return Response(
            {'error': 'A table with this name already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    table = Table.objects.create(name=name)
    return Response({'id': table.id, 'name': table.name},
                    status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
def table_detail(request, pk):
    try:
        table = Table.objects.get(pk=pk)
    except Table.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    active = Order.objects.filter(
        table_name=table.name,
        status__in=['NEW', 'PREPARING', 'READY']
    )
    if active.exists():
        return Response(
            {'error': 'Cannot delete – table has an active order.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    table.delete()
    return Response({'message': 'Table deleted.'},
                    status=status.HTTP_204_NO_CONTENT)


# ============================================================
#  MENU
# ============================================================

@api_view(['GET'])
def menu_categories(request):
    cats = Category.objects.filter(is_active=True).order_by('id')
    return Response(CategorySerializer(cats, many=True).data)


@api_view(['GET'])
def menu_items(request):
    items = MenuItem.objects.filter(is_active=True).order_by('category__id', 'name')
    return Response(MenuItemSerializer(items, many=True).data)


@api_view(['GET'])
def menu_items_all(request):
    """Return ALL items (active + inactive) for the Set Menu page."""
    items = MenuItem.objects.all().order_by('category__id', 'name')
    return Response(MenuItemSerializer(items, many=True).data)


@api_view(['PATCH'])
def toggle_menu_item(request, pk):
    """Toggle a single item's is_active flag."""
    try:
        item = MenuItem.objects.get(pk=pk)
    except MenuItem.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    item.is_active = not item.is_active
    item.save()
    return Response(MenuItemSerializer(item).data)


@api_view(['POST'])
def bulk_toggle_menu(request):
    """Set active/inactive in bulk.
    Body: { "active_ids": [1,2,3], "inactive_ids": [4,5,6] }
    """
    active_ids = request.data.get('active_ids', [])
    inactive_ids = request.data.get('inactive_ids', [])
    if active_ids:
        MenuItem.objects.filter(id__in=active_ids).update(is_active=True)
    if inactive_ids:
        MenuItem.objects.filter(id__in=inactive_ids).update(is_active=False)
    return Response({'message': 'Menu updated.'})


@api_view(['POST'])
def create_menu_item(request):
    """Create a new menu item.
    Body: { "name": "...", "price": 100, "item_type": "veg", "category_id": 1 }
    Optionally pass "category_name" to auto-create a new category.
    """
    name = request.data.get('name', '').strip()
    price = request.data.get('price')
    item_type = request.data.get('item_type', 'veg')
    category_id = request.data.get('category_id')
    category_name = request.data.get('category_name', '').strip()
    is_loyalty_eligible = bool(request.data.get('is_loyalty_eligible', False))

    if not name or not price:
        return Response({'error': 'Name and price are required.'},
                        status=status.HTTP_400_BAD_REQUEST)

    # Validate that price is a valid number (can be int or float string from frontend)
    try:
        price = Decimal(str(price))
        if price < 0:
            return Response({'error': 'Price cannot be negative.'},
                            status=status.HTTP_400_BAD_REQUEST)
    except (InvalidOperation, TypeError, ValueError):
        return Response({'error': 'Price must be a valid number.'},
                        status=status.HTTP_400_BAD_REQUEST)

    # Validate item_type against allowed choices
    valid_types = [choice[0] for choice in MenuItem._meta.get_field('item_type').choices]
    if item_type not in valid_types:
        return Response({'error': f'Invalid item_type. Must be one of: {valid_types}.'},
                        status=status.HTTP_400_BAD_REQUEST)

    # Get or create category
    if category_id:
        try:
            cat = Category.objects.get(pk=category_id)
        except Category.DoesNotExist:
            return Response({'error': 'Category not found.'},
                            status=status.HTTP_400_BAD_REQUEST)
    elif category_name:
        cat, _ = Category.objects.get_or_create(name=category_name)
    else:
        return Response({'error': 'Category is required.'},
                        status=status.HTTP_400_BAD_REQUEST)

    item = MenuItem.objects.create(
        name=name,
        price=price,
        item_type=item_type,
        category=cat,
        is_active=True,
        is_loyalty_eligible=is_loyalty_eligible,
    )
    return Response(MenuItemSerializer(item).data,
                    status=status.HTTP_201_CREATED)


@api_view(['PATCH'])
def edit_menu_item(request, pk):
    """Edit an existing menu item name or price."""
    try:
        item = MenuItem.objects.get(pk=pk)
    except MenuItem.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    name = request.data.get('name')
    if name is not None:
        item.name = name.strip()

    price = request.data.get('price')
    if price is not None:
        try:
            price = Decimal(str(price))
            if price < 0:
                return Response({'error': 'Price cannot be negative.'},
                                status=status.HTTP_400_BAD_REQUEST)
            item.price = price
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'Price must be a valid number.'},
                            status=status.HTTP_400_BAD_REQUEST)

    item_type = request.data.get('item_type')
    if item_type is not None:
        valid_types = [choice[0] for choice in MenuItem._meta.get_field('item_type').choices]
        if item_type not in valid_types:
            return Response({'error': f'Invalid item_type. Must be one of: {valid_types}.'},
                            status=status.HTTP_400_BAD_REQUEST)
        item.item_type = item_type

    category_id = request.data.get('category_id')
    if category_id is not None:
        try:
            item.category = Category.objects.get(pk=category_id)
        except Category.DoesNotExist:
            pass

    is_loyalty_eligible = request.data.get('is_loyalty_eligible')
    if is_loyalty_eligible is not None:
        item.is_loyalty_eligible = bool(is_loyalty_eligible)

    item.save()
    return Response(MenuItemSerializer(item).data)

# ============================================================
#  ORDERS
# ============================================================

@api_view(['POST'])
def create_order(request):
    """Create a new dine-in or token order."""
    with transaction.atomic():
        order_type = request.data.get('order_type', 'dine-in')
        table_name = request.data.get('table_name', None)

        # Validate order_type against model choices
        valid_order_types = [choice[0] for choice in Order._meta.get_field('order_type').choices]
        if order_type not in valid_order_types:
            return Response({'error': f'Invalid order_type.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Concurrent-safe order number
        last = Order.objects.select_for_update().order_by('id').last()
        next_id = (last.id + 1) if last else 1
        order_number = f"ORD-{next_id:05d}"

        order = Order.objects.create(
            order_number=order_number,
            order_type=order_type,
            table_name=table_name,
        )

        # Optionally link a customer phone
        phone = request.data.get('phone_number')
        if phone:
            customer, _ = Customer.objects.get_or_create(phone_number=phone)
            order.customer = customer
            order.save()

    return Response(OrderSerializer(order).data,
                    status=status.HTTP_201_CREATED)


@api_view(['POST'])
def add_items_to_order(request, pk):
    """Append menu items to an existing order."""
    try:
        order = Order.objects.get(pk=pk)
    except Order.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if order.status == 'COMPLETED':
        return Response({'error': 'Order already completed.'},
                        status=status.HTTP_400_BAD_REQUEST)

    items_data = request.data.get('items', [])
    with transaction.atomic():
        for entry in items_data:
            menu_item = MenuItem.objects.get(id=entry['menu_item_id'])
            # Check if item already in order – if so, increase qty
            existing = OrderItem.objects.filter(
                order=order, menu_item=menu_item
            ).first()
            if existing:
                existing.quantity += entry.get('quantity', 1)
                existing.save()
            else:
                OrderItem.objects.create(
                    order=order,
                    menu_item=menu_item,
                    name_snapshot=menu_item.name,
                    price_snapshot=menu_item.price,
                    quantity=entry.get('quantity', 1),
                )

    # Recalculate subtotal
    subtotal = Decimal('0.00')
    for oi in order.items.all():
        subtotal += oi.price_snapshot * oi.quantity
    order.original_subtotal = subtotal
    order.save()

    return Response(OrderSerializer(order).data)


@api_view(['GET', 'DELETE'])
def order_detail(request, pk):
    """Get full detail of a single order, or delete it."""
    try:
        order = Order.objects.get(pk=pk)
    except Order.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        # Order is deleted. We don't need to manually clear the table 
        # since table active status is calculated dynamically.
        order.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    return Response(OrderSerializer(order).data)


@api_view(['PATCH'])
def update_order_item(request, pk, item_pk):
    """Update quantity of a single order-item, or delete it if qty=0."""
    try:
        oi = OrderItem.objects.get(pk=item_pk, order_id=pk)
    except OrderItem.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    new_qty_raw = request.data.get('quantity', oi.quantity)
    try:
        new_qty = int(new_qty_raw)
    except (TypeError, ValueError):
        return Response({'error': 'Quantity must be a valid integer.'}, status=status.HTTP_400_BAD_REQUEST)
    if new_qty <= 0:
        oi.delete()
    else:
        oi.quantity = new_qty
        oi.save()

    # Recalculate order subtotal
    order = Order.objects.get(pk=pk)
    subtotal = Decimal('0.00')
    for item in order.items.all():
        subtotal += item.price_snapshot * item.quantity
    order.original_subtotal = subtotal
    order.save()

    return Response(OrderSerializer(order).data)


@api_view(['PATCH'])
def update_order_status(request, pk):
    """Change order status  (NEW → PREPARING → READY → COMPLETED)."""
    try:
        order = Order.objects.get(pk=pk)
    except Order.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    new_status = request.data.get('status')
    if new_status not in ['NEW', 'PREPARING', 'READY', 'COMPLETED']:
        return Response({'error': 'Invalid status.'},
                        status=status.HTTP_400_BAD_REQUEST)
    order.status = new_status
    if new_status == 'COMPLETED':
        order.completed_at = timezone.now()
    order.save()
    return Response(OrderSerializer(order).data)


@api_view(['GET'])
def active_orders(request):
    """All orders that are not COMPLETED, newest first."""
    orders = Order.objects.exclude(status='COMPLETED').order_by('-created_at')
    return Response(OrderSerializer(orders, many=True).data)


@api_view(['GET'])
def completed_orders(request):
    """Completed orders for today (bill history)."""
    today = timezone.now().date()
    orders = Order.objects.filter(
        status='COMPLETED',
        completed_at__date=today
    ).order_by('-completed_at')
    return Response(OrderSerializer(orders, many=True).data)


# ============================================================
#  LOYALTY
# ============================================================

@api_view(['GET'])
def get_customer_loyalty(request, phone):
    try:
        customer = Customer.objects.get(phone_number=phone)
    except Customer.DoesNotExist:
        return Response({'error': 'Customer not found'},
                        status=status.HTTP_404_NOT_FOUND)
    loyalty, _ = LoyaltyAccount.objects.get_or_create(customer=customer)
    return Response({
        'phone': customer.phone_number,
        'name': customer.name,
        'veg_paid_count': loyalty.veg_paid_count,
        'nonveg_paid_count': loyalty.nonveg_paid_count,
        'free_veg_balance': loyalty.free_veg_balance,
        'free_nonveg_balance': loyalty.free_nonveg_balance,
    })


@api_view(['GET'])
def customer_detail(request, phone):
    """Customer profile: loyalty summary, completed orders and a
    per-dish / per-date loyalty point history (derived from the
    order items, so no extra writes are needed)."""
    try:
        customer = Customer.objects.get(phone_number=phone)
    except Customer.DoesNotExist:
        return Response({'error': 'Customer not found'},
                        status=status.HTTP_404_NOT_FOUND)

    loyalty, _ = LoyaltyAccount.objects.get_or_create(customer=customer)

    orders = Order.objects.filter(
        customer=customer, status='COMPLETED'
    ).order_by('-completed_at')

    order_data = []
    for o in orders:
        try:
            payment = PaymentSerializer(o.payment).data
        except Exception:
            payment = None
        order_data.append({
            'id': o.id,
            'order_number': o.order_number,
            'order_type': o.order_type,
            'table_name': o.table_name,
            'final_total': float(o.final_total),
            'discount_amount': float(o.discount_amount),
            'free_thali_adjustment': float(o.free_thali_adjustment),
            'completed_at': o.completed_at.isoformat() if o.completed_at else None,
            'payment': payment,
            'items': [
                {
                    'name_snapshot': it.name_snapshot,
                    'price_snapshot': float(it.price_snapshot),
                    'quantity': it.quantity,
                    'item_type': it.menu_item.item_type if it.menu_item else 'unknown',
                    'is_loyalty_eligible': bool(it.menu_item.is_loyalty_eligible) if it.menu_item else False,
                    'is_free_redemption': bool(it.is_free_redemption),
                }
                for it in o.items.select_related('menu_item').all()
            ],
        })

    # Loyalty history: earned points come from loyalty-eligible items
    # that were paid for; redeemed points from items flagged as free.
    history = []
    for o in orders:
        for it in o.items.select_related('menu_item').all():
            if not it.menu_item or not it.menu_item.is_loyalty_eligible:
                continue
            if it.is_free_redemption:
                history.append({
                    'type': it.menu_item.item_type,
                    'dish': it.name_snapshot,
                    'date': o.completed_at.isoformat() if o.completed_at else None,
                    'quantity': it.quantity,
                    'action': 'redeemed',
                    'points': -10 * it.quantity,
                })
            else:
                history.append({
                    'type': it.menu_item.item_type,
                    'dish': it.name_snapshot,
                    'date': o.completed_at.isoformat() if o.completed_at else None,
                    'quantity': it.quantity,
                    'action': 'earned',
                    'points': it.quantity,
                })
    history.sort(key=lambda h: h['date'] or '', reverse=True)

    return Response({
        'phone_number': customer.phone_number,
        'name': customer.name,
        'loyalty': {
            'veg_points': loyalty.free_veg_balance * 10 + loyalty.veg_paid_count,
            'nonveg_points': loyalty.free_nonveg_balance * 10 + loyalty.nonveg_paid_count,
            'free_veg_balance': loyalty.free_veg_balance,
            'free_nonveg_balance': loyalty.free_nonveg_balance,
            'veg_paid_count': loyalty.veg_paid_count,
            'nonveg_paid_count': loyalty.nonveg_paid_count,
        },
        'orders': order_data,
        'loyalty_history': history,
    })


# ============================================================
#  BILLING – atomic bill completion
# ============================================================

def build_receipt_text(order, loyalty=None):
    """Plain-text receipt used for the WhatsApp message."""
    lines = ['HOTEL KINARIKA', 'Veg & Non-Veg', '-' * 32]
    lines.append(f'Order: {order.order_number}')
    lines.append(f'Type: {order.order_type}')
    if order.table_name:
        lines.append(f'Table: {order.table_name}')
    lines.append('-' * 32)
    for item in order.items.select_related('menu_item').all():
        amount = float(item.price_snapshot) * item.quantity
        star = ' ⭐' if (item.menu_item and item.menu_item.is_loyalty_eligible) else ''
        free_tag = ' (FREE)' if item.is_free_redemption else ''
        lines.append(f'{item.quantity} x {item.name_snapshot}{star}{free_tag} - Rs{amount:.0f}')
    lines.append('-' * 32)
    if float(order.free_thali_adjustment) > 0:
        lines.append(f'Free Thali Adj: -Rs{float(order.free_thali_adjustment):.0f}')
    if float(order.discount_amount) > 0:
        lines.append(f'Discount ({float(order.discount_percentage):.0f}%): -Rs{float(order.discount_amount):.0f}')
    lines.append(f'TOTAL: Rs{float(order.final_total):.0f}')
    if loyalty:
        veg_points = loyalty.free_veg_balance * 10 + loyalty.veg_paid_count
        nonveg_points = loyalty.free_nonveg_balance * 10 + loyalty.nonveg_paid_count
        lines.append('-' * 32)
        lines.append(f'Veg Loyalty Points: {veg_points}')
        lines.append(f'Non-Veg Loyalty Points: {nonveg_points}')
    lines.append('Thank you! Visit again.')
    return '\n'.join(lines)


@api_view(['POST'])
def complete_bill(request, pk):
    try:
        order = Order.objects.get(pk=pk)
        if order.status == 'COMPLETED':
            return Response({'error': 'Already completed.'},
                            status=status.HTTP_400_BAD_REQUEST)
    except Order.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    # Validate numeric inputs from frontend
    discount_raw = request.data.get('discount_percentage', '0')
    try:
        discount_percentage = Decimal(str(discount_raw))
    except (InvalidOperation, TypeError, ValueError):
        discount_percentage = Decimal('0')
    if discount_percentage < 0 or discount_percentage > 100:
        return Response({'error': 'Discount must be between 0 and 100.'},
                        status=status.HTTP_400_BAD_REQUEST)

    try:
        use_free_veg = int(request.data.get('use_free_veg', 0) or 0)
        use_free_nonveg = int(request.data.get('use_free_nonveg', 0) or 0)
    except (TypeError, ValueError):
        return Response({'error': 'Free thali counts must be valid integers.'},
                        status=status.HTTP_400_BAD_REQUEST)
    payment_method = request.data.get('payment_method', 'CASH')

    # Optional customer phone – create/lookup up front so the transaction
    # only needs to link it.
    phone_number = (request.data.get('phone_number') or '').strip()
    customer = None
    if phone_number:
        customer, _ = Customer.objects.get_or_create(phone_number=phone_number)

    # FREETHALI coupon – specific order-items chosen to be given free.
    free_item_ids = request.data.get('free_item_ids', []) or []
    if isinstance(free_item_ids, str):
        try:
            free_item_ids = json.loads(free_item_ids)
        except ValueError:
            free_item_ids = [p for p in free_item_ids.split(',') if p.strip()]
    try:
        free_item_ids = [int(i) for i in free_item_ids if str(i).strip() != '']
    except (TypeError, ValueError):
        free_item_ids = []

    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=pk)
        if customer:
            order.customer = customer

        loyalty = None
        if order.customer:
            loyalty, _ = LoyaltyAccount.objects.select_for_update().get_or_create(
                customer=order.customer
            )

        if (use_free_veg > 0 or use_free_nonveg > 0 or free_item_ids) and not loyalty:
            return Response({'error': 'No customer linked. Enter a phone number.'},
                            status=status.HTTP_400_BAD_REQUEST)

        items = list(order.items.select_related('menu_item').all())

        # Calculate subtotal and loyalty-eligible thali counts
        original_subtotal = Decimal('0.00')
        veg_thalis = 0
        nonveg_thalis = 0
        for item in items:
            original_subtotal += item.price_snapshot * item.quantity
            if item.menu_item and item.menu_item.is_loyalty_eligible:
                if item.menu_item.item_type == 'veg':
                    veg_thalis += item.quantity
                else:
                    nonveg_thalis += item.quantity

        # Determine which items are free. The FREETHALI coupon (free_item_ids)
        # takes precedence over the manual steppers.
        free_items = []
        if free_item_ids:
            id_set = set(free_item_ids)
            free_items = [i for i in items
                          if i.id in id_set and i.menu_item
                          and i.menu_item.is_loyalty_eligible]
            use_free_veg = sum(i.quantity for i in free_items
                               if i.menu_item.item_type == 'veg')
            use_free_nonveg = sum(i.quantity for i in free_items
                                  if i.menu_item.item_type != 'veg')

        # Validate free-thali balances BEFORE making any changes
        if loyalty:
            if loyalty.free_veg_balance < use_free_veg:
                return Response({'error': 'Not enough free Veg Thalis.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if loyalty.free_nonveg_balance < use_free_nonveg:
                return Response({'error': 'Not enough free Non-Veg Thalis.'},
                                status=status.HTTP_400_BAD_REQUEST)

        # Apply the free-thali adjustment
        free_thali_adjustment = Decimal('0.00')
        if free_item_ids:
            # Coupon path – each chosen loyalty-eligible line becomes free
            for item in free_items:
                item.is_free_redemption = True
                item.save(update_fields=['is_free_redemption'])
                free_thali_adjustment += item.price_snapshot * item.quantity
        else:
            # Stepper path – apply free thalis first-come (legacy behaviour)
            remaining_free_veg = use_free_veg
            remaining_free_nonveg = use_free_nonveg
            for item in items:
                if item.menu_item and item.menu_item.is_loyalty_eligible:
                    freed = 0
                    if remaining_free_veg > 0 and item.menu_item.item_type == 'veg':
                        freed = min(remaining_free_veg, item.quantity)
                        remaining_free_veg -= freed
                    elif remaining_free_nonveg > 0 and item.menu_item.item_type == 'non-veg':
                        freed = min(remaining_free_nonveg, item.quantity)
                        remaining_free_nonveg -= freed
                    if freed > 0:
                        if freed == item.quantity:
                            item.is_free_redemption = True
                            item.save(update_fields=['is_free_redemption'])
                        free_thali_adjustment += item.price_snapshot * freed

        adjusted = original_subtotal - free_thali_adjustment
        discount_amount = (adjusted * discount_percentage) / Decimal('100')
        final_total = adjusted - discount_amount

        order.original_subtotal = original_subtotal
        order.free_thali_adjustment = free_thali_adjustment
        order.discount_percentage = discount_percentage
        order.discount_amount = discount_amount
        order.final_total = final_total
        order.status = 'COMPLETED'
        order.completed_at = timezone.now()
        order.save()

        Payment.objects.create(
            order=order, amount=final_total, method=payment_method
        )

        # Track dish sales for reporting
        for item in order.items.all():
            DishSale.objects.create(
                order_reference=order.order_number,
                dish_name=item.name_snapshot,
                price_sold=item.price_snapshot,
                quantity=item.quantity,
                item_type=item.menu_item.item_type if item.menu_item else 'unknown'
            )

        # Loyalty bookkeeping
        if loyalty:
            if use_free_veg > 0:
                loyalty.free_veg_balance -= use_free_veg
                LoyaltyTransaction.objects.create(
                    account=loyalty, transaction_type='FREE_REDEEMED',
                    quantity=use_free_veg, thali_type='veg',
                    order_reference=order.order_number
                )
            if use_free_nonveg > 0:
                loyalty.free_nonveg_balance -= use_free_nonveg
                LoyaltyTransaction.objects.create(
                    account=loyalty, transaction_type='FREE_REDEEMED',
                    quantity=use_free_nonveg, thali_type='non-veg',
                    order_reference=order.order_number
                )
            new_veg = veg_thalis - use_free_veg
            new_nonveg = nonveg_thalis - use_free_nonveg
            loyalty.veg_paid_count += max(new_veg, 0)
            if loyalty.veg_paid_count >= 10:
                earned = loyalty.veg_paid_count // 10
                loyalty.free_veg_balance += earned
                loyalty.veg_paid_count %= 10
            loyalty.nonveg_paid_count += max(new_nonveg, 0)
            if loyalty.nonveg_paid_count >= 10:
                earned = loyalty.nonveg_paid_count // 10
                loyalty.free_nonveg_balance += earned
                loyalty.nonveg_paid_count %= 10
            loyalty.save()

    # Auto-send the receipt via WhatsApp (outside the transaction so a
    # failed send never rolls back the completed bill).
    whatsapp_result = {'sent': False}
    if phone_number and loyalty:
        receipt_text = build_receipt_text(order, loyalty)
        ok, resp = send_whatsapp(phone_number, receipt_text)
        WhatsAppMessage.objects.create(
            order=order,
            phone_number=phone_number,
            message_content=receipt_text,
            status='SENT' if ok else 'FAILED',
        )
        whatsapp_result = {'sent': ok, 'detail': resp}

    serialized = OrderSerializer(order).data
    if loyalty:
        serialized['loyalty'] = {
            'veg_paid_count': loyalty.veg_paid_count,
            'nonveg_paid_count': loyalty.nonveg_paid_count,
            'free_veg_balance': loyalty.free_veg_balance,
            'free_nonveg_balance': loyalty.free_nonveg_balance,
        }
    serialized['whatsapp'] = whatsapp_result
    return Response(serialized)


# ============================================================
#  WHATSAPP – webhook + manual receipt send
# ============================================================

@csrf_exempt
def whatsapp_webhook(request):
    """Meta WhatsApp Cloud API webhook.

    GET  – webhook verification (Meta echoes back hub.challenge when
           the verify token matches).
    POST – message status / inbound message events.
    """
    if request.method == 'GET':
        mode = request.GET.get('hub.mode')
        token = request.GET.get('hub.verify_token')
        challenge = request.GET.get('hub.challenge')
        if mode == 'subscribe' and token == get_verify_token():
            return HttpResponse(challenge, status=200,
                                content_type='text/plain')
        return HttpResponse('Forbidden', status=403)

    # Acknowledge event callbacks immediately. Message-status and
    # inbound events could be persisted here if needed later.
    return HttpResponse('OK', status=200)


@api_view(['POST'])
def send_order_whatsapp(request, pk):
    """Attach a customer (granting loyalty points if the order was
    completed while unattached) and send the receipt via WhatsApp."""
    try:
        order = Order.objects.get(pk=pk)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found'},
                        status=status.HTTP_404_NOT_FOUND)

    phone = (request.data.get('phone') or '').strip()
    if not phone and order.customer:
        phone = order.customer.phone_number
    if not phone:
        return Response({'error': 'Phone number required'},
                        status=status.HTTP_400_BAD_REQUEST)

    # Attach customer + grant points atomically
    with transaction.atomic():
        customer, _ = Customer.objects.get_or_create(phone_number=phone)
        loyalty, _ = LoyaltyAccount.objects.select_for_update().get_or_create(
            customer=customer
        )
        old_customer = order.customer
        order.customer = customer
        order.save()

        # If the order is COMPLETED and previously had NO customer,
        # grant the points now.
        if order.status == 'COMPLETED' and not old_customer:
            veg_thalis = 0
            nonveg_thalis = 0
            for item in order.items.select_related('menu_item').all():
                if (item.menu_item and item.menu_item.is_loyalty_eligible
                        and not item.is_free_redemption):
                    if item.menu_item.item_type == 'veg':
                        veg_thalis += item.quantity
                    else:
                        nonveg_thalis += item.quantity

            loyalty.veg_paid_count += veg_thalis
            if loyalty.veg_paid_count >= 10:
                loyalty.free_veg_balance += loyalty.veg_paid_count // 10
                loyalty.veg_paid_count %= 10

            loyalty.nonveg_paid_count += nonveg_thalis
            if loyalty.nonveg_paid_count >= 10:
                loyalty.free_nonveg_balance += loyalty.nonveg_paid_count // 10
                loyalty.nonveg_paid_count %= 10

            loyalty.save()

    # Send the receipt (outside the transaction)
    receipt_text = build_receipt_text(order, loyalty)
    ok, resp = send_whatsapp(phone, receipt_text)
    WhatsAppMessage.objects.create(
        order=order,
        phone_number=phone,
        message_content=receipt_text,
        status='SENT' if ok else 'FAILED',
    )
    return Response({
        'sent': ok,
        'detail': resp,
        'order': OrderSerializer(order).data,
    })


# ============================================================
#  DASHBOARD  –  simple daily stats
# ============================================================

@api_view(['GET'])
def dashboard_stats(request):
    from datetime import datetime, timedelta
    from django.db.models import Sum, Count, F
    
    # 1. Today's Stats
    today = timezone.now().date()
    yesterday = today - timedelta(days=1)
    
    today_orders = Order.objects.filter(status='COMPLETED', completed_at__date=today)
    yesterday_orders = Order.objects.filter(status='COMPLETED', completed_at__date=yesterday)
    
    today_revenue = today_orders.aggregate(t=Sum('final_total'))['t'] or 0
    yesterday_revenue = yesterday_orders.aggregate(t=Sum('final_total'))['t'] or 0
    
    trend = 0
    if yesterday_revenue > 0:
        trend = ((float(today_revenue) - float(yesterday_revenue)) / float(yesterday_revenue)) * 100
        
    today_upi = Payment.objects.filter(order__in=today_orders, method__in=['UPI', 'CARD']).aggregate(t=Sum('amount'))['t'] or 0
    today_cash = Payment.objects.filter(order__in=today_orders, method='CASH').aggregate(t=Sum('amount'))['t'] or 0
    
    today_upi_count = Payment.objects.filter(order__in=today_orders, method__in=['UPI', 'CARD']).count()
    today_cash_count = Payment.objects.filter(order__in=today_orders, method='CASH').count()
    
    from .models import InventoryPurchase, DishSale
    today_expenses = InventoryPurchase.objects.filter(timestamp__date=today).aggregate(t=Sum('purchase_price'))['t'] or 0
    
    today_stats = {
        'total': float(today_revenue),
        'upi': float(today_upi),
        'cash': float(today_cash),
        'upi_count': today_upi_count,
        'cash_count': today_cash_count,
        'expenses': float(today_expenses),
        'trend_percentage': round(trend, 1),
        'is_positive': trend >= 0
    }
    
    # 2. Period Stats
    start_str = request.GET.get('start_date')
    end_str = request.GET.get('end_date')
    
    if start_str and end_str:
        start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
    else:
        end_date = today
        start_date = today - timedelta(days=6)
        
    # Generate daily chart data
    chart_data = []
    current = start_date
    period_sales = 0
    period_profit = 0
    period_expenses = 0
    
    while current <= end_date:
        d_orders = Order.objects.filter(status='COMPLETED', completed_at__date=current)
        d_sales = d_orders.aggregate(t=Sum('final_total'))['t'] or 0
        d_exp = InventoryPurchase.objects.filter(timestamp__date=current).aggregate(t=Sum('purchase_price'))['t'] or 0
        
        # Simple profit calculation for mock: assuming base margin of 40% minus expenses
        # In a real app, you would sum (selling price - cost price). Here we'll do sales - expenses
        d_profit = float(d_sales) - float(d_exp)
        
        period_sales += float(d_sales)
        period_expenses += float(d_exp)
        period_profit += float(d_profit)
        
        chart_data.append({
            'date': current.strftime('%b') + ' ' + str(current.day),
            'fullDate': current.strftime('%Y-%m-%d'),
            'sales': float(d_sales),
            'profit': float(d_profit),
            'expenses': float(d_exp)
        })
        current += timedelta(days=1)
        
    # Top Items for Period
    top_items = DishSale.objects.filter(timestamp__date__range=[start_date, end_date]).values('dish_name').annotate(
        qty=Sum('quantity'),
        revenue=Sum(models.F('quantity') * models.F('price_sold'), output_field=models.DecimalField())
    ).order_by('-qty')[:20]
    
    items_data = []
    for item in top_items:
        items_data.append({
            'name': item['dish_name'],
            'qty': item['qty'],
            'revenue': float(item['revenue']),
            'trend': 'up',
            'trendValue': 0
        })

    return Response({
        'today': today_stats,
        'period': {
            'chart_data': chart_data,
            'items_data': items_data,
            'summary': {
                'total_sales': float(period_sales),
                'total_profit': float(period_profit),
                'total_expenses': float(period_expenses)
            }
        },
        # Keep old keys to not break existing frontend during transition
        'total_revenue_today': float(today_revenue),
        'completed_orders_today': today_orders.count(),
        'active_orders': Order.objects.exclude(status='COMPLETED').count()
    })

# ============================================================
#  INVENTORY / EXPENSES
# ============================================================

from .serializers import InventoryPurchaseSerializer

@api_view(['GET', 'POST'])
def inventory_list(request):
    if request.method == 'GET':
        purchases = InventoryPurchase.objects.all().order_by('-timestamp')
        return Response(InventoryPurchaseSerializer(purchases, many=True).data)
    
    # POST
    item_name = request.data.get('item_name', '').strip()
    purchase_price = request.data.get('purchase_price')

    if not item_name or not purchase_price:
        return Response({'error': 'Item name and price are required'}, status=status.HTTP_400_BAD_REQUEST)

    # Validate price is a valid number
    try:
        purchase_price = Decimal(str(purchase_price))
        if purchase_price < 0:
            return Response({'error': 'Price cannot be negative.'},
                            status=status.HTTP_400_BAD_REQUEST)
    except (InvalidOperation, TypeError, ValueError):
        return Response({'error': 'Price must be a valid number.'},
                        status=status.HTTP_400_BAD_REQUEST)
        
    purchase = InventoryPurchase.objects.create(
        item_name=item_name,
        purchase_price=purchase_price,
        operator=request.user if request.user.is_authenticated else None
    )
    return Response(InventoryPurchaseSerializer(purchase).data, status=status.HTTP_201_CREATED)

@api_view(['POST'])
@transaction.atomic
def attach_whatsapp_customer(request, pk):
    try:
        order = Order.objects.get(pk=pk)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

    phone = request.data.get('phone')
    if not phone:
        return Response({'error': 'Phone number required'}, status=status.HTTP_400_BAD_REQUEST)

    # If already has this customer, do nothing
    if order.customer and order.customer.phone_number == phone:
        return Response(OrderSerializer(order).data)

    customer, _ = Customer.objects.get_or_create(phone_number=phone)
    loyalty, _ = LoyaltyAccount.objects.select_for_update().get_or_create(customer=customer)

    # Attach to order
    old_customer = order.customer
    order.customer = customer
    order.save()

    # If order is COMPLETED and previously had NO customer, grant the points now
    if order.status == 'COMPLETED' and not old_customer:
        veg_thalis = 0
        nonveg_thalis = 0
        for item in order.items.select_related('menu_item').all():
            if item.menu_item and item.menu_item.is_loyalty_eligible:
                if item.menu_item.item_type == 'veg':
                    veg_thalis += item.quantity
                else:
                    nonveg_thalis += item.quantity

        loyalty.veg_paid_count += veg_thalis
        if loyalty.veg_paid_count >= 10:
            loyalty.free_veg_balance += loyalty.veg_paid_count // 10
            loyalty.veg_paid_count %= 10
            
        loyalty.nonveg_paid_count += nonveg_thalis
        if loyalty.nonveg_paid_count >= 10:
            loyalty.free_nonveg_balance += loyalty.nonveg_paid_count // 10
            loyalty.nonveg_paid_count %= 10
            
        loyalty.save()

    return Response(OrderSerializer(order).data)
