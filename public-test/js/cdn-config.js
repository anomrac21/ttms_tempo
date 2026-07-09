/**
 * TT Menus CDN Configuration
 * 
 * This file configures the connection to the TT Menus CDN API
 * for icon loading and other static resources.
 * 
 * Usage: Include this file BEFORE update-ui.js in your HTML:
 * <script src="/js/cdn-config.js"></script>
 * <script src="/js/update-ui.js"></script>
 */

(function() {
  'use strict';
  
  // CDN Configuration
  const CDN_CONFIG = {
    // Base URL for the TT Menus CDN
    // For local testing: Set to 'http://localhost:1313' if running CDN locally
    // For production: Use 'https://cdn.ttmenus.com'
    baseUrl: window.location.hostname === 'localhost' 
      ? 'https://cdn.ttmenus.com'  // Try production CDN even in local dev
      : 'https://cdn.ttmenus.com',
    
    // API endpoints
    endpoints: {
      listIcons: '/api/list-icons/index.json',  // Explicit index.json for Hugo compatibility
      // CDN static/icons: ui/, socialmedia/, food/, drink/, business/, … — use getIconUrl(category, filename)
      icons: '/icons/',
      css: '/css/',
      js: '/js/',
      branding: '/branding/',
      plugins: '/plugins/',
      sounds: '/sounds/'
    },
    
    // Helper methods
    getIconsApiUrl() {
      return `${this.baseUrl}${this.endpoints.listIcons}`;
    },
    
    getIconUrl(category, filename) {
      return `${this.baseUrl}${this.endpoints.icons}${category}/${filename}`;
    },
    
    getResourceUrl(type, path) {
      const endpoint = this.endpoints[type] || '/';
      return `${this.baseUrl}${endpoint}${path}`;
    }
  };
  
  // Make CDN config available globally
  // Note: UPDATE_API_URL is set separately in the HTML template and should NOT be overwritten
  // CDN is for READ operations (icons, static resources) via window.CDN_CONFIG
  // UPDATE_API_URL is for WRITE operations (publishing changes) and points to content service API
  window.CDN_CONFIG = CDN_CONFIG;
  
  console.log('✅ TT Menus CDN configured:', CDN_CONFIG.baseUrl);
  console.log('📍 Icons API:', CDN_CONFIG.getIconsApiUrl());
  
})();

