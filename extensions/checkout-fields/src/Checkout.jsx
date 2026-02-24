import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState, useRef } from "preact/hooks";
import {
    useApi,
    useSettings,
    useApplyAttributeChange,
    useApplyShippingAddressChange,
    useShippingAddress,
    useDeliveryGroups,
    useLanguage,
    useBuyerJourneyIntercept,
    useExtensionCapability,
    useBuyerJourneyActiveStep,
    useAttributeValues,
} from "@shopify/ui-extensions/checkout/preact";

// Export the extension
export default function extension() {
    render(<Extension />, document.body);
}

/**
 * Parses address.city which stores "City, District" format.
 * Returns { city, district }
 */
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
                g?.deliveryAddress?.provinceCode === address?.provinceCode &&
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
    const isRestoringFromAddress = useRef(false);

    const canBlockProgress = useExtensionCapability("block_progress");

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
        const { city: parsedCity, district: parsedDistrict } = parseAddressCity(addr.city || "");
        const zip = addr.zip || "";

        // --- Regions (already set by the load effect, but be safe) ---
        setSelectedRegion(province);

        if (province && loadedData.length > 0) {
            // Cities for this region
            const regionData = loadedData.filter(
                (loc) => loc?.region_code === province || loc?.Region === province
            );
            const sortedCities = [...new Set(regionData.map((loc) => loc?.city))].sort((a, b) =>
                a.localeCompare(b)
            );
            setCities(sortedCities);
            setSelectedCity(parsedCity);

            if (parsedCity) {
                // Districts for this city
                const cityData = regionData.filter((loc) => loc?.city === parsedCity);
                const sortedDistricts = [...new Set(cityData.map((loc) => loc?.district))].sort(
                    (a, b) => a.localeCompare(b)
                );
                setDistricts(sortedDistricts);
                setSelectedDistrict(parsedDistrict);
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

        console.log("[restore] province:", province, "city:", parsedCity, "district:", parsedDistrict, "zip:", zip);
    };

    // ─── Intercept / Validation ──────────────────────────────────────────────
    useBuyerJourneyIntercept(({ canBlockProgress }) => {
        if (!canBlockProgress) return { behavior: "allow" };

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
                        message: "ZIP Code doesn't match the selected location.",
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
                            message: "City doesn't match the selected location.",
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

        if (selectedZipcode && address?.zip && selectedZipcode !== address.zip) {
            return {
                behavior: "block",
                reason: "ZIP Code doesn't match the selected location.",
                errors: [
                    {
                        message: "ZIP Code doesn't match the selected location.",
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
                                item?.region_name || item?.Region || "Unknown Region";
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
        // Skip if data hasn't loaded yet
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

        if (weChangedIt) return;

        // The address changed externally (saved-address switch or manual edit)
        console.log("[address-change] Detected external address change → re-syncing dropdowns");
        restoreFromAddress(address, data);

        // Update our "last applied" snapshot
        lastAppliedProvince.current = incomingProvince;
        lastAppliedCity.current = incomingCity;
        lastAppliedZip.current = incomingZip;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address?.provinceCode, address?.city, address?.zip]);

    // ─── Side effects: sync selections → Shopify address ────────────────────

    // Sync region → Shopify (only when NOT restoring)
    useEffect(() => {
        if (!selectedRegion) return;
        if (isRestoringFromAddress.current) return; // skip during restore

        applyAttributeChange({
            type: "updateAttribute",
            key: String(settings?.target_save_note_key_for_Region || "Region"),
            value: selectedRegion,
        });

        if (selectedRegion !== address?.provinceCode) {
            const newProvince = selectedRegion;
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
                },
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRegion]);

    // Sync zipcode → Shopify (only when NOT restoring)
    useEffect(() => {
        if (!selectedZipcode) return;
        if (isRestoringFromAddress.current) return; // skip during restore

        applyAttributeChange({
            type: "updateAttribute",
            key: String(settings?.target_save_note_key_for_zipcode || "Zip Code"),
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
                address: { ...address, zip: selectedZipcode, city: fullCity },
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
        if (isRestoringFromAddress.current) {
            // All state from the restore has been applied; release the lock.
            isRestoringFromAddress.current = false;
            console.log("[restore] Complete — releasing restore lock");
        }
    }, [selectedRegion, selectedCity, selectedDistrict, selectedZipcode]);

    // ─── Step 2: When region changes → update cities ──────────────────────────
    useEffect(() => {
        // During a restore we manage cities ourselves in restoreFromAddress()
        if (isRestoringFromAddress.current) return;

        if (!selectedRegion || data.length === 0) {
            setCities([]);
            setSelectedCity("");
            setSelectedDistrict("");
            setSelectedZipcode("");
            setDistricts([]);
            return;
        }

        const regionData = data.filter(
            (loc) =>
                loc?.region_code === selectedRegion || loc?.Region === selectedRegion
        );
        const sortedCities = [...new Set(regionData.map((loc) => loc?.city))].sort(
            (a, b) => a.localeCompare(b)
        );
        setCities(sortedCities);
        // User changed region manually — clear dependent fields
        setSelectedCity("");
        setSelectedDistrict("");
        setSelectedZipcode("");
        setDistricts([]);

        console.log("[region-effect] Updated cities for region:", selectedRegion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRegion, data]);

    // ─── Step 3: When city changes → update districts ─────────────────────────
    useEffect(() => {
        // During a restore we manage districts ourselves in restoreFromAddress()
        if (isRestoringFromAddress.current) return;

        setSelectedDistrict("");
        setSelectedZipcode("");

        if (!selectedCity || !selectedRegion || data.length === 0) {
            setDistricts([]);
            return;
        }

        const cityData = data.filter(
            (loc) =>
                (loc?.region_code === selectedRegion || loc?.Region === selectedRegion) &&
                loc?.city === selectedCity
        );
        const sortedDistricts = [
            ...new Set(cityData.map((loc) => loc?.district)),
        ].sort((a, b) => a.localeCompare(b));
        setDistricts(sortedDistricts);

        console.log("[city-effect] Updated districts for city:", selectedCity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCity, selectedRegion, data]);

    // ─── Step 4: When district changes → auto-populate zipcode ───────────────
    useEffect(() => {
        if (isRestoringFromAddress.current) return;
        if (!selectedDistrict || !selectedCity || !selectedRegion || data.length === 0)
            return;

        const match = data.find(
            (loc) =>
                (loc?.region_code === selectedRegion || loc?.Region === selectedRegion) &&
                loc?.city === selectedCity &&
                loc?.district === selectedDistrict
        );

        const newZip = match?.zipcode || "";
        setSelectedZipcode(newZip);

        console.log("[district-effect] District:", selectedDistrict, "→ zipcode:", newZip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDistrict, selectedCity, selectedRegion, data]);

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const handleRegionChange = (event) => {
        const value = event?.target?.value || event;
        setSelectedRegion(value);
        setSelectedRegionErr("");
    };

    const handleCityChange = (event) => {
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
                address: { ...address, city: value },
            });
        }
    };

    const handleDistrictChange = (event) => {
        const value = event?.target?.value || event;
        setSelectedDistrict(value);
        setSelectedDistrictErr("");

        if (selectedCity && value) {
            const fullCity = `${selectedCity}, ${value}`;
            lastAppliedCity.current = fullCity;
            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: { ...address, city: fullCity },
            });
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <s-box border="none">
            <s-stack direction="block" gap="base">
                <s-heading>{blockTitle}</s-heading>

                {loading ? (
                    <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                        <s-box border="base" borderRadius="base" padding="base">
                            <s-skeleton-paragraph />
                        </s-box>
                        <s-box border="base" borderRadius="base" padding="base">
                            <s-skeleton-paragraph />
                        </s-box>
                        <s-box border="base" borderRadius="base" padding="base">
                            <s-skeleton-paragraph />
                        </s-box>
                        <s-box border="base" borderRadius="base" padding="base">
                            <s-skeleton-paragraph />
                        </s-box>
                    </s-grid>
                ) : (
                    <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                        <s-select
                            label={String(regionLabel)}
                            value={selectedRegion}
                            required={canBlockProgress}
                            error={selectedRegionErr}
                            onChange={handleRegionChange}
                        >
                            {regions.map((region) => (
                                <s-option key={region.value} value={region.value}>
                                    {region.label}
                                </s-option>
                            ))}
                        </s-select>

                        <s-select
                            label={String(cityLabel)}
                            value={selectedCity}
                            required={canBlockProgress}
                            error={selectedCityErr}
                            disabled={!selectedRegion || cities.length === 0}
                            onChange={handleCityChange}
                        >
                            {cities.map((city) => (
                                <s-option key={city} value={city}>
                                    {city}
                                </s-option>
                            ))}
                        </s-select>

                        <s-select
                            label={String(districtLabel)}
                            value={selectedDistrict}
                            required={canBlockProgress}
                            error={selectedDistrictErr}
                            disabled={!selectedCity || districts.length === 0}
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
    );
}