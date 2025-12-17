/**
 * Get shop parameter from URL or use development shop
 * @returns {string} Shop domain
 */
export const getShopParam = () => {
    return new URLSearchParams(window.location.search).get('shop') || 'dev-shop.myshopify.com';
};
