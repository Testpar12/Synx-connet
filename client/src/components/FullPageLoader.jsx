import React from 'react';
import { Page, Layout, BlockStack, Spinner, Text } from '@shopify/polaris';

const FullPageLoader = ({ label = 'Loading...' }) => {
    return (
        <Page>
            <Layout>
                <Layout.Section>
                    <div style={{ height: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <BlockStack gap="400" align="center">
                            <Spinner size="large" accessibilityLabel={label} />
                            <Text variant="headingMd" as="h2" tone="subdued">{label}</Text>
                        </BlockStack>
                    </div>
                </Layout.Section>
            </Layout>
        </Page>
    );
};

export default FullPageLoader;
