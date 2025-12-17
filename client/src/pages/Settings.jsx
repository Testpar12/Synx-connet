import React, { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
  FormLayout,
  Checkbox,
  Button,
  BlockStack,
  Text,
  InlineStack,
  Badge,
} from '@shopify/polaris';

function Settings() {
  const [shop, setShop] = useState(null);
  const [settings, setSettings] = useState({
    autoSync: true,
    notifications: {
      email: true,
      failureAlerts: true,
    },
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchShop();
  }, []);

  const fetchShop = async () => {
    try {
      const shopParam = new URLSearchParams(window.location.search).get('shop');
      const response = await fetch(`/api/shops/current?shop=${shopParam}`);
      const data = await response.json();
      setShop(data.shop);
      setSettings(data.shop.settings);
    } catch (error) {
      console.error('Error fetching shop:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const shopParam = new URLSearchParams(window.location.search).get('shop');
      await fetch(`/api/shops/current/settings?shop=${shopParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      alert('Settings saved successfully');
      fetchShop();
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Shop Information</Text>

              {shop && (
                <BlockStack gap="200">
                  <Text>
                    <strong>Shop:</strong> {shop.name}
                  </Text>
                  <Text>
                    <strong>Domain:</strong> {shop.domain}
                  </Text>
                  <Text>
                    <strong>Plan:</strong>{' '}
                    <Badge tone="info">
                      {shop.subscription?.plan?.toUpperCase() || 'FREE'}
                    </Badge>
                  </Text>
                  <Text>
                    <strong>Status:</strong>{' '}
                    <Badge
                      tone={
                        shop.subscription?.status === 'active'
                          ? 'success'
                          : 'info'
                      }
                    >
                      {shop.subscription?.status?.toUpperCase() || 'N/A'}
                    </Badge>
                  </Text>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">App Settings</Text>

              <FormLayout>
                <Checkbox
                  label="Enable automatic sync for scheduled feeds"
                  checked={settings.autoSync}
                  onChange={(value) =>
                    setSettings({ ...settings, autoSync: value })
                  }
                />

                <Text variant="headingSm">Notifications</Text>

                <Checkbox
                  label="Email notifications"
                  checked={settings.notifications.email}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        email: value,
                      },
                    })
                  }
                />

                <Checkbox
                  label="Failure alerts"
                  checked={settings.notifications.failureAlerts}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        failureAlerts: value,
                      },
                    })
                  }
                />
              </FormLayout>

              <InlineStack align="end">
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  Save Settings
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">About</Text>
              <Text>
                <strong>Synx Connect</strong> - Shopify CSV Feed Importer
              </Text>
              <Text variant="bodySm" tone="subdued">
                Version 1.0.0
              </Text>
              <Text variant="bodySm">
                Automate product imports from FTP/SFTP servers with full
                metafield support.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default Settings;
