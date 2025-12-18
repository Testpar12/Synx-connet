import React, { useState } from 'react';
import {
    Card,
    IndexTable,
    Text,
    TextField,
    BlockStack,
    Box,
    Select,
    Button,
    InlineStack,
    Banner,
    Spinner,
    Badge,
} from '@shopify/polaris';

function ValueMappingTable({ mappings, onUpdateMapping, onFetchUniqueValues }) {
    const [selectedMappingIndex, setSelectedMappingIndex] = useState(null);
    const [loadingValues, setLoadingValues] = useState(false);
    const [uniqueValues, setUniqueValues] = useState([]);
    const [error, setError] = useState(null);

    // Filter only mappings that are assigned to a CSV column (not constants)
    const validMappings = mappings.map((m, i) => ({ ...m, originalIndex: i }))
        .filter(m => m.csvColumn && !m.csvColumn.startsWith('CONSTANT:'));

    const handleMappingSelect = async (index) => {
        setSelectedMappingIndex(index);
        setUniqueValues([]);
        setError(null);

        const mapping = mappings[index];
        if (mapping.csvColumn) {
            setLoadingValues(true);
            try {
                const values = await onFetchUniqueValues(mapping.csvColumn);
                setUniqueValues(values || []);

                // Initialize value map if empty
                if (!mapping.valueMap) {
                    onUpdateMapping(index, { ...mapping, valueMap: {} });
                }
            } catch (err) {
                setError('Failed to fetch unique values');
            } finally {
                setLoadingValues(false);
            }
        }
    };

    const handleValueChange = (csvValue, mappedValue) => {
        if (selectedMappingIndex === null) return;

        const mapping = mappings[selectedMappingIndex];
        const newValueMap = { ...(mapping.valueMap || {}) };

        if (mappedValue === '') {
            delete newValueMap[csvValue];
        } else {
            newValueMap[csvValue] = mappedValue;
        }

        onUpdateMapping(selectedMappingIndex, { ...mapping, valueMap: newValueMap });
    };

    const selectedMapping = selectedMappingIndex !== null ? mappings[selectedMappingIndex] : null;

    return (
        <BlockStack gap="400">
            <Text variant="headingSm" as="p">
                Map specific CSV values to Shopify values
            </Text>

            <Card>
                <BlockStack gap="400">
                    <Select
                        label="Select Field to Map Values"
                        options={[
                            { label: 'Select a field...', value: '' },
                            ...validMappings.map(m => ({
                                label: `${m.shopifyField} (from ${m.csvColumn})`,
                                value: String(m.originalIndex)
                            }))
                        ]}
                        value={selectedMappingIndex !== null ? String(selectedMappingIndex) : ''}
                        onChange={(val) => handleMappingSelect(Number(val))}
                        helpText="Select a mapped field to configure value translation"
                    />

                    {loadingValues && (
                        <Box padding="400">
                            <InlineStack align="center" gap="200">
                                <Spinner size="small" />
                                <Text>Fetching unique values from CSV...</Text>
                            </InlineStack>
                        </Box>
                    )}

                    {error && (
                        <Banner tone="critical" onDismiss={() => setError(null)}>
                            {error}
                        </Banner>
                    )}

                    {selectedMapping && !loadingValues && uniqueValues.length > 0 && (
                        <Box>
                            <BlockStack gap="200">
                                <Text variant="headingSm">
                                    Value Translations for "{selectedMapping.csvColumn}" → "{selectedMapping.shopifyField}"
                                </Text>
                                <IndexTable
                                    resourceName={{ singular: 'value', plural: 'values' }}
                                    itemCount={uniqueValues.length}
                                    headings={[
                                        { title: 'CSV Value (Source)', width: '50%' },
                                        { title: 'Shopify Value (Target)', width: '50%' },
                                    ]}
                                    selectable={false}
                                >
                                    {uniqueValues.map((value, index) => {
                                        const mappingVal = selectedMapping.valueMap?.[value] || '';
                                        return (
                                            <IndexTable.Row id={value} key={value} position={index}>
                                                <IndexTable.Cell>
                                                    <Text variant="bodyMd" fontWeight="semibold">{value}</Text>
                                                </IndexTable.Cell>
                                                <IndexTable.Cell>
                                                    <TextField
                                                        label=""
                                                        labelHidden
                                                        value={mappingVal}
                                                        onChange={(val) => handleValueChange(value, val)}
                                                        autoComplete="off"
                                                        placeholder="Enter target value"
                                                    />
                                                </IndexTable.Cell>
                                            </IndexTable.Row>
                                        );
                                    })}
                                </IndexTable>
                            </BlockStack>
                        </Box>
                    )}

                    {selectedMapping && !loadingValues && uniqueValues.length === 0 && (
                        <Banner tone="warning">
                            No unique values found in the first 1000 rows for this column.
                        </Banner>
                    )}
                </BlockStack>
            </Card>
        </BlockStack>
    );
}

export default ValueMappingTable;
