import { useState, useEffect } from 'react';
import { Clock, ChevronDown } from 'lucide-react';

interface TimePickerControlProps {
  value: string; // 24-hour format "HH:MM"
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

interface TimePreset {
  label: string;
  value: string;
  description: string;
}

const timePresets: TimePreset[] = [
  { label: '7:00 AM', value: '07:00', description: 'Early morning' },
  { label: '8:00 AM', value: '08:00', description: 'Start of workday' },
  { label: '9:00 AM', value: '09:00', description: 'Business hours' },
  { label: '12:00 PM', value: '12:00', description: 'Lunch time' },
  { label: '1:00 PM', value: '13:00', description: 'Afternoon' },
  { label: '5:00 PM', value: '17:00', description: 'End of workday' },
  { label: '6:00 PM', value: '18:00', description: 'Evening' },
  { label: '9:00 PM', value: '21:00', description: 'Night' },
];

export function TimePickerControl({ value, onChange, placeholder = "Select time", disabled = false }: TimePickerControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');

  // Convert 24-hour format to 12-hour format
  const convertTo12Hour = (time24: string) => {
    if (!time24) return { hour: 12, minute: 0, period: 'AM' as const };
    
    const [hourStr, minuteStr] = time24.split(':');
    const hour24 = parseInt(hourStr);
    const minute = parseInt(minuteStr);
    
    if (hour24 === 0) {
      return { hour: 12, minute, period: 'AM' as const };
    } else if (hour24 < 12) {
      return { hour: hour24, minute, period: 'AM' as const };
    } else if (hour24 === 12) {
      return { hour: 12, minute, period: 'PM' as const };
    } else {
      return { hour: hour24 - 12, minute, period: 'PM' as const };
    }
  };

  // Convert 12-hour format to 24-hour format
  const convertTo24Hour = (hour: number, minute: number, period: 'AM' | 'PM') => {
    let hour24 = hour;
    
    if (period === 'AM') {
      if (hour === 12) hour24 = 0;
    } else {
      if (hour !== 12) hour24 = hour + 12;
    }
    
    return `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  // Update internal state when value changes
  useEffect(() => {
    if (value) {
      const converted = convertTo12Hour(value);
      setHour(converted.hour);
      setMinute(converted.minute);
      setPeriod(converted.period);
    }
  }, [value]);

  // Update value when internal state changes
  const updateValue = (newHour: number, newMinute: number, newPeriod: 'AM' | 'PM') => {
    const time24 = convertTo24Hour(newHour, newMinute, newPeriod);
    onChange(time24);
  };

  // Format time for display
  const formatTime = (time24: string) => {
    if (!time24) return '';
    const converted = convertTo12Hour(time24);
    return `${converted.hour}:${converted.minute.toString().padStart(2, '0')} ${converted.period}`;
  };

  const handlePresetSelect = (preset: TimePreset) => {
    onChange(preset.value);
    setIsOpen(false);
  };

  const handleCustomTimeChange = (newHour: number, newMinute: number, newPeriod: 'AM' | 'PM') => {
    setHour(newHour);
    setMinute(newMinute);
    setPeriod(newPeriod);
    updateValue(newHour, newMinute, newPeriod);
  };

  const clearTime = () => {
    onChange('');
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Main Time Display Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2 bg-flow-bg-secondary border border-flow-border rounded-lg transition-all text-sm ${
          disabled 
            ? 'text-flow-text-muted cursor-not-allowed opacity-50' 
            : 'text-flow-text-primary hover:bg-flow-surface focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue'
        }`}
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-flow-text-muted" />
          <span className={value ? 'text-flow-text-primary' : 'text-flow-text-muted'}>
            {value ? formatTime(value) : placeholder}
          </span>
        </div>
        {!disabled && <ChevronDown className="w-4 h-4 text-flow-text-muted" />}
      </button>

      {/* Dropdown Panel */}
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 mt-2 w-full bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Quick Presets */}
          <div className="p-3 border-b border-flow-border">
            <h4 className="text-xs font-medium text-flow-text-secondary mb-2">Quick Select</h4>
            <div className="grid grid-cols-2 gap-1">
              {timePresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetSelect(preset)}
                  className={`text-left p-2 rounded-lg text-xs transition-colors ${
                    value === preset.value
                      ? 'bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30'
                      : 'hover:bg-flow-surface text-flow-text-secondary hover:text-flow-text-primary'
                  }`}
                >
                  <div className="font-medium">{preset.label}</div>
                  <div className="text-xs text-flow-text-muted">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Time Selector */}
          <div className="p-3">
            <h4 className="text-xs font-medium text-flow-text-secondary mb-3">Custom Time</h4>
            
            <div className="flex items-center gap-2 mb-3">
              {/* Hour Selector */}
              <div className="flex-1">
                <label className="block text-xs text-flow-text-muted mb-1">Hour</label>
                <select
                  value={hour}
                  onChange={(e) => handleCustomTimeChange(parseInt(e.target.value), minute, period)}
                  className="w-full px-2 py-1.5 bg-flow-bg-secondary border border-flow-border rounded text-sm text-flow-text-primary focus:outline-none focus:ring-1 focus:ring-flow-accent-blue/50"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Minute Selector */}
              <div className="flex-1">
                <label className="block text-xs text-flow-text-muted mb-1">Minute</label>
                <select
                  value={minute}
                  onChange={(e) => handleCustomTimeChange(hour, parseInt(e.target.value), period)}
                  className="w-full px-2 py-1.5 bg-flow-bg-secondary border border-flow-border rounded text-sm text-flow-text-primary focus:outline-none focus:ring-1 focus:ring-flow-accent-blue/50"
                >
                  {Array.from({ length: 60 }, (_, i) => i).filter(m => m % 5 === 0).map((m) => (
                    <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                  ))}
                </select>
              </div>

              {/* AM/PM Selector */}
              <div className="flex-1">
                <label className="block text-xs text-flow-text-muted mb-1">Period</label>
                <select
                  value={period}
                  onChange={(e) => handleCustomTimeChange(hour, minute, e.target.value as 'AM' | 'PM')}
                  className="w-full px-2 py-1.5 bg-flow-bg-secondary border border-flow-border rounded text-sm text-flow-text-primary focus:outline-none focus:ring-1 focus:ring-flow-accent-blue/50"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={clearTime}
                className="flex-1 px-3 py-2 text-xs bg-flow-surface border border-flow-border rounded-lg text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 px-3 py-2 text-xs bg-flow-accent-blue text-flow-text-primary rounded-lg hover:bg-flow-accent-blue-hover transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}