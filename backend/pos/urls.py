from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path('auth/login/', views.api_login),
    path('auth/logout/', views.api_logout),
    path('auth/session/', views.api_session),

    # Tables
    path('tables/', views.tables_list),
    path('tables/<int:pk>/', views.table_detail),

    # Menu
    path('menu/categories/', views.menu_categories),
    path('menu/items/', views.menu_items),
    path('menu/items/all/', views.menu_items_all),
    path('menu/items/<int:pk>/toggle/', views.toggle_menu_item),
    path('menu/items/bulk/', views.bulk_toggle_menu),
    path('menu/items/create/', views.create_menu_item),
    path('menu/items/<int:pk>/edit/', views.edit_menu_item),

    # Orders
    path('orders/', views.create_order),
    path('orders/active/', views.active_orders),
    path('orders/completed/', views.completed_orders),
    path('orders/<int:pk>/', views.order_detail),
    path('orders/<int:pk>/items/', views.add_items_to_order),
    path('orders/<int:pk>/items/<int:item_pk>/', views.update_order_item),
    path('orders/<int:pk>/status/', views.update_order_status),

    # Billing
    path('billing/<int:pk>/complete/', views.complete_bill),
    path('orders/<int:pk>/attach_customer/', views.attach_whatsapp_customer),

    # Loyalty
    path('loyalty/<str:phone>/', views.get_customer_loyalty),

    # Dashboard
    path('dashboard/', views.dashboard_stats),
    
    # Inventory
    path('inventory/', views.inventory_list),
]
