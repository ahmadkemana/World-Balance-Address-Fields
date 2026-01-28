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

function Extension() {
   const { extension } = useApi();
    const address = useShippingAddress();
    const applyAttributeChange = useApplyAttributeChange();
    const ApplyShippingAddressChange = useApplyShippingAddressChange();
    const settings = useSettings();
    const blockTitle = settings?.block_title || "Address Fields";
    const regionLabel = settings?.region_label || "Region";
    const cityLabel = settings?.city_label || "City";
    const districtLabel = settings?.district_label || "District";
    const zipcodeLabel = settings?.zipcode_label || "Zip Code";
    const [defaultRegion, defaultZipcode, attDisrict] = useAttributeValues([
        `${settings?.target_save_note_key_for_Region || "Region"}`,
        `${settings?.target_save_note_key_for_zipcode || "Zip Code"}`,
        `${settings?.target_save_note_key_for_district || "District"}`
    ]);
    const defaultCity = address?.city || "";
    const defaultDistrict = address?.address2 && address?.address2.includes(',')  ? address.address2.split(',').pop().trim() : attDisrict || "";
    const language = useLanguage();
    const [data, setData] = useState([]);
    const [regions, setRegions] = useState([])
    const [selectedRegion, setSelectedRegion] = useState(address?.provinceCode || "");
    const [selectedRegionErr, setSelectedRegionErr] = useState("");
    const [cities, setCities] = useState([]);
    const [selectedCity, setSelectedCity] = useState("");
    const [selectedCityErr, setSelectedCityErr] = useState("");
    const [districts, setDistricts] = useState([]);
    const [selectedDistrict, setSelectedDistrict] = useState("");
    const [selectedDistrictErr, setSelectedDistrictErr] = useState(""); 
    const [selectedZipcode, setSelectedZipcode] = useState("");
    const [selectedzipcodeErr, setSelectedzipcodeErr] = useState("");
    const [loading, setLoading] = useState(false);
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    const activeStep = useBuyerJourneyActiveStep();

    const canBlockProgress = useExtensionCapability("block_progress"); 
    useBuyerJourneyIntercept(({ canBlockProgress }) => {
        console.log("Intercept called with:", { canBlockProgress, selectedRegion, selectedCity, selectedDistrict, selectedZipcode });
        
        if (canBlockProgress && selectedRegion === "" && regions?.length > 0) {
            console.log("Blocking: Region is required");
            setSelectedRegionErr("Region is required");
            setSelectedCityErr("Please enter the City of the address");
            setSelectedDistrictErr("Please enter the Barangay of the address");
            setSelectedzipcodeErr("Zip Code as parameter is required");
            return {
                behavior: "block",
                reason: "Region is required",
            };
        } else if (selectedRegion && selectedRegion != address?.provinceCode) {
            console.log("Blocking: Region does not match");
            return {
                behavior: "block",
                reason: "Region does not match the selected location",
                errors: [
                    {
                        message: "Region does not match the selected location", 
                        target: "$.cart.deliveryGroups[0].deliveryAddress.provinceCode",
                    }
                ],
            };
        }

        if (canBlockProgress && selectedCity === "" && cities?.length > 0) {
            console.log("Blocking: City is required");
            setSelectedCityErr("Please enter the City of the address");
            setSelectedDistrictErr("Please enter the Barangay of the address");
            setSelectedzipcodeErr("Zip Code as parameter is required");
            return {
                behavior: "block",
                reason: "Please enter the City of the address",
            };
        } else if (address?.city && selectedCity && selectedCity != address?.city) {
            console.log("Blocking: City does not match", { selectedCity, addressCity: address?.city });
            return {
                behavior: "block",
                reason: "City does not match the selected location",
                errors: [
                    {
                        message: "City does not match the selected location", 
                        target: "$.cart.deliveryGroups[0].deliveryAddress.city",
                    }
                ],
            };
        }

        if (
            canBlockProgress &&
            selectedDistrict === "" &&
            districts?.length > 0
        ) {
            console.log("Blocking: District is required");
            setSelectedDistrictErr("Please enter the Barangay of the address");
            setSelectedzipcodeErr("Zip Code as parameter is required");
            return {
                behavior: "block",
                reason: "Please enter the Barangay of the address",
            };
        }

        if (canBlockProgress && selectedZipcode === "") {
            console.log("Blocking: Zipcode is required");
            setSelectedzipcodeErr("Zip Code as parameter is required");
            return {
                behavior: "block",
                reason: "Zip Code as parameter is required",
            };
        } else if (selectedZipcode && address?.zip != "" && selectedZipcode != address?.zip) {
            console.log("Blocking: Zipcode does not match", { selectedZipcode, addressZip: address?.zip });
            return {
                behavior: "block",
                reason: "Zip code does not match the selected location",
                errors: [
                    {
                        message: "Zip code does not match the selected location", 
                        target: "$.cart.deliveryGroups[0].deliveryAddress.zip",
                    }
                ],
            };
        }

        console.log("Allowing progress");
        clearValidationError();
        return {
            behavior: "allow",
        };
    });
    

    function clearValidationError() {
        setSelectedRegionErr("");
        setSelectedCityErr("");
        setSelectedDistrictErr("");
        setSelectedzipcodeErr("");
    }

    // Load initial data and populate regions
    useEffect(() => { 
        if (!settings?.addresses_file_url || !address?.countryCode) return;
        setLoading(true);
        fetch(`${settings?.addresses_file_url}`)
            .then((response) => response.json())
            .then((jsonData) => {
                const filteredData = jsonData?.filter(
                    (item) => item?.country_id === address?.countryCode
                );
                setData(filteredData);

                // Extract unique regions for the country
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
                );
                 const sortedRegions = uniqueRegions.sort((a, b) =>
                        a.label.localeCompare(b.label)
                    );

                    setRegions(sortedRegions);
                setLoading(false);
                setSelectedRegion(address?.provinceCode || "");
                setInitialLoadComplete(true);
            })
            .catch((error) => {
                console.error("Error fetching data:", error);
                setLoading(false);
            });
    }, [settings?.addresses_file_url, address?.countryCode]);

    // When region changes, update cities and reset dependent fields
    useEffect(() => {
        if (selectedRegion && data?.length > 0) {
            const regionCities = data
                ?.filter(
                    (location) =>
                        location?.region_code === selectedRegion ||
                        location?.Region === selectedRegion
                )
                .map((location) => location?.city);
                 const sortedCities = [...new Set(regionCities)].sort((a, b) =>
                    a.localeCompare(b)
                    );
            setCities(sortedCities);

            // Reset dependent fields
            setSelectedCity(regionCities?.includes(defaultCity) ? defaultCity : "");
            setSelectedDistrict("");
            setSelectedCityErr("");
            setSelectedDistrictErr("");
            setSelectedzipcodeErr("");
            setSelectedZipcode("");
            setDistricts([]);
        } else {
            setCities([]);
            setSelectedCity("");
            setSelectedDistrict("");
            setSelectedCityErr("");
            setSelectedDistrictErr("");
            setSelectedzipcodeErr("");
            setSelectedZipcode("");
            setDistricts([]);
        }
    }, [selectedRegion, data]); 

    // When city changes, update districts and reset dependent fields
    useEffect(() => {
        console.log("City changed:", { selectedCity, selectedRegion });
        if (selectedCity && selectedRegion && data?.length > 0) {
            const cityDistricts = data
                ?.filter(
                    (location) =>
                        (location?.region_code === selectedRegion ||
                            location?.Region === selectedRegion) &&
                        location?.city === selectedCity
                )
                .map((location) => location?.district);
                 const sortedDistricts = [...new Set(cityDistricts)].sort((a, b) =>
                    a.localeCompare(b)
                    ); 
                  setDistricts(sortedDistricts);

            // Reset dependent fields 
            setSelectedDistrict( cityDistricts?.includes(defaultDistrict) ? defaultDistrict : "");
            setSelectedDistrictErr("");
            setSelectedzipcodeErr("");
            setSelectedZipcode("");
        } else {
            setDistricts([]);
            setSelectedDistrict("");
            setSelectedDistrictErr("");
            setSelectedzipcodeErr("");
            setSelectedZipcode("");
        }
    }, [selectedCity, selectedRegion, data]);
    
    // Validate zipcode when district and zipcode are selected
    useEffect(() => {
        console.log("District changed:", { selectedDistrict, selectedCity, selectedRegion });
        if (
            selectedDistrict &&
            selectedCity &&
            selectedRegion &&
            data?.length > 0
        ) {
            const ZipcodeLocation = data?.find(
                (location) =>
                    (location?.region_code === selectedRegion ||
                        location?.Region === selectedRegion) &&
                    location?.city === selectedCity &&
                    location?.district === selectedDistrict
            );
            console.log("Zipcode found:", ZipcodeLocation?.zipcode);
            setSelectedZipcode(ZipcodeLocation?.zipcode || "");
        } 
    }, [selectedDistrict, selectedCity, selectedRegion, data]);

    // Extract district from address2 if it contains comma
    useEffect(() => {
        if (address?.address2 && address?.address2?.includes(",") && !selectedDistrict) {
            const parts = address?.address2?.split(",").map((val) => val?.trim());
            
            Promise.resolve().then(() => {
                if (parts[parts.length - 1]) {

                    setSelectedDistrict(parts[parts.length - 1]);
                }
            });
        }
    }, [address?.address2]);

    // Set city from address.city
    useEffect(() => {
        if (address?.city && !selectedCity) {
            setSelectedCity(address?.city?.trim());
        }
    }, [address?.city]);

    // New logic: Auto-select first district if city has no comma, district is empty, but zipcode matches
    useEffect(() => {
        if (
            initialLoadComplete &&
            data?.length > 0 &&
            address?.city &&
            address?.address2 &&
            !address?.address2?.includes(",") &&
            !attDisrict &&
            address?.zip &&
            address?.provinceCode &&
            selectedRegion === address?.provinceCode &&
            selectedCity === address?.city &&
            !selectedDistrict &&
            districts?.length > 0
        ) {
            // Find matching locations with the zipcode
            const matchingLocations = data?.filter(
                (location) =>
                    (location?.region_code === address?.provinceCode ||
                        location?.Region === address?.provinceCode) &&
                    location?.city === address?.city &&
                    location?.zipcode === address?.zip
            );

            if (matchingLocations?.length > 0) {
                // Get the first district from matching locations
                const firstDistrict = matchingLocations[0]?.district;
                if (firstDistrict && districts?.includes(firstDistrict)) {
                    setSelectedDistrict(firstDistrict);
                }
            }
        }
    }, [initialLoadComplete, data, address?.city, address?.address2, address?.zip, address?.provinceCode, attDisrict, selectedRegion, selectedCity, selectedDistrict, districts]);

    const handleRegionChange = (event) => {
        const value = event?.target?.value || event;
        console.log("Region changed to:", value);
        setSelectedRegion(value);
        setSelectedRegionErr("");
    };

    const handleCityChange = (event) => {
        const value = event?.target?.value || event;
        console.log("City changed to:", value);
        setSelectedCity(value);
        setSelectedCityErr("");
    };

    const handleDistrictChange = (event) => {
        const value = event?.target?.value || event;
        console.log("District changed to:", value);
        setSelectedDistrict(value);
        setSelectedDistrictErr("");
    };

    const handleZipcodeChange = (event) => {
        const value = event?.target?.value || event;
        console.log("Zipcode changed to:", value);
        setSelectedZipcode(value);
        setSelectedzipcodeErr("");
    };

    // Apply attribute changes
    useEffect(() => {
        if (selectedRegion) {
            applyAttributeChange({
                type: "updateAttribute",
                key: `${settings?.target_save_note_key_for_Region || "Region"}`,
                value: selectedRegion,
            });
            if(selectedRegion != address?.provinceCode) {
            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: {
                    ...address,
                    provinceCode: selectedRegion,
                    city: "",
                    zip: ""
                },
            });
        }
        }
    }, [settings?.target_save_note_key_for_Region, selectedRegion]);

    useEffect(() => {
        if (selectedCity && selectedCity != address?.city) { 
            applyAttributeChange({
                type: "updateAttribute",
                key: `${settings?.target_save_note_key_for_city || "City"}`,
                value: selectedCity,
            });
            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: {
                    ...address,
                    city: selectedCity,
                },
            });
        }
    }, [settings?.target_save_note_key_for_city, selectedCity]);

    useEffect(() => {
        if (selectedDistrict) { 
             // Get the base address2 without district
            let baseAddress2 = address?.address2 || "";
            if (baseAddress2.includes(',')) {
                baseAddress2 = baseAddress2.split(',').slice(0, -1).join(',').trim();
            }
            
            // Concatenate district to address2
            const fullAddress2 = baseAddress2 + (selectedDistrict ? `, ${selectedDistrict}` : "");
            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: {
                    ...address,
                    address2: fullAddress2,
                },
            });

            applyAttributeChange({
                type: "updateAttribute",
                key: `${settings?.target_save_note_key_for_district || "District"}`,
                value: selectedDistrict,
            });
        }
    }, [settings?.target_save_note_key_for_district, selectedDistrict]);

    useEffect(() => {
        if (selectedZipcode) {
            applyAttributeChange({
                type: "updateAttribute",
                key: `${settings?.target_save_note_key_for_zipcode || "Zip Code"}`,
                value: selectedZipcode,
            });
        if(selectedZipcode != address?.zip) {
            console.log('address?.address2', address?.address2);

            ApplyShippingAddressChange({
                type: "updateShippingAddress",
                address: {
                    ...address,
                    zip: selectedZipcode,
                },
            });
        }
        }
    }, [address?.address2]);
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
                            label={`${regionLabel}`}
                            value={selectedRegion}
                            required={canBlockProgress}
                            error={selectedRegionErr}
                            onChange={handleRegionChange}
                        >
                            {regions?.map((region) => (
                                <s-option
                                    key={region.value}
                                    value={region.value}
                                >
                                    {region.label}
                                </s-option>
                            ))}
                        </s-select>

                        <s-select
                            label={`${cityLabel}`}
                            value={selectedCity}
                            required={canBlockProgress}
                            error={selectedCityErr}
                            disabled={!selectedRegion || cities.length === 0}
                            onChange={handleCityChange}
                        >
                            {cities?.map((city) => (
                                <s-option key={city} value={city}>
                                    {city}
                                </s-option>
                            ))}
                        </s-select>

                        <s-select
                            label={`${districtLabel}`}
                            value={selectedDistrict}
                            required={canBlockProgress}
                            error={selectedDistrictErr}
                            disabled={!selectedCity || districts.length === 0}
                            onChange={handleDistrictChange}
                        >
                            {districts?.map((district) => (
                                <s-option key={district} value={district}>
                                    {district}
                                </s-option>
                            ))}
                        </s-select>

                        <s-text-field
                            label={`${zipcodeLabel}`}
                            value={selectedZipcode}
                            required={canBlockProgress}
                            error={selectedzipcodeErr}
                            disabled
                            onChange={handleZipcodeChange}
                        />
                    </s-grid>
                )}
            </s-stack>
        </s-box>
    );
}
