import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState, useRef } from "preact/hooks";
import {
    useApi,
    useSettings,
    useApplyAttributeChange,
    useApplyShippingAddressChange,
    useShippingAddress,
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
    const applyAttributeChange = useApplyAttributeChange();
    const ApplyShippingAddressChange = useApplyShippingAddressChange();
    const settings = useSettings();

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
     * userAction refs track whether a dropdown change was triggered by the USER
     * (vs programmatic initialization). This prevents resetting child fields
     * during initial load.
     */
    const userChangedRegion = useRef(false);
    const userChangedCity = useRef(false);
    // Flag: set once data has loaded and initial values have been restored
    const isInitialized = useRef(false);

    const canBlockProgress = useExtensionCapability("block_progress");

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
            return {
                behavior: "block",
                reason: "Region doesn't match the selected location.",
                errors: [
                    {
                        message: "Region doesn't match the selected location.",
                        target: "$.cart.deliveryGroups[0].deliveryAddress.provinceCode",
                    },
                    {
                        message: "City doesn't match the selected location.",
                        target: "$.cart.deliveryGroups[0].deliveryAddress.city",
                    },
                    {
                        message: "ZIP Code doesn't match the selected location.",
                        target: "$.cart.deliveryGroups[0].deliveryAddress.zip",
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
                            message: "City doesn’t match the selected location.",
                            target: "$.cart.deliveryGroups[0].deliveryAddress.city",
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
                        target: "$.cart.deliveryGroups[0].deliveryAddress.zip",
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

                // Initialize region from existing address (no user action)
                if (address?.provinceCode) {
                    userChangedRegion.current = false;
                    setSelectedRegion(address.provinceCode);
                }
            })
            .catch((err) => {
                console.error("Error fetching address data:", err);
                setLoading(false);
            });
    }, [settings?.addresses_file_url, address?.countryCode]);

    // ─── Step 2: When region changes → update cities ──────────────────────────
    useEffect(() => {
        if (!selectedRegion || data.length === 0) {
            setCities([]);
            if (userChangedRegion.current) {
                setSelectedCity("");
                setSelectedDistrict("");
                setSelectedZipcode("");
                setDistricts([]);
            }
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
            const cityFromAddress = parseAddressCity(address?.city || "").city;
            setSelectedCity(cityFromAddress || "");
            setSelectedDistrict("");
            setSelectedZipcode("");
            setDistricts([]); 
        console.log("Region changed, updated cities:", selectedRegion);
    }, [selectedRegion, data]);

    // ─── Step 3: When city changes → update districts ─────────────────────────
    useEffect(() => {
        // Always clear district and zipcode when city changes
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
        const districtFromAddress = parseAddressCity(address?.city || "").district;
        setSelectedDistrict(districtFromAddress || "");
         console.log("City changed, updated districts:", selectedCity);

    }, [selectedCity, selectedRegion, data]);

    // ─── Step 4: When district changes → auto-populate zipcode ───────────────
    useEffect(() => {
        if (!selectedDistrict || !selectedCity || !selectedRegion || data.length === 0)
            return;

        const match = data.find(
            (loc) =>
                (loc?.region_code === selectedRegion || loc?.Region === selectedRegion) &&
                loc?.city === selectedCity &&
                loc?.district === selectedDistrict
        );
        if (match?.zipcode) {
            setSelectedZipcode(match.zipcode);
        } else {
            setSelectedZipcode("");
        } 
    console.log("District changed to:", selectedDistrict, "auto-populated zipcode:", match?.zipcode);
    }, [selectedDistrict, selectedCity, selectedRegion, data]);

    // ─── Side effects: sync selections → Shopify address ────────────────────

    // Sync region
    useEffect(() => {
        if (!selectedRegion) return;
        applyAttributeChange({
            type: "updateAttribute",
            key: String(settings?.target_save_note_key_for_Region || "Region"),
            value: selectedRegion,
        });
        console.log("Region changed, updated address.provinceCode to:", selectedRegion, selectedRegion !== address?.provinceCode);
        if (selectedRegion !== address?.provinceCode) {
            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: {
                    ...address,
                    provinceCode: selectedRegion,
                    city: "",
                    zip: "",
                },
            });
        }
    }, [selectedRegion]);

    // Sync zipcode
    useEffect(() => {
        if (!selectedZipcode) return;
        applyAttributeChange({
            type: "updateAttribute",
            key: String(settings?.target_save_note_key_for_zipcode || "Zip Code"),
            value: selectedZipcode,
        });
         const fullCity = `${selectedCity}, ${selectedDistrict}`;
        console.log("Zipcode changed, updated address.zip to:", selectedZipcode, selectedZipcode !== address?.zip);
        if (selectedZipcode !== address?.zip) {
            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: { ...address, zip: selectedZipcode, city: fullCity },
            });
        }
    }, [selectedZipcode]);

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const handleRegionChange = (event) => {
        const value = event?.target?.value || event;
        userChangedRegion.current = true; // mark as user action
        setSelectedRegion(value);
        setSelectedRegionErr("");
    };

    const handleCityChange = (event) => {
        const value = event?.target?.value || event;
        setSelectedCity(value);
        setSelectedCityErr(""); 
        const fullCity = value ? `${value}${selectedDistrict ? `, ${selectedDistrict}` : ""}` : "";
        if (fullCity !== address?.city) {
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
        console.log("District changed to:", value);
        // Maintain city and add district next to it using comma separator
        if (selectedCity && value) {
            const fullCity = `${selectedCity}, ${value}`;
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