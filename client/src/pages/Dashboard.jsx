import React, { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  ProgressBar,
  Badge,
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || 'dev-shop.myshopify.com';
      const response = await fetch(`/api/shops/current/stats?shop=${shop}`);
      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Page title="Dashboard">
        <Card>
          <BlockStack gap="400">
            <Text>Loading...</Text>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Dashboard"
      primaryAction={{
        content: 'Create Feed',
        onAction: () => navigate('/feeds/new'),
      }}
    >
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">
                  Total Feeds
                </Text>
                <Text variant="heading2xl" as="p">
                  {stats?.feeds?.total || 0}
                </Text>
                <Text variant="bodySm" tone="subdued">
                  {stats?.feeds?.active || 0} active
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">
                  Total Syncs
                </Text>
                <Text variant="heading2xl" as="p">
                  {stats?.jobs?.total || 0}
                </Text>
                <Text variant="bodySm" tone="subdued">
                  All time
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">
                  Success Rate
                </Text>
                <Text variant="heading2xl" as="p">
                  {stats?.jobs?.successRate || 0}%
                </Text>
                <ProgressBar
                  progress={stats?.jobs?.successRate || 0}
                  tone="success"
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">
                  Subscription
                </Text>
                <Badge tone="info">
                  {stats?.subscription?.plan?.toUpperCase() || 'FREE'}
                </Badge>
                <Text variant="bodySm" tone="subdued">
                  {stats?.subscription?.status === 'trial'
                    ? 'Trial Active'
                    : 'Active'}
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Last Sync
              </Text>
              {stats?.lastJob ? (
                <BlockStack gap="200">
                  <Text>
                    Status:{' '}
                    <Badge
                      tone={
                        stats.lastJob.status === 'completed'
                          ? 'success'
                          : stats.lastJob.status === 'failed'
                            ? 'critical'
                            : 'info'
                      }
                    >
                      {stats.lastJob.status}
                    </Badge>
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    {new Date(stats.lastJob.createdAt).toLocaleString()}
                  </Text>
                  {stats.lastJob.results && (
                    <Text variant="bodySm">
                      Created: {stats.lastJob.results.created}, Updated:{' '}
                      {stats.lastJob.results.updated}, Failed:{' '}
                      {stats.lastJob.results.failed}
                    </Text>
                  )}
                </BlockStack>
              ) : (
                <Text tone="subdued">No syncs yet</Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Quick Links
              </Text>
              <BlockStack gap="200">
                <Text>
                  <a href="/feeds">Manage Feeds</a>
                </Text>
                <Text>
                  <a href="/ftp-connections">FTP Connections</a>
                </Text>
                <Text>
                  <a href="/settings">Settings</a>
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default Dashboard;
