import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState, useRef } from "preact/hooks";
import {
    useSettings,
    useApplyAttributeChange,
    useApplyShippingAddressChange,
    useShippingAddress,
    useDeliveryGroups,
    useBuyerJourneyIntercept,
    useExtensionCapability,
} from "@shopify/ui-extensions/checkout/preact";

export default function extension() {
    render(<Extension />, document.body);
}

function parseAddressCity(cityField) {
    if (!cityField) return { city: "", district: "" };

    const trimmed = cityField.trim();

    if (trimmed.includes(",")) {
        const parts = trimmed.split(",").map((p) => p.trim());
        return {
            city: parts.slice(0, -1).join(",").trim(),
            district: parts[parts.length - 1],
        };
    }

    return { city: trimmed, district: "" };
}

function Extension() {
    const address = useShippingAddress();
    const deliveryGroups = useDeliveryGroups();
    const applyAttributeChange = useApplyAttributeChange();
    const ApplyShippingAddressChange = useApplyShippingAddressChange();
    const settings = useSettings();

    console.log("address", address);

    const userInteracted = useRef(false);
    const isRestoringFromAddress = useRef(false);
    const ignoreAddressSyncUntil = useRef(0);

    const settingsCountryCode = String(settings?.country_code || "")
        .trim()
        .toUpperCase();

    const addressCountryCode = String(address?.countryCode || "")
        .trim()
        .toUpperCase();

    const shouldRenderForCountry =
        Boolean(settingsCountryCode) &&
        Boolean(addressCountryCode) &&
        settingsCountryCode === addressCountryCode;

    const lastSeenCountryCode = useRef(addressCountryCode);
    const countryChangedAt = useRef(Date.now());

    useEffect(() => {
        if (lastSeenCountryCode.current === addressCountryCode) return;
        lastSeenCountryCode.current = addressCountryCode;
        countryChangedAt.current = Date.now();
    }, [addressCountryCode]);

    const isCountryStable = Date.now() - countryChangedAt.current > 350;

    /**
     * Dynamically resolve which delivery group index is currently active by
     * matching its deliveryAddress against the current shipping address.
     * This replaces every hardcoded [0] so errors always point at the right group.
     * Falls back to 0 if no match is found.
     */
    const activeDeliveryGroupIndex = (() => {
        if (!deliveryGroups?.length) return 0;
        const idx = deliveryGroups.findIndex(
            (g) =>
                // @ts-ignore - deliveryAddress is valid on DeliveryGroup per Shopify API
                g?.deliveryAddress?.provinceCode === address?.provinceCode &&
                // @ts-ignore - deliveryAddress is valid on DeliveryGroup per Shopify API
                g?.deliveryAddress?.zip === address?.zip
        );
        return idx !== -1 ? idx : 0;
    })();

    const blockTitle = settings?.block_title || "Address Fields";
    const regionLabel = settings?.region_label || "Region";
    const cityLabel = settings?.city_label || "City";
    const districtLabel = settings?.district_label || "District";
    const zipcodeLabel = settings?.zipcode_label || "Zip Code";

    const [data, setData] = useState([]);
    const [regions, setRegions] = useState([]);
    const [selectedRegion, setSelectedRegion] = useState("");
    const [selectedRegionErr, setSelectedRegionErr] = useState("");

    const [cities, setCities] = useState([]);
    const [selectedCity, setSelectedCity] = useState("");
    const [selectedCityErr, setSelectedCityErr] = useState("");

    const [districts, setDistricts] = useState([]);
    const [selectedDistrict, setSelectedDistrict] = useState("");
    const [selectedDistrictErr, setSelectedDistrictErr] = useState("");

    const [selectedZipcode, setSelectedZipcode] = useState("");
    const [selectedZipcodeErr, setSelectedZipcodeErr] = useState("");

    const [loading, setLoading] = useState(false);

    /**
     * Track the last values WE applied to Shopify so we can distinguish
     * between "address changed because we updated it" vs "user selected a
     * different saved address".
     */
    const lastAppliedProvince = useRef("");
    const lastAppliedCity = useRef("");
    const lastAppliedZip = useRef("");

    /**
     * When true, the next region/city/district useEffect cascade should
     * restore from the current address instead of resetting child fields.
     */

    const canBlockProgress = useExtensionCapability("block_progress");

    useEffect(() => {
        if (shouldRenderForCountry) return;

        setSelectedRegion("");
        setSelectedCity("");
        setSelectedDistrict("");
        setSelectedZipcode("");
        setRegions([]);
        setCities([]);
        setDistricts([]);
        setData([]);

        setSelectedRegionErr("");
        setSelectedCityErr("");
        setSelectedDistrictErr("");
        setSelectedZipcodeErr("");
    }, [shouldRenderForCountry]);

    // ─── Helper: restore all dropdowns from a given address object ───────────
    /**
     * Populates region/city/district/zipcode from an address object using
     * the already-loaded `data` array. Called on first load AND whenever the
     * user selects a different saved address.
     */
    const restoreFromAddress = (addr, loadedData) => {
        if (!addr) return;

        isRestoringFromAddress.current = true;

        const province = addr.provinceCode || "";
        const { city: parsedCity, district: parsedDistrict } = parseAddressCity(
            addr.city || ""
        );
        const zip = addr.zip || "";

        // --- Regions (already set by the load effect, but be safe) ---
        setSelectedRegion(province);

        if (province && loadedData.length > 0) {
            const regionData = loadedData.filter(
                (loc) =>
                    loc?.region_code === province || loc?.Region === province
            );

            const sortedCities = [
                ...new Set(regionData.map((loc) => loc?.city)),
            ].sort((a, b) => a.localeCompare(b));

            setCities(sortedCities);

            if (parsedCity && sortedCities.includes(parsedCity)) {
                setSelectedCity(parsedCity);
            }

            if (parsedCity) {
                const cityData = regionData.filter(
                    (loc) => loc?.city === parsedCity
                );

                const sortedDistricts = [
                    ...new Set(cityData.map((loc) => loc?.district)),
                ].sort((a, b) => a.localeCompare(b));

                setDistricts(sortedDistricts);

                if (
                    parsedDistrict &&
                    sortedDistricts.includes(parsedDistrict)
                ) {
                    setSelectedDistrict(parsedDistrict);
                }
            } else {
                setDistricts([]);
                setSelectedDistrict("");
            }
        } else {
            setCities([]);
            setSelectedCity("");
            setDistricts([]);
            setSelectedDistrict("");
        }

        setSelectedZipcode(zip);

        // Clear all errors on address switch
        setSelectedRegionErr("");
        setSelectedCityErr("");
        setSelectedDistrictErr("");
        setSelectedZipcodeErr("");

        setTimeout(() => {
            isRestoringFromAddress.current = false;
        }, 0);
    };

    // ─── Intercept / Validation ──────────────────────────────────────────────
    useBuyerJourneyIntercept(({ canBlockProgress }) => {
        if (!canBlockProgress) return { behavior: "allow" };

        if (!shouldRenderForCountry) return { behavior: "allow" };

        if (!isCountryStable) return { behavior: "allow" };

        if (regions.length === 0) return { behavior: "allow" };

        // 1. Region check
        if (!selectedRegion && regions.length > 0) {
            setSelectedRegionErr("Region is required");
            setSelectedCityErr("City is required");
            setSelectedDistrictErr("Barangay is required");
            setSelectedZipcodeErr("Zip Code is required");
            return { behavior: "block", reason: "Region is required" };
        }

        if (selectedRegion && selectedRegion !== address?.provinceCode) {
            const dg = `$.cart.deliveryGroups[${activeDeliveryGroupIndex}].deliveryAddress`;
            return {
                behavior: "block",
                reason: "Region doesn't match the selected location.",
                errors: [
                    {
                        message: "Region doesn't match the selected location.",
                        target: `${dg}.provinceCode`,
                    },
                    {
                        message: "City doesn't match the selected location.",
                        target: `${dg}.city`,
                    },
                    {
                        message:
                            "ZIP Code doesn't match the selected location.",
                        target: `${dg}.zip`,
                    },
                ],
            };
        }

        // 2. City check
        if (!selectedCity && cities.length > 0) {
            setSelectedCityErr("City is required");
            setSelectedDistrictErr("Barangay is required");
            setSelectedZipcodeErr("Zip Code is required");
            return { behavior: "block", reason: "City is required" };
        }

        // 3. District check
        if (!selectedDistrict && districts.length > 0) {
            setSelectedDistrictErr("Barangay is required");
            setSelectedZipcodeErr("Zip Code is required");
            return { behavior: "block", reason: "Barangay is required" };
        }

        // 4. Validate address.city matches our "City, District" format
        if (selectedCity) {
            const expectedAddressCity = selectedDistrict
                ? `${selectedCity}, ${selectedDistrict}`
                : selectedCity;

            if (address?.city && address.city !== expectedAddressCity) {
                return {
                    behavior: "block",
                    reason: "Address city doesn't match the selected location.",
                    errors: [
                        {
                            message:
                                "City doesn't match the selected location.",
                            target: `$.cart.deliveryGroups[${activeDeliveryGroupIndex}].deliveryAddress.city`,
                        },
                    ],
                };
            }
        }

        // 5. Zipcode check
        if (!selectedZipcode) {
            setSelectedZipcodeErr("Zip Code is required");
            return { behavior: "block", reason: "Zip Code is required" };
        }

        if (
            selectedZipcode &&
            address?.zip &&
            selectedZipcode !== address.zip
        ) {
            return {
                behavior: "block",
                reason: "ZIP Code doesn't match the selected location.",
                errors: [
                    {
                        message:
                            "ZIP Code doesn't match the selected location.",
                        target: `$.cart.deliveryGroups[${activeDeliveryGroupIndex}].deliveryAddress.zip`,
                    },
                ],
            };
        }

        // All good — clear errors
        setSelectedRegionErr("");
        setSelectedCityErr("");
        setSelectedDistrictErr("");
        setSelectedZipcodeErr("");
        return { behavior: "allow" };
    });

    // ─── Step 1: Load JSON data and populate regions ─────────────────────────
    useEffect(() => {
        if (!shouldRenderForCountry) return;
        if (!settings?.addresses_file_url || !address?.countryCode) return;
        setLoading(true);

        fetch(String(settings.addresses_file_url))
            .then((r) => r.json())
            .then((jsonData) => {
                const filteredData = jsonData.filter(
                    (item) => item?.country_id === address?.countryCode
                );
                setData(filteredData);

                const uniqueRegions = Array.from(
                    new Map(
                        filteredData.map((item) => {
                            const value = item?.region_code || item?.Region;
                            const label =
                                item?.region_name ||
                                item?.Region ||
                                "Unknown Region";
                            return [value, { value, label }];
                        })
                    ).values()
                ).sort((a, b) => a.label.localeCompare(b.label));

                setRegions(uniqueRegions);
                setLoading(false);

                // Restore from current address on first load
                restoreFromAddress(address, filteredData);

                // Record what Shopify currently has so we can detect future external changes
                lastAppliedProvince.current = address?.provinceCode || "";
                lastAppliedCity.current = address?.city || "";
                lastAppliedZip.current = address?.zip || "";
            })
            .catch((err) => {
                console.error("Error fetching address data:", err);
                setLoading(false);
            });
        // Only re-run when the data source or country changes (not on every address update)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings?.addresses_file_url, address?.countryCode]);

    // ─── Detect external address change (user selected a different saved address)
    useEffect(() => {
        if (!shouldRenderForCountry) return;
        if (data.length === 0) return;

        const incomingProvince = address?.provinceCode || "";
        const incomingCity = address?.city || "";
        const incomingZip = address?.zip || "";

        // If the incoming address matches what we last applied, this change
        // was caused by our own code — ignore it.
        const weChangedIt =
            incomingProvince === lastAppliedProvince.current &&
            incomingCity === lastAppliedCity.current &&
            incomingZip === lastAppliedZip.current;

        if (Date.now() < ignoreAddressSyncUntil.current) return;

        if (weChangedIt) return;

        restoreFromAddress(address, data);

        // Update our "last applied" snapshot
        lastAppliedProvince.current = incomingProvince;
        lastAppliedCity.current = incomingCity;
        lastAppliedZip.current = incomingZip;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address?.provinceCode, address?.city, address?.zip]);

    // Sync zipcode → Shopify (only when NOT restoring)
    useEffect(() => {
        if (!shouldRenderForCountry) return;
        if (!selectedZipcode) return;
        if (isRestoringFromAddress.current) return; // skip during restore

        applyAttributeChange({
            type: "updateAttribute",
            key: String(
                settings?.target_save_note_key_for_zipcode || "Zip Code"
            ),
            value: selectedZipcode,
        });

        const fullCity = selectedDistrict
            ? `${selectedCity}, ${selectedDistrict}`
            : selectedCity;

        if (selectedZipcode !== address?.zip || fullCity !== address?.city) {
            lastAppliedZip.current = selectedZipcode;
            lastAppliedCity.current = fullCity;

            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: {
                    ...address,
                    zip: selectedZipcode,
                    city: fullCity,
                    countryCode: address?.countryCode,
                },
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedZipcode]);

    /**
     * After restoreFromAddress() has run through all its setState() calls
     * (which are batched by Preact/React), we need to release the restore lock
     * so subsequent USER-driven changes are synced to Shopify again.
     *
     * We do this in a useEffect that depends on the restored values settling.
     */
    useEffect(() => {
        if (!shouldRenderForCountry) return;
        if (isRestoringFromAddress.current) {
            // All state from the restore has been applied; release the lock.
            isRestoringFromAddress.current = false;
        }
    }, [selectedRegion, selectedCity, selectedDistrict, selectedZipcode]);

    // ─── Step 2: When region changes → update cities ──────────────────────────
    useEffect(() => {
        if (!shouldRenderForCountry) return;
        if (isRestoringFromAddress.current) return;

        if (!selectedRegion || data.length === 0) {
            if (!userInteracted.current) return;

            setCities([]);
            setSelectedCity("");
            setSelectedDistrict("");
            setSelectedZipcode("");
            setDistricts([]);
            return;
        }

        const regionData = data.filter(
            (loc) =>
                loc?.region_code === selectedRegion ||
                loc?.Region === selectedRegion
        );

        const sortedCities = [
            ...new Set(regionData.map((loc) => loc?.city)),
        ].sort((a, b) => a.localeCompare(b));

        setCities(sortedCities);
    }, [selectedRegion, data]);

    // ─── Step 3: When city changes → update districts ─────────────────────────
    useEffect(() => {
        if (!shouldRenderForCountry) return;
        if (isRestoringFromAddress.current) return;

        if (!selectedCity || !selectedRegion || data.length === 0) {
            setDistricts([]);
            return;
        }

        const cityData = data.filter(
            (loc) =>
                (loc?.region_code === selectedRegion ||
                    loc?.Region === selectedRegion) &&
                loc?.city === selectedCity
        );
        const sortedDistricts = [
            ...new Set(cityData.map((loc) => loc?.district)),
        ].sort((a, b) => a.localeCompare(b));
        setDistricts(sortedDistricts);
    }, [selectedCity, selectedRegion, data]);

    // ─── Step 4: When district changes → auto-populate zipcode ───────────────
    useEffect(() => {
        if (!shouldRenderForCountry) return;
        if (isRestoringFromAddress.current) return;
        if (
            !selectedDistrict ||
            !selectedCity ||
            !selectedRegion ||
            data.length === 0
        )
            return;

        const match = data.find(
            (loc) =>
                (loc?.region_code === selectedRegion ||
                    loc?.Region === selectedRegion) &&
                loc?.city === selectedCity &&
                loc?.district === selectedDistrict
        );

        const newZip = match?.zipcode || "";
        setSelectedZipcode(newZip);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDistrict, selectedCity, selectedRegion, data]);

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const handleRegionChange = (event) => {
        userInteracted.current = true;

        const value = event?.target?.value || event;
        setSelectedRegion(value);
        setSelectedRegionErr("");

        applyAttributeChange({
            type: "updateAttribute",
            key: String(settings?.target_save_note_key_for_Region || "Region"),
            value: value,
        });

        if (value !== address?.provinceCode) {
            const newProvince = value;
            lastAppliedProvince.current = newProvince;
            lastAppliedCity.current = "";
            lastAppliedZip.current = "";

            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: {
                    ...address,
                    provinceCode: newProvince,
                    city: "",
                    zip: "",
                    countryCode: address?.countryCode,
                },
            });
        }

        setSelectedCity("");
        setSelectedDistrict("");
        setSelectedZipcode("");
        setDistricts([]);
    };

    const handleCityChange = (event) => {
        userInteracted.current = true;

        const value = event?.target?.value || event;
        setSelectedCity(value);
        setSelectedCityErr("");

        const fullCity = value
            ? `${value}${selectedDistrict ? `, ${selectedDistrict}` : ""}`
            : "";

        if (fullCity !== address?.city) {
            lastAppliedCity.current = fullCity;
            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: {
                    ...address,
                    city: value,
                    countryCode: address?.countryCode,
                },
            });
        }

        setSelectedDistrict("");
        setSelectedZipcode("");
    };

    const handleDistrictChange = (event) => {
        const value = event?.target?.value || event;

        setSelectedDistrict(value);
        setSelectedDistrictErr("");

        if (selectedCity && value) {
            const fullCity = `${selectedCity}, ${value}`;
            lastAppliedCity.current = fullCity;
            ignoreAddressSyncUntil.current = Date.now() + 800;
            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: {
                    ...address,
                    city: fullCity,
                    countryCode: address?.countryCode,
                },
            });
        }
    };

    return (
        shouldRenderForCountry && (
            <s-box border="none">
                <s-stack direction="block" gap="base">
                    <s-heading>{blockTitle}</s-heading>

                    {loading ? (
                        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                            <s-box
                                border="base"
                                borderRadius="base"
                                padding="base"
                            >
                                <s-skeleton-paragraph />
                            </s-box>
                            <s-box
                                border="base"
                                borderRadius="base"
                                padding="base"
                            >
                                <s-skeleton-paragraph />
                            </s-box>
                            <s-box
                                border="base"
                                borderRadius="base"
                                padding="base"
                            >
                                <s-skeleton-paragraph />
                            </s-box>
                            <s-box
                                border="base"
                                borderRadius="base"
                                padding="base"
                            >
                                <s-skeleton-paragraph />
                            </s-box>
                        </s-grid>
                    ) : (
                        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                            <s-select
                                key={`region-${regions.length}`}
                                label={String(regionLabel)}
                                value={selectedRegion || ""}
                                required={canBlockProgress}
                                error={selectedRegionErr}
                                onChange={handleRegionChange}
                            >
                                {regions.map((region) => (
                                    <s-option
                                        key={region.value}
                                        value={region.value}
                                    >
                                        {region.label}
                                    </s-option>
                                ))}
                            </s-select>

                            <s-select
                                key={`city-${cities.length}`}
                                label={String(cityLabel)}
                                value={selectedCity || ""}
                                required={canBlockProgress}
                                error={selectedCityErr}
                                disabled={
                                    !selectedRegion || cities.length === 0
                                }
                                onChange={handleCityChange}
                            >
                                {cities.map((city) => (
                                    <s-option key={city} value={city}>
                                        {city}
                                    </s-option>
                                ))}
                            </s-select>

                            <s-select
                                key={`district-${districts.length}`}
                                label={String(districtLabel)}
                                value={selectedDistrict || ""}
                                required={canBlockProgress}
                                error={selectedDistrictErr}
                                disabled={
                                    !selectedCity || districts.length === 0
                                }
                                onChange={handleDistrictChange}
                            >
                                {districts.map((district) => (
                                    <s-option key={district} value={district}>
                                        {district}
                                    </s-option>
                                ))}
                            </s-select>

                            <s-text-field
                                label={String(zipcodeLabel)}
                                value={selectedZipcode}
                                required={canBlockProgress}
                                error={selectedZipcodeErr}
                                disabled
                            />
                        </s-grid>
                    )}
                </s-stack>
            </s-box>
        )
    );
}
