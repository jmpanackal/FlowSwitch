import {
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  normalizeFlowProfile,
  toSerializableProfiles,
  type ContentLibrarySnapshot,
  type FlowProfile,
  type ProfileStoreError,
  type ProfileListResult,
  type ProfileSavePayload,
} from "../../../types/flow-profile";
import {
  monitorLayoutPositionsDiffer,
  syncAllProfilesMonitorLayoutPositions,
} from "../utils/sharedMonitorLayout";

type UseProfilesPersistenceOptions = {
  /** React `useState` setter — stable identity; listed in effect deps for lint clarity only. */
  setSelectedProfileId: Dispatch<SetStateAction<string>>;
};

const emptyLibrary = (): ContentLibrarySnapshot => ({ items: [], folders: [] });

export function useProfilesPersistence({
  setSelectedProfileId,
}: UseProfilesPersistenceOptions) {
  const [profiles, setProfiles] = useState<FlowProfile[]>([]);
  const [contentLibrary, setContentLibrary] = useState<ContentLibrarySnapshot>(
    emptyLibrary,
  );
  const [contentLibraryExclusions, setContentLibraryExclusions] = useState<
    Record<string, string[]>
  >({});
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
        const harmonized = syncAllProfilesMonitorLayoutPositions(normalizedProfiles);
        if (monitorLayoutPositionsDiffer(normalizedProfiles, harmonized)) {
          skipNextAutosaveRef.current = false;
        }
        setProfiles(harmonized);
        setSelectedProfileId((prev) => prev || normalizedProfiles[0]?.id || "");

        if (Array.isArray(listResult)) {
          setContentLibrary(emptyLibrary());
          setContentLibraryExclusions({});
        } else {
          const lib = listResult.contentLibrary;
          setContentLibrary(
            lib && typeof lib === "object"
              ? {
                items: Array.isArray(lib.items) ? lib.items : [],
                folders: Array.isArray(lib.folders) ? lib.folders : [],
              }
              : emptyLibrary(),
          );
          const ex = listResult.contentLibraryExclusions;
          setContentLibraryExclusions(
            ex && typeof ex === "object" && !Array.isArray(ex)
              ? (ex as Record<string, string[]>)
              : {},
          );
        }
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
          setContentLibrary(emptyLibrary());
          setContentLibraryExclusions({});
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

    const payload: ProfileSavePayload = {
      profiles: toSerializableProfiles(profiles),
      contentLibrary,
      contentLibraryExclusions,
    };

    const timer = window.setTimeout(() => {
      void window.electron.saveProfiles(payload).catch((error) => {
        console.error("Failed to save persisted profiles:", error);
      });
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [profiles, contentLibrary, contentLibraryExclusions, profilesLoaded]);

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
    contentLibrary,
    setContentLibrary,
    contentLibraryExclusions,
    setContentLibraryExclusions,
    profilesLoaded,
    profileStoreError,
    skipNextAutosaveRef,
    blockProfileAutosaveAfterStoreErrorRef,
  };
}
