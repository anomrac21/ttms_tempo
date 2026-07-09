/**
 * Centralized LocalStorage Handler for TTMenus
 * This file consolidates all localStorage operations used across the application
 */

const LocalStorageManager = {
    // Storage keys
    KEYS: {
        MENU: 'menu',
        CART: 'cart',
        HEADER_SCROLL: 'headerScroll',
        USER_PREFERENCES: 'userPreferences',
        LOCATION_HISTORY: 'locationHistory',
        ORDER_HISTORY: 'orderHistory'
    },

    // Cart operations
    cart: {
        /**
         * Save cart data to localStorage
         * @param {Array} order - The order array to save
         * @param {string} baseURL - The base URL for menu validation
         */
        save(order, baseURL = null) {
            try {
                if (!baseURL) {
                    baseURL = window.location.origin;
                }
                
                localStorage.setItem(LocalStorageManager.KEYS.MENU, JSON.stringify(baseURL));
                localStorage.setItem(LocalStorageManager.KEYS.CART, JSON.stringify(order));
                
                console.log('🛒 Cart saved to localStorage:', order);
                return true;
            } catch (error) {
                console.error('❌ Error saving cart to localStorage:', error);
                return false;
            }
        },

        /**
         * Load cart data from localStorage
         * @param {string} baseURL - The base URL to validate against
         * @returns {Array|null} The loaded order array or null if not found/invalid
         */
        load(baseURL = null) {
            try {
                if (!baseURL) {
                    baseURL = window.location.origin;
                }

                const savedMenu = localStorage.getItem(LocalStorageManager.KEYS.MENU);
                if (savedMenu === JSON.stringify(baseURL)) {
                    const savedCart = localStorage.getItem(LocalStorageManager.KEYS.CART);
                    if (savedCart) {
                        const order = JSON.parse(savedCart);
                        console.log('🛒 Cart loaded from localStorage:', order);
                        return order;
                    }
                }
                
                console.log('🛒 No valid cart found in localStorage');
                return null;
            } catch (error) {
                console.error('❌ Error loading cart from localStorage:', error);
                return null;
            }
        },

        /**
         * Clear cart data from localStorage
         */
        clear() {
            try {
                localStorage.removeItem(LocalStorageManager.KEYS.CART);
                console.log('🛒 Cart cleared from localStorage');
                return true;
            } catch (error) {
                console.error('❌ Error clearing cart from localStorage:', error);
                return false;
            }
        },

        /**
         * Check if cart exists in localStorage
         * @param {string} baseURL - The base URL to validate against
         * @returns {boolean} True if cart exists and is valid
         */
        exists(baseURL = null) {
            try {
                if (!baseURL) {
                    baseURL = window.location.origin;
                }

                const savedMenu = localStorage.getItem(LocalStorageManager.KEYS.MENU);
                const savedCart = localStorage.getItem(LocalStorageManager.KEYS.CART);
                
                return savedMenu === JSON.stringify(baseURL) && savedCart !== null;
            } catch (error) {
                console.error('❌ Error checking cart existence:', error);
                return false;
            }
        }
    },

    // Header scroll operations
    headerScroll: {
        /**
         * Save header scroll position
         * @param {number} scrollLeft - The scroll position to save
         */
        save(scrollLeft) {
            try {
                localStorage.setItem(LocalStorageManager.KEYS.HEADER_SCROLL, scrollLeft.toString());
                console.log('📜 Header scroll position saved:', scrollLeft);
                return true;
            } catch (error) {
                console.error('❌ Error saving header scroll position:', error);
                return false;
            }
        },

        /**
         * Load header scroll position
         * @returns {number|null} The saved scroll position or null if not found
         */
        load() {
            try {
                const savedScroll = localStorage.getItem(LocalStorageManager.KEYS.HEADER_SCROLL);
                if (savedScroll !== null) {
                    const scrollPosition = parseInt(savedScroll, 10);
                    console.log('📜 Header scroll position loaded:', scrollPosition);
                    return scrollPosition;
                }
                return null;
            } catch (error) {
                console.error('❌ Error loading header scroll position:', error);
                return null;
            }
        },

        /**
         * Clear header scroll position
         */
        clear() {
            try {
                localStorage.removeItem(LocalStorageManager.KEYS.HEADER_SCROLL);
                console.log('📜 Header scroll position cleared');
                return true;
            } catch (error) {
                console.error('❌ Error clearing header scroll position:', error);
                return false;
            }
        }
    },

    // User preferences operations
    preferences: {
        /**
         * Save user preferences
         * @param {Object} preferences - The preferences object to save
         */
        save(preferences) {
            try {
                localStorage.setItem(LocalStorageManager.KEYS.USER_PREFERENCES, JSON.stringify(preferences));
                console.log('⚙️ User preferences saved:', preferences);
                return true;
            } catch (error) {
                console.error('❌ Error saving user preferences:', error);
                return false;
            }
        },

        /**
         * Load user preferences
         * @returns {Object|null} The saved preferences or null if not found
         */
        load() {
            try {
                const savedPreferences = localStorage.getItem(LocalStorageManager.KEYS.USER_PREFERENCES);
                if (savedPreferences) {
                    const preferences = JSON.parse(savedPreferences);
                    console.log('⚙️ User preferences loaded:', preferences);
                    return preferences;
                }
                return null;
            } catch (error) {
                console.error('❌ Error loading user preferences:', error);
                return null;
            }
        },

        /**
         * Update specific preference
         * @param {string} key - The preference key to update
         * @param {*} value - The new value
         */
        update(key, value) {
            try {
                const currentPreferences = this.load() || {};
                currentPreferences[key] = value;
                this.save(currentPreferences);
                console.log(`⚙️ Preference updated: ${key} = ${value}`);
                return true;
            } catch (error) {
                console.error('❌ Error updating preference:', error);
                return false;
            }
        },

        /**
         * Get specific preference value
         * @param {string} key - The preference key
         * @param {*} defaultValue - Default value if preference not found
         * @returns {*} The preference value or default
         */
        get(key, defaultValue = null) {
            try {
                const preferences = this.load();
                return preferences && preferences[key] !== undefined ? preferences[key] : defaultValue;
            } catch (error) {
                console.error('❌ Error getting preference:', error);
                return defaultValue;
            }
        }
    },

    // Location history operations
    locationHistory: {
        /**
         * Save location to history
         * @param {Object} locationData - The location data to save
         * @param {number} maxHistory - Maximum number of locations to keep (default: 10)
         */
        save(locationData, maxHistory = 10) {
            try {
                const currentHistory = this.load() || [];
                
                // Remove duplicate if exists
                const filteredHistory = currentHistory.filter(item => 
                    item.address !== locationData.address
                );
                
                // Add new location to beginning
                filteredHistory.unshift({
                    ...locationData,
                    timestamp: Date.now()
                });
                
                // Keep only the most recent locations
                if (filteredHistory.length > maxHistory) {
                    filteredHistory.splice(maxHistory);
                }
                
                localStorage.setItem(LocalStorageManager.KEYS.LOCATION_HISTORY, JSON.stringify(filteredHistory));
                console.log('📍 Location saved to history:', locationData.address);
                return true;
            } catch (error) {
                console.error('❌ Error saving location to history:', error);
                return false;
            }
        },

        /**
         * Load location history
         * @returns {Array} Array of saved locations
         */
        load() {
            try {
                const savedHistory = localStorage.getItem(LocalStorageManager.KEYS.LOCATION_HISTORY);
                if (savedHistory) {
                    const history = JSON.parse(savedHistory);
                    console.log('📍 Location history loaded:', history.length, 'locations');
                    return history;
                }
                return [];
            } catch (error) {
                console.error('❌ Error loading location history:', error);
                return [];
            }
        },

        /**
         * Clear location history
         */
        clear() {
            try {
                localStorage.removeItem(LocalStorageManager.KEYS.LOCATION_HISTORY);
                console.log('📍 Location history cleared');
                return true;
            } catch (error) {
                console.error('❌ Error clearing location history:', error);
                return false;
            }
        }
    },

    // Location operations
    location: {
        /**
         * Save selected location
         * @param {string} whatsappNumber - The WhatsApp number of the selected location
         */
        save(whatsappNumber) {
            try {
                localStorage.setItem('ttms_selected_location', whatsappNumber);
                console.log('📍 Location saved to localStorage:', whatsappNumber);
                return true;
            } catch (error) {
                console.error('❌ Error saving location to localStorage:', error);
                return false;
            }
        },

        /**
         * Load selected location
         * @returns {string|null} The saved WhatsApp number or null if not found
         */
        load() {
            try {
                const savedLocation = localStorage.getItem('ttms_selected_location');
                if (savedLocation && savedLocation.trim() !== '') {
                    console.log('📍 Location loaded from localStorage:', savedLocation);
                    return savedLocation;
                }
                return null;
            } catch (error) {
                console.error('❌ Error loading location from localStorage:', error);
                return null;
            }
        },

        /**
         * Clear selected location
         */
        clear() {
            try {
                localStorage.removeItem('ttms_selected_location');
                console.log('🗑️ Location cleared from localStorage');
                return true;
            } catch (error) {
                console.error('❌ Error clearing location from localStorage:', error);
                return false;
            }
        },

        /**
         * Check if location exists in localStorage
         * @returns {boolean} True if location exists
         */
        exists() {
            try {
                const savedLocation = localStorage.getItem('ttms_selected_location');
                return savedLocation !== null && savedLocation.trim() !== '';
            } catch (error) {
                console.error('❌ Error checking location existence:', error);
                return false;
            }
        }
    },

    // Order history operations
    orderHistory: {
        /**
         * Save completed order to history
         * @param {Object} orderData - The order data to save
         * @param {number} maxHistory - Maximum number of orders to keep (default: 20)
         */
        save(orderData, maxHistory = 20) {
            try {
                const currentHistory = this.load() || [];
                
                // Add new order to beginning
                currentHistory.unshift({
                    ...orderData,
                    timestamp: Date.now(),
                    orderId: this.generateOrderId()
                });
                
                // Keep only the most recent orders
                if (currentHistory.length > maxHistory) {
                    currentHistory.splice(maxHistory);
                }
                
                localStorage.setItem(LocalStorageManager.KEYS.ORDER_HISTORY, JSON.stringify(currentHistory));
                console.log('📋 Order saved to history:', orderData);
                return true;
            } catch (error) {
                console.error('❌ Error saving order to history:', error);
                return false;
            }
        },

        /**
         * Load order history
         * @returns {Array} Array of saved orders
         */
        load() {
            try {
                const savedHistory = localStorage.getItem(LocalStorageManager.KEYS.ORDER_HISTORY);
                if (savedHistory) {
                    const history = JSON.parse(savedHistory);
                    console.log('📋 Order history loaded:', history.length, 'orders');
                    return history;
                }
                return [];
            } catch (error) {
                console.error('❌ Error loading order history:', error);
                return [];
            }
        },

        /**
         * Clear order history
         */
        clear() {
            try {
                localStorage.removeItem(LocalStorageManager.KEYS.ORDER_HISTORY);
                console.log('📋 Order history cleared');
                return true;
            } catch (error) {
                console.error('❌ Error clearing order history:', error);
                return false;
            }
        },

        /**
         * Generate unique order ID
         * @returns {string} Unique order ID
         */
        generateOrderId() {
            return 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        }
    },

    // Utility functions
    utils: {
        /**
         * Check if localStorage is available
         * @returns {boolean} True if localStorage is available
         */
        isAvailable() {
            try {
                const test = 'test';
                localStorage.setItem(test, test);
                localStorage.removeItem(test);
                return true;
            } catch (e) {
                return false;
            }
        },

        /**
         * Get localStorage usage statistics
         * @returns {Object} Usage statistics
         */
        getUsageStats() {
            try {
                let totalSize = 0;
                const stats = {};
                
                for (let key in localStorage) {
                    if (localStorage.hasOwnProperty(key)) {
                        const itemSize = localStorage[key].length;
                        totalSize += itemSize;
                        stats[key] = {
                            size: itemSize,
                            sizeKB: (itemSize / 1024).toFixed(2)
                        };
                    }
                }
                
                return {
                    totalSize,
                    totalSizeKB: (totalSize / 1024).toFixed(2),
                    itemCount: Object.keys(stats).length,
                    details: stats
                };
            } catch (error) {
                console.error('❌ Error getting usage stats:', error);
                return null;
            }
        },

        /**
         * Clear all localStorage data
         */
        clearAll() {
            try {
                localStorage.clear();
                console.log('🗑️ All localStorage data cleared');
                return true;
            } catch (error) {
                console.error('❌ Error clearing all localStorage data:', error);
                return false;
            }
        },

        /**
         * Export localStorage data as JSON
         * @returns {string} JSON string of all localStorage data
         */
        exportData() {
            try {
                const data = {};
                for (let key in localStorage) {
                    if (localStorage.hasOwnProperty(key)) {
                        try {
                            data[key] = JSON.parse(localStorage[key]);
                        } catch (e) {
                            data[key] = localStorage[key];
                        }
                    }
                }
                return JSON.stringify(data, null, 2);
            } catch (error) {
                console.error('❌ Error exporting localStorage data:', error);
                return null;
            }
        },

        /**
         * Import localStorage data from JSON
         * @param {string} jsonData - JSON string of localStorage data
         * @returns {boolean} True if import successful
         */
        importData(jsonData) {
            try {
                const data = JSON.parse(jsonData);
                for (let key in data) {
                    if (data.hasOwnProperty(key)) {
                        if (typeof data[key] === 'object') {
                            localStorage.setItem(key, JSON.stringify(data[key]));
                        } else {
                            localStorage.setItem(key, data[key]);
                        }
                    }
                }
                console.log('📥 localStorage data imported successfully');
                return true;
            } catch (error) {
                console.error('❌ Error importing localStorage data:', error);
                return false;
            }
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LocalStorageManager;
} else {
    // Make available globally
    window.LocalStorageManager = LocalStorageManager;
}

// Hub app.js / loader.js expect TTMSStorage (ttmenus-main localStorage.js API subset)
(function () {
    if (typeof window.TTMSStorage !== 'undefined') {
        return;
    }
    window.TTMSStorage = {
        get: function (key, defaultValue) {
            try {
                var val = localStorage.getItem(key);
                return val !== null && val !== '' ? val : defaultValue;
            } catch (e) {
                return defaultValue;
            }
        },
        set: function (key, value) {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (e) {
                return false;
            }
        },
        has: function (key) {
            try {
                return localStorage.getItem(key) !== null;
            } catch (e) {
                return false;
            }
        },
        getTheme: function () {
            return this.get('theme', 'light');
        },
        setTheme: function (theme) {
            var ok = this.set('theme', theme);
            try {
                window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: theme } }));
            } catch (e2) {}
            return ok;
        },
        init: function () {}
    };
})();

