export const createFileManagementHandlers = (setProfiles: any) => {
  const addFile = (profileId: string, monitorId: string, newFile: any) => {
    setProfiles((prev: any) => prev.map((profile: any) => {
      if (profile.id !== profileId) return profile;
      
      return {
        ...profile,
        monitors: profile.monitors.map((monitor: any) => {
          if (monitor.id !== monitorId) return monitor;
          
          return {
            ...monitor,
            files: [...(monitor.files || []), { ...newFile, targetMonitor: monitorId }]
          };
        }),
        fileCount: (profile.fileCount || 0) + 1
      };
    }));
  };

  const addFileToMinimized = (profileId: string, newFile: any) => {
    setProfiles((prev: any) => prev.map((profile: any) => {
      if (profile.id !== profileId) return profile;
      
      return {
        ...profile,
        minimizedFiles: [...(profile.minimizedFiles || []), newFile],
        fileCount: (profile.fileCount || 0) + 1
      };
    }));
  };

  const moveFileToMinimized = (profileId: string, monitorId: string, fileIndex: number) => {
    setProfiles((prev: any) => prev.map((profile: any) => {
      if (profile.id !== profileId) return profile;
      
      const monitor = profile.monitors.find((m: any) => m.id === monitorId);
      if (!monitor || !monitor.files?.[fileIndex]) return profile;
      
      const fileToMove = monitor.files[fileIndex];
      
      const minimizedFile = {
        ...fileToMove,
        targetMonitor: monitorId,
        sourcePosition: fileToMove.position,
        sourceSize: fileToMove.size
      };
      
      return {
        ...profile,
        monitors: profile.monitors.map((monitor: any) => {
          if (monitor.id !== monitorId) return monitor;
          
          return {
            ...monitor,
            files: (monitor.files || []).filter((_: any, index: number) => index !== fileIndex)
          };
        }),
        minimizedFiles: [...(profile.minimizedFiles || []), minimizedFile]
      };
    }));
  };

  const moveFileBetweenMonitors = (profileId: string, sourceMonitorId: string, fileIndex: number, targetMonitorId: string, newPosition?: { x: number; y: number }) => {
    setProfiles((prev: any) => prev.map((profile: any) => {
      if (profile.id !== profileId) return profile;
      
      const sourceMonitor = profile.monitors.find((m: any) => m.id === sourceMonitorId);
      if (!sourceMonitor || !sourceMonitor.files?.[fileIndex]) return profile;
      
      const fileToMove = sourceMonitor.files[fileIndex];
      
      const movedFile = {
        ...fileToMove,
        position: newPosition || { x: 50, y: 50 },
        targetMonitor: targetMonitorId
      };
      
      return {
        ...profile,
        monitors: profile.monitors.map((monitor: any) => {
          if (monitor.id === sourceMonitorId) {
            return {
              ...monitor,
              files: (monitor.files || []).filter((_: any, index: number) => index !== fileIndex)
            };
          } else if (monitor.id === targetMonitorId) {
            return {
              ...monitor,
              files: [...(monitor.files || []), movedFile]
            };
          }
          return monitor;
        })
      };
    }));
  };

  const moveMinimizedFileToMonitor = (profileId: string, fileIndex: number, targetMonitorId?: string, newPosition?: { x: number; y: number }) => {
    setProfiles((prev: any) => prev.map((profile: any) => {
      if (profile.id !== profileId) return profile;
      
      const minimizedFile = profile.minimizedFiles?.[fileIndex];
      if (!minimizedFile) return profile;
      
      const finalTargetMonitorId = targetMonitorId || minimizedFile.targetMonitor || 'monitor-1';
      
      const newFile = {
        ...minimizedFile,
        position: newPosition || minimizedFile.sourcePosition || { x: 50, y: 50 },
        size: minimizedFile.sourceSize || { width: 40, height: 30 },
        targetMonitor: finalTargetMonitorId
      };
      
      return {
        ...profile,
        minimizedFiles: (profile.minimizedFiles || []).filter((_: any, index: number) => index !== fileIndex),
        monitors: profile.monitors.map((monitor: any) => {
          if (monitor.id === finalTargetMonitorId) {
            return {
              ...monitor,
              files: [...(monitor.files || []), newFile]
            };
          }
          return monitor;
        })
      };
    }));
  };

  const removeFile = (profileId: string, monitorId: string, fileIndex: number) => {
    setProfiles((prev: any) => prev.map((profile: any) => {
      if (profile.id !== profileId) return profile;
      
      return {
        ...profile,
        monitors: profile.monitors.map((monitor: any) => {
          if (monitor.id !== monitorId) return monitor;
          
          return {
            ...monitor,
            files: (monitor.files || []).filter((_: any, index: number) => index !== fileIndex)
          };
        }),
        fileCount: Math.max(0, (profile.fileCount || 0) - 1)
      };
    }));
  };

  const removeMinimizedFile = (profileId: string, fileIndex: number) => {
    setProfiles((prev: any) => prev.map((profile: any) => {
      if (profile.id !== profileId) return profile;
      
      return {
        ...profile,
        minimizedFiles: (profile.minimizedFiles || []).filter((_: any, index: number) => index !== fileIndex),
        fileCount: Math.max(0, (profile.fileCount || 0) - 1)
      };
    }));
  };

  const updateFile = (profileId: string, monitorId: string, fileIndex: number, updates: any) => {
    setProfiles((prev: any) => prev.map((profile: any) => {
      if (profile.id !== profileId) return profile;
      
      return {
        ...profile,
        monitors: profile.monitors.map((monitor: any) => {
          if (monitor.id !== monitorId) return monitor;
          
          return {
            ...monitor,
            files: (monitor.files || []).map((file: any, index: number) => 
              index === fileIndex ? { ...file, ...updates } : file
            )
          };
        })
      };
    }));
  };

  return {
    addFile,
    addFileToMinimized,
    moveFileToMinimized,
    moveFileBetweenMonitors,
    moveMinimizedFileToMonitor,
    removeFile,
    removeMinimizedFile,
    updateFile
  };
};