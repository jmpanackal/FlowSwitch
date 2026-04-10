import {
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  normalizeFlowProfile,
  type FlowProfile,
  type ProfileStoreError,
  type ProfileListResult,
} from "../../../types/flow-profile";

type UseProfilesPersistenceOptions = {
  /** React `useState` setter — stable identity; listed in effect deps for lint clarity only. */
  setSelectedProfileId: Dispatch<SetStateAction<string>>;
};

export function useProfilesPersistence({
  setSelectedProfileId,
}: UseProfilesPersistenceOptions) {
  const [profiles, setProfiles] = useState<FlowProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [profileStoreError, setProfileStoreError] =
    useState<ProfileStoreError | null>(null);
  const blockProfileAutosaveAfterStoreErrorRef = useRef(false);
  const skipNextAutosaveRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    const loadProfiles = async () => {
      if (!window.electron?.listProfiles) {
        if (!cancelled) setProfilesLoaded(true);
        return;
      }

      try {
        const listResult = (await window.electron.listProfiles()) as unknown as ProfileListResult;
        if (cancelled) return;

        const rawProfiles = Array.isArray(listResult)
          ? listResult
          : listResult.profiles;
        const storeErr = Array.isArray(listResult)
          ? null
          : listResult.storeError ?? null;

        if (storeErr) {
          setProfileStoreError(storeErr);
          blockProfileAutosaveAfterStoreErrorRef.current = true;
        } else {
          setProfileStoreError(null);
          blockProfileAutosaveAfterStoreErrorRef.current = false;
        }

        const normalizedProfiles = Array.isArray(rawProfiles)
          ? rawProfiles.map(normalizeFlowProfile)
          : [];
        setProfiles(normalizedProfiles);
        setSelectedProfileId((prev) => prev || normalizedProfiles[0]?.id || "");
      } catch (error) {
        console.error("Failed to load persisted profiles:", error);
        if (!cancelled) {
          setProfileStoreError({
            code: "LOAD_FAILED",
            message:
              "Could not load profiles from the app (IPC or bridge error). Try restarting FlowSwitch. "
              + "If this persists, check disk space and whether security software is blocking the profile file.",
          });
          blockProfileAutosaveAfterStoreErrorRef.current = true;
          setProfiles([]);
          setSelectedProfileId("");
        }
      } finally {
        if (!cancelled) setProfilesLoaded(true);
      }
    };

    void loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [setSelectedProfileId]);

  useEffect(() => {
    if (!profilesLoaded) return;
    if (!window.electron?.saveProfiles) return;
    if (blockProfileAutosaveAfterStoreErrorRef.current) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void window.electron.saveProfiles(profiles).catch((error) => {
        console.error("Failed to save persisted profiles:", error);
      });
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [profiles, profilesLoaded]);

  useEffect(() => {
    if (!profilesLoaded) return;

    setSelectedProfileId((prev) => {
      if (prev && profiles.some((profile) => profile.id === prev)) return prev;
      return profiles[0]?.id || "";
    });
  }, [profiles, profilesLoaded, setSelectedProfileId]);

  return {
    profiles,
    setProfiles,
    profilesLoaded,
    profileStoreError,
    skipNextAutosaveRef,
    blockProfileAutosaveAfterStoreErrorRef,
  };
}
