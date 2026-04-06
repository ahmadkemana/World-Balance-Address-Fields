import {
    Card,
    Page,
    Layout,
    Text,
    Button,
    Icon,
    Banner,
    SkeletonBodyText,
    Box,
    LegacyStack,
} from "@shopify/polaris";
import { TitleBar, Toast } from "@shopify/app-bridge-react";
import { useState, useCallback } from "react";
import { useAppQuery } from "../hooks";

// Simple Copy Icon SVG
const DuplicateIcon = () => (
    <svg
        viewBox="0 0 20 20"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "20px", height: "20px", fill: "currentColor" }}
    >
        <path
            fillRule="evenodd"
            d="M6 3.5A1.5 1.5 0 0 1 7.5 2h7A1.5 1.5 0 0 1 16 3.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 6 10.5v-7ZM7.5 3.5a.25.25 0 0 0-.25.25v7c0 .138.112.25.25.25h7a.25.25 0 0 0 .25-.25v-7a.25.25 0 0 0-.25-.25h-7Z"
        />
        <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v7A1.5 1.5 0 0 0 4.5 16h7a1.5 1.5 0 0 0 1.5-1.5v-1.25a.75.75 0 0 0-1.5 0v1.25a.25.25 0 0 1-.25.25h-7a.25.25 0 0 1-.25-.25v-7a.25.25 0 0 1 .25-.25h1.25a.75.75 0 0 0 0-1.5H4.5Z" />
    </svg>
);

export default function HomePage() {
    const [toastContent, setToastContent] = useState(null);

    const { data, isLoading, isError } = useAppQuery({
        url: "/api/dashboard",
    });

    const toggleToast = useCallback(() => setToastContent(null), []);

    const copyToClipboard = async (text) => {
        if (!text || text === "N/A") return;
        try {
            await navigator.clipboard.writeText(text);
            setToastContent("Copied to clipboard");
        } catch (err) {
            setToastContent("Failed to copy");
        }
    };

    if (isLoading) {
        return (
            <Page narrowWidth>
                <Layout>
                    <Layout.Section>
                        <Card sectioned title="Loading...">
                            <SkeletonBodyText lines={4} />
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    if (isError) {
        return (
            <Page narrowWidth>
                <Layout>
                    <Layout.Section>
                        <Banner status="critical">
                            There was an error loading the dashboard data.
                        </Banner>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    const accessToken = data?.shop_data?.access_token || "N/A";

    const storefrontToken = data?.createStorefrontToken || "N/A";

    return (
        <Page narrowWidth>
            <TitleBar title="Dashboard" primaryAction={null} />
            {toastContent && (
                <Toast content={toastContent} onDismiss={toggleToast} />
            )}
            <Layout>
                <Layout.Section>
                    <Card sectioned>
                        <Box paddingBlockEnd="400">
                            <div style={{ textAlign: "center" }}>
                                <Text
                                    as="h1"
                                    variant="headingLg"
                                    color="success"
                                >
                                    Welcome! Your app has been installed.
                                </Text>
                            </div>
                        </Box>

                        <div
                            style={{
                                marginTop: "24px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "24px",
                            }}
                        >
                            <div>
                                <Text
                                    as="h2"
                                    variant="headingMd"
                                    fontWeight="semibold"
                                >
                                    Your Access Token
                                </Text>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "16px",
                                        backgroundColor: "#f1f2f3",
                                        borderRadius: "12px",
                                        marginTop: "12px",
                                        border: "1px solid #e1e3e5",
                                        boxShadow:
                                            "inset 0 1px 2px rgba(0,0,0,0.05)",
                                    }}
                                >
                                    <Text
                                        as="span"
                                        variant="bodyMd"
                                        fontWeight="medium"
                                        breakWord
                                    >
                                        {accessToken}
                                    </Text>
                                    <div style={{ marginLeft: "12px" }}>
                                        <Button
                                            icon={DuplicateIcon}
                                            plain
                                            onClick={() =>
                                                copyToClipboard(accessToken)
                                            }
                                            accessibilityLabel="Copy Access Token"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Text
                                    as="h2"
                                    variant="headingMd"
                                    fontWeight="semibold"
                                >
                                    Your Storefront Token
                                </Text>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "16px",
                                        backgroundColor: "#f1f2f3",
                                        borderRadius: "12px",
                                        marginTop: "12px",
                                        border: "1px solid #e1e3e5",
                                        boxShadow:
                                            "inset 0 1px 2px rgba(0,0,0,0.05)",
                                    }}
                                >
                                    <Text
                                        as="span"
                                        variant="bodyMd"
                                        fontWeight="medium"
                                        breakWord
                                    >
                                        {storefrontToken}
                                    </Text>
                                    <div style={{ marginLeft: "12px" }}>
                                        <Button
                                            icon={DuplicateIcon}
                                            plain
                                            onClick={() =>
                                                copyToClipboard(storefrontToken)
                                            }
                                            accessibilityLabel="Copy Storefront Token"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
