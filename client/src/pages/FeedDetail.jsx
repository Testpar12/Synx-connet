import React, { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineGrid,
  Badge,
  DataTable,
  Tabs,
  InlineStack,
} from '@shopify/polaris';
import { useParams, useNavigate } from 'react-router-dom';

function FeedDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [feed, setFeed] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchFeed();
    fetchJobs();
  }, [id]);

  const fetchFeed = async () => {
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      const response = await fetch(`/api/feeds/${id}?shop=${shop}`);
      const data = await response.json();
      setFeed(data.feed);
    } catch (error) {
      console.error('Error fetching feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobs = async () => {
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      const response = await fetch(`/api/jobs?feedId=${id}&shop=${shop}`);
      const data = await response.json();
      setJobs(data.jobs);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      await fetch(`/api/feeds/${id}/process?shop=${shop}`, {
        method: 'POST',
      });
      alert('Feed processing started');
      setTimeout(fetchJobs, 2000);
    } catch (error) {
      console.error('Error processing feed:', error);
      alert('Error starting feed process');
    } finally {
      setProcessing(false);
    }
  };

  const handlePreview = async () => {
    setProcessing(true);
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      await fetch(`/api/feeds/${id}/preview?shop=${shop}`, {
        method: 'POST',
      });
      alert('Preview started');
      setTimeout(fetchJobs, 2000);
    } catch (error) {
      console.error('Error previewing feed:', error);
      alert('Error starting preview');
    } finally {
      setProcessing(false);
    }
  };

  if (loading || !feed) {
    return (
      <Page title="Loading...">
        <Card>
          <Text>Loading feed details...</Text>
        </Card>
      </Page>
    );
  }

  const tabs = [
    { id: 'all', content: 'All', panelID: 'all-jobs' },
    { id: 'success', content: 'Success', panelID: 'success-jobs' },
    { id: 'failed', content: 'Failed', panelID: 'failed-jobs' },
  ];

  const filteredJobs = jobs.filter((job) => {
    if (selectedTab === 0) return true;
    if (selectedTab === 1) return job.status === 'completed';
    if (selectedTab === 2) return job.status === 'failed';
    return true;
  });

  const jobRows = filteredJobs.map((job) => [
    new Date(job.createdAt).toLocaleString(),
    <Badge
      tone={
        job.status === 'completed'
          ? 'success'
          : job.status === 'failed'
            ? 'critical'
            : 'info'
      }
    >
      {job.status}
    </Badge>,
    job.results?.processed || 0,
    job.results?.created || 0,
    job.results?.updated || 0,
    job.results?.failed || 0,
    <Button size="slim" onClick={() => navigate(`/jobs/${job._id}`)}>
      View
    </Button>,
  ]);

  return (
    <Page
      title={feed.name}
      backAction={{ onAction: () => navigate('/feeds') }}
      secondaryActions={[
        {
          content: 'Edit Settings',
          onAction: () => navigate(`/feeds/${id}/edit`),
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd">Overview</Text>
                <InlineStack gap="200">
                  <Button
                    onClick={handlePreview}
                    loading={processing}
                    disabled={processing}
                  >
                    Preview Sync
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleProcess}
                    loading={processing}
                    disabled={processing}
                  >
                    Start Process
                  </Button>
                </InlineStack>
              </InlineStack>

              <InlineGrid columns={2} gap="400">
                <BlockStack gap="200">
                  <Text variant="headingSm" tone="subdued">
                    Matching Column
                  </Text>
                  <Text>
                    {feed.matching.column} ({feed.matching.type})
                  </Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text variant="headingSm" tone="subdued">
                    Status
                  </Text>
                  <Badge
                    tone={
                      feed.status === 'active'
                        ? 'success'
                        : feed.status === 'paused'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {feed.status}
                  </Badge>
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Connection</Text>

              <InlineGrid columns={2} gap="400">
                <BlockStack gap="200">
                  <Text variant="headingSm" tone="subdued">
                    FTP Connection
                  </Text>
                  <Text>{feed.ftpConnection?.name || 'N/A'}</Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text variant="headingSm" tone="subdued">
                    File Path
                  </Text>
                  <Text>{feed.file.path}</Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text variant="headingSm" tone="subdued">
                    Schedule
                  </Text>
                  <Text>
                    {feed.schedule?.enabled
                      ? `${feed.schedule.frequency} at ${feed.schedule.time}`
                      : 'Manual only'}
                  </Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text variant="headingSm" tone="subdued">
                    Last Processed
                  </Text>
                  <Text>
                    {feed.lastSync?.completedAt
                      ? new Date(feed.lastSync.completedAt).toLocaleString()
                      : 'Never'}
                  </Text>
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Activity Logs</Text>

              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                <div style={{ padding: '16px 0' }}>
                  {jobRows.length > 0 ? (
                    <DataTable
                      columnContentTypes={[
                        'text',
                        'text',
                        'numeric',
                        'numeric',
                        'numeric',
                        'numeric',
                        'text',
                      ]}
                      headings={[
                        'Date',
                        'Status',
                        'Processed',
                        'Created',
                        'Updated',
                        'Failed',
                        'Actions',
                      ]}
                      rows={jobRows}
                    />
                  ) : (
                    <Text tone="subdued">No activity logs yet</Text>
                  )}
                </div>
              </Tabs>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default FeedDetail;
