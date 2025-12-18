import React, { useState, useMemo } from 'react';
import {
    Card,
    IndexTable,
    Text,
    TextField,
    BlockStack,
    Box,
    Select,
    InlineStack,
    Banner,
    Badge,
    Button,
    Divider,
} from '@shopify/polaris';
import { DeleteIcon, PlusIcon } from '@shopify/polaris-icons';

/**
 * ValueMappingTable Component
 * Step 3: Map specific CSV values to different Shopify metafields
 * Supports multiple source→target mapping configurations
 */
function ValueMappingTable({
    mappings,
    shopifyFields = [],
    csvSampleRows = [],
    valueMappings = [],
    onAddValueMapping,
    onRemoveValueMapping,
}) {
    // State for adding new mapping configuration
    const [newSourceIndex, setNewSourceIndex] = useState('');
    const [newTargetField, setNewTargetField] = useState('');

    // Get fields that have CSV columns mapped (not constants)
    const sourceMappings = useMemo(() => {
        return mappings
            .map((m, i) => ({ ...m, originalIndex: i }))
            .filter(m => m.csvColumn && !m.csvColumn.startsWith('CONSTANT:'));
    }, [mappings]);

    // Get unique source→target configurations from valueMappings
    const mappingConfigurations = useMemo(() => {
        const configs = new Map();
        valueMappings.forEach(vm => {
            const key = `${vm.sourceField}___${vm.targetField}`;
            if (!configs.has(key)) {
                configs.set(key, {
                    sourceField: vm.sourceField,
                    sourceCsvColumn: vm.sourceCsvColumn,
                    targetField: vm.targetField,
                    values: []
                });
            }
            configs.get(key).values.push({
                sourceValue: vm.sourceValue,
                targetValue: vm.targetValue
            });
        });
        return Array.from(configs.values());
    }, [valueMappings]);

    // Get unique values from CSV sample rows for a source column
    const getUniqueValuesForColumn = (columnName) => {
        if (!columnName || !csvSampleRows.length) return [];

        const values = new Set();
        csvSampleRows.forEach(row => {
            if (row[columnName] !== undefined && row[columnName] !== null && row[columnName] !== '') {
                values.add(String(row[columnName]).trim());
            }
        });

        return Array.from(values).sort();
    };

    // Get metafields for target selection
    const targetFieldOptions = useMemo(() => {
        const options = [{ label: 'Select target metafield...', value: '' }];

        shopifyFields
            .filter(f => f.type === 'metafield' || f.type === 'variant_metafield')
            .forEach(field => {
                options.push({
                    label: `${field.label} (${field.metafieldNamespace}.${field.metafieldKey})`,
                    value: field.key
                });
            });

        return options;
    }, [shopifyFields]);

    const sourceFieldOptions = [
        { label: 'Select source field...', value: '' },
        ...sourceMappings.map(m => ({
            label: `${m.shopifyField} (from ${m.csvColumn})`,
            value: String(m.originalIndex)
        }))
    ];

    // Handle adding a new mapping configuration
    const handleAddConfiguration = () => {
        if (newSourceIndex === '' || !newTargetField) return;

        const sourceMapping = mappings[parseInt(newSourceIndex)];
        const uniqueValues = getUniqueValuesForColumn(sourceMapping.csvColumn);

        // Add empty mappings for all unique values
        uniqueValues.forEach(value => {
            onAddValueMapping({
                sourceField: sourceMapping.shopifyField,
                sourceCsvColumn: sourceMapping.csvColumn,
                sourceValue: value,
                targetField: newTargetField,
                targetValue: ''
            });
        });

        // Reset form
        setNewSourceIndex('');
        setNewTargetField('');
    };

    // Handle value change for a specific mapping
    const handleValueChange = (config, sourceValue, targetValue) => {
        onAddValueMapping({
            sourceField: config.sourceField,
            sourceCsvColumn: config.sourceCsvColumn,
            sourceValue: sourceValue,
            targetField: config.targetField,
            targetValue: targetValue
        });
    };

    // Handle removing an entire configuration
    const handleRemoveConfiguration = (config) => {
        // Remove all valueMappings for this source→target pair
        valueMappings.forEach((vm, index) => {
            if (vm.sourceField === config.sourceField && vm.targetField === config.targetField) {
                onRemoveValueMapping(index);
            }
        });
    };

    // Get target value for a source value in a configuration
    const getTargetValue = (config, sourceValue) => {
        const mapping = valueMappings.find(vm =>
            vm.sourceField === config.sourceField &&
            vm.targetField === config.targetField &&
            vm.sourceValue === sourceValue
        );
        return mapping?.targetValue || '';
    };

    return (
        <BlockStack gap="400">
            <Text variant="headingSm" as="p">
                Create conditional mappings: Based on CSV values, write to different metafields
            </Text>

            {/* Add New Configuration */}
            <Card>
                <BlockStack gap="300">
                    <Text variant="headingSm">Add New Value Mapping Rule</Text>
                    <InlineStack gap="300" wrap={false} blockAlign="end">
                        <Box minWidth="35%">
                            <Select
                                label="Source Field"
                                options={sourceFieldOptions}
                                value={newSourceIndex}
                                onChange={setNewSourceIndex}
                            />
                        </Box>
                        <Box minWidth="35%">
                            <Select
                                label="Target Metafield"
                                options={targetFieldOptions}
                                value={newTargetField}
                                onChange={setNewTargetField}
                                disabled={newSourceIndex === ''}
                            />
                        </Box>
                        <Button
                            variant="primary"
                            onClick={handleAddConfiguration}
                            disabled={newSourceIndex === '' || !newTargetField}
                            icon={PlusIcon}
                        >
                            Add Rule
                        </Button>
                    </InlineStack>
                </BlockStack>
            </Card>

            {/* Configured Mappings */}
            {mappingConfigurations.length > 0 && (
                <BlockStack gap="400">
                    {mappingConfigurations.map((config, configIndex) => {
                        const uniqueValues = getUniqueValuesForColumn(config.sourceCsvColumn);

                        return (
                            <Card key={`${config.sourceField}-${config.targetField}`}>
                                <BlockStack gap="300">
                                    <InlineStack align="space-between">
                                        <BlockStack gap="100">
                                            <Text variant="headingSm">
                                                Rule {configIndex + 1}: {config.sourceCsvColumn} → {config.targetField}
                                            </Text>
                                            <Text variant="bodySm" tone="subdued">
                                                When "{config.sourceCsvColumn}" equals a value, write to "{config.targetField}"
                                            </Text>
                                        </BlockStack>
                                        <Button
                                            variant="plain"
                                            tone="critical"
                                            onClick={() => handleRemoveConfiguration(config)}
                                            icon={DeleteIcon}
                                        >
                                            Remove
                                        </Button>
                                    </InlineStack>

                                    <Divider />

                                    <IndexTable
                                        resourceName={{ singular: 'mapping', plural: 'mappings' }}
                                        itemCount={uniqueValues.length}
                                        headings={[
                                            { title: 'CSV Value', width: '40%' },
                                            { title: `Value to Write to ${config.targetField}`, width: '60%' },
                                        ]}
                                        selectable={false}
                                    >
                                        {uniqueValues.map((value, index) => (
                                            <IndexTable.Row id={value} key={value} position={index}>
                                                <IndexTable.Cell>
                                                    <Badge tone="info">{value}</Badge>
                                                </IndexTable.Cell>
                                                <IndexTable.Cell>
                                                    <TextField
                                                        label=""
                                                        labelHidden
                                                        value={getTargetValue(config, value)}
                                                        onChange={(val) => handleValueChange(config, value, val)}
                                                        autoComplete="off"
                                                        placeholder={`Value when "${value}"`}
                                                    />
                                                </IndexTable.Cell>
                                            </IndexTable.Row>
                                        ))}
                                    </IndexTable>
                                </BlockStack>
                            </Card>
                        );
                    })}
                </BlockStack>
            )}

            {mappingConfigurations.length === 0 && (
                <Banner tone="info">
                    No value mapping rules configured yet. Add a rule above to map CSV values to target metafields.
                    <br /><br />
                    <strong>Example:</strong> Map "color" values (D, E, F...) to write numeric values (1, 2, 3...) to "custom.color_index" metafield.
                </Banner>
            )}
        </BlockStack>
    );
}

export default ValueMappingTable;
