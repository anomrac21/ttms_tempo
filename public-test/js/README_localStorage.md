# LocalStorage Manager for TTMenus

## Overview

The `LocalStorageManager` is a centralized handler for all localStorage operations used across the TTMenus application. It consolidates scattered localStorage calls into a single, maintainable module with proper error handling and logging.

## Features

- **Centralized Management**: All localStorage operations in one place
- **Error Handling**: Comprehensive error handling with try-catch blocks
- **Logging**: Detailed console logging for debugging
- **Type Safety**: JSDoc documentation for all functions
- **Utility Functions**: Helper functions for data management
- **Testing Support**: Built-in testing functions for development

## Structure

```javascript
LocalStorageManager
├── KEYS                    // Storage key constants
├── cart                    // Cart operations
├── headerScroll           // Header scroll position
├── location               // Selected location
├── preferences            // User preferences
├── locationHistory        // Location history
├── orderHistory          // Order history
└── utils                  // Utility functions
```

## Usage Examples

### Cart Operations

```javascript
// Save cart
LocalStorageManager.cart.save(orderArray);

// Load cart
const savedOrder = LocalStorageManager.cart.load();

// Check if cart exists
const hasCart = LocalStorageManager.cart.exists();

// Clear cart
LocalStorageManager.cart.clear();
```

### Header Scroll Operations

```javascript
// Save scroll position
LocalStorageManager.headerScroll.save(scrollLeft);

// Load scroll position
const savedScroll = LocalStorageManager.headerScroll.load();

// Clear scroll position
LocalStorageManager.headerScroll.clear();
```

### Location Operations

```javascript
// Save selected location
LocalStorageManager.location.save(whatsappNumber);

// Load selected location
const savedLocation = LocalStorageManager.location.load();

// Check if location exists
const hasLocation = LocalStorageManager.location.exists();

// Clear selected location
LocalStorageManager.location.clear();
```

### User Preferences

```javascript
// Save preferences
LocalStorageManager.preferences.save({
    theme: 'dark',
    language: 'en',
    notifications: true
});

// Load preferences
const prefs = LocalStorageManager.preferences.load();

// Update specific preference
LocalStorageManager.preferences.update('theme', 'light');

// Get specific preference
const theme = LocalStorageManager.preferences.get('theme', 'default');
```

### Location History

```javascript
// Save location
LocalStorageManager.locationHistory.save({
    address: '123 Main St',
    lat: '40.7128',
    lng: '-74.0060'
});

// Load history
const locations = LocalStorageManager.locationHistory.load();

// Clear history
LocalStorageManager.locationHistory.clear();
```

### Order History

```javascript
// Save completed order
LocalStorageManager.orderHistory.save({
    items: ['Burger', 'Fries'],
    total: 15.99,
    location: 'Downtown'
});

// Load history
const orders = LocalStorageManager.orderHistory.load();

// Clear history
LocalStorageManager.orderHistory.clear();
```

### Utility Functions

```javascript
// Check availability
const isAvailable = LocalStorageManager.utils.isAvailable();

// Get usage statistics
const stats = LocalStorageManager.utils.getUsageStats();

// Export all data
const exportedData = LocalStorageManager.utils.exportData();

// Import data
LocalStorageManager.utils.importData(jsonString);

// Clear all data
LocalStorageManager.utils.clearAll();
```

## Migration Guide

### From Direct localStorage Calls

**Before:**
```javascript
// Old way
localStorage.setItem('cart', JSON.stringify(order));
localStorage.setItem('menu', JSON.stringify(baseURL));

const savedCart = localStorage.getItem('cart');
if (savedCart) {
    order = JSON.parse(savedCart);
}
```

**After:**
```javascript
// New way
LocalStorageManager.cart.save(order);

const savedOrder = LocalStorageManager.cart.load();
if (savedOrder) {
    order = savedOrder;
}
```

### From Header Scroll Functions

**Before:**
```javascript
// Old way
localStorage.setItem("headerScroll", header.scrollLeft);

const savedScroll = localStorage.getItem("headerScroll");
if (savedScroll !== null) {
    header.scrollLeft = savedScroll;
}
```

**After:**
```javascript
// New way
LocalStorageManager.headerScroll.save(header.scrollLeft);

const savedScroll = LocalStorageManager.headerScroll.load();
if (savedScroll !== null) {
    header.scrollLeft = savedScroll;
}
```

## Testing Functions

In development mode (localhost), the following testing functions are available:

```javascript
// Test all localStorage operations
testLocalStorage();

// Clear all localStorage data
clearAllLocalStorage();
```

## Error Handling

All functions include comprehensive error handling:

- **Try-catch blocks** around all localStorage operations
- **Console logging** for successful operations and errors
- **Return values** indicating success/failure
- **Graceful fallbacks** when localStorage is unavailable

## Browser Compatibility

The manager automatically detects localStorage availability and provides appropriate warnings if it's not supported.

## Performance Considerations

- **Lazy loading**: Data is only loaded when requested
- **Efficient storage**: Automatic cleanup of old data
- **Memory management**: Configurable limits for history items

## Best Practices

1. **Always check return values** from save/load operations
2. **Use the utility functions** for bulk operations
3. **Handle errors gracefully** in your application code
4. **Use appropriate storage keys** from the KEYS constant
5. **Test localStorage availability** before critical operations

## Integration

To use this manager in your HTML files, include the script:

```html
<script src="/js/localStorage.js"></script>
```

The manager will automatically initialize when the DOM is ready and make `LocalStorageManager` available globally.

## Support

For issues or questions about the LocalStorage Manager, check the browser console for detailed logging and error messages.

