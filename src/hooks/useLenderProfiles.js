import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * useLenderProfiles
 * Loads all branch lender profiles + LO AE overrides.
 * Priority: loProfiles/lo_profile_default/aeOverrides/{docId}  >  lenderProfiles/{docId}
 */
export function useLenderProfiles() {
  const [profilesByName, setProfilesByName] = useState({});
  const [aeOverrides, setAeOverrides]       = useState({});
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(collection(db, "lenderProfiles"));
        const byName = {};
        snap.forEach((d) => {
          const data = { id: d.id, ...d.data() };
          if (data.name) byName[data.name.toLowerCase().trim()] = data;
        });
        setProfilesByName(byName);

        const loSnap = await getDoc(doc(db, "loProfiles", "lo_profile_default"));
        if (loSnap.exists()) {
          setAeOverrides(loSnap.data().aeOverrides || {});
        }
      } catch (err) {
        console.error("[useLenderProfiles]", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function getAeInfo(lenderName) {
    if (!lenderName) return null;
    const profile = profilesByName[lenderName.toLowerCase().trim()];
    if (!profile) return null;

    const override = aeOverrides[profile.id];
    if (override && (override.aeContact || override.aeEmail || override.aePhone)) {
      return {
        aeContact: override.aeContact || null,
        aeEmail:   override.aeEmail   || null,
        aePhone:   override.aePhone   || null,
        isOverride: true,
      };
    }

    if (profile.aeContact || profile.aeEmail || profile.aePhone) {
      return {
        aeContact: profile.aeContact || null,
        aeEmail:   profile.aeEmail   || null,
        aePhone:   profile.aePhone   || null,
        isOverride: false,
      };
    }

    return null;
  }

  return { getAeInfo, loading };
}