import { useState, useEffect } from 'react';
import { Clock, Calendar, Check, Zap, Edit3, Copy } from 'lucide-react';
import { TimePickerControl } from './TimePickerControl';
import { Switch } from './ui/switch';

interface WeeklySchedule {
  [key: string]: {
    enabled: boolean;
    time: string;
  };
}

interface ScheduleControlProps {
  value: {
    type: 'daily' | 'weekly';
    dailyTime?: string;
    weeklySchedule?: WeeklySchedule;
  };
  onChange: (schedule: {
    type: 'daily' | 'weekly';
    dailyTime?: string;
    weeklySchedule?: WeeklySchedule;
  }) => void;
  disabled?: boolean;
}

const weekDays = [
  { key: 'monday', label: 'Monday', short: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday', label: 'Thursday', short: 'Thu' },
  { key: 'friday', label: 'Friday', short: 'Fri' },
  { key: 'saturday', label: 'Saturday', short: 'Sat' },
  { key: 'sunday', label: 'Sunday', short: 'Sun' }
];

const defaultWeeklySchedule: WeeklySchedule = {
  monday: { enabled: false, time: '09:00' },
  tuesday: { enabled: false, time: '09:00' },
  wednesday: { enabled: false, time: '09:00' },
  thursday: { enabled: false, time: '09:00' },
  friday: { enabled: false, time: '09:00' },
  saturday: { enabled: false, time: '09:00' },
  sunday: { enabled: false, time: '09:00' }
};

export function ScheduleControl({ value, onChange, disabled = false }: ScheduleControlProps) {
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly'>(value.type || 'daily');
  const [dailyTime, setDailyTime] = useState(value.dailyTime || '');
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(
    value.weeklySchedule || defaultWeeklySchedule
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedDayForEdit, setSelectedDayForEdit] = useState<string | null>(null);

  // Initialize from value
  useEffect(() => {
    setScheduleType(value.type || 'daily');
    setDailyTime(value.dailyTime || '');
    setWeeklySchedule(value.weeklySchedule || defaultWeeklySchedule);
    setShowAdvanced(value.type === 'weekly');
  }, [value]);

  // Update parent when values change
  const updateSchedule = (newType: 'daily' | 'weekly', newDailyTime?: string, newWeeklySchedule?: WeeklySchedule) => {
    onChange({
      type: newType,
      dailyTime: newDailyTime,
      weeklySchedule: newWeeklySchedule
    });
  };

  const handleDailyTimeChange = (time: string) => {
    setDailyTime(time);
    updateSchedule('daily', time, weeklySchedule);
  };

  const handleAdvancedToggle = (enabled: boolean) => {
    setShowAdvanced(enabled);
    
    if (enabled) {
      // Convert daily time to weekly schedule
      if (dailyTime) {
        const newWeeklySchedule = { ...defaultWeeklySchedule };
        Object.keys(newWeeklySchedule).forEach(day => {
          newWeeklySchedule[day] = { enabled: true, time: dailyTime };
        });
        setWeeklySchedule(newWeeklySchedule);
        updateSchedule('weekly', dailyTime, newWeeklySchedule);
      } else {
        updateSchedule('weekly', dailyTime, weeklySchedule);
      }
      setScheduleType('weekly');
    } else {
      // Convert weekly schedule back to daily
      const enabledDays = Object.values(weeklySchedule).filter(day => day.enabled);
      if (enabledDays.length > 0) {
        // Use the most common time
        const timeCount: { [time: string]: number } = {};
        enabledDays.forEach(day => {
          timeCount[day.time] = (timeCount[day.time] || 0) + 1;
        });
        const mostCommonTime = Object.keys(timeCount).reduce((a, b) => 
          timeCount[a] > timeCount[b] ? a : b
        );
        setDailyTime(mostCommonTime);
        updateSchedule('daily', mostCommonTime, weeklySchedule);
      } else {
        updateSchedule('daily', dailyTime, weeklySchedule);
      }
      setScheduleType('daily');
      setSelectedDayForEdit(null);
    }
  };

  const handleDayToggle = (dayKey: string) => {
    const newWeeklySchedule = { ...weeklySchedule };
    
    if (newWeeklySchedule[dayKey].enabled) {
      // Disable the day
      newWeeklySchedule[dayKey].enabled = false;
      // Clear selection if this day was being edited
      if (selectedDayForEdit === dayKey) {
        setSelectedDayForEdit(null);
      }
    } else {
      // Enable the day
      newWeeklySchedule[dayKey].enabled = true;
      // Use current daily time or default to 09:00
      newWeeklySchedule[dayKey].time = dailyTime || '09:00';
      // Auto-select for editing
      setSelectedDayForEdit(dayKey);
    }
    
    setWeeklySchedule(newWeeklySchedule);
    updateSchedule('weekly', dailyTime, newWeeklySchedule);
  };

  const handleIndividualTimeChange = (dayKey: string, time: string) => {
    const newWeeklySchedule = {
      ...weeklySchedule,
      [dayKey]: {
        ...weeklySchedule[dayKey],
        time: time
      }
    };
    setWeeklySchedule(newWeeklySchedule);
    updateSchedule('weekly', dailyTime, newWeeklySchedule);
  };

  const handleCopyTimeToAll = (sourceTime: string) => {
    const newWeeklySchedule = { ...weeklySchedule };
    
    // Apply time to all enabled days
    Object.keys(newWeeklySchedule).forEach(dayKey => {
      if (newWeeklySchedule[dayKey].enabled) {
        newWeeklySchedule[dayKey].time = sourceTime;
      }
    });
    
    setWeeklySchedule(newWeeklySchedule);
    updateSchedule('weekly', dailyTime, newWeeklySchedule);
  };

  // Quick actions
  const selectWeekdays = () => {
    const weekdayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const newWeeklySchedule = { ...weeklySchedule };
    
    // Enable weekdays, disable weekends
    Object.keys(newWeeklySchedule).forEach(day => {
      newWeeklySchedule[day].enabled = weekdayKeys.includes(day);
      // Apply current daily time to newly enabled days
      if (weekdayKeys.includes(day) && dailyTime) {
        newWeeklySchedule[day].time = dailyTime;
      }
    });
    
    setWeeklySchedule(newWeeklySchedule);
    updateSchedule('weekly', dailyTime, newWeeklySchedule);
    // Auto-select first weekday for editing
    setSelectedDayForEdit('monday');
  };

  const selectAllDays = () => {
    const allDayKeys = weekDays.map(d => d.key);
    const newWeeklySchedule = { ...weeklySchedule };
    
    // Enable all days and apply current time
    Object.keys(newWeeklySchedule).forEach(day => {
      newWeeklySchedule[day].enabled = true;
      if (dailyTime) {
        newWeeklySchedule[day].time = dailyTime;
      }
    });
    
    setWeeklySchedule(newWeeklySchedule);
    updateSchedule('weekly', dailyTime, newWeeklySchedule);
    // Auto-select first day for editing
    setSelectedDayForEdit('monday');
  };

  const clearAllDays = () => {
    const newWeeklySchedule = { ...weeklySchedule };
    
    // Disable all days
    Object.keys(newWeeklySchedule).forEach(day => {
      newWeeklySchedule[day].enabled = false;
    });
    
    setWeeklySchedule(newWeeklySchedule);
    updateSchedule('weekly', dailyTime, newWeeklySchedule);
    setSelectedDayForEdit(null);
  };

  // Format time for display
  const formatTime = (time24: string) => {
    if (!time24) return '';
    const [hour, minute] = time24.split(':');
    const hour24 = parseInt(hour);
    const minute12 = parseInt(minute);
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    return `${hour12}:${minute12.toString().padStart(2, '0')} ${period}`;
  };

  // Get summary of current schedule
  const getScheduleSummary = () => {
    if (scheduleType === 'daily' && dailyTime) {
      return `Daily at ${formatTime(dailyTime)}`;
    } else if (scheduleType === 'weekly') {
      const enabledDays = Object.entries(weeklySchedule)
        .filter(([_, day]) => day.enabled)
        .map(([dayKey, day]) => {
          const dayName = weekDays.find(d => d.key === dayKey)?.short || dayKey;
          return `${dayName} ${formatTime(day.time)}`;
        });
      
      if (enabledDays.length === 0) {
        return 'No scheduled times';
      } else if (enabledDays.length <= 2) {
        return enabledDays.join(', ');
      } else {
        return `${enabledDays.length} scheduled days`;
      }
    }
    return 'No schedule set';
  };

  const hasActiveSchedule = (scheduleType === 'daily' && dailyTime) || 
    (scheduleType === 'weekly' && Object.values(weeklySchedule).some(day => day.enabled));

  // Get enabled days
  const enabledDays = Object.entries(weeklySchedule).filter(([_, day]) => day.enabled);

  return (
    <div className="space-y-4">
      {/* Main Schedule Control */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-flow-text-muted" />
            <span className="text-sm font-medium text-flow-text-secondary">Auto-switch Schedule</span>
          </div>
          
          {hasActiveSchedule && (
            <div className="text-xs text-flow-accent-blue bg-flow-accent-blue/10 px-2 py-1 rounded border border-flow-accent-blue/30">
              {getScheduleSummary()}
            </div>
          )}
        </div>

        {/* Simple Daily Time Picker */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-flow-text-secondary mb-2">
              Daily activation time
            </label>
            <TimePickerControl
              value={dailyTime}
              onChange={handleDailyTimeChange}
              placeholder="Set time for daily activation"
              disabled={disabled || showAdvanced}
            />
            <p className="text-xs text-flow-text-muted mt-1">
              Profile will activate at this time every day
            </p>
          </div>

          {/* Advanced Weekly Schedule Toggle */}
          <div className="flex items-center justify-between p-3 bg-flow-bg-secondary border border-flow-border rounded-lg">
            <div>
              <div className="text-sm font-medium text-flow-text-secondary">Different times for different days</div>
              <div className="text-xs text-flow-text-muted">Enable to set custom schedule for each day</div>
            </div>
            <Switch
              checked={showAdvanced}
              onCheckedChange={handleAdvancedToggle}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      {/* Advanced Weekly Schedule */}
      {showAdvanced && (
        <div className="space-y-4 bg-flow-surface border border-flow-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-flow-accent-blue" />
              <span className="text-sm font-medium text-flow-text-primary">Weekly Schedule</span>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={selectWeekdays}
                className="text-xs px-2 py-1 bg-flow-accent-blue/20 text-flow-accent-blue rounded hover:bg-flow-accent-blue/30 transition-colors font-medium"
                disabled={disabled}
              >
                Weekdays
              </button>
              <button
                onClick={selectAllDays}
                className="text-xs px-2 py-1 bg-flow-accent-green/20 text-flow-accent-green rounded hover:bg-flow-accent-green/30 transition-colors font-medium"
                disabled={disabled}
              >
                All Days
              </button>
              <button
                onClick={clearAllDays}
                className="text-xs px-2 py-1 bg-flow-surface border border-flow-border text-flow-text-secondary rounded hover:bg-flow-surface-elevated transition-colors"
                disabled={disabled}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Horizontal Day Selector */}
          <div>
            <label className="block text-xs font-medium text-flow-text-secondary mb-2">
              Select days to activate this profile
            </label>
            <div className="flex gap-1">
              {weekDays.map((day) => {
                const isEnabled = weeklySchedule[day.key]?.enabled || false;
                const isSelected = selectedDayForEdit === day.key;
                
                return (
                  <button
                    key={day.key}
                    onClick={() => {
                      if (isEnabled) {
                        // If already enabled, toggle selection for editing
                        setSelectedDayForEdit(isSelected ? null : day.key);
                      } else {
                        // If not enabled, enable it
                        handleDayToggle(day.key);
                      }
                    }}
                    disabled={disabled}
                    className={`relative flex-1 flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all duration-200 min-h-20 ${
                      isEnabled 
                        ? isSelected
                          ? 'border-flow-accent-purple bg-flow-accent-purple/20 text-flow-accent-purple'
                          : 'border-flow-accent-blue bg-flow-accent-blue/20 text-flow-accent-blue'
                        : 'border-flow-border bg-flow-bg-secondary text-flow-text-muted hover:border-flow-border-accent hover:bg-flow-surface hover:text-flow-text-secondary'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className={`text-sm font-bold mb-1 ${
                      isEnabled 
                        ? isSelected ? 'text-flow-accent-purple' : 'text-flow-accent-blue'
                        : 'text-flow-text-secondary'
                    }`}>
                      {day.short.charAt(0)}
                    </div>
                    <div className={`text-xs text-center ${
                      isEnabled 
                        ? isSelected ? 'text-flow-accent-purple' : 'text-flow-accent-blue'
                        : 'text-flow-text-muted'
                    }`}>
                      {day.short.slice(1)}
                    </div>
                    
                    {isEnabled && (
                      <div className="mt-1">
                        <Check className={`w-3 h-3 ${isSelected ? 'text-flow-accent-purple' : 'text-flow-accent-blue'}`} />
                      </div>
                    )}
                    
                    {isEnabled && (
                      <div className={`mt-1 text-xs font-medium ${
                        isSelected ? 'text-flow-accent-purple' : 'text-flow-accent-blue'
                      }`}>
                        {formatTime(weeklySchedule[day.key].time)}
                      </div>
                    )}

                    {/* Edit indicator */}
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-3 h-3 bg-flow-accent-purple rounded-full flex items-center justify-center">
                        <Edit3 className="w-1.5 h-1.5 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-flow-text-muted mt-2">
              Click enabled days to edit their times individually
            </p>
          </div>

          {/* Individual Time Configuration */}
          {selectedDayForEdit && weeklySchedule[selectedDayForEdit]?.enabled && (
            <div className="bg-flow-bg-secondary border border-flow-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-flow-accent-purple" />
                  <h4 className="text-sm font-medium text-flow-text-primary">
                    Edit {weekDays.find(d => d.key === selectedDayForEdit)?.label}
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedDayForEdit(null)}
                  className="text-xs px-2 py-1 bg-flow-surface border border-flow-border text-flow-text-secondary rounded hover:bg-flow-surface-elevated transition-colors"
                >
                  Done
                </button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-flow-text-secondary mb-2">
                    Activation time for {weekDays.find(d => d.key === selectedDayForEdit)?.label}
                  </label>
                  <TimePickerControl
                    value={weeklySchedule[selectedDayForEdit].time}
                    onChange={(time) => handleIndividualTimeChange(selectedDayForEdit, time)}
                    placeholder="Select time"
                    disabled={disabled}
                  />
                </div>

                {/* Quick Actions for Individual Day */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => handleCopyTimeToAll(weeklySchedule[selectedDayForEdit].time)}
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-flow-accent-blue/20 text-flow-accent-blue rounded hover:bg-flow-accent-blue/30 transition-colors font-medium"
                    disabled={enabledDays.length <= 1}
                  >
                    <Copy className="w-3 h-3" />
                    Copy to all days
                  </button>
                  <button
                    onClick={() => handleDayToggle(selectedDayForEdit)}
                    className="text-xs px-2 py-1 bg-flow-accent-red/20 text-flow-accent-red rounded hover:bg-flow-accent-red/30 transition-colors font-medium"
                  >
                    Remove day
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Edit All Days */}
          {enabledDays.length > 0 && !selectedDayForEdit && (
            <div className="bg-flow-bg-secondary border border-flow-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-flow-text-primary">Quick Edit All Days</h4>
                  <p className="text-xs text-flow-text-muted">Set the same time for all {enabledDays.length} enabled days</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32">
                    <TimePickerControl
                      value={enabledDays[0][1].time} // Use first enabled day's time as default
                      onChange={(time) => handleCopyTimeToAll(time)}
                      placeholder="Select time"
                      disabled={disabled}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Schedule Summary */}
          {enabledDays.length > 0 && (
            <div className="bg-flow-accent-blue/10 border border-flow-accent-blue/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-flow-accent-blue" />
                <span className="text-sm font-medium text-flow-accent-blue">Active Schedule</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-flow-accent-blue">
                {enabledDays.map(([dayKey, day]) => {
                  const dayName = weekDays.find(d => d.key === dayKey)?.short || dayKey;
                  return (
                    <div key={dayKey} className="flex justify-between">
                      <span>{dayName}</span>
                      <span className="font-medium">{formatTime(day.time)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Schedule State */}
      {!hasActiveSchedule && (
        <div className="text-center py-6 text-sm text-flow-text-muted bg-flow-bg-secondary border border-flow-border rounded-lg">
          <Clock className="w-8 h-8 text-flow-text-muted mx-auto mb-2" />
          <div className="font-medium">No auto-switch schedule</div>
          <div className="text-xs mt-1">Set a time to automatically activate this profile</div>
        </div>
      )}
    </div>
  );
}