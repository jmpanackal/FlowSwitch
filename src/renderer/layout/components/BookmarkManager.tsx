import { useState } from "react";
import { Search, Bookmark, Globe, Folder, Star, Plus, Link, Trash2 } from "lucide-react";

interface BookmarkManagerProps {
  compact?: boolean;
  onDragStart?: () => void;
  onBookmarkDrop?: (bookmark: any, targetType: string, targetId: string) => void;
}

const sampleBookmarks = [
  { id: '1', name: 'GitHub', url: 'https://github.com', category: 'Development', icon: '🐙' },
  { id: '2', name: 'Stack Overflow', url: 'https://stackoverflow.com', category: 'Development', icon: '📚' },
  { id: '3', name: 'MDN Web Docs', url: 'https://developer.mozilla.org', category: 'Development', icon: '📖' },
  { id: '4', name: 'CodePen', url: 'https://codepen.io', category: 'Development', icon: '✏️' },
  { id: '5', name: 'Figma', url: 'https://figma.com', category: 'Design', icon: '🎨' },
  { id: '6', name: 'Dribbble', url: 'https://dribbble.com', category: 'Design', icon: '🏀' },
  { id: '7', name: 'Unsplash', url: 'https://unsplash.com', category: 'Resources', icon: '📸' },
  { id: '8', name: 'YouTube', url: 'https://youtube.com', category: 'Media', icon: '📺' },
  { id: '9', name: 'Netflix', url: 'https://netflix.com', category: 'Media', icon: '🎬' },
  { id: '10', name: 'Spotify', url: 'https://spotify.com', category: 'Media', icon: '🎵' },
  { id: '11', name: 'Gmail', url: 'https://gmail.com', category: 'Productivity', icon: '📧' },
  { id: '12', name: 'Google Drive', url: 'https://drive.google.com', category: 'Productivity', icon: '💾' },
  { id: '13', name: 'Notion', url: 'https://notion.so', category: 'Productivity', icon: '📝' },
  { id: '14', name: 'Slack', url: 'https://slack.com', category: 'Communication', icon: '💬' },
  { id: '15', name: 'Discord', url: 'https://discord.com', category: 'Communication', icon: '🎮' },
];

export function BookmarkManager({ compact = false, onDragStart, onBookmarkDrop }: BookmarkManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [draggedBookmark, setDraggedBookmark] = useState<any>(null);

  const categories = Array.from(new Set(sampleBookmarks.map(b => b.category)));
  
  const filteredBookmarks = sampleBookmarks.filter(bookmark => {
    const matchesSearch = bookmark.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         bookmark.url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || bookmark.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDragStart = (e: React.DragEvent, bookmark: any) => {
    setDraggedBookmark(bookmark);
    if (onDragStart) {
      onDragStart();
    }
    
    const dragData = {
      source: 'bookmark',
      type: 'bookmark',
      ...bookmark
    };
    
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = () => {
    setDraggedBookmark(null);
  };

  if (compact) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-flow-text-primary font-medium">Bookmarks</h2>
          <span className="text-flow-text-muted text-xs">{filteredBookmarks.length} total</span>
        </div>

        {/* Compact Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-flow-text-muted" />
          <input
            type="text"
            placeholder="Search bookmarks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-flow-text-primary placeholder:text-flow-text-muted text-sm focus:outline-none focus:ring-1 focus:ring-flow-accent-blue/50"
          />
        </div>

        {/* Category Filter */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-2 py-1 text-xs rounded-full transition-colors ${
              !selectedCategory 
                ? 'bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30'
                : 'bg-flow-surface text-flow-text-muted hover:text-flow-text-secondary border border-flow-border'
            }`}
          >
            All
          </button>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-2 py-1 text-xs rounded-full transition-colors ${
                selectedCategory === category
                  ? 'bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30'
                  : 'bg-flow-surface text-flow-text-muted hover:text-flow-text-secondary border border-flow-border'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Drag Instructions */}
        <div className="bg-flow-accent-purple/10 border border-flow-accent-purple/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Link className="w-3 h-3 text-flow-accent-purple" />
            <span className="text-flow-accent-purple text-xs font-medium">Drag to Add</span>
          </div>
          <p className="text-flow-accent-purple text-xs">
            Drag bookmarks to monitors or browser tabs section to add them to your profile.
          </p>
        </div>

        {/* Compact Bookmark List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredBookmarks.map((bookmark) => {
            const isBeingDragged = draggedBookmark?.id === bookmark.id;
            
            return (
              <div 
                key={bookmark.id} 
                className={`bg-flow-surface border border-flow-border rounded-lg p-3 transition-all duration-200 ${
                  isBeingDragged ? 'opacity-50 scale-95' : 'hover:border-flow-border-accent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-grab active:cursor-grabbing transition-transform hover:scale-105 bg-flow-bg-tertiary"
                    draggable
                    onDragStart={(e) => handleDragStart(e, bookmark)}
                    onDragEnd={handleDragEnd}
                    title="Drag to add to profile"
                  >
                    <span className="text-sm">{bookmark.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-flow-text-primary text-sm font-medium truncate">{bookmark.name}</h4>
                      <span className="text-flow-text-muted text-xs px-1.5 py-0.5 bg-flow-bg-tertiary rounded text-xs">
                        {bookmark.category}
                      </span>
                    </div>
                    <div className="text-flow-text-muted text-xs truncate">
                      {bookmark.url}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Add to favorites logic here
                    }}
                    className="p-1 text-flow-text-muted hover:text-flow-accent-blue transition-colors"
                  >
                    <Star className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Full size version would go here
  return (
    <div className="space-y-6">
      <div className="text-flow-text-muted text-center py-8">
        Full Bookmark Manager (non-compact mode)
      </div>
    </div>
  );
}