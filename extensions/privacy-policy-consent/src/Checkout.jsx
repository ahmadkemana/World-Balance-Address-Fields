// @ts-nocheck
import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import {
    useSettings,
    useBuyerJourneyIntercept,
    useExtensionCapability,
    useApplyAttributeChange,
    useAppMetafields,
    useCustomer,
} from "@shopify/ui-extensions/checkout/preact";

/**
 * Check if a raw metafield value represents "accepted" consent.
 * The canonical stored value is configured via settings (default: "Accepted"),
 * compared case-insensitively.
 */
function isConsentAcceptedValue(raw) {
    if (!raw) return false;
    return String(raw).trim().toLowerCase() === "accepted";
}

export default function extension() {
    render(<PrivacyConsent />, document.body);
}

function PrivacyConsent() {
    const settings = useSettings();
    const applyAttributeChange = useApplyAttributeChange();
    const canBlockProgress = useExtensionCapability("block_progress");

    const [isConfirmed, setIsConfirmed] = useState(false);
    const [confirmError, setConfirmError] = useState("");

    // Keep a ref for the intercept callback so we always read the latest state
    const isConfirmedRef = useRef(false);

    // ─── Settings ─────────────────────────────────────────────────────────────
    const blockTitle = String(
        settings?.block_title || "Privacy Policy Consent"
    );
    const checkboxLabel = String(
        settings?.checkbox_label ||
        "I have read and agree to the Privacy Policy and consent to the collection and processing of my personal data in accordance with this policy."
    );
    const attributeKey = String(
        settings?.attribute_key || "privacy_policy_consent"
    );
    const acceptedValue = String(settings?.accepted_value || "Accepted");

    // ---------------------------------------------------------------------------
    // 1. Reactively determine login status via useBuyerIdentity hook.
    //    Reactively read the customer metafield via useAppMetafields hook.
    //
    //    The metafield is loaded via [[extensions.metafields]] in shopify.extension.toml.
    //    We filter for entries where target.type === "customer" matching our
    //    namespace (custom) and key (privacy_policy_consent).
    //
    //    Note: Updating the customer metafield directly from a Checkout UI extension
    //    is NOT supported. The customer metafield is READ-only here — it indicates
    //    whether the customer has already given consent in a previous session.
    //    The actual consent for THIS order is saved as a cart attribute.
    //    The merchant's backend (e.g. Flow app) should update the customer metafield
    //    after order creation using the Admin API.
    // ---------------------------------------------------------------------------

    // Reactive buyer identity — useCustomer returns the logged-in customer or undefined
    const customer = useCustomer();
    console.log("useCustomer result", customer);
    const isLoggedIn = Boolean(customer);

    // Reactive metafields — replaces reading shopify.appMetafields directly.
    // useAppMetafields filters by target type + namespace/key automatically.
    const metafields = useAppMetafields({
        type: "customer",
        namespace: "custom",
        key: "privacy_policy_consent",
    });

    console.log("useAppMetafields result", metafields);

    // Derive consent status from the first matching metafield entry
    const consentEntry = metafields?.[0];
    const consentValue = consentEntry?.metafield?.value;
    const alreadyAccepted = isConsentAcceptedValue(consentValue);

    // Pre-check the box when we detect a prior accepted metafield value
    useEffect(() => {
        if (alreadyAccepted && !isConfirmedRef.current) {
            setIsConfirmed(true);
            isConfirmedRef.current = true;
        }
    }, [alreadyAccepted]);

    // Show nothing until buyer identity is resolved
    const loading = customer === undefined;

    // ---------------------------------------------------------------------------
    // 2. Handle checkbox toggle
    //    - Saves consent status as a cart attribute (visible on the order)
    //    - Uses configured attribute key and accepted value from settings
    // ---------------------------------------------------------------------------
    const handleCheckboxChange = () => {
        const newValue = !isConfirmed;
        setIsConfirmed(newValue);
        isConfirmedRef.current = newValue;
        setConfirmError("");

        applyAttributeChange({
            type: "updateAttribute",
            key: attributeKey,
            value: newValue ? acceptedValue : "Rejected",
        });
    };

    // ---------------------------------------------------------------------------
    // 3. Buyer journey intercept — block checkout if consent is required
    //    but the checkbox has not been checked.
    // ---------------------------------------------------------------------------
    useBuyerJourneyIntercept(({ canBlockProgress }) => {
        if (!canBlockProgress) return { behavior: "allow" };

        // Guest checkout — no consent required
        if (!isLoggedIn) return { behavior: "allow" };

        // Already accepted from a prior session — no need to re-consent
        if (alreadyAccepted) return { behavior: "allow" };

        // Block if the checkbox is not checked
        if (!isConfirmedRef.current) {
            setConfirmError(
                "You must accept the Privacy Policy to proceed with checkout."
            );
            return {
                behavior: "block",
                reason: "Privacy Policy consent is required to proceed.",
            };
        }

        // All good
        setConfirmError("");
        return { behavior: "allow" };
    });

    // ---------------------------------------------------------------------------
    // 4. Early returns
    // ---------------------------------------------------------------------------
    if (loading) return null;
    if (!isLoggedIn) return null;
    if (alreadyAccepted) return null;

    // ---------------------------------------------------------------------------
    // 5. Render the consent checkbox UI
    // ---------------------------------------------------------------------------
    return (
        <s-box border="none" padding="base" borderRadius="base">
            <s-stack direction="block" gap="base">
                <s-heading>{blockTitle}</s-heading>

                <s-grid
                    gridTemplateColumns="min-content 1fr"
                    gap="base"
                    alignItems="center"
                >
                    <s-box>
                        <s-checkbox
                            checked={isConfirmed}
                            onChange={handleCheckboxChange}
                        />
                    </s-box>
                    <s-box>
                        <s-text>{checkboxLabel}</s-text>
                    </s-box>
                </s-grid>

                {/* Validation error from buyer journey intercept */}
                {confirmError ? (
                    <s-text tone="critical">{confirmError}</s-text>
                ) : null}
            </s-stack>
        </s-box>
    );
}
