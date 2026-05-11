// @ts-nocheck
import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState, useRef } from "preact/hooks";
import {
    useDeliveryGroups,
    useBuyerJourneyIntercept,
    useExtensionCapability,
    useApplyAttributeChange,
} from "@shopify/ui-extensions/checkout/preact";

export default function extension() {
    render(<PickupConfirmation />, document.body);
}

function PickupConfirmation() {
    const deliveryGroups = useDeliveryGroups();
    const applyAttributeChange = useApplyAttributeChange();
    const canBlockProgress = useExtensionCapability("block_progress");

    const [isConfirmed, setIsConfirmed] = useState(false);
    const [confirmError, setConfirmError] = useState("");

    // Keep a ref for the intercept callback so we always read the latest state
    const isConfirmedRef = useRef(false);

    /**
     * Dynamically resolve which delivery group index is currently active.
     * Reuses the same logic as Checkout.jsx for consistency.
     */
    const activeDeliveryGroupIndex = (() => {
        if (!deliveryGroups?.length) return 0;
        // Fall back to index 0 — we're not matching against address here
        // since pickup doesn't require a shipping address.
        return 0;
    })();

    /**
     * Detect pickup: selectedDeliveryOption only carries `handle` — not `type`.
     * We look up the full option from deliveryOptions using the handle.
     */
    const activeGroup = deliveryGroups?.[activeDeliveryGroupIndex];
    const selectedHandle = activeGroup?.selectedDeliveryOption?.handle;
    const selectedOption = activeGroup?.deliveryOptions?.find(
        (opt) => opt.handle === selectedHandle
    );

    const isPickup =
        selectedOption?.type === "pickup" || selectedOption?.type === "local";

    /**
     * Get the pickup location / store name from the delivery option title.
     * For pickup deliveries, the title typically contains the store/location name.
     * If title is missing, fall back to a generic "Pickup Location" label.
     */
    const pickupLocationName = selectedOption?.title || "Pickup Location";
    const storeDisplayName =
        String(pickupLocationName).trim() || "Pickup Location";

    /**
     * Update the ref whenever isConfirmed changes so the intercept callback
     * always reads the current value.
     */
    const handleCheckboxChange = () => {
        const newValue = !isConfirmed;
        setIsConfirmed(newValue);
        isConfirmedRef.current = newValue;
        setConfirmError("");

        // Sync the confirmation state as a cart attribute
        applyAttributeChange({
            type: "updateAttribute",
            key: "pickup_confirmed",
            value: newValue ? "true" : "false",
        });
    };

    // ─── Intercept / Validation ──────────────────────────────────────────────
    useBuyerJourneyIntercept(({ canBlockProgress }) => {
        if (!canBlockProgress) return { behavior: "allow" };

        // Only intercept when pickup is selected
        if (!isPickup) return { behavior: "allow" };

        // Block if the checkbox is not checked
        if (!isConfirmedRef.current) {
            setConfirmError(
                "Please confirm your pickup selection before proceeding."
            );
            return {
                behavior: "block",
                reason: "You must confirm your pickup selection before proceeding to checkout.",
            };
        }

        // All good—clear error and allow
        setConfirmError("");
        return { behavior: "allow" };
    });

    // Only render when pickup is selected
    if (!isPickup) return null;

    return (
        <s-box border="none" padding="base" borderRadius="base">
            <s-stack direction="block" gap="base">
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
                        <s-text>
                            {"You have selected "}
                            <s-text type="strong">
                                "{storeDisplayName}"
                            </s-text>
                            {" for order pickup. Please confirm before proceeding to checkout."}
                        </s-text>
                    </s-box>
                </s-grid>
                {confirmError ? (
                    <s-text tone="critical">{confirmError}</s-text>
                ) : null}
            </s-stack>
        </s-box>
    );
}
