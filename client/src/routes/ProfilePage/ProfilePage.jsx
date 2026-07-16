import React, { useState, useEffect } from "react";
import { useLanguage } from "../../context/LanguageContext";
import "./ProfilePage.css";
import { normalizeCrop, getCropLabel } from "../../lib/cropUtils";
// 🌟 ADDED MISSING FIREBASE IMPORT
import { getAuth } from "firebase/auth";
import {
  User,
  MapPin,
  TreePine,
  IndianRupee,
  Sprout,
  Pencil,
  Save,
  X,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

// ─── Data Maps ────────────────────────────────────────────────────────────────
const FARMER_CAT_LABELS = {
  marginal: { en: "Marginal (≤1 acre)", mr: "सीमांत (≤१ एकर)" },
  small: { en: "Small (1–2 acres)", mr: "लहान (१–२ एकर)" },
  "semi-medium": { en: "Semi-Medium (2–4 ac)", mr: "अर्ध-मध्यम (२–४ एकर)" },
  medium: { en: "Medium (4–10 acres)", mr: "मध्यम (४–१० एकर)" },
  large: { en: "Large (>10 acres)", mr: "मोठे (>१० एकर)" },
};

const LAND_TYPE_LABELS = {
  Rainfed: { en: "Rainfed", mr: "कोरडवाहू" },
  Irrigated: { en: "Irrigated", mr: "बागायत" },
  Dryland: { en: "Dryland", mr: "जिरायत" },
};

const DISTRICT_LABELS = {
  "Mumbai City": "मुंबई शहर",
  "Mumbai Suburban": "मुंबई उपनगर",
  Thane: "ठाणे",
  Palghar: "पालघर",
  Raigad: "रायगड",
  Ratnagiri: "रत्नागिरी",
  Sindhudurg: "सिंधुदुर्ग",

  // Pune Division
  Pune: "पुणे",
  Satara: "सातारा",
  Sangli: "सांगली",
  Solapur: "सोलापूर",
  Kolhapur: "कोल्हापूर",

  // Nashik Division
  Nashik: "नाशिक",
  Ahmednagar: "अहमदनगर",
  Jalgaon: "जळगाव",
  Dhule: "धुळे",
  Nandurbar: "नंदुरबार",

  // Chhatrapati Sambhajinagar (formerly Aurangabad) Division
  "Chhatrapati Sambhajinagar": "छत्रपती संभाजीनगर",
  Jalna: "जालना",
  Parbhani: "परभणी",
  Hingoli: "हिंगोली",
  Beed: "बीड",
  Nanded: "नांदेड",
  Dharashiv: "धाराशिव",
  Latur: "लातूर",

  // Amravati Division
  Amravati: "अमरावती",
  Akola: "अकोला",
  Buldhana: "बुलढाणा",
  Washim: "वाशिम",
  Yavatmal: "यवतमाळ",

  // Nagpur Division
  Nagpur: "नागपूर",
  Wardha: "वर्धा",
  Bhandara: "भंडारा",
  Gondia: "गोंदिया",
  Chandrapur: "चंद्रपूर",
  Gadchiroli: "गडचिरोली",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function computeCompletion(p) {
  if (!p) return { percent: 0, missing: [] };
  const checks = {
    // 🌟 FIXED: Now checks both flat and nested district to calculate completion
    district: !!p.district || !!p.location?.district,
    landType: !!p.landType,
    landSize: p.landSize != null,
    annualIncome: p.annualIncome != null,
    crops: p.crops?.length > 0,
  };
  const filled = Object.values(checks).filter(Boolean).length;
  const missing = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return { percent: Math.round((filled / 5) * 100), missing };
}

function fillClass(pct) {
  if (pct === 100) return "pct-100";
  if (pct > 60) return "pct-high";
  return "pct-low";
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const Field = ({ label, value }) => (
  <div className="field-item">
    <div className="field-label">{label}</div>
    <div className={`field-value ${value ? "" : "empty"}`}>
      {value || (
        <>
          <span className="empty-dot" />
        </>
      )}
      {!value && <span>—</span>}
    </div>
  </div>
);

const ProfileCard = ({ icon, title, children }) => (
  <div className="profileCard">
    <div className="profileCard-header">
      <div className="profileCard-icon">{icon}</div>
      <div className="profileCard-title">{title}</div>
    </div>
    <div className="profileCard-body">{children}</div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const ProfilePage = () => {
  const { language } = useLanguage();
  const isMr = language === "mr-IN";

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formData, setFormData] = useState({});

  const t = isMr
    ? {
        title: "माझे प्रोफाइल",
        subtitle: "सरकारी योजनांसाठी तुमची माहिती",
        completion: "प्रोफाइल पूर्ण",
        edit: "संपादित करा",
        save: "जतन करा",
        cancel: "रद्द करा",
        location: "स्थान",
        farm: "शेत माहिती",
        financial: "आर्थिक माहिती",
        crops: "पिके",
        district: "जिल्हा",
        state: "राज्य",
        landType: "जमीन प्रकार",
        acreage: "क्षेत्रफळ (एकर)",
        income: "वार्षिक उत्पन्न (₹)",
        farmerTier: "शेतकरी श्रेणी",
        cropsList: "पिके (स्वल्पविरामाने)",
        notSet: "—",
        saved: "जतन झाले!",
        missing: "काही माहिती अपूर्ण आहे. संपादित करण्यासाठी Edit दाबा.",
        saveError: "जतन करताना त्रुटी. पुन्हा प्रयत्न करा.",
        loading: "लोड होत आहे...",
      }
    : {
        title: "My Profile",
        subtitle: "Your details for government scheme recommendations",
        completion: "Profile Complete",
        edit: "Edit Profile",
        save: "Save Changes",
        cancel: "Cancel",
        location: "Location",
        farm: "Farm Details",
        financial: "Financial Info",
        crops: "Crops Grown",
        district: "District",
        state: "State",
        landType: "Land Type",
        acreage: "Land Area (acres)",
        income: "Annual Income (₹)",
        farmerTier: "Farmer Tier",
        cropsList: "Crops (comma separated)",
        notSet: "—",
        saved: "Saved!",
        missing: "Some info is missing. Click Edit to fill it in.",
        saveError: "Error saving. Please try again.",
        loading: "Loading...",
      };

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const auth = getAuth();
      const realUserId = auth.currentUser
        ? auth.currentUser.uid
        : "anonymous_user";

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/profile/status?user_id=${realUserId}`,
        { credentials: "include" },
      );

      const responseData = await res.json();
      console.log("📥 Raw Backend Response:", responseData);

      // 🌟 FIXED: Look inside the 'data' property sent by the backend
      const p = responseData.data || responseData.profile || {};

      setProfile(p);

      setFormData({
        district: p.district || p.location?.district || "",
        state: p.state || p.location?.state || "Maharashtra",
        landType: p.landType || "",
        landSize: p.landSize ?? "",
        annualIncome: p.annualIncome ?? "",
        crops: Array.isArray(p.crops) ? p.crops.join(", ") : (p.crops || ""),
      });
    } catch (err) {
      console.error("Fetch profile error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);

    // 1. Get the Auth User
    const auth = getAuth();
    const realUserId = auth.currentUser
      ? auth.currentUser.uid
      : "anonymous_user";

    try {
      // 🌟 NEW: Translate manual inputs if the user is typing in Marathi
      let finalDistrict = formData.district;
      let finalCrops = formData.crops;

      if (language === "mr-IN") {
        // Translate District
        if (finalDistrict) {
          const distRes = await fetch(
            `${import.meta.env.VITE_API_URL}/api/translate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: finalDistrict, target_lang: "en" }),
            },
          );
          const distData = await distRes.json();
          finalDistrict = distData.translated
            ? distData.translated.trim()
            : finalDistrict;
        }

        // Translate Crops
        if (finalCrops) {
          const cropRes = await fetch(
            `${import.meta.env.VITE_API_URL}/api/translate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: finalCrops, target_lang: "en" }),
            },
          );
          const cropData = await cropRes.json();
          finalCrops = cropData.translated || finalCrops;
        }
      }

      // 2. Define the fields safely using the translated text
      const fields = [
        { field: "district", value: finalDistrict || null },
        { field: "state", value: formData.state || "Maharashtra" },
        { field: "landType", value: formData.landType || null },
        {
          field: "landSize",
          value:
            formData.landSize !== "" ? parseFloat(formData.landSize) : null,
        },
        {
          field: "annualIncome",
          value:
            formData.annualIncome !== ""
              ? parseInt(formData.annualIncome)
              : null,
        },
        {
          field: "crops",
          value: finalCrops
            ? [
                ...new Set(
                  finalCrops
                    .split(/[, ]+/) // Split by commas or spaces
                    .filter(
                      (word) =>
                        ![
                          "and",
                          "i",
                          "grow",
                          "my",
                          "crops",
                          "are",
                          "also",
                        ].includes(word.toLowerCase()),
                    ) // Strip English filler
                    .filter((word) => word.length > 1)
                    .map(
                      (c) =>
                        c.charAt(0).toUpperCase() + c.slice(1).toLowerCase(),
                    ), // Capitalize
                ),
              ]
            : [],
        },
      ].filter(
        ({ value }) =>
          value !== null &&
          value !== undefined &&
          !(Array.isArray(value) && value.length === 0),
      );

      // 3. Loop through and save cleanly
      for (const item of fields) {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/profile/update-field`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: realUserId,
              field: item.field,
              value: item.value,
            }),
          },
        );

        const result = await res.json();
        if (!res.ok || !result.success)
          throw new Error(`Failed on ${item.field}`);
      }

      // 4. Wrap it up
      await fetchProfile();
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Save error:", err);
      alert(t.saveError);
    } finally {
      setSaving(false);
    }
  };

  const { percent, missing } = computeCompletion(profile);

  const tierLabel = profile?.farmerCategory
    ? FARMER_CAT_LABELS[profile.farmerCategory]?.[isMr ? "mr" : "en"] ||
      profile.farmerCategory
    : null;
  const landTypeLabel = profile?.landType
    ? LAND_TYPE_LABELS[profile.landType]?.[isMr ? "mr" : "en"] ||
      profile.landType
    : null;

  const cropList = formData.crops
    ? formData.crops
        .split(",")
        .map((c) => normalizeCrop(c))
        .filter(Boolean)
    : [];

  const uniqueCropKeys = [...new Set(cropList)];

  const rawCrops = profile?.crops 
    ? (Array.isArray(profile.crops) ? profile.crops : profile.crops.split(",")) 
    : [];

  const viewModeCrops = [...new Set(rawCrops.map((c) => normalizeCrop(c)).filter(Boolean))];

  return (
    <div className="profilePage">
      <div className="profilePage-inner">
        {/* ── Hero ── */}
        <div className="profileHero">
          <div className="profileHero-left">
            <div className="profileHero-avatar">
              <User size={30} strokeWidth={1.5} />
            </div>
            <div>
              <div className="profileHero-title">{t.title}</div>
              <div className="profileHero-sub">{t.subtitle}</div>
            </div>
          </div>

          <div className="profileHero-right">
            <div>
              <div className="completion-label">
                {percent === 100 ? "✓ " : ""}
                {percent}% {t.completion}
              </div>
              <div className="completion-track">
                <div
                  className={`completion-fill ${fillClass(percent)}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
            {!editing && (
              <div className="profileHero-btns">
                <button className="heroBtn" onClick={() => setEditing(true)}>
                  <Pencil size={14} />
                  {t.edit}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Saved toast ── */}
        {saved && (
          <div className="profile-toast">
            <CheckCircle size={18} />
            {t.saved}
          </div>
        )}

        {/* ── Missing notice ── */}
        {missing.length > 0 && !editing && (
          <div className="profile-notice">
            <AlertCircle size={17} />
            <span>{t.missing}</span>
          </div>
        )}

        {/* ════════ VIEW MODE ════════ */}
        {!editing && (
          <>
            <ProfileCard icon={<MapPin size={17} />} title={t.location}>
              <div className="field-grid">
                <Field
                  label={t.district}
                  // 🌟 FIXED: Translates the DB string to Marathi for display
                  value={
                    isMr
                      ? DISTRICT_LABELS[profile?.district] || profile?.district
                      : profile?.district
                  }
                />
                <Field
                  label={t.state}
                  // 🌟 FIXED: Hardcode Marathi translation for state display
                  value={isMr ? "महाराष्ट्र" : "Maharashtra"}
                />
              </div>
            </ProfileCard>

            <ProfileCard icon={<TreePine size={17} />} title={t.farm}>
              <div className="field-grid">
                <Field label={t.landType} value={landTypeLabel} />
                <Field
                  label={t.acreage}
                  value={
                    profile?.landSize != null
                      ? `${profile.landSize} ${isMr ? "एकर" : "acres"}`
                      : null
                  }
                />
              </div>
              {tierLabel && (
                <div className="tier-badge">
                  <CheckCircle size={13} />
                  {tierLabel}
                </div>
              )}
            </ProfileCard>

            <ProfileCard icon={<IndianRupee size={17} />} title={t.financial}>
              <div className="field-grid">
                <Field
                  label={t.income}
                  value={
                    profile?.annualIncome != null
                      ? `₹${Number(profile.annualIncome).toLocaleString("en-IN")}`
                      : null
                  }
                />
                <Field label={t.farmerTier} value={tierLabel} />
              </div>
            </ProfileCard>

            <ProfileCard icon={<Sprout size={17} />} title={t.crops}>
              {viewModeCrops.length > 0 ? (
                <div className="chip-wrap">
                  {viewModeCrops.map((c, i) => (
                    <div key={i} className="chip">
                      {getCropLabel(c, isMr)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="field-value empty">
                  <span className="empty-dot" />
                  {t.notSet}
                </div>
              )}
            </ProfileCard>
          </>
        )}

        {/* ════════ EDIT MODE ════════ */}
        {editing && (
          <>
            <ProfileCard icon={<MapPin size={17} />} title={t.location}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t.district}</label>
                  <input
                    className="form-input"
                    placeholder={isMr ? "उदा. पुणे" : "e.g. Pune"}
                    value={formData.district}
                    onChange={(e) =>
                      setFormData({ ...formData, district: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.state}</label>
                  <input
                    className="form-input"
                    value={formData.state}
                    onChange={(e) =>
                      setFormData({ ...formData, state: e.target.value })
                    }
                  />
                </div>
              </div>
            </ProfileCard>

            <ProfileCard icon={<TreePine size={17} />} title={t.farm}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t.landType}</label>
                  <select
                    className="form-select"
                    value={formData.landType || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, landType: e.target.value })
                    }
                  >
                    <option value="">{isMr ? "निवडा" : "Select"}</option>
                    <option value="Rainfed">
                      {isMr ? "कोरडवाहू" : "Rainfed"}
                    </option>
                    <option value="Irrigated">
                      {isMr ? "बागायत" : "Irrigated"}
                    </option>
                    <option value="Dryland">
                      {isMr ? "जिरायत" : "Dryland"}
                    </option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t.acreage}</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0.0"
                    value={formData.landSize}
                    onChange={(e) =>
                      setFormData({ ...formData, landSize: e.target.value })
                    }
                  />
                </div>
              </div>
            </ProfileCard>

            <ProfileCard icon={<IndianRupee size={17} />} title={t.financial}>
              <div className="form-group">
                <label className="form-label">{t.income}</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  placeholder="180000"
                  value={formData.annualIncome}
                  onChange={(e) =>
                    setFormData({ ...formData, annualIncome: e.target.value })
                  }
                />
              </div>
            </ProfileCard>

            <ProfileCard icon={<Sprout size={17} />} title={t.crops}>
              <div className="form-group">
                <label className="form-label">{t.cropsList}</label>
                <input
                  className="form-input"
                  placeholder={
                    isMr ? "टोमॅटो, कांदा, सोयाबीन" : "Tomato, Onion, Soybean"
                  }
                  value={formData.crops}
                  onChange={(e) =>
                    setFormData({ ...formData, crops: e.target.value })
                  }
                />
                {uniqueCropKeys.length > 0 && (
                  <div className="crop-preview">
                    {uniqueCropKeys.map((c, i) => (
                      <div key={i} className="chip">
                        {getCropLabel(c, isMr)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ProfileCard>

            <div className="profile-action-bar">
              <button
                className="profile-save-btn"
                onClick={handleSave}
                disabled={saving}
              >
                <Save size={16} />
                {saving ? (isMr ? "जतन होत आहे..." : "Saving...") : t.save}
              </button>
              <button
                className="profile-cancel-btn"
                onClick={() => setEditing(false)}
              >
                <X size={16} />
                {t.cancel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
