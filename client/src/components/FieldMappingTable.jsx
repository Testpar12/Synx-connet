import React from 'react';
import {
    Card,
    IndexTable,
    Text,
    Select,
    InlineStack,
    Badge,
    Button,
    BlockStack,
    Icon,
    Box,
    TextField,
} from '@shopify/polaris';
import { DeleteIcon } from '@shopify/polaris-icons';

/**
 * FieldMappingTable Component
 * Displays Shopify fields on the left and CSV column selection on the right
 */
function FieldMappingTable({
    shopifyFields = [],
    csvHeaders = [],
    mappings = [],
    onMappingChange,
    onMappingRemove,
    onMappingAdd,
}) {
    // Build CSV options for dropdown
    const csvOptions = [
        { label: '-- Do not import --', value: '' },
        ...csvHeaders.map((header) => ({
            label: header,
            value: header,
        })),
    ];

    // Get field type badge
    const getTypeBadge = (field) => {
        const typeMap = {
            product: { tone: 'info', label: 'Product' },
            variant: { tone: 'success', label: 'Variant' },
            metafield: { tone: 'warning', label: 'Metafield' },
            variant_metafield: { tone: 'attention', label: 'Variant Meta' },
        };
        const config = typeMap[field.type] || { tone: 'info', label: field.type };
        return <Badge tone={config.tone}>{config.label}</Badge>;
    };

    // Find CSV column for a Shopify field
    const getMappedCsvColumn = (shopifyFieldKey) => {
        const mapping = mappings.find((m) => m.shopifyField === shopifyFieldKey);
        return mapping?.csvColumn || '';
    };

    // Handle mapping change
    const handleChange = (shopifyField, csvColumn) => {
        const existingIndex = mappings.findIndex(
            (m) => m.shopifyField === shopifyField.key
        );

        if (csvColumn === '') {
            // Remove mapping if empty
            if (existingIndex >= 0) {
                onMappingRemove(existingIndex);
            }
        } else {
            const newMapping = {
                csvColumn,
                shopifyField: shopifyField.key,
                fieldType: shopifyField.type === 'product' ? 'product' :
                    shopifyField.type === 'variant' ? 'variant' : 'metafield',
                ...(shopifyField.metafieldNamespace && {
                    metafieldNamespace: shopifyField.metafieldNamespace,
                    metafieldKey: shopifyField.metafieldKey,
                    metafieldType: shopifyField.metafieldType,
                }),
            };

            if (existingIndex >= 0) {
                onMappingChange(existingIndex, newMapping);
            } else {
                onMappingAdd(newMapping);
            }
        }
    };

    // Group fields by type
    const groupedFields = {
        product: shopifyFields.filter((f) => f.type === 'product'),
        variant: shopifyFields.filter((f) => f.type === 'variant'),
        metafield: shopifyFields.filter((f) => f.type === 'metafield' || f.type === 'variant_metafield'),
    };

    // Get options for a specific field
    const getOptionsForField = (field) => {
        if (field.key === 'status') {
            return [
                { label: '-- Do not import --', value: '' },
                { label: 'Set as Active', value: 'CONSTANT:active' },
                { label: 'Set as Draft', value: 'CONSTANT:draft' },
                { label: 'Set as Archived', value: 'CONSTANT:archived' },
                ...csvHeaders.map((header) => ({
                    label: header,
                    value: header,
                })),
            ];
        }
        if (field.key === 'published scope') {
            return [
                { label: '-- Do not import --', value: '' },
                { label: 'True', value: 'CONSTANT:true' },
                { label: 'False', value: 'CONSTANT:false' },
                ...csvHeaders.map((header) => ({
                    label: header,
                    value: header,
                })),
            ];
        }
        if (field.key === 'title') {
            return [
                { label: '-- Do not import --', value: '' },
                { label: 'Use Custom Text', value: 'CONSTANT:' },
                ...csvHeaders.map((header) => ({
                    label: header,
                    value: header,
                })),
            ];
        }
        return csvOptions;
    };

    const renderFieldSection = (title, fields) => {
        if (fields.length === 0) return null;

        return (
            <Box paddingBlockEnd="400">
                <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">
                        {title}
                    </Text>
                    <IndexTable
                        resourceName={{ singular: 'field', plural: 'fields' }}
                        itemCount={fields.length}
                        headings={[
                            { title: 'Shopify Field', width: '40%' },
                            { title: 'Type', width: '15%' },
                            { title: 'Map to CSV Column', width: '45%' },
                        ]}
                        selectable={false}
                    >
                        {fields.map((field, index) => (
                            <IndexTable.Row id={field.key} key={field.key} position={index}>
                                <IndexTable.Cell>
                                    <Text variant="bodyMd" fontWeight="semibold">
                                        {field.label}
                                    </Text>
                                    {field.description && (
                                        <Text variant="bodySm" tone="subdued">
                                            {field.description}
                                        </Text>
                                    )}
                                </IndexTable.Cell>
                                <IndexTable.Cell>{getTypeBadge(field)}</IndexTable.Cell>
                                <IndexTable.Cell>
                                    {getMappedCsvColumn(field.key).startsWith('CONSTANT:') &&
                                        !['CONSTANT:active', 'CONSTANT:draft', 'CONSTANT:archived', 'CONSTANT:true', 'CONSTANT:false', 'CONSTANT:global', 'CONSTANT:web'].includes(getMappedCsvColumn(field.key)) ? (
                                        <TextField
                                            label=""
                                            labelHidden
                                            value={getMappedCsvColumn(field.key).replace('CONSTANT:', '')}
                                            onChange={(value) => handleChange(field, `CONSTANT:${value}`)}
                                            autoComplete="off"
                                            clearButton
                                            onClearButtonClick={() => handleChange(field, '')}
                                            placeholder="Enter custom text..."
                                        />
                                    ) : (
                                        <Select
                                            label=""
                                            labelHidden
                                            options={getOptionsForField(field)}
                                            value={getMappedCsvColumn(field.key)}
                                            onChange={(value) => handleChange(field, value)}
                                        />
                                    )}
                                </IndexTable.Cell>
                            </IndexTable.Row>
                        ))}
                    </IndexTable>
                </BlockStack>
            </Box>
        );
    };

    const mappedCount = mappings.filter((m) => m.csvColumn).length;

    return (
        <BlockStack gap="400">
            <InlineStack align="space-between">
                <Text variant="headingSm" as="p">
                    Map Shopify fields to CSV columns
                </Text>
                <Badge tone={mappedCount > 0 ? 'success' : 'info'}>
                    {mappedCount} field{mappedCount !== 1 ? 's' : ''} mapped
                </Badge>
            </InlineStack>

            {renderFieldSection('Product Fields', groupedFields.product)}
            {renderFieldSection('Variant Fields', groupedFields.variant)}
            {renderFieldSection('Metafields', groupedFields.metafield)}

            {shopifyFields.length === 0 && (
                <Box padding="400" background="bg-surface-secondary">
                    <Text tone="subdued">
                        Loading Shopify fields... If this takes too long, there may be an issue with your Shopify connection.
                    </Text>
                </Box>
            )}
        </BlockStack>
    );
}

export default FieldMappingTable;
