import React, { useState, useEffect } from 'react';
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  EmptyState,
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import FullPageLoader from '../components/FullPageLoader';

function Feeds() {
  const navigate = useNavigate();
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFeeds = async () => {
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      const response = await fetch(`/api/feeds?shop=${shop}`);
      const data = await response.json();
      setFeeds(data.feeds);
    } catch (error) {
      console.error('Error fetching feeds:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeeds();
  }, []);

  if (loading) {
    return <FullPageLoader label="Loading feeds..." />;
  }

  const handleDelete = async (feedId) => {
    if (!confirm('Are you sure you want to delete this feed?')) return;

    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      await fetch(`/api/feeds/${feedId}?shop=${shop}`, {
        method: 'DELETE',
      });
      fetchFeeds();
    } catch (error) {
      console.error('Error deleting feed:', error);
    }
  };

  const getStatusBadge = (status) => {
    const toneMap = {
      active: 'success',
      paused: 'warning',
      draft: 'info',
      error: 'critical',
    };

    return <Badge tone={toneMap[status] || 'info'}>{status}</Badge>;
  };

  const resourceName = {
    singular: 'feed',
    plural: 'feeds',
  };

  const rowMarkup = feeds.map((feed, index) => (
    <IndexTable.Row id={feed._id} key={feed._id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {feed.name}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{getStatusBadge(feed.status)}</IndexTable.Cell>
      <IndexTable.Cell>
        {feed.ftpConnection?.name || 'N/A'}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {feed.schedule?.enabled ? feed.schedule.frequency : 'Manual only'}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {feed.lastSync?.completedAt
          ? new Date(feed.lastSync.completedAt).toLocaleDateString()
          : 'Never'}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            size="slim"
            onClick={() => navigate(`/feeds/${feed._id}`)}
          >
            View
          </Button>
          <Button
            size="slim"
            onClick={() => navigate(`/feeds/${feed._id}/edit`)}
          >
            Edit
          </Button>
          <Button
            size="slim"
            tone="critical"
            onClick={() => handleDelete(feed._id)}
          >
            Delete
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const emptyState = (
    <EmptyState
      heading="Create your first feed"
      action={{
        content: 'Create Feed',
        onAction: () => navigate('/feeds/new'),
      }}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>Import products from CSV files via FTP/SFTP</p>
    </EmptyState>
  );

  return (
    <Page
      title="Feeds"
      primaryAction={{
        content: 'Create Feed',
        onAction: () => navigate('/feeds/new'),
      }}
    >
      <Card padding="0">
        {feeds.length === 0 && !loading ? (
          emptyState
        ) : (
          <IndexTable
            resourceName={resourceName}
            itemCount={feeds.length}
            headings={[
              { title: 'Name' },
              { title: 'Status' },
              { title: 'FTP Connection' },
              { title: 'Schedule' },
              { title: 'Last Sync' },
              { title: 'Actions' },
            ]}
            selectable={false}
            loading={loading}
          >
            {rowMarkup}
          </IndexTable>
        )}
      </Card>
    </Page>
  );
}

export default Feeds;
