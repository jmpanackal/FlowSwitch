import { LucideIcon } from "lucide-react";

interface AppIconProps {
  name: string;
  icon: LucideIcon;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AppIcon({ name, icon: Icon, color, size = 'md' }: AppIconProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 p-1.5',
    md: 'w-12 h-12 p-2.5',
    lg: 'w-16 h-16 p-3'
  };
  
  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm', 
    lg: 'text-base'
  };
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div 
        className={`${sizeClasses[size]} rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center`}
        style={{ backgroundColor: `${color}20`, borderColor: `${color}40` }}
      >
        <Icon className="w-full h-full text-white" />
      </div>
      <span className={`text-white/80 ${textSizes[size]} text-center max-w-20 truncate`}>
        {name}
      </span>
    </div>
  );
}