import type { Profile } from './profile';
import type {
  ProfileListResult,
  ProfileSavePayload,
} from './flow-profile';
import type { LaunchAction } from '../renderer/layout/hooks/useLaunchFeedback';

export {};

declare global {
  interface Window {
    electron: {
      launchProfile: (
        profileId: string,
        options?: { fireAndForget?: boolean; launchOrigin?: string },
      ) => Promise<{
        ok: boolean;
        started?: boolean;
        error?: string;
        runId?: string;
        replacedRunId?: string | null;
        storeErrorCode?: string;
        requestedProfileId?: string;
        profile?: Profile;
        launchedAppCount?: number;
        launchedTabCount?: number;
        requestedAppCount?: number;
        cancelled?: boolean;
        superseded?: boolean;
        failedApps?: Array<{
          name: string;
          path: string;
          error: string;
        }>;
        skippedApps?: Array<{
          name: string;
          reason: string;
        }>;
        pendingConfirmations?: Array<{
          name: string;
          path: string;
          reason: string;
          processHintLc?: string;
          blockerHandle?: string | null;
          status?: "waiting" | "resolved" | "failed";
          handle?: string;
          resolvedAt?: number;
        }>;
        pendingConfirmationCount?: number;
        unresolvedPendingConfirmationCount?: number;
      }>;
      subscribeProfileLaunchStarted?: (
        callback: (payload: { profileId: string; runId: string }) => void,
      ) => () => void;
      subscribeProfileLaunchFinished?: (
        callback: (payload: {
          profileId: string;
          runId: string;
          outcome: 'success' | 'warning' | 'error' | 'idle';
          message: string;
          durationSeconds?: number;
        }) => void,
      ) => () => void;
      cancelProfileLaunch?: (
        profileId: string,
        runId: string,
      ) => Promise<{ ok: boolean; error?: string; reason?: string }>;
      getLaunchProfileStatus: (profileId: string) => Promise<{
        ok: boolean;
        error?: string;
        status?: {
          profileId: string;
          runId: string;
          state: "idle" | "in-progress" | "awaiting-confirmations" | "complete" | "failed" | "cancelled" | string;
          launchedAppCount: number;
          launchedTabCount: number;
          failedAppCount: number;
          skippedAppCount: number;
          pendingConfirmationCount: number;
          unresolvedPendingConfirmationCount: number;
          requestedAppCount: number;
          requestedBrowserTabCount?: number;
          startedAt?: number | null;
          activePhase?: "launching" | "placing" | "tabs" | null;
          activeAppName?: string | null;
          activeActionId?: string | null;
          actionsTotal?: number | null;
          actionsCompleted?: number | null;
          actions?: LaunchAction[] | null;
          appLaunchProgress?: Array<{
            key: string;
            name: string;
            step:
              | "pending"
              | "launching"
              | "placing"
              | "verifying"
              | "awaiting-confirmation"
              | "done"
              | "failed"
              | "skipped";
            iconDataUrl?: string | null;
            location?: string;
            outcomes?: string[];
          }>;
          pendingConfirmations: Array<{
            name: string;
            path: string;
            reason: string;
            processHintLc?: string;
            blockerHandle?: string | null;
            status?: "waiting" | "resolved" | "failed";
            handle?: string;
            resolvedAt?: number;
          }>;
          updatedAt: number;
        } | null;
      }>;
      getInstalledApps: (opts?: { force?: boolean }) => Promise<{
        name: string;
        iconPath: string | null;
        executablePath?: string | null;
        shortcutPath?: string | null;
        launchUrl?: string | null;
      }[]>;
      captureRunningAppLayout: () => Promise<{
        capturedAt: number;
        appCount: number;
        monitors: Array<{
          id: string;
          name: string;
          systemName?: string | null;
          primary: boolean;
          resolution: string;
          orientation: 'landscape' | 'portrait';
          layoutPosition?: { x: number; y: number };
          apps: Array<{
            name: string;
            iconPath: string | null;
            executablePath?: string | null;
            position: { x: number; y: number };
            size: { width: number; height: number };
          }>;
        }>;
        minimizedApps?: Array<{
          name: string;
          iconPath: string | null;
          executablePath?: string | null;
          position: { x: number; y: number };
          size: { width: number; height: number };
          targetMonitor?: string;
          sourcePosition?: { x: number; y: number };
          sourceSize?: { width: number; height: number };
        }>;
        error?: string;
      }>;
      getSystemMonitors: () => Promise<Array<{
        id: string;
        name: string;
        systemName?: string | null;
        primary: boolean;
        scaleFactor: number;
        resolution: string;
        orientation: 'landscape' | 'portrait';
        layoutPosition?: { x: number; y: number };
        apps: Array<unknown>;
      }>>;
      listProfiles: () => Promise<ProfileListResult>;
      saveProfiles: (
        payload: ProfileSavePayload,
      ) => Promise<{ ok: boolean; count?: number; error?: string }>;
      pickContentLibraryPaths: (opts?: {
        mode?: 'files' | 'directory';
      }) => Promise<{
        canceled: boolean;
        entries?: Array<{ path: string; kind: 'file' | 'directory' }>;
      }>;
      showItemInFolder: (
        filePath: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      openPathInExplorer: (
        targetPath: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      browseFolderList: (
        dirPath: string,
      ) => Promise<{
        ok: boolean;
        entries?: Array<{ name: string; isDirectory: boolean }>;
        truncated?: boolean;
        error?: string;
      }>;
      getZoneHistoryStats: () => Promise<{
        ok: boolean;
        stats?: {
          totalEntries: number;
          totalUseCount: number;
          mostUsedApp: string | null;
          maxUseCount: number;
        };
        error?: string;
      }>;
      getAppPreferences: () => Promise<{
        ok: boolean;
        preferences?: { pinMainWindowDuringProfileLaunch: boolean };
        error?: string;
      }>;
      setAppPreferences: (patch: {
        pinMainWindowDuringProfileLaunch?: boolean;
      }) => Promise<{
        ok: boolean;
        preferences?: { pinMainWindowDuringProfileLaunch: boolean };
        error?: string;
      }>;
    };
  }
}
