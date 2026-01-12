import {
    useApi,
    reactExtension,
    Grid,
    Select,
    useShippingAddress,
    useSettings,
    useApplyAttributeChange,
    SkeletonText,
    View,
    useLanguage,
    useBuyerJourneyIntercept,
    useExtensionCapability,
} from "@shopify/ui-extensions-react/checkout";
import { useEffect, useState } from "react";

export default reactExtension(
    "purchase.checkout.delivery-address.render-after",
    () => <Extension />
);

function Extension() {
    const { extension } = useApi();
    const address = useShippingAddress();
    const applyAttributeChange = useApplyAttributeChange();
    const settings = useSettings();
    const language = useLanguage();
    const [data, setData] = useState([]);
    const [cities, setCities] = useState([]);
    const [selectedCity, setSelectedCity] = useState("");
    const [selectedCityErr, setSelectedCityErr] = useState("");
    const [districts, setDistricts] = useState([]);
    const [selectedDistrict, setSelectedDistrict] = useState("");
    const [selectedDistrictErr, setSelectedDistrictErr] = useState("");
    const [subdistricts, setSubdistricts] = useState([]);
    const [selectedSubdistrict, setSelectedSubdistrict] = useState("");
    const [selectedSubdistrictErr, setSelectedSubdistrictErr] = useState("");
    const [loading, setLoading] = useState(false);

    const canBlockProgress = useExtensionCapability("block_progress");

    useBuyerJourneyIntercept(({ canBlockProgress }) => {
        if (
            canBlockProgress &&
            selectedCity === "" &&
            cities?.length > 0 &&
            settings?.city_field === "Yes"
        ) {
            return {
                behavior: "block",
                reason: "City is required",
                perform: (result) => {
                    if (result.behavior === "block") {
                        setSelectedCityErr(
                            `${
                                (language?.isoCode == "en" ||
                                    language?.isoCode ==
                                        `en-${settings?.country_code}`) &&
                                settings?.validation_message_city_ENG !== null
                                    ? settings?.validation_message_city_ENG
                                    : (language?.isoCode == "en" ||
                                          language?.isoCode ==
                                              `en-${settings?.country_code}`) &&
                                      settings?.validation_message_city_ENG ==
                                          null
                                    ? "City is required"
                                    : settings?.validation_message_city_translated ==
                                      null
                                    ? "Kota Diperlukan"
                                    : settings?.validation_message_city_translated
                            }`
                        );
                    }
                },
            };
        }

        if (
            canBlockProgress &&
            selectedDistrict === "" &&
            districts?.length > 0 &&
            settings?.district_field === "Yes"
        ) {
            return {
                behavior: "block",
                reason: "District is required",
                perform: (result) => {
                    if (result.behavior === "block") {
                        setSelectedDistrictErr(
                            `${
                                (language?.isoCode == "en" ||
                                    language?.isoCode ==
                                        `en-${settings?.country_code}`) &&
                                settings?.validation_message_district_ENG !==
                                    null
                                    ? settings?.validation_message_district_ENG
                                    : (language?.isoCode == "en" ||
                                          language?.isoCode ==
                                              `en-${settings?.country_code}`) &&
                                      settings?.validation_message_district_ENG ==
                                          null
                                    ? "District is required"
                                    : settings?.validation_message_district_translated ==
                                      null
                                    ? "Kelurahan Diperlukan"
                                    : settings?.validation_message_district_translated
                            }`
                        );
                    }
                },
            };
        }

        if (
            canBlockProgress &&
            selectedSubdistrict === "" &&
            subdistricts?.length > 0 &&
            settings?.subdistrict_field === "Yes"
        ) {
            return {
                behavior: "block",
                reason: "Subdistrict is required",
                perform: (result) => {
                    if (result.behavior === "block") {
                        setSelectedSubdistrictErr(
                            `${
                                (language?.isoCode == "en" ||
                                    language?.isoCode ==
                                        `en-${settings?.country_code}`) &&
                                settings?.validation_message_subdistrict_ENG !==
                                    null
                                    ? settings?.validation_message_subdistrict_ENG
                                    : (language?.isoCode == "en" ||
                                          language?.isoCode ==
                                              `en-${settings?.country_code}`) &&
                                      settings?.validation_message_subdistrict_ENG ==
                                          null
                                    ? "Sub district is Required"
                                    : settings?.validation_message_subdistrict_translated ==
                                      null
                                    ? "Kecamatan Diperlukan"
                                    : settings?.validation_message_subdistrict_translated
                            }`
                        );
                    }
                },
            };
        }

        return {
            behavior: "allow",
            perform: () => {
                clearValidationErrors();
            },
        };
    });

    function clearValidationErrors() {
        setSelectedCityErr("");
        setSelectedDistrictErr("");
        setSelectedSubdistrictErr("");
    }

    useEffect(() => {
        if (!settings?.addresses_file_url || !address?.countryCode) return;

        fetch(settings?.addresses_file_url)
            .then((response) => response.json())
            .then((jsonData) => {
                const filteredData = jsonData?.filter(
                    (item) => item?.country_id === address?.countryCode
                );
                setData(filteredData);
                setLoading(false);
            })
            .catch((error) => {
                console.error("Error fetching data:", error);
                setLoading(false);
            });
    }, [settings?.addresses_file_url, address?.countryCode]);

    useEffect(() => {
        setSelectedCity("");
        setSelectedDistrict("");
        setSelectedSubdistrict("");
        setSubdistricts([]);
        setDistricts([]);

        if (settings?.city_field === "No") {
            // Directly filter districts based on province code
            const filteredDistricts = data
                ?.filter(
                    (location) =>
                        location?.region_code === address?.provinceCode
                )
                .map((location) => location?.district);

            setDistricts([...new Set(filteredDistricts)]);
        } else {
            // Normal city-based filtering
            const filteredCities = data?.filter(
                (location) => location?.region_code === address?.provinceCode
            );
            const uniqueCities = [
                ...new Set(filteredCities.map((city) => city?.city)),
            ];
            setCities(uniqueCities);
        }
    }, [data, address?.provinceCode, settings?.city_field]);

    const handleCityChange = async (value) => {
        setSelectedCity(value);
        setSelectedCityErr("");
        setSelectedDistrict("");
        setSelectedSubdistrict("");

        // Filter districts based on the selected city
        const selectedCityDistricts = data
            ?.filter((city) => city?.city === value)
            .map((city) => city?.district);
        setDistricts([...new Set(selectedCityDistricts)]);
    };

    useEffect(() => {
        const updateAttribute = async () => {
            const result = await applyAttributeChange({
                type: "updateAttribute",
                key:
                    settings?.target_save_note_key_for_city == null
                        ? "City"
                        : `${settings?.target_save_note_key_for_city}`,
                value: `${selectedCity}`,
            });
        };

        updateAttribute();
    }, [settings?.target_save_note_key_for_city, selectedCity]);

    const handleDistrictChange = async (value) => {
        setSelectedDistrictErr("");
        setSelectedDistrict(value);
        setSelectedSubdistrict("");

        // Filter subdistricts based on the selected district
        // const selectedDistrictSubdistricts = data
        //     ?.filter(
        //         (location) =>
        //             location?.city === selectedCity &&
        //             location?.district === value
        //     )
        //     .map((location) => location?.subdistrict);

        const selectedDistrictSubdistricts = data
            ?.filter((location) => {
                if (settings?.city_field === "No") {
                    // No city field, filter only by district
                    return (
                        location?.region_code === address?.provinceCode &&
                        location?.district === value
                    );
                } else {
                    // City field enabled, filter by city and district
                    return (
                        location?.city === selectedCity &&
                        location?.district === value
                    );
                }
            })
            .map((location) => location?.subdistrict);
        setSubdistricts([...new Set(selectedDistrictSubdistricts)]);
    };

    useEffect(() => {
        const updateAttribute = async () => {
            const result = await applyAttributeChange({
                type: "updateAttribute",
                key:
                    settings?.target_save_note_key_for_district == null
                        ? "District"
                        : `${settings?.target_save_note_key_for_district}`,
                value: `${selectedDistrict}`,
            });
        };

        updateAttribute();
    }, [settings?.target_save_note_key_for_district, selectedDistrict]);

    const handleSubdistrictChange = async (value) => {
        setSelectedSubdistrict(value);
        setSelectedSubdistrictErr("");
    };

    useEffect(() => {
        const updateAttribute = async () => {
            const result = await applyAttributeChange({
                type: "updateAttribute",
                key:
                    settings?.target_save_note_key_for_subdistrict == null
                        ? "Subdistrict"
                        : `${settings?.target_save_note_key_for_subdistrict}`,
                value: `${selectedSubdistrict}`,
            });
        };

        updateAttribute();
    }, [settings?.target_save_note_key_for_subdistrict, selectedSubdistrict]);

    const activeFields = [
        settings?.city_field === "Yes",
        settings?.district_field === "Yes",
        settings?.subdistrict_field === "Yes",
    ].filter(Boolean).length;

    const gridColumns = {
        1: ["100%"], // Single column
        2: ["50%", "50%"], // Two columns
        3: ["33.333%", "33.333%", "33.333%"], // Three columns
    }[activeFields] || ["100%"];

    return address?.countryCode == settings?.country_code ? (
        <Grid columns={gridColumns} spacing="loose">
            {loading ? (
                <>
                    <View
                        inlineAlignment="start"
                        border={"base"}
                        borderWidth={"base"}
                        borderRadius={"base"}
                        padding={"base"}
                    >
                        <SkeletonText size="small" />
                    </View>
                    <View
                        inlineAlignment="start"
                        border={"base"}
                        borderWidth={"base"}
                        borderRadius={"base"}
                        padding={"base"}
                    >
                        <SkeletonText size="small" />
                    </View>
                    <View
                        inlineAlignment="start"
                        border={"base"}
                        borderWidth={"base"}
                        borderRadius={"base"}
                        padding={"base"}
                    >
                        <SkeletonText size="small" />
                    </View>
                </>
            ) : (
                <>
                    {settings?.city_field && settings.city_field === "Yes" && (
                        <Select
                            label={
                                (language?.isoCode == "en" ||
                                    language?.isoCode ==
                                        `en-${settings?.country_code}`) &&
                                settings?.label_city_ENG == null
                                    ? `${
                                          selectedCity == ""
                                              ? "Select City"
                                              : "City"
                                      }`
                                    : (language?.isoCode == "en" ||
                                          language?.isoCode ==
                                              `en-${settings?.country_code}`) &&
                                      settings?.label_city_ENG !== null
                                    ? `${
                                          selectedCity == ""
                                              ? `Select ${settings?.label_city_ENG}`
                                              : settings?.label_city_ENG
                                      }`
                                    : (language?.isoCode !== "en" ||
                                          language?.isoCode !==
                                              `en-${settings?.country_code}`) &&
                                      settings?.label_city_translated == null
                                    ? `${
                                          selectedCity == ""
                                              ? settings?.label_city_translated
                                              : settings?.label_city_translated
                                      }`
                                    : `${
                                          selectedCity == ""
                                              ? settings?.label_city_translated
                                              : settings?.label_city_translated
                                      }`
                            }
                            value={selectedCity}
                            options={cities?.map((city) => ({
                                value: city,
                                label: city,
                            }))}
                            onChange={(value) => handleCityChange(value)}
                            required={canBlockProgress}
                            error={selectedCityErr}
                        />
                    )}
                    {settings?.district_field &&
                        settings.district_field === "Yes" && (
                            <Select
                                label={
                                    (language?.isoCode == "en" ||
                                        language?.isoCode ==
                                            `en-${settings?.country_code}`) &&
                                    settings?.label_district_ENG == null
                                        ? `${
                                              selectedDistrict == ""
                                                  ? "Select District"
                                                  : "District"
                                          }`
                                        : (language?.isoCode == "en" ||
                                              language?.isoCode ==
                                                  `en-${settings?.country_code}`) &&
                                          settings?.label_district_ENG !== null
                                        ? `${
                                              selectedDistrict == ""
                                                  ? `Select ${settings?.label_district_ENG}`
                                                  : settings?.label_district_ENG
                                          }`
                                        : (language?.isoCode !== "en" ||
                                              language?.isoCode !==
                                                  `en-${settings?.country_code}`) &&
                                          settings?.label_district_translated ==
                                              null
                                        ? `${
                                              selectedDistrict == ""
                                                  ? settings?.label_district_translated
                                                  : settings?.label_district_translated
                                          }`
                                        : `${
                                              selectedDistrict == ""
                                                  ? settings?.label_district_translated
                                                  : settings?.label_district_translated
                                          }`
                                }
                                value={selectedDistrict}
                                options={districts?.map((district) => ({
                                    value: district,
                                    label: district,
                                }))}
                                onChange={(value) =>
                                    handleDistrictChange(value)
                                }
                                required={canBlockProgress}
                                error={selectedDistrictErr}
                            />
                        )}
                    {settings?.subdistrict_field &&
                        settings.subdistrict_field === "Yes" && (
                            <Select
                                label={
                                    (language?.isoCode == "en" ||
                                        language?.isoCode ==
                                            `en-${settings?.country_code}`) &&
                                    settings?.label_subdistrict_ENG == null
                                        ? `${
                                              selectedSubdistrict == ""
                                                  ? "Select Subdistrict"
                                                  : "Subdistrict"
                                          }`
                                        : (language?.isoCode == "en" ||
                                              language?.isoCode ==
                                                  `en-${settings?.country_code}`) &&
                                          settings?.label_subdistrict_ENG !==
                                              null
                                        ? `${
                                              selectedSubdistrict == ""
                                                  ? `Select ${settings?.label_subdistrict_ENG}`
                                                  : settings?.label_subdistrict_ENG
                                          }`
                                        : (language?.isoCode !== "en" ||
                                              language?.isoCode !==
                                                  `en-${settings?.country_code}`) &&
                                          settings?.label_subdistrict_translated ==
                                              null
                                        ? `${
                                              selectedSubdistrict == ""
                                                  ? settings?.label_subdistrict_translated
                                                  : settings?.label_subdistrict_translated
                                          }`
                                        : `${
                                              selectedSubdistrict == ""
                                                  ? settings?.label_subdistrict_translated
                                                  : settings?.label_subdistrict_translated
                                          }`
                                }
                                value={selectedSubdistrict}
                                options={subdistricts?.map((subdistrict) => ({
                                    value: subdistrict,
                                    label: subdistrict,
                                }))}
                                onChange={(value) =>
                                    handleSubdistrictChange(value)
                                }
                                required={canBlockProgress}
                                error={selectedSubdistrictErr}
                            />
                        )}
                </>
            )}
        </Grid>
    ) : (
        ""
    );
}
