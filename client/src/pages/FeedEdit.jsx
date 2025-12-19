import React, { useState, useEffect } from 'react';
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Checkbox,
  ProgressBar,
  Banner,
  Spinner,
  Box,
  Divider,
} from '@shopify/polaris';
import { useParams, useNavigate } from 'react-router-dom';
import FieldMappingTable from '../components/FieldMappingTable';
import ValueMappingTable from '../components/ValueMappingTable';
import FullPageLoader from '../components/FullPageLoader';

function FeedEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  // Wizard step state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ftpConnections, setFtpConnections] = useState([]);

  // CSV and Shopify fields state
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [shopifyFields, setShopifyFields] = useState([]);
  const [loadingCsv, setLoadingCsv] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [error, setError] = useState(null);
  const [csvSampleRows, setCsvSampleRows] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    ftpConnection: '',
    file: {
      path: '',
      delimiter: ',',
      encoding: 'utf8',
      hasHeader: true,
    },
    matching: {
      column: '',
      type: 'sku',
    },
    mappings: [],
    valueMappings: [],
    schedule: {
      enabled: false,
      frequency: 'daily',
      time: '00:00',
    },
    options: {
      skipUnchangedFile: true,
      skipUnchangedRows: false,
      createMissingMetafields: true,
      updateExisting: true,
      createNew: true,
    },
  });

  const fetchFtpConnections = async () => {
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      const response = await fetch(`/api/ftp-connections?shop=${shop}`);
      const data = await response.json();
      setFtpConnections(data.connections || []);
    } catch (error) {
      console.error('Error fetching FTP connections:', error);
    }
  };

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      const response = await fetch(`/api/feeds/${id}?shop=${shop}`);
      const data = await response.json();
      setFormData({
        ...data.feed,
        ftpConnection: data.feed.ftpConnection._id,
      });
      // If feed has mappings, go to step 2
      if (data.feed.mappings?.length > 0) {
        setCurrentStep(2);
        await fetchCsvHeaders(data.feed.ftpConnection._id, data.feed.file.path, data.feed.file.delimiter);
        await fetchShopifyFields();
      }
    } catch (error) {
      console.error('Error fetching feed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFtpConnections();
    if (!isNew) {
      fetchFeed();
    }
  }, [id]);

  if (loading) {
    return <FullPageLoader label="Loading feed configuration..." />;
  }

  // Fetch CSV headers from FTP file
  // Optional params allow calling this when editing a feed before formData state is updated
  const fetchCsvHeaders = async (ftpConnectionId, filePath, delimiter) => {
    const connId = ftpConnectionId || formData.ftpConnection;
    const path = filePath || formData.file.path;
    const delim = delimiter || formData.file.delimiter;

    if (!connId || !path) {
      setError('Please select an FTP connection and enter a CSV file path');
      return false;
    }

    setLoadingCsv(true);
    setError(null);

    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      const response = await fetch(`/api/feeds/preview-csv-headers?shop=${shop}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ftpConnectionId: connId,
          filePath: path,
          delimiter: delim,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch CSV headers');
      }

      setCsvHeaders(data.headers || []);
      setCsvSampleRows(data.sampleRows || []);

      // Auto-set matching column if SKU found
      if (!formData.matching.column && data.headers.includes('sku')) {
        setFormData(prev => ({
          ...prev,
          matching: { ...prev.matching, column: 'sku' }
        }));
      }

      return true;
    } catch (error) {
      console.error('Error fetching CSV headers:', error);
      setError(error.message || 'Failed to fetch CSV headers from FTP');
      return false;
    } finally {
      setLoadingCsv(false);
    }
  };

  // Fetch Shopify product fields
  const fetchShopifyFields = async () => {
    setLoadingFields(true);

    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      const response = await fetch(`/api/shopify-fields/product-fields?shop=${shop}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch Shopify fields');
      }

      setShopifyFields(data.fields || []);

      // Auto-map fields with matching names
      autoMapFields(data.fields || [], csvHeaders);

      return true;
    } catch (error) {
      console.error('Error fetching Shopify fields:', error);
      // Don't fail - just show standard fields
      return true;
    } finally {
      setLoadingFields(false);
    }
  };

  // Auto-map fields with matching names
  const autoMapFields = (shopifyFields, csvCols) => {
    if (!csvCols.length || formData.mappings.length > 0) return;

    const autoMappings = [];

    shopifyFields.forEach(field => {
      const fieldName = field.key.toLowerCase();
      const matchingCsv = csvCols.find(csv =>
        csv.toLowerCase() === fieldName ||
        csv.toLowerCase().replace(/[_\s-]/g, '') === fieldName.replace(/[_\s-]/g, '')
      );

      if (matchingCsv) {
        autoMappings.push({
          csvColumn: matchingCsv,
          shopifyField: field.key,
          fieldType: field.type === 'product' ? 'product' :
            field.type === 'variant' ? 'variant' : 'metafield',
          ...(field.metafieldNamespace && {
            metafieldNamespace: field.metafieldNamespace,
            metafieldKey: field.metafieldKey,
            metafieldType: field.metafieldType,
          }),
        });
      }
    });

    if (autoMappings.length > 0) {
      setFormData(prev => ({
        ...prev,
        mappings: autoMappings,
      }));
    }
  };

  // Handle next step
  const handleNextStep = async () => {
    if (currentStep === 1) {
      // Validate step 1
      if (!formData.name.trim()) {
        setError('Please enter a feed name');
        return;
      }
      if (!formData.ftpConnection) {
        setError('Please select an FTP connection');
        return;
      }
      if (!formData.file.path.trim()) {
        setError('Please enter a CSV file path');
        return;
      }

      setError(null);

      // Fetch CSV headers and Shopify fields
      const csvSuccess = await fetchCsvHeaders();
      if (csvSuccess) {
        await fetchShopifyFields();
        setCurrentStep(2);
      }
    } else if (currentStep === 2) {
      setCurrentStep(3);
    }
  };

  // Handle previous step
  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Handle mapping changes
  const handleMappingChange = (index, mapping) => {
    const newMappings = [...formData.mappings];
    newMappings[index] = mapping;
    setFormData({ ...formData, mappings: newMappings });
  };

  const handleMappingRemove = (index) => {
    const newMappings = formData.mappings.filter((_, i) => i !== index);
    setFormData({ ...formData, mappings: newMappings });
  };

  const handleMappingAdd = (mapping) => {
    setFormData({
      ...formData,
      mappings: [...formData.mappings, mapping],
    });
  };

  // Fetch unique values for value mapping (Step 3)
  const fetchUniqueValues = async (columnName) => {
    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      const response = await fetch(`/api/feeds/preview-csv-values?shop=${shop}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ftpConnectionId: formData.ftpConnection,
          filePath: formData.file.path,
          columnName: columnName,
          delimiter: formData.file.delimiter,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch unique values');
      }

      return data.values || [];
    } catch (error) {
      console.error('Error fetching unique values:', error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    // Validate matching column
    if (!formData.matching.column) {
      setError('Please select a matching column (e.g. SKU) to identify products');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('currentPageShop');
      const url = isNew
        ? `/api/feeds?shop=${shop}`
        : `/api/feeds/${id}?shop=${shop}`;

      const response = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        navigate(`/feeds/${data.feed._id}`);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Error saving feed');
      }
    } catch (error) {
      console.error('Error saving feed:', error);
      setError('Error saving feed');
    } finally {
      setSaving(false);
    }
  };

  const ftpOptions = [
    { label: 'Select FTP Connection', value: '' },
    ...ftpConnections.map((conn) => ({
      label: conn.name,
      value: conn._id,
    })),
  ];

  // Render Step 1: Basic Configuration
  const renderStep1 = () => (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd">Step 1: Feed Configuration</Text>

        <FormLayout>
          <TextField
            label="Feed Name"
            value={formData.name}
            onChange={(value) =>
              setFormData({ ...formData, name: value })
            }
            autoComplete="off"
            placeholder="e.g., Product Inventory Feed"
          />

          <Select
            label="FTP Connection"
            options={ftpOptions}
            value={formData.ftpConnection}
            onChange={(value) =>
              setFormData({ ...formData, ftpConnection: value })
            }
            helpText="Select the FTP connection where your CSV file is located"
          />

          <TextField
            label="CSV File Path"
            value={formData.file.path}
            onChange={(value) =>
              setFormData({
                ...formData,
                file: { ...formData.file, path: value },
              })
            }
            helpText="Path relative to FTP root directory (e.g., products.csv or folder/products.csv)"
            autoComplete="off"
          />

          <Select
            label="Delimiter"
            options={[
              { label: 'Comma (,)', value: ',' },
              { label: 'Semicolon (;)', value: ';' },
              { label: 'Tab', value: '\t' },
              { label: 'Pipe (|)', value: '|' },
            ]}
            value={formData.file.delimiter}
            onChange={(value) =>
              setFormData({
                ...formData,
                file: { ...formData.file, delimiter: value },
              })
            }
          />

          <Divider />

          <Checkbox
            label="Enable Scheduling"
            checked={formData.schedule.enabled}
            onChange={(value) =>
              setFormData({
                ...formData,
                schedule: { ...formData.schedule, enabled: value },
              })
            }
          />

          {formData.schedule.enabled && (
            <>
              <Select
                label="Frequency"
                options={[
                  { label: 'Hourly', value: 'hourly' },
                  { label: 'Every 6 Hours', value: 'every_6_hours' },
                  { label: 'Daily', value: 'daily' },
                  { label: 'Weekly', value: 'weekly' },
                ]}
                value={formData.schedule.frequency}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    schedule: { ...formData.schedule, frequency: value },
                  })
                }
              />

              <TextField
                label="Time (HH:mm)"
                value={formData.schedule.time}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    schedule: { ...formData.schedule, time: value },
                  })
                }
                autoComplete="off"
              />
            </>
          )}

          <Divider />

          <Text variant="headingSm">Options</Text>

          <Checkbox
            label="Skip unchanged file (based on checksum)"
            checked={formData.options.skipUnchangedFile}
            onChange={(value) =>
              setFormData({
                ...formData,
                options: { ...formData.options, skipUnchangedFile: value },
              })
            }
          />

          <Checkbox
            label="Skip unchanged rows (faster syncs - caches row data)"
            helpText="Skips rows that haven't changed since last successful sync. Recommended for large feeds."
            checked={formData.options.skipUnchangedRows}
            onChange={(value) =>
              setFormData({
                ...formData,
                options: { ...formData.options, skipUnchangedRows: value },
              })
            }
          />

          <Checkbox
            label="Create missing metafields automatically"
            checked={formData.options.createMissingMetafields}
            onChange={(value) =>
              setFormData({
                ...formData,
                options: {
                  ...formData.options,
                  createMissingMetafields: value,
                },
              })
            }
          />

          <Checkbox
            label="Update existing products"
            checked={formData.options.updateExisting}
            onChange={(value) =>
              setFormData({
                ...formData,
                options: { ...formData.options, updateExisting: value },
              })
            }
          />

          <Checkbox
            label="Create new products"
            checked={formData.options.createNew}
            onChange={(value) =>
              setFormData({
                ...formData,
                options: { ...formData.options, createNew: value },
              })
            }
          />
        </FormLayout>
      </BlockStack>
    </Card>
  );

  // Render Step 2: Field Mapping
  const renderStep2 = () => (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text variant="headingMd">Step 2: Map Fields</Text>
          {csvHeaders.length > 0 && (
            <Text variant="bodySm" tone="subdued">
              {csvHeaders.length} CSV columns found
            </Text>
          )}
        </InlineStack>

        {(loadingCsv || loadingFields) && (
          <Box padding="400">
            <InlineStack gap="200" align="center">
              <Spinner size="small" />
              <Text>
                {loadingCsv ? 'Fetching CSV headers...' : 'Fetching Shopify fields...'}
              </Text>
            </InlineStack>
          </Box>
        )}

        {csvSampleRows.length > 0 && (
          <Banner title="CSV Preview" tone="info">
            <Text variant="bodySm">
              First row sample: {Object.entries(csvSampleRows[0] || {}).slice(0, 3).map(([k, v]) => `${k}: "${v}"`).join(', ')}
              {Object.keys(csvSampleRows[0] || {}).length > 3 && '...'}
            </Text>
          </Banner>
        )}

        <Box paddingBlockEnd="400">
          <FormLayout>
            <FormLayout.Group>
              <Select
                label="Product Matching Column (CSV)"
                options={[
                  { label: 'Select CSV Column', value: '' },
                  ...csvHeaders.map(h => ({ label: h, value: h }))
                ]}
                value={formData.matching.column}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    matching: { ...formData.matching, column: value },
                  })
                }
                helpText="Which CSV column uniquely identifies the product?"
              />

              <Select
                label="Match against Shopify Field"
                options={[
                  { label: 'SKU', value: 'sku' },
                  { label: 'Handle', value: 'handle' },
                ]}
                value={formData.matching.type}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    matching: { ...formData.matching, type: value },
                  })
                }
              />
            </FormLayout.Group>
          </FormLayout>
        </Box>

        <Divider />

        {!loadingCsv && !loadingFields && (
          <FieldMappingTable
            shopifyFields={shopifyFields}
            csvHeaders={csvHeaders}
            mappings={formData.mappings}
            onMappingChange={handleMappingChange}
            onMappingRemove={handleMappingRemove}
            onMappingAdd={handleMappingAdd}
          />
        )}
      </BlockStack>
    </Card>
  );

  // Handle value mapping add
  const handleAddValueMapping = (valueMapping) => {
    setFormData(prev => ({
      ...prev,
      valueMappings: [
        ...prev.valueMappings.filter(vm =>
          !(vm.sourceField === valueMapping.sourceField &&
            vm.targetField === valueMapping.targetField &&
            vm.sourceValue === valueMapping.sourceValue)
        ),
        valueMapping
      ]
    }));
  };

  // Handle value mapping remove
  const handleRemoveValueMapping = (index) => {
    setFormData(prev => ({
      ...prev,
      valueMappings: prev.valueMappings.filter((_, i) => i !== index)
    }));
  };

  // Render Step 3: Value Mapping
  const renderStep3 = () => (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd">Step 3: Conditional Value Mapping (Optional)</Text>
        <Text variant="bodySm" tone="subdued">
          Based on CSV values, write specific values to different Shopify metafields.
        </Text>
        <ValueMappingTable
          mappings={formData.mappings}
          shopifyFields={shopifyFields}
          csvSampleRows={csvSampleRows}
          valueMappings={formData.valueMappings}
          onAddValueMapping={handleAddValueMapping}
          onRemoveValueMapping={handleRemoveValueMapping}
        />
      </BlockStack>
    </Card>
  );

  return (
    <Page
      title={isNew ? 'Create Feed' : 'Edit Feed'}
      backAction={{ onAction: () => navigate('/feeds') }}
    >
      <BlockStack gap="400">
        {/* Progress indicator */}
        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between">
              <Text variant="bodySm">Step {currentStep} of {totalSteps}</Text>
              <Text variant="bodySm">
                {currentStep === 1 ? 'Configuration' :
                  currentStep === 2 ? 'Field Mapping' : 'Value Mapping'}
              </Text>
            </InlineStack>
            <ProgressBar progress={(currentStep / totalSteps) * 100} size="small" />
          </BlockStack>
        </Card>

        {/* Error banner */}
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        {/* Step content */}
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}

        {/* Navigation buttons */}
        <InlineStack align="space-between">
          <Button
            onClick={() => currentStep === 1 ? navigate('/feeds') : handlePrevStep()}
          >
            {currentStep === 1 ? 'Cancel' : 'Back'}
          </Button>

          <InlineStack gap="200">
            {currentStep < totalSteps && (
              <Button
                variant="primary"
                onClick={handleNextStep}
                loading={loadingCsv || loadingFields}
              >
                {currentStep === 1 ? 'Next: Map Fields' : 'Next: Value Mapping'}
              </Button>
            )}
            {currentStep === totalSteps && (
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={saving}
              >
                {isNew ? 'Create Feed' : 'Save Changes'}
              </Button>
            )}
          </InlineStack>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}

export default FeedEdit;