// Initialize and check availability
document.addEventListener('DOMContentLoaded', function() {
    if (!LocalStorageManager.utils.isAvailable()) {
        console.warn('⚠️ localStorage is not available in this browser');
    } else {
        console.log('✅ LocalStorageManager initialized successfully');
        
        // Log usage stats in development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            const stats = LocalStorageManager.utils.getUsageStats();
            console.log('📊 localStorage usage stats:', stats);
        }
    }
});

// Add testing functions for development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.testLocalStorage = function() {
        console.log('🧪 TESTING: LocalStorage Manager');
        console.log('📍 Available:', LocalStorageManager.utils.isAvailable());
        console.log('📊 Usage stats:', LocalStorageManager.utils.getUsageStats());
        console.log('🛒 Cart exists:', LocalStorageManager.cart.exists());
        console.log('📜 Header scroll:', LocalStorageManager.headerScroll.load());
        console.log('⚙️ Preferences:', LocalStorageManager.preferences.load());
        console.log('📍 Selected location:', LocalStorageManager.location.load());
        console.log('📍 Location history:', LocalStorageManager.locationHistory.load());
        console.log('📋 Order history:', LocalStorageManager.orderHistory.load());
    };
    
    window.clearAllLocalStorage = function() {
        if (confirm('Are you sure you want to clear all localStorage data?')) {
            LocalStorageManager.utils.clearAll();
            console.log('✅ All localStorage data cleared');
        }
    };
}

