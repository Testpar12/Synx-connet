import React from 'react';
import { NavigationMenu } from '@shopify/app-bridge-react';
import { useLocation, useNavigate } from 'react-router-dom';

function Navigation() {
    const location = useLocation();
    const navigate = useNavigate();

    // Helper to construct link with current search params (to preserve shop/host)
    const getLink = (path) => {
        return path;
        // Note: App Bridge NavigationMenu handles routing, but we need to ensure
        // we use the react-router-dom navigation.
        // However, NavigationMenu items accept a 'destination' prop.
        // If using 'matcher', we can highlight active.
    };

    return (
        <NavigationMenu
            navigationLinks={[
                {
                    label: 'Dashboard',
                    destination: '/',
                },
                {
                    label: 'Feeds',
                    destination: '/feeds',
                },
                {
                    label: 'FTP Connections',
                    destination: '/ftp-connections',
                },
                {
                    label: 'Settings',
                    destination: '/settings',
                }
            ]}
            matcher={(link, location) => {
                // Custom matcher to handle active state
                return link.destination === location.pathname;
            }}
        />
    );
}

export default Navigation;
