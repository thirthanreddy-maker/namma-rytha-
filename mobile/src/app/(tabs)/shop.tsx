import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, useColorScheme, FlatList, TextInput } from 'react-native';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { useAuth } from '../_layout';
import { GlassCard } from '../../components/GlassCard';
import { ShoppingCart, Trash2, Search, X } from 'lucide-react-native';

export default function ShopScreen() {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const colors = Colors[scheme];
  const { user } = useAuth();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  const [cart, setCart] = useState<any[]>([]);
  const [showCart, setShowCart] = useState(false);

  const defaultProducts = [
    { id: '1', name: 'Mini Power Tiller', category: 'Tractors', price: 45000, image: '🚜', brand: 'Mahindra', rating: 4.8 },
    { id: '2', name: 'NPK 19-19-19 Fertilizer', category: 'Sprayers', price: 950, image: '🧪', brand: 'IFFCO', rating: 4.7 },
    { id: '3', name: 'Hand Cultivator Hoe', category: 'Hand Tools', price: 399, image: '🔨', brand: 'Falcon', rating: 4.5 },
    { id: '4', name: 'Knapsack Battery Sprayer', category: 'Sprayers', price: 3200, image: '🎒', brand: 'Aspee', rating: 4.6 },
    { id: '5', name: 'Harvesting Sickle', category: 'Harvesting', price: 199, image: '🌾', brand: 'Tata Agrico', rating: 4.4 },
    { id: '6', name: 'Soil PH Moisture Meter', category: 'Smart Accessories', price: 1250, image: '📟', brand: 'AgriSense', rating: 4.9 },
  ];

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await api.getProducts();
      if (Array.isArray(data) && data.length > 0) {
        setProducts(data);
      } else {
        setProducts(defaultProducts);
      }
    } catch (e) {
      console.log('Error loading products from server:', e);
      setProducts(defaultProducts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const categories = ['All', 'Tractors', 'Sprayers', 'Hand Tools', 'Harvesting', 'Smart Accessories'];

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product: any) => {
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        )
      );
    } else {
      setCart([...cart, { product, qty: 1 }]);
    }
    Alert.alert('Added', `${product.name} added to cart!`);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  const updateQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(
      cart.map((item) =>
        item.product.id === productId ? { ...item, qty: newQty } : item
      )
    );
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  };

  const handleCheckout = async () => {
    if (!user) return;
    if (cart.length === 0) {
      Alert.alert('Empty', 'Your cart is empty');
      return;
    }

    try {
      setLoading(true);
      const itemsList = cart.map((c) => ({
        id: c.product.id,
        name: c.product.name,
        qty: c.qty,
        price: c.product.price,
      }));

      await api.createOrder({
        userId: user.id,
        userName: user.name || 'Farmer',
        items: JSON.stringify(itemsList),
        total: getCartTotal(),
      });

      await api.logActivity({
        userId: user.id,
        userName: user.name || 'Farmer',
        action: 'purchase',
        details: `Ordered ${cart.length} items from Rytha Marketplace for ₹${getCartTotal()}`,
      });

      setCart([]);
      setShowCart(false);
      Alert.alert('Success', 'Order placed successfully! Delivery updates will be sent via WhatsApp.');
    } catch (e) {
      Alert.alert('Checkout Failed', 'Unable to submit order.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.searchHeader, { backgroundColor: colors.backgroundElement, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Search size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search farm equipment, fertilizers..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.catBtn,
                { backgroundColor: selectedCategory === cat ? colors.primary : colors.background },
                selectedCategory === cat ? {} : { borderColor: colors.border, borderWidth: 1 }
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.catText, { color: selectedCategory === cat ? '#050a05' : colors.text }]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <GlassCard style={styles.productCard}>
              <View style={styles.imageBox}>
                <Text style={styles.productEmoji}>{item.image || '📦'}</Text>
              </View>
              <Text style={[styles.productName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.productBrand, { color: colors.textSecondary }]}>
                {item.brand || 'Generic'}
              </Text>
              <View style={styles.priceRow}>
                <Text style={[styles.productPrice, { color: colors.primary }]}>
                  ₹{item.price.toLocaleString('en-IN')}
                </Text>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: colors.primary }]}
                  onPress={() => addToCart(item)}
                >
                  <Text style={styles.addText}>+</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          )}
        />
      )}

      {cart.length > 0 && (
        <TouchableOpacity
          style={[styles.cartFab, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
          onPress={() => setShowCart(true)}
        >
          <ShoppingCart size={24} color="#050a05" />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{cart.reduce((sum, item) => sum + item.qty, 0)}</Text>
          </View>
        </TouchableOpacity>
      )}

      {showCart && (
        <View style={[styles.cartModal, { backgroundColor: colors.backgroundElement, borderTopColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Shopping Cart</Text>
            <TouchableOpacity onPress={() => setShowCart(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.cartItemsScroll}>
            {cart.map((item) => (
              <View key={item.product.id} style={[styles.cartItem, { borderBottomColor: colors.border }]}>
                <Text style={styles.itemEmoji}>{item.product.image || '📦'}</Text>
                <View style={styles.itemMeta}>
                  <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                    {item.product.name}
                  </Text>
                  <Text style={[styles.itemPrice, { color: colors.primary }]}>
                    ₹{(item.product.price * item.qty).toLocaleString('en-IN')}
                  </Text>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={[styles.qtyBtn, { borderColor: colors.border }]}
                      onPress={() => updateQty(item.product.id, item.qty - 1)}
                    >
                      <Text style={[styles.qtyText, { color: colors.text }]}>-</Text>
                    </TouchableOpacity>
                    <Text style={[styles.qtyVal, { color: colors.text }]}>{item.qty}</Text>
                    <TouchableOpacity
                      style={[styles.qtyBtn, { borderColor: colors.border }]}
                      onPress={() => updateQty(item.product.id, item.qty + 1)}
                    >
                      <Text style={[styles.qtyText, { color: colors.text }]}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity onPress={() => removeFromCart(item.product.id)} style={styles.trashBtn}>
                  <Trash2 size={20} color="#f87171" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.checkoutBox, { borderTopColor: colors.border }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Total Amount:</Text>
              <Text style={[styles.totalVal, { color: colors.text }]}>
                ₹{getCartTotal().toLocaleString('en-IN')}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.checkoutBtn, { backgroundColor: colors.primary }]}
              onPress={handleCheckout}
            >
              <Text style={styles.checkoutText}>Place Order (COD/UPI)</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchHeader: {
    padding: 16,
    borderBottomWidth: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  catScroll: {
    flexDirection: 'row',
  },
  catBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    justifyContent: 'center',
  },
  catText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 8,
    paddingBottom: 80,
  },
  productCard: {
    flex: 1,
    margin: 8,
    padding: 12,
    borderRadius: 16,
  },
  imageBox: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginBottom: 8,
  },
  productEmoji: {
    fontSize: 48,
  },
  productName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  productBrand: {
    fontSize: 11,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addText: {
    color: '#050a05',
    fontWeight: 'bold',
    fontSize: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#f87171',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cartModal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    borderTopWidth: 1.5,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    elevation: 20,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    zIndex: 100,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  cartItemsScroll: {
    flex: 1,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  itemEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  itemMeta: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '500',
    marginVertical: 2,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  qtyVal: {
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: 'bold',
  },
  trashBtn: {
    padding: 8,
  },
  checkoutBox: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  totalVal: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  checkoutBtn: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkoutText: {
    color: '#050a05',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
