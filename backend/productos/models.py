from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class Location(models.Model):
    zone = models.CharField(max_length=35)
    aisle = models.CharField(max_length=35)
    shelf = models.CharField(max_length=35)

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["zone", "aisle", "shelf"], name="unique_warehouse_location",
        )]

    def __str__(self):
        return f"{self.zone} / {self.aisle} / {self.shelf}"


class Product(models.Model):
    sku = models.CharField(max_length=50, unique=True)
    barcode = models.CharField(max_length=64, unique=True, null=True, blank=True)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="products", null=True, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    stock = models.PositiveIntegerField(default=0, editable=False)
    minimum_stock = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.CheckConstraint(
            condition=models.Q(price__gte=0), name="product_nonnegative_price",
        )]

    def __str__(self):
        return f"{self.sku} · {self.name}"
