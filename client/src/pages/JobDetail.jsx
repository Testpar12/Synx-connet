import React, { useState, useEffect } from 'react';
import {
    Page,
    Layout,
    Card,
    Text,
    Badge,
    DataTable,
    BlockStack,
    InlineGrid,
    Pagination,
    Box,
    Banner,
} from '@shopify/polaris';
import { useParams, useNavigate } from 'react-router-dom';

function JobDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [job, setJob] = useState(null);
    const [rows, setRows] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [rowLoading, setRowLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchJobDetails();
    }, [id]);

    useEffect(() => {
        fetchJobRows(page);
    }, [id, page]);

    const fetchJobDetails = async () => {
        try {
            const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');

            // Fetch job info
            const jobResponse = await fetch(`/api/jobs/${id}?shop=${shop}`);
            if (!jobResponse.ok) throw new Error('Failed to fetch job');
            const jobData = await jobResponse.json();
            setJob(jobData.job);

            // Fetch stats
            const statsResponse = await fetch(`/api/jobs/${id}/stats?shop=${shop}`);
            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                setStats(statsData.rowStats);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchJobRows = async (pageNum) => {
        setRowLoading(true);
        try {
            const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
            const response = await fetch(`/api/jobs/${id}/rows?page=${pageNum}&limit=50&shop=${shop}`);
            const data = await response.json();
            setRows(data.rows);
            setTotalPages(data.pages);
        } catch (err) {
            console.error('Error fetching rows:', err);
        } finally {
            setRowLoading(false);
        }
    };
    const handleCancel = async () => {
        if (!confirm('Are you sure you want to cancel this job?')) return;

        try {
            const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
            const response = await fetch(`/api/jobs/${id}/cancel?shop=${shop}`, {
                method: 'POST'
            });
            const data = await response.json();

            if (response.ok) {
                fetchJobDetails();
            } else {
                setError(data.message || 'Failed to cancel job');
            }
        } catch (err) {
            setError(err.message);
        }
    };

    if (loading) {
        return (
            <Page title="Loading...">
                <Card>
                    <Text>Loading job details...</Text>
                </Card>
            </Page>
        );
    }

    if (error || !job) {
        return (
            <Page title="Error">
                <Banner tone="critical">
                    <p>{error || 'Job not found'}</p>
                </Banner>
            </Page>
        );
    }

    const rowData = rows.map((row) => [
        row.rowNumber,
        <Badge
            tone={
                row.status === 'success'
                    ? 'success'
                    : row.status === 'error'
                        ? 'critical'
                        : 'warning'
            }
        >
            {row.status}
        </Badge>,
        row.operation || '-',
        row.message || '-',
        row.data ? JSON.stringify(row.data).substring(0, 50) + '...' : '-',
    ]);

    return (
        <Page
            title={`Job #${job.queueJobId || job._id}`}
            subtitle={`Feed: ${job.feed?.name || 'Unknown'}`}
            backAction={{ onAction: () => navigate(`/feeds/${job.feed?._id || ''}`) }}
            secondaryActions={
                job.status === 'pending' || job.status === 'processing'
                    ? [{ content: 'Cancel Job', onAction: handleCancel, destructive: true }]
                    : []
            }
        >
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd">Overview</Text>
                            <InlineGrid columns={4} gap="400">
                                <BlockStack gap="200">
                                    <Text variant="headingSm" tone="subdued">Status</Text>
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
                                    </Badge>
                                </BlockStack>
                                <BlockStack gap="200">
                                    <Text variant="headingSm" tone="subdued">Started</Text>
                                    <Text>{new Date(job.createdAt).toLocaleString()}</Text>
                                </BlockStack>
                                <BlockStack gap="200">
                                    <Text variant="headingSm" tone="subdued">Duration</Text>
                                    <Text>{job.duration ? `${(job.duration / 1000).toFixed(1)}s` : '-'}</Text>
                                </BlockStack>
                                <BlockStack gap="200">
                                    <Text variant="headingSm" tone="subdued">Type</Text>
                                    <Text>{job.type}</Text>
                                </BlockStack>
                            </InlineGrid>

                            {job.error && (
                                <Banner tone="critical" title="Job Failed">
                                    <p>{job.error.message || JSON.stringify(job.error)}</p>
                                </Banner>
                            )}
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd">Statistics</Text>
                            <InlineGrid columns={4} gap="400">
                                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                                    <BlockStack gap="200">
                                        <Text variant="headingSm" tone="subdued">Processed</Text>
                                        <Text variant="headingLg">{stats?.totalRows || job.results?.processed || 0}</Text>
                                    </BlockStack>
                                </Box>
                                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                                    <BlockStack gap="200">
                                        <Text variant="headingSm" tone="subdued">Created</Text>
                                        <Text variant="headingLg" tone="success">{stats?.created || job.results?.created || 0}</Text>
                                    </BlockStack>
                                </Box>
                                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                                    <BlockStack gap="200">
                                        <Text variant="headingSm" tone="subdued">Updated</Text>
                                        <Text variant="headingLg" tone="info">{stats?.updated || job.results?.updated || 0}</Text>
                                    </BlockStack>
                                </Box>
                                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                                    <BlockStack gap="200">
                                        <Text variant="headingSm" tone="subdued">Failed</Text>
                                        <Text variant="headingLg" tone="critical">{stats?.errors || job.results?.failed || 0}</Text>
                                    </BlockStack>
                                </Box>
                            </InlineGrid>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd">Row Details</Text>
                            {rows.length > 0 ? (
                                <>
                                    <DataTable
                                        columnContentTypes={['numeric', 'text', 'text', 'text', 'text']}
                                        headings={['Row', 'Status', 'Operation', 'Message', 'Data']}
                                        rows={rowData}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                                        <Pagination
                                            hasPrevious={page > 1}
                                            onPrevious={() => setPage(page - 1)}
                                            hasNext={page < totalPages}
                                            onNext={() => setPage(page + 1)}
                                        />
                                    </div>
                                </>
                            ) : (
                                <Text tone="subdued">No row details available.</Text>
                            )}
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

export default JobDetail;
