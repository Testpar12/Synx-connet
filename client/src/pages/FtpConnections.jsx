import React, { useState, useEffect } from 'react';
import {
  Page,
  Card,
  IndexTable,
  Text,
  Button,
  Badge,
  EmptyState,
  Modal,
  FormLayout,
  TextField,
  Select,
  InlineStack,
} from '@shopify/polaris';

function FtpConnections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalActive, setModalActive] = useState(false);
  const [testingId, setTestingId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    protocol: 'sftp',
    host: '',
    port: 22,
    username: '',
    password: '',
    rootPath: '/',
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      if (!shop) {
        console.error('No shop provided');
        return;
      }
      const response = await fetch(`/api/ftp-connections?shop=${shop}`);
      const data = await response.json();
      setConnections(data.connections);
    } catch (error) {
      console.error('Error fetching connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      await fetch(`/api/ftp-connections?shop=${shop}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      setModalActive(false);
      setFormData({
        name: '',
        protocol: 'sftp',
        host: '',
        port: 22,
        username: '',
        password: '',
        rootPath: '/',
      });
      fetchConnections();
    } catch (error) {
      console.error('Error creating connection:', error);
      alert('Error creating connection');
    }
  };

  const handleTest = async (id) => {
    setTestingId(id);
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      const response = await fetch(
        `/api/ftp-connections/${id}/test?shop=${shop}`,
        { method: 'POST' }
      );
      const data = await response.json();

      alert(
        data.success
          ? 'Connection successful!'
          : `Connection failed: ${data.error}`
      );

      fetchConnections();
    } catch (error) {
      console.error('Error testing connection:', error);
      alert('Error testing connection');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this connection?')) return;

    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      await fetch(`/api/ftp-connections/${id}?shop=${shop}`, {
        method: 'DELETE',
      });
      fetchConnections();
    } catch (error) {
      console.error('Error deleting connection:', error);
    }
  };

  const getStatusBadge = (connection) => {
    if (!connection.lastTestStatus) {
      return <Badge>Not Tested</Badge>;
    }

    return connection.lastTestStatus === 'success' ? (
      <Badge tone="success">Connected</Badge>
    ) : (
      <Badge tone="critical">Failed</Badge>
    );
  };

  const resourceName = {
    singular: 'connection',
    plural: 'connections',
  };

  const rowMarkup = connections.map((conn, index) => (
    <IndexTable.Row id={conn._id} key={conn._id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {conn.name}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge>{conn.protocol.toUpperCase()}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>{conn.host}</IndexTable.Cell>
      <IndexTable.Cell>{conn.port}</IndexTable.Cell>
      <IndexTable.Cell>{getStatusBadge(conn)}</IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            size="slim"
            onClick={() => handleTest(conn._id)}
            loading={testingId === conn._id}
          >
            Test
          </Button>
          <Button
            size="slim"
            tone="critical"
            onClick={() => handleDelete(conn._id)}
          >
            Delete
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="FTP Connections"
      primaryAction={{
        content: 'Add Connection',
        onAction: () => setModalActive(true),
      }}
    >
      <Card padding="0">
        {connections.length === 0 && !loading ? (
          <EmptyState
            heading="Add your first FTP connection"
            action={{
              content: 'Add Connection',
              onAction: () => setModalActive(true),
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Connect to your FTP/SFTP server to import CSV files</p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={resourceName}
            itemCount={connections.length}
            headings={[
              { title: 'Name' },
              { title: 'Protocol' },
              { title: 'Host' },
              { title: 'Port' },
              { title: 'Status' },
              { title: 'Actions' },
            ]}
            selectable={false}
            loading={loading}
          >
            {rowMarkup}
          </IndexTable>
        )}
      </Card>

      <Modal
        open={modalActive}
        onClose={() => setModalActive(false)}
        title="Add FTP Connection"
        primaryAction={{
          content: 'Save',
          onAction: handleSubmit,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setModalActive(false),
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Connection Name"
              value={formData.name}
              onChange={(value) =>
                setFormData({ ...formData, name: value })
              }
              autoComplete="off"
            />

            <Select
              label="Protocol"
              options={[
                { label: 'SFTP', value: 'sftp' },
                { label: 'FTP', value: 'ftp' },
                { label: 'FTPS', value: 'ftps' },
              ]}
              value={formData.protocol}
              onChange={(value) => {
                setFormData({
                  ...formData,
                  protocol: value,
                  port: value === 'sftp' ? 22 : 21,
                });
              }}
            />

            <TextField
              label="Host"
              value={formData.host}
              onChange={(value) =>
                setFormData({ ...formData, host: value })
              }
              autoComplete="off"
            />

            <TextField
              label="Port"
              type="number"
              value={formData.port.toString()}
              onChange={(value) =>
                setFormData({ ...formData, port: parseInt(value) })
              }
              autoComplete="off"
            />

            <TextField
              label="Username"
              value={formData.username}
              onChange={(value) =>
                setFormData({ ...formData, username: value })
              }
              autoComplete="off"
            />

            <TextField
              label="Password"
              type="password"
              value={formData.password}
              onChange={(value) =>
                setFormData({ ...formData, password: value })
              }
              autoComplete="off"
            />

            <TextField
              label="Root Path"
              value={formData.rootPath}
              onChange={(value) =>
                setFormData({ ...formData, rootPath: value })
              }
              helpText="Root directory path on FTP server"
              autoComplete="off"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export default FtpConnections;
