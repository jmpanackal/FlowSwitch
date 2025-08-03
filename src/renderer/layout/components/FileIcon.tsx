import { 
  File,
  FileText,
  Code,
  Database,
  Image,
  Music,
  Video,
  Archive,
  Folder,
  FolderOpen,
  Settings,
  Terminal,
  Globe,
  Paperclip
} from "lucide-react";

interface FileIconProps {
  type?: string; // Make type optional
  className?: string;
  isOpen?: boolean;
}

const fileTypeIcons = {
  // Text files
  'text': FileText,
  'txt': FileText,
  'doc': FileText,
  'docx': FileText,
  'rtf': FileText,
  'pdf': FileText,
  
  // Code files
  'code': Code,
  'js': Code,
  'ts': Code,
  'jsx': Code,
  'tsx': Code,
  'html': Code,
  'css': Code,
  'scss': Code,
  'json': Code,
  'xml': Code,
  'yml': Code,
  'yaml': Code,
  'py': Code,
  'java': Code,
  'cpp': Code,
  'c': Code,
  'cs': Code,
  'php': Code,
  'rb': Code,
  'go': Code,
  'rust': Code,
  'swift': Code,
  'kt': Code,
  
  // Script files
  'script': Terminal,
  'sh': Terminal,
  'bash': Terminal,
  'bat': Terminal,
  'cmd': Terminal,
  'ps1': Terminal,
  
  // Database files
  'sql': Database,
  'db': Database,
  'sqlite': Database,
  'mdb': Database,
  
  // Config files
  'config': Settings,
  'conf': Settings,
  'cfg': Settings,
  'ini': Settings,
  'env': Settings,
  'toml': Settings,
  
  // Markdown
  'markdown': FileText,
  'md': FileText,
  'mdx': FileText,
  
  // Log files
  'log': FileText,
  'logs': FileText,
  
  // Image files
  'image': Image,
  'jpg': Image,
  'jpeg': Image,
  'png': Image,
  'gif': Image,
  'svg': Image,
  'bmp': Image,
  'tiff': Image,
  'ico': Image,
  'webp': Image,
  
  // Audio files
  'audio': Music,
  'mp3': Music,
  'wav': Music,
  'flac': Music,
  'aac': Music,
  'ogg': Music,
  'wma': Music,
  
  // Video files
  'video': Video,
  'mp4': Video,
  'avi': Video,
  'mkv': Video,
  'mov': Video,
  'wmv': Video,
  'flv': Video,
  'webm': Video,
  
  // Archive files
  'archive': Archive,
  'zip': Archive,
  'rar': Archive,
  '7z': Archive,
  'tar': Archive,
  'gz': Archive,
  'bz2': Archive,
  
  // Web files
  'web': Globe,
  'url': Globe,
  'link': Globe,
  'htm': Globe,
  
  // Folders
  'folder': Folder,
  'directory': Folder,
  
  // Default
  'default': File
};

const fileTypeColors = {
  // Text files
  'text': '#64748B',
  'txt': '#64748B',
  'doc': '#2563EB',
  'docx': '#2563EB',
  'rtf': '#64748B',
  'pdf': '#DC2626',
  
  // Code files
  'code': '#10B981',
  'js': '#F7DF1E',
  'ts': '#3178C6',
  'jsx': '#61DAFB',
  'tsx': '#61DAFB',
  'html': '#E34F26',
  'css': '#1572B6',
  'scss': '#CF649A',
  'json': '#000000',
  'xml': '#FF6600',
  'yml': '#CB171E',
  'yaml': '#CB171E',
  'py': '#3776AB',
  'java': '#ED8B00',
  'cpp': '#00599C',
  'c': '#A8B9CC',
  'cs': '#239120',
  'php': '#777BB4',
  'rb': '#CC342D',
  'go': '#00ADD8',
  'rust': '#000000',
  'swift': '#FA7343',
  'kt': '#0095D5',
  
  // Script files
  'script': '#4ADE80',
  'sh': '#4ADE80',
  'bash': '#4ADE80',
  'bat': '#C5C5C5',
  'cmd': '#C5C5C5',
  'ps1': '#012456',
  
  // Database files
  'sql': '#F59E0B',
  'db': '#336791',
  'sqlite': '#003B57',
  'mdb': '#A4373A',
  
  // Config files
  'config': '#EF4444',
  'conf': '#EF4444',
  'cfg': '#EF4444',
  'ini': '#EF4444',
  'env': '#EF4444',
  'toml': '#EF4444',
  
  // Markdown
  'markdown': '#6366F1',
  'md': '#6366F1',
  'mdx': '#6366F1',
  
  // Log files
  'log': '#6B7280',
  'logs': '#6B7280',
  
  // Image files
  'image': '#EC4899',
  'jpg': '#EC4899',
  'jpeg': '#EC4899',
  'png': '#EC4899',
  'gif': '#EC4899',
  'svg': '#FF9500',
  'bmp': '#EC4899',
  'tiff': '#EC4899',
  'ico': '#EC4899',
  'webp': '#EC4899',
  
  // Audio files
  'audio': '#06B6D4',
  'mp3': '#06B6D4',
  'wav': '#06B6D4',
  'flac': '#06B6D4',
  'aac': '#06B6D4',
  'ogg': '#06B6D4',
  'wma': '#06B6D4',
  
  // Video files
  'video': '#8B5CF6',
  'mp4': '#8B5CF6',
  'avi': '#8B5CF6',
  'mkv': '#8B5CF6',
  'mov': '#8B5CF6',
  'wmv': '#8B5CF6',
  'flv': '#8B5CF6',
  'webm': '#8B5CF6',
  
  // Archive files
  'archive': '#F59E0B',
  'zip': '#F59E0B',
  'rar': '#F59E0B',
  '7z': '#F59E0B',
  'tar': '#F59E0B',
  'gz': '#F59E0B',
  'bz2': '#F59E0B',
  
  // Web files
  'web': '#3B82F6',
  'url': '#3B82F6',
  'link': '#3B82F6',
  'htm': '#E34F26',
  
  // Folders
  'folder': '#3B82F6',
  'directory': '#3B82F6',
  
  // Default
  'default': '#64748B'
};

export function FileIcon({ type, className = "", isOpen = false }: FileIconProps) {
  // Handle undefined or null type by providing a default
  const safeType = type || 'default';
  const normalizedType = typeof safeType === 'string' ? safeType.toLowerCase() : 'default';
  
  // Special handling for folders
  if (normalizedType === 'folder' || normalizedType === 'directory') {
    const FolderIcon = isOpen ? FolderOpen : Folder;
    return <FolderIcon className={className} style={{ color: fileTypeColors.folder }} />;
  }
  
  const IconComponent = fileTypeIcons[normalizedType as keyof typeof fileTypeIcons] || fileTypeIcons.default;
  const iconColor = fileTypeColors[normalizedType as keyof typeof fileTypeColors] || fileTypeColors.default;
  
  return <IconComponent className={className} style={{ color: iconColor }} />;
}

export function getFileTypeColor(type: string): string {
  // Handle undefined or null type
  const safeType = type || 'default';
  const normalizedType = typeof safeType === 'string' ? safeType.toLowerCase() : 'default';
  return fileTypeColors[normalizedType as keyof typeof fileTypeColors] || fileTypeColors.default;
}

export function getFileTypeIcon(type: string) {
  // Handle undefined or null type
  const safeType = type || 'default';
  const normalizedType = typeof safeType === 'string' ? safeType.toLowerCase() : 'default';
  return fileTypeIcons[normalizedType as keyof typeof fileTypeIcons] || fileTypeIcons.default;
}