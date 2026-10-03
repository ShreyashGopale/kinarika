from pos.models import Table  
print(list(Table.objects.values_list('name', flat=True)))  
