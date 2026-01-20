import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";

// Checkout will call this default export
export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  // All Checkout APIs come from the global `shopify` object.
  // Many of these are Preact Signals: use `.value` to read them.
  const {
    settings,
    shippingAddress,
    language,
    buyerJourney,
    extensionCapabilities,
    attributeValues,
    applyAttributeChange,
    applyShippingAddressChange,
  } = shopify;

  // --- Derive initial values from signals ---

  const settingsValue = settings.value ?? {};
  const address = shippingAddress.value ?? {};
  const languageValue = language.value ?? {};

  const [
    defaultRegionSignal,
    defaultZipcodeSignal,
    attDistrictSignal,
  ] = attributeValues.value([
    settingsValue.target_save_note_key_for_Region || "Region",
    settingsValue.target_save_note_key_for_zipcode || "Zip Code",
    settingsValue.target_save_note_key_for_district || "District",
  ]);

  const defaultRegion = defaultRegionSignal?.value || "";
  const defaultZipcode = defaultZipcodeSignal?.value || "";
  const attDisrict = attDistrictSignal?.value || "";

  const defaultCity = address.city || "";
  const defaultDistrict =
    address.address2 && address.address2.includes(",")
      ? address.address2.split(",").pop().trim()
      : attDisrict || "";

  const canBlockProgress = extensionCapabilities.value?.includes(
    "block_progress",
  );

  // --- Local component state ---

  const [data, setData] = useState([]);
  const [regions, setRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState(
    address.provinceCode || defaultRegion || "",
  );
  const [selectedRegionErr, setSelectedRegionErr] = useState("");

  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(defaultCity || "");
  const [selectedCityErr, setSelectedCityErr] = useState("");

  const [districts, setDistricts] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState(defaultDistrict || "");
  const [selectedDistrictErr, setSelectedDistrictErr] = useState("");

  const [selectedZipcode, setSelectedZipcode] = useState(
    address.zip || defaultZipcode || "",
  );
  const [selectedzipcodeErr, setSelectedzipcodeErr] = useState("");

  const [loading, setLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // --- Buyer journey blocking logic (intercept) ---

  useEffect(() => {
    // register intercept once
    const unsubscribe = buyerJourney.intercept(({canBlockProgress}) => {
      if (canBlockProgress && selectedRegion === "" && regions?.length > 0) {
        return {
          behavior: "block",
          reason: "Region is required",
          perform: (result) => {
            if (result.behavior === "block") {
              setSelectedRegionErr("Region is required");
              setSelectedCityErr("Please enter the City of the address");
              setSelectedDistrictErr(
                "Please enter the Barangay of the address",
              );
              setSelectedzipcodeErr("Zip Code as parameter is required");
            }
          },
        };
      } else if (
        selectedRegion &&
        address.provinceCode &&
        selectedRegion !== address.provinceCode
      ) {
        return {
          behavior: "block",
          reason: "Region does not match the selected location",
          errors: [
            {
              message: "Region does not match the selected location",
              target:
                "$.cart.deliveryGroups[0].deliveryAddress.provinceCode",
            },
          ],
        };
      }

      if (canBlockProgress && selectedCity === "" && cities?.length > 0) {
        return {
          behavior: "block",
          reason: "Please enter the City of the address",
          perform: (result) => {
            if (result.behavior === "block") {
              setSelectedCityErr("Please enter the City of the address");
              setSelectedDistrictErr(
                "Please enter the Barangay of the address",
              );
              setSelectedzipcodeErr("Zip Code as parameter is required");
            }
          },
        };
      } else if (
        address.city &&
        selectedCity &&
        selectedCity !== address.city
      ) {
        return {
          behavior: "block",
          reason: "City does not match the selected location",
          errors: [
            {
              message: "City does not match the selected location",
              target: "$.cart.deliveryGroups[0].deliveryAddress.city",
            },
          ],
        };
      }

      if (canBlockProgress && selectedDistrict === "" && districts?.length > 0) {
        return {
          behavior: "block",
          reason: "Please enter the Barangay of the address",
          perform: (result) => {
            if (result.behavior === "block") {
              setSelectedDistrictErr(
                "Please enter the Barangay of the address",
              );
              setSelectedzipcodeErr("Zip Code as parameter is required");
            }
          },
        };
      }

      if (canBlockProgress && selectedZipcode === "") {
        return {
          behavior: "block",
          reason: "Zip Code as parameter is required",
          perform: (result) => {
            if (result.behavior === "block") {
              setSelectedzipcodeErr("Zip Code as parameter is required");
            }
          },
        };
      } else if (
        selectedZipcode &&
        address.zip &&
        selectedZipcode !== address.zip
      ) {
        return {
          behavior: "block",
          reason: "Zip code does not match the selected location",
          errors: [
            {
              message: "Zip code does not match the selected location",
              target: "$.cart.deliveryGroups[0].deliveryAddress.zip",
            },
          ],
        };
      }

      return {
        behavior: "allow",
        perform: () => {
          clearValidationError();
        },
      };
    });

    return () => {
      unsubscribe?.();
    };
  }, [
    buyerJourney,
    selectedRegion,
    selectedCity,
    selectedDistrict,
    selectedZipcode,
    regions,
    cities,
    districts,
    address.city,
    address.provinceCode,
    address.zip,
  ]);

  function clearValidationError() {
    setSelectedRegionErr("");
    setSelectedCityErr("");
    setSelectedDistrictErr("");
    setSelectedzipcodeErr("");
  }

  // --- Load region/city/district data ---

  useEffect(() => {
    if (!settingsValue.addresses_file_url || !address.countryCode) return;
    setLoading(true);

    fetch(settingsValue.addresses_file_url)
      .then((response) => response.json())
      .then((jsonData) => {
        const filteredData = jsonData?.filter(
          (item) => item?.country_id === address.countryCode,
        );
        setData(filteredData);

        const uniqueRegions = Array.from(
          new Map(
            filteredData.map((item) => {
              const value = item?.region_code || item?.Region;
              const label =
                item?.region_name || item?.Region || "Unknown Region";
              return [value, {value, label}];
            }),
          ).values(),
        );

        const sortedRegions = uniqueRegions.sort((a, b) =>
          a.label.localeCompare(b.label),
        );

        setRegions(sortedRegions);
        setLoading(false);
        setSelectedRegion(
          address.provinceCode || defaultRegion || sortedRegions[0]?.value || "",
        );
        setInitialLoadComplete(true);
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
        setLoading(false);
      });
  }, [settingsValue.addresses_file_url, address.countryCode]);

  // When region changes, update cities and reset dependent fields
  useEffect(() => {
    if (selectedRegion && data?.length > 0) {
      const regionCities = data
        ?.filter(
          (location) =>
            location?.region_code === selectedRegion ||
            location?.Region === selectedRegion,
        )
        .map((location) => location?.city);

      const sortedCities = [...new Set(regionCities)].sort((a, b) =>
        a.localeCompare(b),
      );

      setCities(sortedCities);

      setSelectedCity(
        regionCities?.includes(defaultCity) ? defaultCity : "",
      );
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
  }, [selectedRegion, data, defaultCity]);

  // When city changes, update districts and reset dependent fields
  useEffect(() => {
    if (selectedCity && selectedRegion && data?.length > 0) {
      const cityDistricts = data
        ?.filter(
          (location) =>
            (location?.region_code === selectedRegion ||
              location?.Region === selectedRegion) &&
            location?.city === selectedCity,
        )
        .map((location) => location?.district);

      const sortedDistricts = [...new Set(cityDistricts)].sort((a, b) =>
        a.localeCompare(b),
      );
      setDistricts(sortedDistricts);

      setSelectedDistrict(
        cityDistricts?.includes(defaultDistrict) ? defaultDistrict : "",
      );
      setSelectedDistrictErr("");
      setSelectedzipcodeErr("");
      setSelectedZipcode(selectedDistrict || "");
    } else {
      setDistricts([]);
      setSelectedDistrict("");
      setSelectedDistrictErr("");
      setSelectedzipcodeErr("");
      setSelectedZipcode("");
    }
  }, [selectedCity, selectedRegion, data, defaultDistrict, selectedDistrict]);

  // Validate zipcode when district is selected
  useEffect(() => {
    if (selectedDistrict && selectedCity && selectedRegion && data?.length > 0) {
      const zipcodeLocation = data?.find(
        (location) =>
          (location?.region_code === selectedRegion ||
            location?.Region === selectedRegion) &&
          location?.city === selectedCity &&
          location?.district === selectedDistrict,
      );
      setSelectedZipcode(zipcodeLocation?.zipcode || "");
    }
  }, [selectedDistrict, selectedCity, selectedRegion, data]);

  // Extract district from address2 if it contains comma
  useEffect(() => {
    if (
      address.address2 &&
      address.address2.includes(",") &&
      !selectedDistrict
    ) {
      const parts = address.address2
        .split(",")
        .map((val) => val.trim());

      Promise.resolve().then(() => {
        const last = parts[parts.length - 1];
        if (last) {
          setSelectedDistrict(last);
        }
      });
    }
  }, [address.address2, selectedDistrict]);

  // Set city from address.city
  useEffect(() => {
    if (address.city) {
      setSelectedCity(address.city.trim());
    }
  }, [address.city]);

  // Auto-select district based on zipcode if needed
  useEffect(() => {
    if (
      initialLoadComplete &&
      data?.length > 0 &&
      address.city &&
      address.address2 &&
      !address.address2.includes(",") &&
      !attDisrict &&
      address.zip &&
      address.provinceCode &&
      selectedRegion === address.provinceCode &&
      selectedCity === address.city &&
      !selectedDistrict &&
      districts?.length > 0
    ) {
      const matchingLocations = data?.filter(
        (location) =>
          (location?.region_code === address.provinceCode ||
            location?.Region === address.provinceCode) &&
          location?.city === address.city &&
          location?.zipcode === address.zip,
      );

      if (matchingLocations?.length > 0) {
        const firstDistrict = matchingLocations[0]?.district;
        if (firstDistrict && districts?.includes(firstDistrict)) {
          setSelectedDistrict(firstDistrict);
        }
      }
    }
  }, [
    initialLoadComplete,
    data,
    address.city,
    address.address2,
    address.zip,
    address.provinceCode,
    attDisrict,
    selectedRegion,
    selectedCity,
    selectedDistrict,
    districts,
  ]);

  // --- Event handlers ---

  const handleRegionChange = (value) => {
    setSelectedRegion(value);
    setSelectedRegionErr("");
  };

  const handleCityChange = (value) => {
    setSelectedCity(value);
    setSelectedCityErr("");
  };

  const handleDistrictChange = (value) => {
    setSelectedDistrict(value);
    setSelectedDistrictErr("");
  };

  const handleZipcodeChange = (value) => {
    setSelectedZipcode(value);
    setSelectedzipcodeErr("");
  };

  // --- Apply attribute / shipping address changes ---

  useEffect(() => {
    if (selectedRegion) {
      applyAttributeChange({
        type: "updateAttribute",
        key: settingsValue.target_save_note_key_for_Region || "Region",
        value: selectedRegion,
      });

      if (selectedRegion !== address.provinceCode) {
        applyShippingAddressChange({
          type: "updateShippingAddress",
          address: {
            ...address,
            provinceCode: selectedRegion,
            city: "",
            zip: "",
          },
        });
      }
    }
  }, [
    selectedRegion,
    settingsValue.target_save_note_key_for_Region,
    address,
    applyAttributeChange,
    applyShippingAddressChange,
  ]);

  useEffect(() => {
    if (selectedCity && selectedCity !== address.city) {
      applyAttributeChange({
        type: "updateAttribute",
        key: settingsValue.target_save_note_key_for_city || "City",
        value: selectedCity,
      });

      applyShippingAddressChange({
        type: "updateShippingAddress",
        address: {
          ...address,
          city: selectedCity,
        },
      });
    }
  }, [
    selectedCity,
    settingsValue.target_save_note_key_for_city,
    address,
    applyAttributeChange,
    applyShippingAddressChange,
  ]);

  useEffect(() => {
    if (selectedDistrict) {
      let baseAddress2 = address.address2 || "";
      if (baseAddress2.includes(",")) {
        baseAddress2 = baseAddress2
          .split(",")
          .slice(0, -1)
          .join(",")
          .trim();
      }

      const fullAddress2 =
        baseAddress2 + (selectedDistrict ? `, ${selectedDistrict}` : "");

      applyShippingAddressChange({
        type: "updateShippingAddress",
        address: {
          ...address,
          address2: fullAddress2,
        },
      });

      applyAttributeChange({
        type: "updateAttribute",
        key: settingsValue.target_save_note_key_for_district || "District",
        value: selectedDistrict,
      });
    }
  }, [
    selectedDistrict,
    settingsValue.target_save_note_key_for_district,
    address,
    applyAttributeChange,
    applyShippingAddressChange,
  ]);

  useEffect(() => {
    if (selectedZipcode) {
      applyAttributeChange({
        type: "updateAttribute",
        key: settingsValue.target_save_note_key_for_zipcode || "Zip Code",
        value: selectedZipcode,
      });

      if (selectedZipcode !== address.zip) {
        applyShippingAddressChange({
          type: "updateShippingAddress",
          address: {
            ...address,
            zip: selectedZipcode,
          },
        });
      }
    }
  }, [
    selectedZipcode,
    settingsValue.target_save_note_key_for_zipcode,
    address,
    applyAttributeChange,
    applyShippingAddressChange,
  ]);

  // --- UI: Polaris web components (JSX) ---

  const isEnglish =
    languageValue.isoCode === "en" ||
    languageValue.isoCode === `en-${settingsValue.country_code}`;

  const blockTitle =
    settingsValue.block_title !== "" && settingsValue.block_title != null
      ? settingsValue.block_title
      : "Barangay and Zip Code";

  const regionLabel =
    isEnglish && settingsValue.label_region_ENG == null
      ? selectedRegion === "" ? "Select Region" : "Region"
      : selectedRegion === ""
        ? `Select ${settingsValue.label_region_ENG}`
        : settingsValue.label_region_ENG;

  const cityLabel =
    isEnglish && settingsValue.label_city_ENG == null
      ? selectedCity === "" ? "Select City" : "City"
      : selectedCity === ""
        ? `Select ${settingsValue.label_city_ENG}`
        : settingsValue.label_city_ENG;

  const districtLabel =
    isEnglish && settingsValue.label_district_ENG == null
      ? selectedDistrict === "" ? "Select Barangay" : "Barangay"
      : selectedDistrict === ""
        ? `Select ${settingsValue.label_district_ENG}`
        : settingsValue.label_district_ENG;

  const zipcodeLabel =
    isEnglish && settingsValue.label_zipcode_ENG == null
      ? "Zip Code"
      : settingsValue.label_zipcode_ENG || "Zip Code";

  return (
    <s-box border="none">
      <s-stack direction="block" gap="base">
        <s-heading>{blockTitle}</s-heading>

        {loading ? (
          <s-stack direction="block" gap="base">
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
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            <s-select
              label={regionLabel}
              value={selectedRegion}
              required={canBlockProgress}
              error={selectedRegionErr}
              onChange={(value) => handleRegionChange(value)}
            >
              {regions?.map((region) => (
                <s-option value={region.value}>{region.label}</s-option>
              ))}
            </s-select>

            <s-select
              label={cityLabel}
              value={selectedCity}
              required={canBlockProgress}
              error={selectedCityErr}
              disabled={!selectedRegion || cities.length === 0}
              onChange={(value) => handleCityChange(value)}
            >
              {cities?.map((city) => (
                <s-option value={city}>{city}</s-option>
              ))}
            </s-select>

            <s-select
              label={districtLabel}
              value={selectedDistrict}
              required={canBlockProgress}
              error={selectedDistrictErr}
              disabled={!selectedCity || districts.length === 0}
              onChange={(value) => handleDistrictChange(value)}
            >
              {districts?.map((district) => (
                <s-option value={district}>{district}</s-option>
              ))}
            </s-select>

            <s-text-field
              label={zipcodeLabel}
              value={selectedZipcode}
              required={canBlockProgress}
              error={selectedzipcodeErr}
              disabled
              onChange={(value) => handleZipcodeChange(value)}
            />
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}