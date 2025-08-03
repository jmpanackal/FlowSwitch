import { useState, useEffect } from 'react';
import { Clock, Calendar, ChevronDown, RotateCcw, Copy } from 'lucide-react';
import { TimePickerControl } from './TimePickerControl';

interface WeeklySchedule {
  [key: string]: {
    enabled: boolean;
    time: string; // 24-hour format "HH:MM"
  };
}

interface WeeklyScheduleControlProps {
  value: WeeklySchedule;
  onChange: (schedule: WeeklySchedule) => void;
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

const defaultSchedule: WeeklySchedule = {
  monday: { enabled: false, time: '09:00' },
  tuesday: { enabled: false, time: '09:00' },
  wednesday: { enabled: false, time: '09:00' },
  thursday: { enabled: false, time: '09:00' },
  friday: { enabled: false, time: '09:00' },
  saturday: { enabled: false, time: '09:00' },
  sunday: { enabled: false, time: '09:00' }
};

export function WeeklyScheduleControl({ value, onChange, disabled = false }: WeeklyScheduleControlProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [schedule, setSchedule] = useState<WeeklySchedule>(defaultSchedule);

  // Initialize schedule from value
  useEffect(() => {
    if (value && Object.keys(value).length > 0) {
      setSchedule({ ...defaultSchedule, ...value });
    } else {
      setSchedule(defaultSchedule);
    }
  }, [value]);

  // Update parent when schedule changes
  const updateSchedule = (newSchedule: WeeklySchedule) => {
    setSchedule(newSchedule);
    onChange(newSchedule);
  };

  // Toggle day enabled/disabled
  const toggleDay = (dayKey: string) => {
    const newSchedule = {
      ...schedule,
      [dayKey]: {
        ...schedule[dayKey],
        enabled: !schedule[dayKey].enabled
      }
    };
    updateSchedule(newSchedule);
  };

  // Update time for a specific day
  const updateDayTime = (dayKey: string, time: string) => {
    const newSchedule = {
      ...schedule,
      [dayKey]: {
        ...schedule[dayKey],
        time: time
      }
    };
    updateSchedule(newSchedule);
  };

  // Quick actions
  const enableAllWeekdays = () => {
    const newSchedule = { ...schedule };
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
      newSchedule[day].enabled = true;
    });
    updateSchedule(newSchedule);
  };

  const enableAllDays = () => {
    const newSchedule = { ...schedule };
    weekDays.forEach(day => {
      newSchedule[day.key].enabled = true;
    });
    updateSchedule(newSchedule);
  };

  const disableAllDays = () => {
    const newSchedule = { ...schedule };
    weekDays.forEach(day => {
      newSchedule[day.key].enabled = false;
    });
    updateSchedule(newSchedule);
  };

  const copyTimeToAll = (sourceTime: string) => {
    const newSchedule = { ...schedule };
    weekDays.forEach(day => {
      if (newSchedule[day.key].enabled) {
        newSchedule[day.key].time = sourceTime;
      }
    });
    updateSchedule(newSchedule);
  };

  // Get summary of enabled days
  const getEnabledDays = () => {
    return weekDays.filter(day => schedule[day.key]?.enabled);
  };

  const formatTime = (time24: string) => {
    if (!time24) return '';
    const [hour, minute] = time24.split(':');
    const hour24 = parseInt(hour);
    const minute12 = parseInt(minute);
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    return `${hour12}:${minute12.toString().padStart(2, '0')} ${period}`;
  };

  const enabledDays = getEnabledDays();
  const hasEnabledDays = enabledDays.length > 0;

  return (
    <div className="space-y-3">
      {/* Main Control Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-flow-text-muted" />
          <span className="text-sm font-medium text-flow-text-secondary">Weekly Schedule</span>
        </div>
        <button
          type="button"
          onClick={() => !disabled && setIsExpanded(!isExpanded)}
          disabled={disabled}
          className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
            disabled 
              ? 'text-flow-text-muted cursor-not-allowed' 
              : 'text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary'
          }`}
        >
          {isExpanded ? 'Collapse' : 'Configure'}
          <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Summary Display */}
      {hasEnabledDays && (
        <div className="bg-flow-surface border border-flow-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-flow-accent-blue" />
            <span className="text-sm font-medium text-flow-text-primary">Active Schedule</span>
          </div>
          <div className="space-y-1 text-xs">
            {enabledDays.map(day => (
              <div key={day.key} className="flex items-center justify-between">
                <span className="text-flow-text-secondary">{day.label}</span>
                <span className="text-flow-accent-blue font-medium">
                  {formatTime(schedule[day.key].time)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!hasEnabledDays && !isExpanded && (
        <div className="text-center py-4 text-sm text-flow-text-muted bg-flow-bg-secondary border border-flow-border rounded-lg">
          No scheduled activation times
        </div>
      )}

      {/* Expanded Configuration */}
      {isExpanded && (
        <div className="space-y-4 bg-flow-surface border border-flow-border rounded-lg p-4">
          {/* Quick Actions */}
          <div className="flex items-center gap-2 pb-3 border-b border-flow-border">
            <span className="text-xs text-flow-text-muted">Quick actions:</span>
            <button
              onClick={enableAllWeekdays}
              className="text-xs px-2 py-1 bg-flow-accent-blue/20 text-flow-accent-blue rounded hover:bg-flow-accent-blue/30 transition-colors"
            >
              Weekdays
            </button>
            <button
              onClick={enableAllDays}
              className="text-xs px-2 py-1 bg-flow-accent-green/20 text-flow-accent-green rounded hover:bg-flow-accent-green/30 transition-colors"
            >
              All Days
            </button>
            <button
              onClick={disableAllDays}
              className="text-xs px-2 py-1 bg-flow-surface border border-flow-border text-flow-text-secondary rounded hover:bg-flow-surface-elevated transition-colors"
            >
              Clear All
            </button>
          </div>

          {/* Day Configuration */}
          <div className="space-y-3">
            {weekDays.map((day) => {
              const daySchedule = schedule[day.key];
              const isEnabled = daySchedule?.enabled || false;
              
              return (
                <div
                  key={day.key}
                  className={`flex items-center gap-3 p-3 border rounded-lg transition-all ${
                    isEnabled 
                      ? 'border-flow-accent-blue/30 bg-flow-accent-blue/10' 
                      : 'border-flow-border bg-flow-bg-secondary'
                  }`}
                >
                  {/* Day Toggle */}
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleDay(day.key)}
                      className="w-4 h-4 text-flow-accent-blue rounded border-flow-border focus:ring-flow-accent-blue/50 focus:ring-offset-0"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm text-flow-text-primary">{day.label}</div>
                      <div className="text-xs text-flow-text-muted">{day.short}</div>
                    </div>
                  </div>

                  {/* Time Picker */}
                  <div className="flex items-center gap-2">
                    {isEnabled && (
                      <div className="w-48">
                        <TimePickerControl
                          value={daySchedule.time}
                          onChange={(time) => updateDayTime(day.key, time)}
                          placeholder="Select time"
                          disabled={!isEnabled}
                        />
                      </div>
                    )}
                    
                    {/* Copy Time Action */}
                    {isEnabled && enabledDays.length > 1 && (
                      <button
                        onClick={() => copyTimeToAll(daySchedule.time)}
                        className="p-1.5 text-flow-text-muted hover:text-flow-accent-blue hover:bg-flow-accent-blue/10 rounded transition-colors"
                        title="Copy this time to all enabled days"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tips */}
          <div className="bg-flow-bg-secondary border border-flow-border rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-flow-text-muted flex-shrink-0 mt-0.5" />
              <div className="text-xs text-flow-text-muted">
                <div className="font-medium mb-1">Scheduling Tips</div>
                <ul className="space-y-1">
                  <li>• Only enabled days will trigger automatic profile switching</li>
                  <li>• Use the copy button to apply the same time to multiple days</li>
                  <li>• Times are checked once per minute for activation</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}