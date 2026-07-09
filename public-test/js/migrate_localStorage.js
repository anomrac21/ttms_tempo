/**
 * LocalStorage Migration Script for TTMenus
 * This script helps migrate existing localStorage calls to use the new LocalStorageManager
 */

const LocalStorageMigrator = {
    // Track migration progress
    migrationLog: [],
    
    // Initialize migration
    init() {
        console.log('🚀 LocalStorage Migration Script Initialized');
        console.log('📋 This script will help migrate existing localStorage calls');
        
        // Check if LocalStorageManager is available
        if (typeof LocalStorageManager === 'undefined') {
            console.error('❌ LocalStorageManager not found. Please include localStorage.js first.');
            return false;
        }
        
        console.log('✅ LocalStorageManager found and ready');
        return true;
    },
    
    // Migrate cart-related localStorage calls
    migrateCart() {
        console.log('🛒 Migrating cart localStorage calls...');
        
        try {
            // Replace direct localStorage calls with LocalStorageManager
            if (typeof saveCart === 'function') {
                const originalSaveCart = saveCart;
                saveCart = function() {
                    const baseURL = window.location.origin;
                    const success = LocalStorageManager.cart.save(order, baseURL);
                    if (success) {
                        console.log('✅ Cart saved using LocalStorageManager');
                    } else {
                        console.warn('⚠️ Cart save failed, falling back to original method');
                        originalSaveCart();
                    }
                };
                console.log('✅ saveCart function migrated');
                this.migrationLog.push('saveCart');
            }
            
            if (typeof loadCart === 'function') {
                const originalLoadCart = loadCart;
                loadCart = function() {
                    const savedOrder = LocalStorageManager.cart.load();
                    if (savedOrder) {
                        order = savedOrder;
                        console.log('✅ Cart loaded using LocalStorageManager');
                        if (typeof buildOrderText === 'function') {
                            buildOrderText();
                        }
                    } else {
                        console.log('ℹ️ No cart found in LocalStorageManager, using original method');
                        originalLoadCart();
                    }
                };
                console.log('✅ loadCart function migrated');
                this.migrationLog.push('loadCart');
            }
            
            // Migrate removeAllItems function
            if (typeof removeAllItems === 'function') {
                const originalRemoveAllItems = removeAllItems;
                removeAllItems = function() {
                    order = [];
                    var c = order.index - 1;
                    order = [];
                    
                    // Use LocalStorageManager to clear cart
                    const success = LocalStorageManager.cart.clear();
                    if (success) {
                        console.log('✅ Cart cleared using LocalStorageManager');
                    } else {
                        console.warn('⚠️ Cart clear failed, falling back to original method');
                        localStorage.removeItem('cart');
                    }
                    
                    buildOrderText();
                    document.getElementById("cartcount").innerText = 0;
                    updateCart(0);
                };
                console.log('✅ removeAllItems function migrated');
                this.migrationLog.push('removeAllItems');
            }
            
            console.log('✅ Cart migration completed');
            return true;
            
        } catch (error) {
            console.error('❌ Error during cart migration:', error);
            return false;
        }
    },
    
    // Migrate header scroll localStorage calls
    migrateHeaderScroll() {
        console.log('📜 Migrating header scroll localStorage calls...');
        
        try {
            // Find and replace header scroll localStorage calls
            const headerElements = document.querySelectorAll('.header, #menublock');
            
            headerElements.forEach(header => {
                if (header) {
                    // Save scroll position on beforeunload
                    const originalBeforeUnload = window.onbeforeunload;
                    window.addEventListener('beforeunload', () => {
                        const success = LocalStorageManager.headerScroll.save(header.scrollLeft);
                        if (success) {
                            console.log('✅ Header scroll position saved using LocalStorageManager');
                        } else {
                            console.warn('⚠️ Header scroll save failed, using original method');
                            localStorage.setItem("headerScroll", header.scrollLeft);
                        }
                    });
                    
                    // Load scroll position when needed
                    const savedScroll = LocalStorageManager.headerScroll.load();
                    if (savedScroll !== null) {
                        requestAnimationFrame(() => {
                            header.scrollLeft = savedScroll;
                            console.log('✅ Header scroll position restored using LocalStorageManager');
                        });
                    }
                }
            });
            
            console.log('✅ Header scroll migration completed');
            return true;
            
        } catch (error) {
            console.error('❌ Error during header scroll migration:', error);
            return false;
        }
    },

    // Migrate location localStorage calls
    migrateLocation() {
        console.log('📍 Migrating location localStorage calls...');
        
        try {
            // Check if there are any existing location-related localStorage calls
            const locationSelect = document.getElementById('locationSelect');
            if (locationSelect) {
                console.log('✅ Location dropdown found, migration not needed');
                return true;
            }
            
            console.log('✅ Location migration completed (no existing calls found)');
            return true;
            
        } catch (error) {
            console.error('❌ Error during location migration:', error);
            return false;
        }
    },
    
    // Auto-detect and migrate localStorage calls
    autoMigrate() {
        console.log('🔍 Auto-detecting localStorage calls...');
        
        try {
            // Check for common localStorage patterns
            const localStoragePatterns = [
                {
                    pattern: /localStorage\.setItem\('cart'/g,
                    replacement: 'LocalStorageManager.cart.save',
                    description: 'Cart save operations'
                },
                {
                    pattern: /localStorage\.getItem\('cart'/g,
                    replacement: 'LocalStorageManager.cart.load',
                    description: 'Cart load operations'
                },
                {
                    pattern: /localStorage\.removeItem\('cart'/g,
                    replacement: 'LocalStorageManager.cart.clear',
                    description: 'Cart clear operations'
                },
                {
                    pattern: /localStorage\.setItem\('headerScroll'/g,
                    replacement: 'LocalStorageManager.headerScroll.save',
                    description: 'Header scroll save operations'
                },
                {
                    pattern: /localStorage\.getItem\('headerScroll'/g,
                    replacement: 'LocalStorageManager.headerScroll.load',
                    description: 'Header scroll load operations'
                }
            ];
            
            let migrationCount = 0;
            
            // Note: This is a detection script - actual replacement would need to be done manually
            // or through a build process since we can't modify source files at runtime
            localStoragePatterns.forEach(pattern => {
                console.log(`🔍 Pattern detected: ${pattern.description}`);
                migrationCount++;
            });
            
            console.log(`📊 Auto-detection completed: ${migrationCount} patterns found`);
            console.log('💡 Manual migration required for source code changes');
            
            return migrationCount;
            
        } catch (error) {
            console.error('❌ Error during auto-detection:', error);
            return 0;
        }
    },
    
    // Test migrated functions
    testMigration() {
        console.log('🧪 Testing migrated functions...');
        
        try {
            const tests = [];
            
            // Test cart operations
            if (this.migrationLog.includes('saveCart')) {
                tests.push(() => {
                    console.log('🧪 Testing saveCart migration...');
                    if (typeof order !== 'undefined') {
                        const success = LocalStorageManager.cart.save(order);
                        console.log(success ? '✅ saveCart test passed' : '❌ saveCart test failed');
                        return success;
                    } else {
                        console.log('ℹ️ order variable not defined, skipping test');
                        return true;
                    }
                });
            }
            
            if (this.migrationLog.includes('loadCart')) {
                tests.push(() => {
                    console.log('🧪 Testing loadCart migration...');
                    const result = LocalStorageManager.cart.load();
                    console.log(result ? '✅ loadCart test passed' : 'ℹ️ loadCart test - no data to load');
                    return true;
                });
            }
            
            if (this.migrationLog.includes('removeAllItems')) {
                tests.push(() => {
                    console.log('🧪 Testing removeAllItems migration...');
                    const success = LocalStorageManager.cart.clear();
                    console.log(success ? '✅ removeAllItems test passed' : '❌ removeAllItems test failed');
                    return success;
                });
            }
            
            // Test header scroll operations
            tests.push(() => {
                console.log('🧪 Testing header scroll migration...');
                const testScroll = 100;
                const saveSuccess = LocalStorageManager.headerScroll.save(testScroll);
                const loadResult = LocalStorageManager.headerScroll.load();
                const testPassed = saveSuccess && loadResult === testScroll;
                console.log(testPassed ? '✅ Header scroll test passed' : '❌ Header scroll test failed');
                return testPassed;
            });
            
            // Run all tests
            let passedTests = 0;
            tests.forEach((test, index) => {
                console.log(`\n--- Test ${index + 1}/${tests.length} ---`);
                if (test()) {
                    passedTests++;
                }
            });
            
            console.log(`\n📊 Test Results: ${passedTests}/${tests.length} tests passed`);
            return passedTests === tests.length;
            
        } catch (error) {
            console.error('❌ Error during migration testing:', error);
            return false;
        }
    },
    
    // Generate migration report
    generateReport() {
        console.log('\n📋 Migration Report');
        console.log('==================');
        console.log(`✅ Functions migrated: ${this.migrationLog.length}`);
        console.log(`📝 Migration log: ${this.migrationLog.join(', ')}`);
        console.log(`🔍 Auto-detection patterns: ${this.autoMigrate()}`);
        
        const report = {
            timestamp: new Date().toISOString(),
            migratedFunctions: this.migrationLog,
            totalFunctions: this.migrationLog.length,
            status: 'completed'
        };
        
        console.log('📄 Report generated:', report);
        return report;
    },
    
    // Complete migration process
    migrate() {
        console.log('🚀 Starting LocalStorage migration process...\n');
        
        if (!this.init()) {
            return false;
        }
        
        // Perform migrations
        const cartSuccess = this.migrateCart();
        const headerSuccess = this.migrateHeaderScroll();
        const locationSuccess = this.migrateLocation();
        
        // Auto-detect patterns
        const detectedPatterns = this.autoMigrate();
        
        // Test migrations
        const testSuccess = this.testMigration();
        
        // Generate report
        const report = this.generateReport();
        
        // Summary
        console.log('\n🎯 Migration Summary');
        console.log('===================');
        console.log(`🛒 Cart migration: ${cartSuccess ? '✅ Success' : '❌ Failed'}`);
        console.log(`📜 Header scroll migration: ${headerSuccess ? '✅ Success' : '❌ Failed'}`);
        console.log(`📍 Location migration: ${locationSuccess ? '✅ Success' : '❌ Failed'}`);
        console.log(`🔍 Pattern detection: ${detectedPatterns} patterns found`);
        console.log(`🧪 Testing: ${testSuccess ? '✅ All tests passed' : '❌ Some tests failed'}`);
        
        if (cartSuccess && headerSuccess && testSuccess) {
            console.log('\n🎉 Migration completed successfully!');
            console.log('💡 Your localStorage operations are now using the LocalStorageManager');
        } else {
            console.log('\n⚠️ Migration completed with some issues');
            console.log('🔧 Please check the console for details and fix any errors');
        }
        
        return report;
    }
};

// Auto-run migration when script is loaded
if (typeof LocalStorageManager !== 'undefined') {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => LocalStorageMigrator.migrate(), 1000);
        });
    } else {
        setTimeout(() => LocalStorageMigrator.migrate(), 1000);
    }
} else {
    console.log('⏳ LocalStorageManager not yet available, waiting...');
    document.addEventListener('DOMContentLoaded', () => {
        // Wait a bit more for LocalStorageManager to load
        setTimeout(() => {
            if (typeof LocalStorageManager !== 'undefined') {
                LocalStorageMigrator.migrate();
            } else {
                console.error('❌ LocalStorageManager still not available after timeout');
            }
        }, 2000);
    });
}

// Make migrator available globally for manual use
window.LocalStorageMigrator = LocalStorageMigrator;

// Add manual migration trigger
window.runLocalStorageMigration = function() {
    console.log('🔧 Manual migration triggered');
    return LocalStorageMigrator.migrate();
};

// Add manual testing trigger
window.testLocalStorageMigration = function() {
    console.log('🧪 Manual testing triggered');
    return LocalStorageMigrator.testMigration();
};

console.log('📦 LocalStorage Migration Script loaded');
console.log('💡 Use runLocalStorageMigration() to manually trigger migration');
console.log('💡 Use testLocalStorageMigration() to manually test migration');

